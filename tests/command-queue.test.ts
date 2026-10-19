import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandQueue, type QueueStatus } from '../lib/command-queue';

test('commands serialize against committed values, including repeated toggle input', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let idle!: () => void;
  const done = new Promise<void>((resolve) => {
    idle = resolve;
  });
  let value = 0;
  const commits: number[] = [];
  const queue = new CommandQueue((status) => {
    if (!status.pending) idle();
  });
  for (const digit of [8, 5, 5])
    queue.enqueue(async () => {
      await blocked;
      value = value === digit ? 0 : digit;
      commits.push(value);
    });
  assert.deepEqual(commits, []);
  release();
  await done;
  assert.deepEqual(commits, [8, 5, 0]);
});

test('failure discards pending commands and requires explicit reset', async () => {
  const statuses: QueueStatus[] = [];
  let failed!: () => void;
  const failure = new Promise<void>((resolve) => {
    failed = resolve;
  });
  const queue = new CommandQueue((status) => {
    statuses.push(status);
    if (status.error) failed();
  });
  let calls = 0;
  queue.enqueue(async () => {
    throw new Error('Storage full');
  });
  queue.enqueue(async () => {
    calls++;
  });
  await failure;
  queue.enqueue(async () => {
    calls++;
  });
  assert.equal(calls, 0);
  assert.match(statuses.at(-1)!.error, /Storage full.*discarded/);
  queue.reset();
  queue.enqueue(async () => {
    calls++;
  });
  assert.equal(calls, 1);
});

test('disposal prevents pending work and late notifications after navigation', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let notifications = 0;
  const queue = new CommandQueue(() => {
    notifications++;
  });
  queue.enqueue(async () => {
    await blocked;
  });
  queue.enqueue(async () => {
    calls++;
  });
  queue.dispose();
  const before = notifications;
  release();
  await blocked;
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(notifications, before);
});
