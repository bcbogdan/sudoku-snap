import { solve, type Board } from './sudoku';

type Result = ReturnType<typeof solve>;
const cache = new Map<string, Promise<Result>>();
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (result: Result) => void; reject: (error: Error) => void }
>();

function compute(clues: Board): Promise<Result> {
  if (typeof window === 'undefined') return Promise.resolve(solve(clues));
  if (!worker) {
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result: Result }>) => {
      pending.get(event.data.id)?.resolve(event.data.result);
      pending.delete(event.data.id);
    };
    const fail = () => {
      for (const request of pending.values())
        request.reject(new Error('Could not solve puzzle. Please retry.'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
  }
  const target = worker;
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try {
      target.postMessage({ id, clues });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

// Cache values, not puzzle identities: renames and callers mutating their arrays
// cannot invalidate or corrupt another consumer's solution.
export async function solveCached(clues: Board): Promise<Result> {
  const snapshot = clues.slice();
  const key = JSON.stringify(snapshot);
  let result = cache.get(key);
  if (!result) {
    result = compute(snapshot);
    cache.set(key, result);
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
    const computation = result;
    void result.catch(() => {
      if (cache.get(key) === computation) cache.delete(key);
    });
  }
  const solved = await result;
  return { count: solved.count, solution: solved.solution?.slice() ?? null };
}
