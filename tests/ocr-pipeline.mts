// Run: npx tsx tests/ocr-pipeline.mts [report.json]. No Next build or server required.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '@playwright/test';

const root = process.cwd();
const output = await mkdtemp('/tmp/opencode/ocr-pipeline-');
let entry = path.join(root, 'lib/localSudokuReader.ts');
if (process.env.OCR_BASELINE === '1') {
  for (const file of ['localSudokuReader.ts', 'sudoku-preprocess.worker.ts', 'image-polarity.ts'])
    await writeFile(path.join(output, file), execFileSync('git', ['show', `HEAD:lib/${file}`]));
  entry = path.join(output, 'localSudokuReader.ts');
}
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: output,
    lib: { entry, formats: ['es'], fileName: () => 'reader.js' },
    minify: true,
  },
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname === '/') return void res.end('<title>Real OCR pipeline</title>');
    const base = url.pathname.startsWith('/vendor/') ? path.join(root, 'public') : output;
    const file = path.resolve(base, `.${url.pathname}`);
    if (!file.startsWith(`${base}/`)) throw new Error('Invalid path');
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'application/javascript'
        : file.endsWith('.wasm')
          ? 'application/wasm'
          : 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(3207, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const samples = [];
const expectedBoards = new Map<string, number[]>();
try {
  for (const fixture of ['original', 'dark-highlighted']) {
    const expected = JSON.parse(
      await readFile(
        `tests/fixtures/${fixture === 'original' ? 'expected' : fixture}.json`,
        'utf8',
      ),
    );
    expectedBoards.set(fixture, expected);
    const image = (await readFile(`tests/fixtures/${fixture}.jpeg`)).toString('base64');
    const context = await browser.newContext();
    await context.addInitScript('window.__name = (value) => value');
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3207');
    const variants =
      process.env.OCR_TRANSFORMS === '1'
        ? ['identity', 'scale-75', 'rotate-2', 'contrast-70', 'invert']
        : ['identity'];
    for (const variant of variants)
      for (let run = 0; run < Number(process.env.OCR_RUNS ?? 3); run++) {
        const result = await page.evaluate(
          async ({ image, variant }) => {
            const timings: { action: string; ms: number }[] = [];
            const NativeWorker = window.Worker;
            window.Worker = class extends NativeWorker {
              postMessage(payload: any, ...rest: any[]) {
                const start = performance.now();
                const action = payload.action ?? 'preprocess';
                const done = (event: MessageEvent) => {
                  const data = event.data;
                  if (data.type === 'progress')
                    timings.push({ action: data.message, ms: performance.now() - start });
                  if (
                    data.type === 'result' ||
                    (data.jobId === payload.jobId && data.status === 'resolve')
                  ) {
                    timings.push({ action, ms: performance.now() - start });
                    this.removeEventListener('message', done);
                  }
                };
                this.addEventListener('message', done);
                super.postMessage(payload, ...(rest as [Transferable[]]));
              }
            };
            try {
              const entry = '/reader.js';
              const { readSudoku } = await import(/* @vite-ignore */ entry);
              let file = new File(
                [Uint8Array.from(atob(image), (c) => c.charCodeAt(0))],
                'fixture.jpeg',
                { type: 'image/jpeg' },
              );
              if (variant !== 'identity') {
                const bitmap = await createImageBitmap(file);
                const factor = variant === 'scale-75' ? 0.75 : 1;
                const canvas = new OffscreenCanvas(
                  Math.round(bitmap.width * factor),
                  Math.round(bitmap.height * factor),
                );
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                if (variant === 'invert') ctx.filter = 'invert(1)';
                if (variant === 'contrast-70') ctx.filter = 'contrast(0.7)';
                ctx.translate(canvas.width / 2, canvas.height / 2);
                if (variant === 'rotate-2') ctx.rotate((2 * Math.PI) / 180);
                ctx.drawImage(
                  bitmap,
                  -canvas.width / 2,
                  -canvas.height / 2,
                  canvas.width,
                  canvas.height,
                );
                bitmap.close();
                file = new File(
                  [await canvas.convertToBlob({ type: 'image/png' })],
                  'transformed.png',
                  { type: 'image/png' },
                );
              }
              const start = performance.now();
              const result = await readSudoku(file, () => {});
              return { ...result, totalMs: performance.now() - start, timings };
            } finally {
              window.Worker = NativeWorker;
            }
          },
          { image, variant },
        );
        const mismatches = result.board.flatMap((value: number, index: number) =>
          value === expected[index] ? [] : [{ index, expected: expected[index], actual: value }],
        );
        assert(
          result.uncertain.every(
            (index: number) => Number.isInteger(index) && index >= 0 && index < 81,
          ),
        );
        const sample = {
          fixture,
          variant,
          cache: run === 0 && variant === 'identity' ? 'cold' : 'warm',
          run,
          mismatches,
          ...result,
        };
        samples.push(sample);
        console.log(JSON.stringify(sample));
      }
    await context.close();
  }
  if (process.argv[2])
    await writeFile(
      process.argv[2],
      JSON.stringify(
        {
          browser: browser.version(),
          source: process.env.OCR_BASELINE === '1' ? 'HEAD' : 'working-tree',
          samples,
        },
        null,
        2,
      ),
    );
  for (const sample of samples)
    assert.deepEqual(
      sample.board,
      expectedBoards.get(sample.fixture),
      `${sample.fixture}/${sample.variant}: exact 81-cell accuracy`,
    );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
