// Inspect browser-derived inputs using the production detection/cell-boundary seams.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import CV from '@techstark/opencv-js';
import sharp from 'sharp';
import {
  analyzeDigit,
  cellBounds,
  detectGrid,
  extractDigit,
  extractDigitCell,
} from '../lib/sudoku-image-processing';

await new Promise<void>((resolve) => {
  if (CV.Mat) resolve();
  else (CV as typeof CV & { onRuntimeInitialized: () => void }).onRuntimeInitialized = resolve;
});
const results = [];
for (const variant of ['identity', 'rotate-2', 'blur-1']) {
  const file = `${process.argv[2] ?? '/tmp/opencode/ocr-followup-capture'}/opencv-paper-${variant}-input`;
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const src = CV.matFromImageData({ data, width: info.width, height: info.height });
  const gray = new CV.Mat();
  const flat = new CV.Mat();
  const ink = new CV.Mat();
  const recoveryInk = new CV.Mat();
  const owned = [src, gray, flat, ink, recoveryInk];
  try {
    CV.cvtColor(src, gray, CV.COLOR_RGBA2GRAY);
    const points = detectGrid(CV, gray);
    const tl = points.reduce((a, b) => (a.x + a.y < b.x + b.y ? a : b));
    const tr = points.reduce((a, b) => (a.x - a.y > b.x - b.y ? a : b));
    const br = points.reduce((a, b) => (a.x + a.y > b.x + b.y ? a : b));
    const bl = points.reduce((a, b) => (a.x - a.y < b.x - b.y ? a : b));
    const from = CV.matFromArray(4, 1, CV.CV_32FC2, [
      tl.x,
      tl.y,
      tr.x,
      tr.y,
      br.x,
      br.y,
      bl.x,
      bl.y,
    ]);
    const to = CV.matFromArray(4, 1, CV.CV_32FC2, [0, 0, 899, 0, 899, 899, 0, 899]);
    const transform = CV.getPerspectiveTransform(from, to);
    owned.push(from, to, transform);
    CV.warpPerspective(gray, flat, transform, new CV.Size(900, 900));
    CV.adaptiveThreshold(
      flat,
      ink,
      255,
      CV.ADAPTIVE_THRESH_GAUSSIAN_C,
      CV.THRESH_BINARY_INV,
      31,
      12,
    );
    CV.adaptiveThreshold(
      flat,
      recoveryInk,
      255,
      CV.ADAPTIVE_THRESH_GAUSSIAN_C,
      CV.THRESH_BINARY_INV,
      31,
      8,
    );
    await sharp(Buffer.from(flat.data), { raw: { width: 900, height: 900, channels: 1 } })
      .png()
      .toFile(`/tmp/opencode/newspaper-${variant}-flat.png`);
    await sharp(Buffer.from(ink.data), { raw: { width: 900, height: 900, channels: 1 } })
      .negate()
      .png()
      .toFile(`/tmp/opencode/newspaper-${variant}-ink.png`);
    const cells = [];
    for (let index = 0; index < 81; index++) {
      const bounds = cellBounds(ink, index);
      const { top, bottom, left, right } = bounds;
      const width = right - left - 10;
      const height = bottom - top - 10;
      const roi = ink.roi(new CV.Rect(left + 5, top + 5, width, height));
      const labels = new CV.Mat();
      const stats = new CV.Mat();
      const centers = new CV.Mat();
      try {
        const count = CV.connectedComponentsWithStats(roi, labels, stats, centers, 8, CV.CV_32S);
        const components = Array.from({ length: count - 1 }, (_, k) => ({
          x: stats.intAt(k + 1, CV.CC_STAT_LEFT),
          y: stats.intAt(k + 1, CV.CC_STAT_TOP),
          width: stats.intAt(k + 1, CV.CC_STAT_WIDTH),
          height: stats.intAt(k + 1, CV.CC_STAT_HEIGHT),
          area: stats.intAt(k + 1, CV.CC_STAT_AREA),
        }));
        const extracted = extractDigit(CV, ink, index);
        const recovery = analyzeDigit(CV, recoveryInk, index);
        const chosen = extractDigitCell(CV, ink, index, () => recoveryInk);
        cells.push({
          index,
          bounds,
          extracted: extracted ? { width: extracted.width, height: extracted.height } : null,
          recovery: {
            width: recovery.digit?.width,
            height: recovery.digit?.height,
            uncertain: recovery.uncertain,
          },
          chosen: {
            width: chosen.digit?.width,
            height: chosen.digit?.height,
            uncertain: chosen.uncertain,
          },
          components,
        });
      } finally {
        roi.delete();
        labels.delete();
        stats.delete();
        centers.delete();
      }
    }
    results.push({
      variant,
      inputSha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
      points,
      cells,
    });
  } finally {
    for (const mat of owned.reverse()) mat.delete();
  }
}
await writeFile(
  process.argv[3] ?? '/tmp/opencode/ocr-extraction-diagnostics.json',
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      processorSha256: createHash('sha256')
        .update(await readFile('lib/sudoku-image-processing.ts'))
        .digest('hex'),
      thresholds: { block: 31, primary: 12, recovery: 8 },
      results,
    },
    null,
    2,
  )}\n`,
);
