// Run: npx tsx tests/ocr-evaluation.mts [report.json]. Accuracy failures are reported, not asserted.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { parseRows, scoreBoard, scoreExtraction } from './ocr-evaluation-metrics';

const root = process.cwd();
const directory = path.join(root, 'tests/fixtures/ocr-evaluation');
const sourceFiles = [
  'lib/localSudokuReader.ts',
  'lib/sudoku-preprocess.worker.ts',
  'lib/sudoku-image-processing.ts',
  'lib/image-polarity.ts',
  'lib/digit-recognition.ts',
  'lib/sudoku-reader-protocol.ts',
  'tests/ocr-evaluation.mts',
  'tests/ocr-evaluation-metrics.ts',
];
const hashSources = async () =>
  Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      ]),
    ),
  );
const sourceHashes = await hashSources();
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as {
  id: string;
  file: string;
  rows: string[];
  source: string;
  license: string;
}[];
const cases = manifest.map((fixture) => ({
  id: fixture.id,
  file: path.join(directory, fixture.file),
  expected: parseRows(fixture.rows),
  group: 'independent',
  variants: ['identity', 'rotate-2', 'blur-1'],
}));
for (const id of ['original', 'dark-highlighted'])
  cases.unshift({
    id,
    file: path.join(root, `tests/fixtures/${id}.jpeg`),
    expected: JSON.parse(
      await readFile(`tests/fixtures/${id === 'original' ? 'expected' : id}.json`, 'utf8'),
    ),
    group: 'existing-regression',
    variants: ['identity'],
  });
for (const id of ['blank', 'text-only'])
  cases.push({ id, file: '', expected: [], group: 'synthetic-negative', variants: ['identity'] });

