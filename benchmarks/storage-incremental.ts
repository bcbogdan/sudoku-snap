import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { makeAttempt } from './data';

// Isolated IDB transfer experiment, not application or engine latency.
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://astra-storage.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Storage experiment</title>' }),
    );
    await page.goto('http://astra-storage.test/');
    const results = [];
    for (const history of [100, 1000, 10000]) {
      const result = await page.evaluate(
        async ({ json }) => {
          const source = JSON.parse(json);
          const { moves, ...fields } = source;
          const header = { ...fields, moveCount: moves.length, historyId: 'experiment' };
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(`experiment-${moves.length}`, 1);
            request.onupgradeneeded = () => {
              request.result.createObjectStore('full', { keyPath: 'id' });
              request.result.createObjectStore('headers', { keyPath: 'id' });
              request.result.createObjectStore('moves', { keyPath: ['attemptId', 'index'] });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['full', 'headers', 'moves'], 'readwrite');
            tx.objectStore('full').put(source);
            tx.objectStore('headers').put(header);
            moves.forEach((move: unknown, index: number) =>
              tx.objectStore('moves').add({ attemptId: source.id, index, move }),
            );
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
          const modes = [];
          for (const mode of ['full', 'append']) {
            const rows: Record<string, number>[] = [];
            for (let sample = 0; sample < 13; sample++) {
              const row = await new Promise<Record<string, number>>((resolve, reject) => {
                const start = performance.now();
                const tx = db.transaction(
                  mode === 'full' ? ['full'] : ['headers', 'moves'],
                  'readwrite',
                );
                const store = tx.objectStore(mode === 'full' ? 'full' : 'headers');
                const request = store.get(source.id);
                let readMs = 0,
                  materializeMs = 0,
                  putMs = 0,
                  afterPut = 0;
                request.onsuccess = () => {
                  readMs = performance.now() - start;
                  const materializeStart = performance.now();
                  const record = request.result;
                  materializeMs = performance.now() - materializeStart;
                  if (
                    (mode === 'full' ? record.moves.length : record.moveCount) !==
                    moves.length + sample
                  )
                    throw new Error('History mismatch');
                  const putStart = performance.now();
                  if (mode === 'append') {
                    const index = moves.length + sample;
                    tx.objectStore('moves').add({
                      attemptId: source.id,
                      index,
                      move: moves.at(-1),
                    });
                    record.moveCount++;
                    record.historyId = `experiment-${sample}`;
                  } else {
                    record.moves.push(moves.at(-1));
                  }
                  record.revision++;
                  store.put(record);
                  afterPut = performance.now();
                  putMs = afterPut - putStart;
                };
                tx.oncomplete = () =>
                  resolve({
                    readMs,
                    materializeMs,
                    putMs,
                    tailMs: performance.now() - afterPut,
                    totalMs: performance.now() - start,
                  });
                tx.onabort = () => reject(tx.error);
              });
              if (sample >= 3) rows.push(row);
            }
            modes.push({
              mode,
              rows,
              medians: Object.fromEntries(
                Object.keys(rows[0]).map((key) => {
                  const values = rows.map((row) => row[key]).sort((a, b) => a - b);
                  return [key, (values[4] + values[5]) / 2];
                }),
              ),
            });
          }
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['full', 'headers', 'moves']);
            const full = tx.objectStore('full').get(source.id);
            const headers = tx.objectStore('headers').get(source.id);
            const storedMoves = tx.objectStore('moves').getAll();
            tx.oncomplete = () => {
              const actual = storedMoves.result;
              if (
                full.result.moves.length !== moves.length + 13 ||
                full.result.revision !== source.revision + 13 ||
                headers.result.revision !== full.result.revision ||
                headers.result.moveCount !== actual.length ||
                actual.some(
                  (record, index) => record.index !== index || record.attemptId !== source.id,
                ) ||
                JSON.stringify(actual.map((record) => record.move)) !==
                  JSON.stringify(full.result.moves)
              ) {
                reject(new Error('Persisted full/append histories diverged'));
              } else resolve();
            };
            tx.onabort = () => reject(tx.error);
          });
          db.close();
          return modes;
        },
        { json: JSON.stringify(makeAttempt(history)) },
      );
      assert.equal(result.length, 2);
      results.push({ history, modes: result });
    }
    console.log(
      JSON.stringify({ browser: browser.version(), warmup: 3, samples: 10, results }, null, 2),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
