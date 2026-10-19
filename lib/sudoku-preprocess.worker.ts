/// <reference lib="webworker" />

import type CV from '@techstark/opencv-js';
import { hasDarkBackground } from './image-polarity';
import type { PreprocessRequest, PreprocessResponse } from './sudoku-reader-protocol';

declare const self: DedicatedWorkerGlobalScope & { cv: typeof CV };
let cvPromise: Promise<{ cv: typeof CV }> | undefined;
function loadCV(): Promise<{ cv: typeof CV }> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Image reader took too long to load. Please retry.')),
      60000,
    );
    try {
      self.importScripts('/vendor/opencv.js');
      const module = self.cv;
      const ready = () => {
        clearTimeout(timeout);
        resolve({ cv: module });
      };
      // Do not resolve a Promise with the legacy Emscripten module itself: its
      // then() returns itself, causing endless Promise assimilation.
      if (module.Mat) ready();
      else module.onRuntimeInitialized = ready;
    } catch (error) {
      clearTimeout(timeout);
      reject(
        new Error(
          'Could not load the local image reader. Reload the page and retry, or enter clues by hand.',
          { cause: error },
        ),
      );
    }
  }).catch((error) => {
    cvPromise = undefined;
    throw error;
  }) as Promise<{ cv: typeof CV }>;
  return cvPromise;
}
function canvas(width: number, height: number) {
  return new OffscreenCanvas(width, height);
}
async function preprocess(
  file: File,
  progress: (message: string) => void,
): Promise<{ cells: { index: number; image: Uint8Array }[] }> {
  progress('Loading the local image reader…');
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined')
    throw new Error(
      'Photo reading needs OffscreenCanvas and ImageBitmap support. Update your browser, or enter clues by hand.',
    );
  const { cv } = await loadCV();
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const source = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  try {
    source.getContext('2d')!.drawImage(bitmap, 0, 0, source.width, source.height);
  } finally {
    bitmap.close();
  }
  const mats: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    progress('Finding the Sudoku grid…');
    const src = own(
        cv.matFromImageData(
          source.getContext('2d')!.getImageData(0, 0, source.width, source.height),
        ),
      ),
      gray = own(new cv.Mat()),
      blur = own(new cv.Mat()),
      binary = own(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Normalize white-on-dark screenshots before grid detection and digit extraction.
    if (hasDarkBackground(gray.data, gray.cols, gray.rows)) cv.bitwise_not(gray, gray);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(
      blur,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      9,
    );
    const contours = own(new cv.MatVector()),
      hierarchy = own(new cv.Mat());
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let bestArea = 0;
    let points: { x: number; y: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i),
        approx = new cv.Mat();
      try {
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        const area = cv.contourArea(contour);
        if (
          approx.rows === 4 &&
          area > bestArea &&
          area > source.width * source.height * 0.12 &&
          cv.isContourConvex(approx)
        ) {
          bestArea = area;
          points = Array.from({ length: 4 }, (_, j) => ({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          }));
        }
      } finally {
        contour.delete();
        approx.delete();
      }
    }
    if (points.length !== 4)
      throw new Error('Could not find a Sudoku grid. Try a clear photo of the whole board.');
    const tl = points.reduce((a, b) => (a.x + a.y < b.x + b.y ? a : b)),
      br = points.reduce((a, b) => (a.x + a.y > b.x + b.y ? a : b));
    const tr = points.reduce((a, b) => (a.x - a.y > b.x - b.y ? a : b)),
      bl = points.reduce((a, b) => (a.x - a.y < b.x - b.y ? a : b));
    if (new Set([tl, tr, br, bl]).size !== 4)
      throw new Error('Please rotate the photo so the board is upright.');
    const from = own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]),
    );
    const to = own(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 899, 0, 899, 899, 0, 899]));
    const transform = own(cv.getPerspectiveTransform(from, to)),
      flat = own(new cv.Mat()),
      ink = own(new cv.Mat());
    cv.warpPerspective(gray, flat, transform, new cv.Size(900, 900));
    cv.adaptiveThreshold(
      flat,
      ink,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      12,
    );
    const cells: { index: number; image: Uint8Array }[] = [];
    for (let index = 0; index < 81; index++) {
      const roi = ink.roi(
        new cv.Rect((index % 9) * 100 + 10, Math.floor(index / 9) * 100 + 10, 80, 80),
      );
      const labels = new cv.Mat(),
        stats = new cv.Mat(),
        centers = new cv.Mat();
      try {
        const count = cv.connectedComponentsWithStats(roi, labels, stats, centers, 8, cv.CV_32S);
        let selected = 0,
          best = 0;
        for (let k = 1; k < count; k++) {
          const x = stats.intAt(k, cv.CC_STAT_LEFT),
            y = stats.intAt(k, cv.CC_STAT_TOP),
            w = stats.intAt(k, cv.CC_STAT_WIDTH),
            h = stats.intAt(k, cv.CC_STAT_HEIGHT),
            area = stats.intAt(k, cv.CC_STAT_AREA);
          if (
            x <= 1 ||
            y <= 1 ||
            x + w >= 79 ||
            y + h >= 79 ||
            h < 22 ||
            w < 5 ||
            area < 65 ||
            Math.abs(x + w / 2 - 40) > 22 ||
            Math.abs(y + h / 2 - 40) > 22
          )
            continue;
          if (area > best) {
            selected = k;
            best = area;
          }
        }
        if (!selected) continue;
        const x = stats.intAt(selected, cv.CC_STAT_LEFT),
          y = stats.intAt(selected, cv.CC_STAT_TOP),
          w = stats.intAt(selected, cv.CC_STAT_WIDTH),
          h = stats.intAt(selected, cv.CC_STAT_HEIGHT);
        const digit = canvas(w, h),
          ctx = digit.getContext('2d')!,
          data = ctx.createImageData(w, h);
        for (let py = 0; py < h; py++)
          for (let px = 0; px < w; px++) {
            const offset = (py * w + px) * 4,
              value = labels.intAt(y + py, x + px) === selected ? 0 : 255;
            data.data[offset] = value;
            data.data[offset + 1] = value;
            data.data[offset + 2] = value;
            data.data[offset + 3] = 255;
          }
        ctx.putImageData(data, 0, 0);
        const normalized = canvas(160, 160),
          nctx = normalized.getContext('2d')!;
        nctx.fillStyle = 'white';
        nctx.fillRect(0, 0, 160, 160);
        const factor = 110 / Math.max(w, h);
        nctx.drawImage(
          digit,
          (160 - w * factor) / 2,
          (160 - h * factor) / 2,
          w * factor,
          h * factor,
        );
        const blob = await normalized.convertToBlob({ type: 'image/png' });
        cells.push({ index, image: new Uint8Array(await blob.arrayBuffer()) });
      } finally {
        roi.delete();
        labels.delete();
        stats.delete();
        centers.delete();
      }
    }
    return { cells };
  } finally {
    for (const mat of mats.reverse()) mat.delete();
  }
}

self.onmessage = async ({ data }: MessageEvent<PreprocessRequest>) => {
  const send = (message: PreprocessResponse, transfer: Transferable[] = []) =>
    self.postMessage(message, transfer);
  try {
    const result = await preprocess(data.file, (message) => send({ type: 'progress', message }));
    send(
      { type: 'result', ...result },
      result.cells.map(({ image }) => image.buffer as ArrayBuffer),
    );
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
