import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSudoku } from '../lib/localSudokuReader';

test('photo reader owns workers throughout initialization, recognition and cancellation', async (t) => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const workers: FakeWorker[] = [];
  let respond: (worker: FakeWorker, payload: any) => void = () => {};
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    constructor(readonly url: URL | string) {
      workers.push(this);
    }
    terminate() {
      this.terminated = true;
    }
    postMessage(payload: unknown) {
      queueMicrotask(() => respond(this, payload));
    }
    reply(data: unknown) {
      this.onmessage?.({ data });
    }
  }
  for (const [key, value] of Object.entries({
    Worker: FakeWorker,
    OffscreenCanvas: class {},
    createImageBitmap: () => {},
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const key of ['Worker', 'OffscreenCanvas', 'createImageBitmap']) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const file = new File(['photo'], 'photo.png');
  const cells = [{ index: 3, image: new Uint8Array([1]) }];
  const noop = () => {};

  await t.test('already aborted does not spawn a worker', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readSudoku(file, noop, { signal: controller.signal }), {
      name: 'AbortError',
    });
    assert.equal(workers.length, 0);
  });

  for (const phase of ['preprocess', 'load', 'loadLanguage', 'initialize', 'recognize']) {
    await t.test(`abort during ${phase} terminates all workers`, async () => {
      const controller = new AbortController();
      respond = (worker, payload) => {
        if ((payload.file && phase === 'preprocess') || payload.action === phase)
          controller.abort();
        else if (payload.file) worker.reply({ type: 'result', cells });
        else worker.reply({ jobId: payload.jobId, status: 'resolve', data: {} });
      };
      await assert.rejects(readSudoku(file, noop, { signal: controller.signal }), {
        name: 'AbortError',
      });
      assert.ok(workers.every((worker) => worker.terminated));
    });
  }

  for (const failure of ['error', 'messageerror', 'reject']) {
    await t.test(`OCR ${failure} rejects and releases resources`, async () => {
      respond = (worker, payload) => {
        if (payload.file) worker.reply({ type: 'result', cells });
        else if (failure === 'error')
          worker.onerror?.({ message: 'broken runtime', preventDefault() {} });
        else if (failure === 'messageerror') worker.onmessageerror?.();
        else worker.reply({ jobId: payload.jobId, status: 'reject', data: 'broken language' });
      };
      await assert.rejects(readSudoku(file, noop), /reader|language/);
      assert.ok(workers.every((worker) => worker.terminated));
    });
  }

  await t.test('success preserves clues/confidence and terminates both workers', async () => {
    respond = (worker, payload) => {
      if (payload.file) worker.reply({ type: 'result', cells });
      else
        worker.reply({
          jobId: payload.jobId,
          status: 'resolve',
          data: { text: '7\n', confidence: 60 },
        });
    };
    const result = await readSudoku(file, noop);
    assert.equal(result.board.length, 81);
    assert.equal(result.board[3], 7);
    assert.deepEqual(result.uncertain, [3]);
    assert.ok(workers.every((worker) => worker.terminated));
  });

  await t.test('an unresponsive worker times out and is terminated', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    respond = () => {};
    const result = assert.rejects(readSudoku(file, noop), /took too long/);
    t.mock.timers.tick(60000);
    await result;
    assert.ok(workers.every((worker) => worker.terminated));
  });
});
