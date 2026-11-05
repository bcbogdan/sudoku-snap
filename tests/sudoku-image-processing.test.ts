import assert from 'node:assert/strict';
import { test } from 'node:test';
import CV from '@techstark/opencv-js';
import sharp from 'sharp';
import { detectGrid, extractDigit, findGridCorners } from '../lib/sudoku-image-processing';
import manifest from './fixtures/ocr-evaluation/manifest.json';

// The legacy Emscripten module is thenable and must never itself resolve a Promise.
const ready = new Promise<void>((resolve) => {
  if (CV.Mat) resolve();
  else (CV as typeof CV & { onRuntimeInitialized: () => void }).onRuntimeInitialized = resolve;
});

test('extraction keeps tall/wide centered glyphs inside a cell without retaining grid borders', async () => {
  await ready;
  const ink = CV.Mat.zeros(900, 900, CV.CV_8UC1);
  try {
    CV.rectangle(ink, new CV.Point(0, 0), new CV.Point(99, 99), new CV.Scalar(255), 5);
    CV.rectangle(ink, new CV.Point(20, 20), new CV.Point(85, 89), new CV.Scalar(255), -1);
    const digit = extractDigit(CV, ink, 0);
    assert.ok(digit, 'a glyph ending at pixel 89 is not a grid-border artifact');
    assert.equal(digit.width, 66);
    assert.equal(digit.height, 70);
    assert.equal(extractDigit(CV, ink, 1), null, 'blank cells remain blank');
    CV.rectangle(ink, new CV.Point(100, 0), new CV.Point(199, 99), new CV.Scalar(255), 5);
    assert.equal(extractDigit(CV, ink, 1), null, 'grid lines alone are not digits');
  } finally {
    ink.delete();
  }
});

test('grid contour geometry is independent of absolute paper brightness', async () => {
  await ready;
  const binary = CV.Mat.zeros(500, 500, CV.CV_8UC1);
  try {
    CV.rectangle(binary, new CV.Point(50, 50), new CV.Point(450, 450), new CV.Scalar(255), 3);
    assert.equal(findGridCorners(CV, binary).length, 4);
  } finally {
    binary.delete();
  }
});

test('detection retains low-light and white-on-dark grid contours and rejects uniform images', async () => {
  await ready;
  for (const [background, foreground] of [
    [100, 10],
    [30, 240],
  ]) {
    const gray = new CV.Mat(500, 500, CV.CV_8UC1, new CV.Scalar(background));
    try {
      assert.equal(
        detectGrid(CV, gray).length,
        0,
        'uniform images have no grid in either polarity',
      );
      gray.setTo(new CV.Scalar(background));
      for (let line = 0; line < 10; line++) {
        const position = 50 + line * 44;
        CV.line(
          gray,
          new CV.Point(position, 50),
          new CV.Point(position, 446),
          new CV.Scalar(foreground),
          3,
        );
        CV.line(
          gray,
          new CV.Point(50, position),
          new CV.Point(446, position),
          new CV.Scalar(foreground),
          3,
        );
      }
      const corners = detectGrid(CV, gray);
      assert.equal(corners.length, 4, `background=${background} foreground=${foreground}`);
      assert.ok(corners.every(({ x, y }) => x >= 45 && y >= 45 && x <= 451 && y <= 451));
    } finally {
      gray.delete();
    }
  }
});

test('shadowed newspaper contour survives the brightness heuristic with the extraction polarity restored', async () => {
  await ready;
  const { data, info } = await sharp('tests/fixtures/ocr-evaluation/opencv-paper.png')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const src = CV.matFromImageData({ data, width: info.width, height: info.height });
  const gray = new CV.Mat();
  try {
    CV.cvtColor(src, gray, CV.COLOR_RGBA2GRAY);
    const original = new Uint8Array(gray.data);
    assert.equal(detectGrid(CV, gray).length, 4);
    assert.deepEqual(gray.data, original, 'paper must not remain inverted after successful retry');
  } finally {
    src.delete();
    gray.delete();
  }
});

for (const { file, rows } of manifest.filter(({ id }) =>
  ['rozet-rendered', 'opencv-paper'].includes(id),
))
  test(`all clues in ${file} reach recognition, with no extracted blank cells`, async () => {
    await ready;
    const { data, info } = await sharp(`tests/fixtures/ocr-evaluation/${file}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const src = CV.matFromImageData({ data, width: info.width, height: info.height });
    const gray = new CV.Mat();
    const flat = new CV.Mat();
    const ink = new CV.Mat();
    const owned = [src, gray, flat, ink];
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
      const indices = Array.from({ length: 81 }, (_, index) => index).filter((index) =>
        extractDigit(CV, ink, index),
      );
      // Independently transcribed fixture truth; production never receives these indices.
      assert.deepEqual(
        indices,
        [...rows.join('')].flatMap((value, index) => (value === '0' ? [] : [index])),
      );
    } finally {
      for (const mat of owned.reverse()) mat.delete();
    }
  });

test('local grid support preserves digits crossing nominal cell boundaries on bowed paper', async () => {
  await ready;
  const ink = CV.Mat.zeros(900, 900, CV.CV_8UC1);
  try {
    const data = ink.data;
    for (let line = 0; line < 10; line++) {
      for (let x = 0; x < 900; x++) {
        const y = Math.min(899, line * 100 + Math.round(14 * Math.sin((x * Math.PI) / 900)));
        for (let dy = -1; dy <= 1; dy++)
          if (y + dy >= 0 && y + dy < 900) data[(y + dy) * 900 + x] = 255;
      }
      CV.line(
        ink,
        new CV.Point(Math.min(899, line * 100), 0),
        new CV.Point(Math.min(899, line * 100), 899),
        new CV.Scalar(255),
        3,
      );
    }
    CV.rectangle(ink, new CV.Point(440, 35), new CV.Point(470, 101), new CV.Scalar(255), -1);
    const digit = extractDigit(CV, ink, 4);
    assert.ok(
      digit,
      'a clue can extend below the nominal row boundary without touching its actual border',
    );
    assert.equal(digit.height, 67);
    assert.equal(digit.width, 31);
    assert.equal(extractDigit(CV, ink, 5), null);
  } finally {
    ink.delete();
  }
});
