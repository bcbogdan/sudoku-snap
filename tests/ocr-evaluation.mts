// Run: npx tsx tests/ocr-evaluation.mts [report.json]. Accuracy failures are reported, not asserted.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { parseRows, scoreBoard } from './ocr-evaluation-metrics';

const root = process.cwd();
const directory = path.join(root, 'tests/fixtures/ocr-evaluation');
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

const output = await mkdtemp('/tmp/opencode/ocr-evaluation-');
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
try {
  browser = await chromium.launch({ headless: true });
  for (const fixture of cases) {
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
        async ({ image, variant, id }) => {
          const extracted: number[] = [];
          const digits: { index: number; text: string; confidence: number }[] = [];
          const progress: string[] = [];
          const NativeWorker = window.Worker;
          window.Worker = class extends NativeWorker {
            private jobs = new Map<string, { action?: string }>();
            constructor(url: string | URL, options?: WorkerOptions) {
              super(url, options);
              // Register before production assigns onmessage: final responses may terminate the worker.
              this.addEventListener('message', (event: MessageEvent) => {
                const data = event.data;
                if (data.type === 'result')
                  extracted.push(...data.cells.map((cell: { index: number }) => cell.index));
                const job = this.jobs.get(data.jobId);
                if (job && ['resolve', 'reject'].includes(data.status)) {
                  if (job.action === 'recognize' && data.status === 'resolve')
                    digits.push({
                      index: extracted[digits.length],
                      text: data.data.text,
                      confidence: data.data.confidence,
                    });
                  this.jobs.delete(data.jobId);
                }
              });
            }
            postMessage(payload: any, ...rest: any[]) {
              if (payload.jobId !== undefined) this.jobs.set(payload.jobId, payload);
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
              digits,
              progress,
            };
          } catch (error) {
            return {
              board: null,
              uncertain: [] as number[],
              error: error instanceof Error ? error.message : String(error),
              totalMs: performance.now() - start,
              extracted,
              digits,
              progress,
            };
          } finally {
            window.Worker = NativeWorker;
          }
        },
        { image: bytes?.toString('base64') ?? null, variant, id: fixture.id },
      );
      assert.ok(
        result.uncertain.every((index) => Number.isInteger(index) && index >= 0 && index < 81),
      );
      assert.deepEqual(browserErrors, [], 'Unexpected browser exception');
      assert.deepEqual(networkErrors, [], 'Evaluation assets failed to load');
      if (!result.error?.startsWith('Could not find a Sudoku grid.'))
        assert.deepEqual(cancelledRequests, [], 'Unexpected failed asset request');
      if (result.board) assert.equal(result.digits.length, result.extracted.length);
      const sample = {
        fixture: fixture.id,
        group: fixture.group,
        variant,
        sha256: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
        expected: fixture.expected.length ? fixture.expected : null,
        ...result,
        cancelledRequests,
        metrics:
          result.board && fixture.expected.length
            ? scoreBoard(fixture.expected, result.board, result.uncertain)
            : null,
        negativeRejected: fixture.group === 'synthetic-negative' ? result.board === null : null,
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
  const report = {
    browser: browser.version(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source: 'working-tree production reader; real local OpenCV/Tesseract assets',
    measuredAt: new Date().toISOString(),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        [
          'lib/localSudokuReader.ts',
          'lib/sudoku-preprocess.worker.ts',
          'lib/sudoku-image-processing.ts',
          'lib/image-polarity.ts',
        ].map(async (file) => [
          file,
          createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        ]),
      ),
    ),
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
