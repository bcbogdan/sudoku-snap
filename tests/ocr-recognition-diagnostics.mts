// Isolated browser experiments on the exact PNGs captured by ocr-evaluation.mts.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const directory = process.argv[2] ?? '/tmp/opencode/ocr-followup-capture';
const suite = process.env.OCR_GLYPH_DIAGNOSTICS_SUITE ?? 'deslant';
const files = (await readdir(directory)).filter((file) =>
  (suite === 'initial'
    ? /(?:rozet-rendered-identity|opencv-paper-blur-1)-cell-\d+\.png$/
    : /(?:rozet-rendered-(?:identity|rotate-2|blur-1)|opencv-paper-blur-1)-cell-\d+\.png$/
  ).test(file),
);
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') return void res.end('<title>OCR glyph diagnostics</title>');
    const base = req.url!.startsWith('/vendor/') ? 'public' : directory;
    const file = path.resolve(base, `.${req.url}`);
    if (!file.startsWith(`${path.resolve(base)}/`)) throw new Error('Invalid path');
    res.setHeader(
      'Content-Type',
      file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(3192, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript('window.__name = (value) => value');
  await page.goto('http://127.0.0.1:3192');
  const results = await page.evaluate(
    async ({ files, suite }) => {
      const worker = new Worker('/vendor/worker.min.js');
      let job = 0;
      const run = (action: string, payload: unknown) =>
        new Promise<any>((resolve, reject) => {
          const jobId = String(job++);
          worker.onmessage = ({ data }) => {
            if (data.jobId !== jobId) return;
            if (data.status === 'resolve') resolve(data.data);
            if (data.status === 'reject') reject(new Error(String(data.data)));
          };
          worker.postMessage({ workerId: 'diagnostics', jobId, action, payload });
        });
      try {
        await run('load', { options: { lstmOnly: true, corePath: '/vendor', logging: false } });
        await run('loadLanguage', {
          langs: 'eng',
          options: { langPath: '/vendor', gzip: true, lstmOnly: true },
        });
        await run('initialize', { langs: 'eng', oem: 1, config: {} });
        await run('setParameters', {
          params: { tessedit_char_whitelist: '123456789', tessedit_pageseg_mode: '8' },
        });
        const results = [];
        const experiments = [
          { name: 'baseline', shear: 0, size: 110, psm: '8', whitelist: '123456789' },
          ...(suite === 'initial' ? [-0.4, -0.2, 0.2, 0.4] : [-0.15, -0.25, -0.3]).map((shear) => ({
            name: `shear-${shear}`,
            shear,
            size: 110,
            psm: '8',
            whitelist: '123456789',
          })),
          ...['6', '7', '10', '11', '13'].map((psm) => ({
            name: `psm-${psm}`,
            shear: 0,
            size: 110,
            psm,
            whitelist: '123456789',
          })),
          { name: 'unwhitelisted', shear: 0, size: 110, psm: '8', whitelist: '' },
          ...[60, 80, 140].map((size) => ({
            name: `size-${size}`,
            shear: 0,
            size,
            psm: '8',
            whitelist: '123456789',
          })),
        ];
        for (const file of files) {
          const bitmap = await createImageBitmap(await (await fetch(`/${file}`)).blob());
          const trials = [];
          for (const experiment of experiments) {
            const canvas = new OffscreenCanvas(160, 160);
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 160, 160);
            ctx.translate(80, 80);
            ctx.transform(experiment.size / 110, 0, experiment.shear, experiment.size / 110, 0, 0);
            ctx.drawImage(bitmap, -80, -80);
            const image = new Uint8Array(
              await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
            );
            const result = await run('recognize', {
              image,
              options: {
                tessedit_pageseg_mode: experiment.psm,
                tessedit_char_whitelist: experiment.whitelist,
              },
              output: { text: true },
            });
            trials.push({
              experiment: experiment.name,
              text: result.text.trim(),
              confidence: result.confidence,
            });
          }
          bitmap.close();
          results.push({ file, trials });
        }
        return results;
      } finally {
        worker.terminate();
      }
    },
    { files, suite },
  );
  const imageHashes = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(path.join(directory, file)))
          .digest('hex'),
      ]),
    ),
  );
  await writeFile(
    process.argv[3] ?? '/tmp/opencode/ocr-glyph-diagnostics.json',
    `${JSON.stringify({ browser: browser.version(), measuredAt: new Date().toISOString(), suite, imageHashes, results }, null, 2)}\n`,
  );
  console.log(`Measured ${results.length} glyphs × ${results[0]?.trials.length} experiments`);
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
