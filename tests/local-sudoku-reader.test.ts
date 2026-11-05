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

  await t.test(
    'extraction losses and augmented readings remain uncertain without duplicate flags',
    async () => {
      const image = new Uint8Array([1]),
        deslanted = new Uint8Array([2]);
      const recognized: Uint8Array[] = [];
      respond = (worker, payload) => {
        if (payload.file)
          worker.reply({
            type: 'result',
            cells: [{ index: 3, image, deslanted }],
            uncertain: [3, 4],
          });
        else {
          if (payload.action === 'recognize') recognized.push(payload.payload.image);
          worker.reply({
            jobId: payload.jobId,
            status: 'resolve',
            data:
              payload.payload?.image === deslanted
                ? { text: '7', confidence: 89 }
                : { text: '', confidence: 0 },
          });
        }
      };
      const result = await readSudoku(file, noop);
      assert.equal(result.board[3], 7);
      assert.equal(result.board[4], 0, 'a rejected component is never invented as a clue');
      assert.deepEqual(result.uncertain, [3, 4]);
      assert.deepEqual(recognized, [image, deslanted], 'at most one alternate read');
      assert.ok(workers.every((worker) => worker.terminated));
    },
  );

  await t.test('confident primary reads do not run the alternate OCR view', async () => {
    let recognized = 0;
    respond = (worker, payload) => {
      if (payload.file)
        worker.reply({ type: 'result', cells: [{ ...cells[0], deslanted: new Uint8Array([2]) }] });
      else {
        if (payload.action === 'recognize') recognized++;
        worker.reply({
          jobId: payload.jobId,
          status: 'resolve',
          data: { text: '1', confidence: 86 },
        });
      }
    };
    const result = await readSudoku(file, noop);
    assert.equal(result.board[3], 1);
    assert.deepEqual(result.uncertain, []);
    assert.equal(recognized, 1);
  });

  for (const failure of ['abort', 'reject'])
    await t.test(`${failure} during alternate recognition releases both workers`, async () => {
      const controller = new AbortController();
      let recognized = 0;
      respond = (worker, payload) => {
        if (payload.file)
          worker.reply({
            type: 'result',
            cells: [{ ...cells[0], deslanted: new Uint8Array([2]) }],
          });
        else if (payload.action === 'recognize' && ++recognized === 2) {
          if (failure === 'abort') controller.abort();
          else worker.reply({ jobId: payload.jobId, status: 'reject', data: 'alternate failed' });
        } else
          worker.reply({
            jobId: payload.jobId,
            status: 'resolve',
            data: { text: '', confidence: 0 },
          });
      };
      await assert.rejects(
        readSudoku(file, noop, { signal: controller.signal }),
        failure === 'abort' ? { name: 'AbortError' } : /alternate failed/,
      );
      assert.equal(recognized, 2);
      assert.ok(workers.every((worker) => worker.terminated));
    });

  await t.test(
    'initializes OCR before preprocessing finishes without changing uncertain clues',
    async () => {
      const controller = new AbortController();
      let preprocessing: FakeWorker | undefined;
      let loadedBeforeExtraction = false;
      respond = (worker, payload) => {
        if (payload.file) {
          preprocessing = worker;
          worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
        } else {
          if (payload.action === 'load') {
            loadedBeforeExtraction = true;
            preprocessing!.reply({ type: 'result', cells });
          }
          worker.reply({
            jobId: payload.jobId,
            status: 'resolve',
            data: { text: '7\n', confidence: 60 },
          });
        }
      };
      const pending = readSudoku(file, noop, { signal: controller.signal });
      void pending.catch(() => {});
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (!loadedBeforeExtraction) controller.abort();
      assert.ok(loadedBeforeExtraction);
      const result = await pending;
      assert.equal(result.board[3], 7);
      assert.deepEqual(result.uncertain, [3]);
      assert.ok(workers.every((worker) => worker.terminated));
    },
  );

  await t.test('abort rejects both concurrent worker requests immediately', async () => {
    const controller = new AbortController();
    respond = (worker, payload) => {
      if (payload.file)
        worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
      else if (payload.action === 'load') controller.abort();
    };
    await assert.rejects(readSudoku(file, noop, { signal: controller.signal }), {
      name: 'AbortError',
    });
    assert.ok(workers.every((worker) => worker.terminated));
  });

  await t.test('preprocessing failure releases a pending OCR initialization', async () => {
    let preprocessing: FakeWorker;
    respond = (worker, payload) => {
      if (payload.file) {
        preprocessing = worker;
        worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
      } else preprocessing.reply({ type: 'error', message: 'No grid' });
    };
    await assert.rejects(readSudoku(file, noop), /No grid/);
    assert.ok(workers.every((worker) => worker.terminated));
  });

  for (const failure of ['error', 'messageerror', 'reject']) {
    await t.test(`OCR ${failure} rejects promptly while preprocessing is pending`, async () => {
      const controller = new AbortController();
      let settled = false;
      respond = (worker, payload) => {
        if (payload.file)
          worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
        else if (failure === 'error')
          worker.onerror?.({ message: 'broken runtime', preventDefault() {} });
        else if (failure === 'messageerror') worker.onmessageerror?.();
        else worker.reply({ jobId: payload.jobId, status: 'reject', data: 'broken language' });
      };
      const pending = readSudoku(file, noop, { signal: controller.signal });
      const rejected = pending.catch((error: unknown) => {
        settled = true;
        return error;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      const prompt = settled;
      if (!prompt) controller.abort();
      const error = await rejected;
      assert.ok(prompt, 'OCR failure must not wait for the preprocessing timeout');
      assert.match(String(error), /reader|language/);
      assert.ok(workers.every((worker) => worker.terminated));
    });
  }

  for (const phase of ['preprocess', 'load', 'loadLanguage', 'initialize', 'setParameters']) {
    await t.test(`abort after successful ${phase} does not start another stage`, async () => {
      const controller = new AbortController();
      const start = workers.length;
      const actions: string[] = [];
      respond = (worker, payload) => {
        const action = payload.file ? 'preprocess' : payload.action;
        actions.push(action);
        if (payload.file) worker.reply({ type: 'result', cells });
        else worker.reply({ jobId: payload.jobId, status: 'resolve', data: {} });
        if (action === phase) controller.abort();
      };
      await assert.rejects(readSudoku(file, noop, { signal: controller.signal }), {
        name: 'AbortError',
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(actions.at(-1), phase);
      assert.equal(workers.length - start, phase === 'preprocess' ? 1 : 2);
      assert.ok(workers.every((worker) => worker.terminated));
    });
  }

  for (const overlap of [false, true]) {
    await t.test(
      `no extracted cells rejects without recognition (overlap=${overlap})`,
      async () => {
        const start = workers.length;
        let preprocessing: FakeWorker;
        const actions: string[] = [];
        respond = (worker, payload) => {
          if (payload.file) {
            preprocessing = worker;
            if (overlap)
              worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
            else worker.reply({ type: 'result', cells: [] });
          } else {
            actions.push(payload.action);
            preprocessing.reply({ type: 'result', cells: [] });
            worker.reply({ jobId: payload.jobId, status: 'resolve', data: {} });
          }
        };
        await assert.rejects(readSudoku(file, noop), /No digits were recognized/);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.deepEqual(actions, overlap ? ['load'] : []);
        assert.equal(workers.length - start, overlap ? 2 : 1);
        assert.ok(workers.every((worker) => worker.terminated));
      },
    );
  }

  await t.test(
    'a completed startup stage cannot restart a worker after preprocessing fails',
    async () => {
      let preprocessing: FakeWorker;
      const actions: string[] = [];
      respond = (worker, payload) => {
        if (payload.file) {
          preprocessing = worker;
          worker.reply({ type: 'progress', message: 'Finding grid', stage: 'processing' });
        } else {
          actions.push(payload.action);
          preprocessing.reply({ type: 'error', message: 'No grid' });
          worker.reply({ jobId: payload.jobId, status: 'resolve', data: {} });
        }
      };
      await assert.rejects(readSudoku(file, noop), /No grid/);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(actions, ['load']);
      assert.ok(workers.every((worker) => worker.terminated));
    },
  );

  await t.test('an unresponsive worker times out and is terminated', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    respond = () => {};
    const result = assert.rejects(readSudoku(file, noop), /took too long/);
    t.mock.timers.tick(60000);
    await result;
    assert.ok(workers.every((worker) => worker.terminated));
  });
});