const output = await mkdtemp(
  path.join(process.env.OCR_EVALUATION_TEMP_DIR ?? '/tmp/opencode', 'ocr-evaluation-'),
);
await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: output,
    lib: {
      entry: path.join(root, 'lib/localSudokuReader.ts'),
      formats: ['es'],
      fileName: () => 'reader.js',
    },
    minify: true,
  },
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname === '/') return void res.end('<title>Production OCR evaluation</title>');
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
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
const port = Number(process.env.OCR_EVALUATION_PORT ?? 3192);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const samples = [];
const captureDirectory = process.env.OCR_EVALUATION_CAPTURE_DIR;
if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
try {
  browser = await chromium.launch({ headless: true });
  for (const fixture of cases.filter(
    (fixture) =>
      !process.env.OCR_EVALUATION_FIXTURE || fixture.id === process.env.OCR_EVALUATION_FIXTURE,
  )) {
    const bytes = fixture.file ? await readFile(fixture.file) : null;
    for (const variant of fixture.variants) {
      const context = await browser.newContext();
      await context.addInitScript('window.__name = (value) => value');
      const page = await context.newPage();
      const browserErrors: string[] = [];
      const networkErrors: string[] = [];
      const cancelledRequests: { url: string; error: string | undefined }[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('requestfailed', (request) =>
        cancelledRequests.push({ url: request.url(), error: request.failure()?.errorText }),
      );
      page.on('response', (response) => {
        if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(`http://127.0.0.1:${port}`);
      const result = await page.evaluate(
        async ({ image, variant, id, capture }) => {
          const extracted: number[] = [];
          let extractionUncertain: number[] = [];
          const digits: {
            index: number;
            view: string;
            text: string;
            confidence: number;
            totalMs: number;
          }[] = [];
          const encodedBytes = { primary: 0, deslanted: 0, condensed: 0 };
          const imageCells = new WeakMap<Uint8Array, { index: number; view: string }>();
          const progress: string[] = [];
          const images: { index: number; base64: string }[] = [];
          const base64 = (bytes: Uint8Array) => {
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 8192)
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
            return btoa(binary);
          };
          const NativeWorker = window.Worker;
          window.Worker = class extends NativeWorker {
            private jobs = new Map<
              string,
              { action?: string; index?: number; view?: string; startedAt: number }
            >();
            constructor(url: string | URL, options?: WorkerOptions) {
              super(url, options);
              // Register before production assigns onmessage: final responses may terminate the worker.
              this.addEventListener('message', (event: MessageEvent) => {
                const data = event.data;
                if (data.type === 'result') {
                  extracted.push(...data.cells.map((cell: { index: number }) => cell.index));
                  extractionUncertain = data.uncertain ?? [];
                  for (const cell of data.cells) {
                    encodedBytes.primary += cell.image.byteLength;
                    encodedBytes.deslanted += cell.deslanted?.byteLength ?? 0;
                    encodedBytes.condensed += cell.condensed?.byteLength ?? 0;
                    imageCells.set(cell.image, { index: cell.index, view: 'primary' });
                    if (cell.deslanted)
                      imageCells.set(cell.deslanted, { index: cell.index, view: 'deslanted' });
                    if (cell.condensed)
                      imageCells.set(cell.condensed, { index: cell.index, view: 'condensed' });
                  }
                  if (capture)
                    images.push(
                      ...data.cells.map((cell: { index: number; image: Uint8Array }) => ({
                        index: cell.index,
                        base64: base64(cell.image),
                      })),
                    );
                }
                const job = this.jobs.get(data.jobId);
                if (job && ['resolve', 'reject'].includes(data.status)) {
                  if (job.action === 'recognize' && data.status === 'resolve')
                    digits.push({
                      index: job.index ?? extracted[digits.length],
                      view: job.view ?? 'primary',
                      text: data.data.text,
                      confidence: data.data.confidence,
                      totalMs: performance.now() - job.startedAt,
                    });
                  this.jobs.delete(data.jobId);
                }
              });
            }
            postMessage(payload: any, ...rest: any[]) {
              if (payload.jobId !== undefined)
                this.jobs.set(payload.jobId, {
                  ...payload,
                  ...imageCells.get(payload.payload?.image),
                  startedAt: performance.now(),
                });
              super.postMessage(payload, ...(rest as [Transferable[]]));
            }
          };
          let file: File;
          if (image) {
            file = new File([Uint8Array.from(atob(image), (c) => c.charCodeAt(0))], 'source', {
              type:
                id === 'rozet-rendered' || ['original', 'dark-highlighted'].includes(id)
                  ? 'image/jpeg'
                  : 'image/png',
            });
            if (variant !== 'identity') {
              const bitmap = await createImageBitmap(file);
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.translate(canvas.width / 2, canvas.height / 2);
              if (variant === 'rotate-2') ctx.rotate((2 * Math.PI) / 180);
              if (variant === 'blur-1') ctx.filter = 'blur(1px)';
              ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
              bitmap.close();
              file = new File([await canvas.convertToBlob({ type: 'image/png' })], 'derived.png', {
                type: 'image/png',
              });
            }
          } else {
            const canvas = new OffscreenCanvas(900, 900);
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 900, 900);
            if (id === 'text-only') {
              ctx.fillStyle = 'black';
              ctx.font = '40px sans-serif';
              ctx.fillText('Shopping list', 90, 180);
              ctx.fillText('1 apple, 2 oranges, 3 pears', 90, 270);
            }
            file = new File([await canvas.convertToBlob({ type: 'image/png' })], `${id}.png`, {
              type: 'image/png',
            });
          }
          const start = performance.now();
          const input = capture ? base64(new Uint8Array(await file.arrayBuffer())) : null;
          try {
            const entry = '/reader.js';
            const { readSudoku } = await import(/* @vite-ignore */ entry);
            const result = await readSudoku(file, (message: string) => progress.push(message));
            return {
              board: result.board as number[],
              uncertain: result.uncertain as number[],
              error: null,
              totalMs: performance.now() - start,
              extracted,
              extractionUncertain,
              encodedBytes,
              digits,
              progress,
              images,
              input,
            };
          } catch (error) {
            return {
              board: null,
              uncertain: [] as number[],
              error: error instanceof Error ? error.message : String(error),
              totalMs: performance.now() - start,
              extracted,
              extractionUncertain,
              encodedBytes,
              digits,
              progress,
              images,
              input,
            };
          } finally {
            window.Worker = NativeWorker;
          }
        },
        {
          image: bytes?.toString('base64') ?? null,
          variant,
          id: fixture.id,
          capture: Boolean(captureDirectory),
        },
      );
      const { images, input, ...measurement } = result;
      if (captureDirectory) {
        const prefix = path.join(captureDirectory, `${fixture.id}-${variant}`);
        if (input) await writeFile(`${prefix}-input`, Buffer.from(input, 'base64'));
        for (const { index, base64 } of images)
          await writeFile(`${prefix}-cell-${index}.png`, Buffer.from(base64, 'base64'));
      }
      assert.ok(
        result.uncertain.every((index) => Number.isInteger(index) && index >= 0 && index < 81),
      );
      assert.deepEqual(browserErrors, [], 'Unexpected browser exception');
      assert.deepEqual(networkErrors, [], 'Evaluation assets failed to load');
      if (!result.error?.startsWith('Could not find a Sudoku grid.'))
        assert.deepEqual(cancelledRequests, [], 'Unexpected failed asset request');
      if (result.board) {
        assert.deepEqual(
          result.digits.filter(({ view }) => view === 'primary').map(({ index }) => index),
          result.extracted,
          'one primary response per extracted cell',
        );
        for (const index of result.extracted) {
          assert.ok(
            result.digits.filter((digit) => digit.index === index).length <= 3,
            'at most two bounded retries',
          );
          const views: string[] = result.digits
            .filter((digit) => digit.index === index)
            .map(({ view }) => view);
          assert.equal(new Set(views).size, views.length, 'each rendering recognized at most once');
        }
        assert.ok(
          result.digits.every(({ index }) => result.extracted.includes(index)),
          'every OCR response has an extracted cell',
        );
      }
      const sample = {
        fixture: fixture.id,
        group: fixture.group,
        variant,
        sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
        expected: fixture.expected.length ? fixture.expected : null,
        ...measurement,
        cancelledRequests,
        metrics:
          result.board && fixture.expected.length
            ? scoreBoard(fixture.expected, result.board, result.uncertain)
            : null,
        extraction:
          result.board && fixture.expected.length
            ? scoreExtraction(fixture.expected, result.extracted, result.uncertain)
            : null,
        negativeRejected:
          fixture.group === 'synthetic-negative'
            ? result.board === null &&
              Boolean(result.error?.startsWith('Could not find a Sudoku grid.'))
            : null,
      };
      samples.push(sample);
      console.log(
        JSON.stringify({
          fixture: sample.fixture,
          variant,
          error: sample.error,
          exactCells: sample.metrics?.exactCells,
          precision: sample.metrics?.cluePrecision,
          recall: sample.metrics?.clueRecall,
          negativeRejected: sample.negativeRejected,
        }),
      );
      await context.close();
    }
  }
  if (!process.env.OCR_EVALUATION_FIXTURE)
    assert.equal(samples.length, 13, 'complete evaluation corpus');
  assert.deepEqual(await hashSources(), sourceHashes, 'OCR sources changed during the measurement');
  const report = {
    browser: browser.version(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source: 'working-tree production reader; real local OpenCV/Tesseract assets',
    measuredAt: new Date().toISOString(),
    scope: process.env.OCR_EVALUATION_FIXTURE ?? 'all-13-cases',
    sourceHashes,
    manifest,
    samples,
  };
  await writeFile(
    process.argv[2] ?? '/tmp/opencode/ocr-evaluation.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (process.env.OCR_EVALUATION_STRICT === '1')
    assert.deepEqual(
      samples
        .filter((sample) => !(sample.metrics?.exactBoard || sample.negativeRejected))
        .map((sample) => `${sample.fixture}/${sample.variant}`),
      [],
      'Recognition failures (full diagnostics saved before assertion)',
    );
  // Infrastructure failures still exit nonzero; known accuracy failures belong in the report.
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
