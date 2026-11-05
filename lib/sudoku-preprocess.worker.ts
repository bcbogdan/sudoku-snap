/// <reference lib="webworker" />

import type CV from '@techstark/opencv-js';
import { detectGrid, extractDigitCell } from './sudoku-image-processing';
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
  progress: (message: string, stage?: 'processing') => void,
): Promise<{
  cells: { index: number; image: Uint8Array; deslanted: Uint8Array }[];
  uncertain: number[];
}> {
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
    progress('Finding the Sudoku grid…', 'processing');
    const src = own(
        cv.matFromImageData(
          source.getContext('2d')!.getImageData(0, 0, source.width, source.height),
        ),
      ),
      gray = own(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const points = detectGrid(cv, gray);
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
    const cells: { index: number; image: Uint8Array; deslanted: Uint8Array }[] = [];
    const uncertain: number[] = [];
    let recoveryInk: CV.Mat | undefined;
    const recoverInk = () => {
      if (!recoveryInk) {
        recoveryInk = own(new cv.Mat());
        cv.adaptiveThreshold(
          flat,
          recoveryInk,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          31,
          8,
        );
      }
      return recoveryInk;
    };
    for (let index = 0; index < 81; index++) {
      const { digit: extracted, uncertain: partial } = extractDigitCell(cv, ink, index, recoverInk);
      if (partial) uncertain.push(index);
      if (!extracted) continue;
      const { width: w, height: h, pixels } = extracted;
      const digit = canvas(w, h),
        ctx = digit.getContext('2d')!,
        data = new ImageData(pixels, w, h);
      ctx.putImageData(data, 0, 0);
      const normalized = canvas(160, 160),
        nctx = normalized.getContext('2d')!;
      nctx.fillStyle = 'white';
      nctx.fillRect(0, 0, 160, 160);
      const factor = 110 / Math.max(w, h);
      nctx.drawImage(digit, (160 - w * factor) / 2, (160 - h * factor) / 2, w * factor, h * factor);
      const blob = await normalized.convertToBlob({ type: 'image/png' });
      // A bounded alternate view counteracts a modest right-leaning italic
      // stroke. OCR uses it only when the unchanged primary read is weak.
      const deslanted = canvas(160, 160),
        dctx = deslanted.getContext('2d')!;
      dctx.fillStyle = 'white';
      dctx.fillRect(0, 0, 160, 160);
      dctx.translate(80, 80);
      dctx.transform(1, 0, -0.2, 1, 0, 0);
      dctx.drawImage(normalized, -80, -80);
      const alternate = await deslanted.convertToBlob({ type: 'image/png' });
      cells.push({
        index,
        image: new Uint8Array(await blob.arrayBuffer()),
        deslanted: new Uint8Array(await alternate.arrayBuffer()),
      });
    }
    return { cells, uncertain };
  } finally {
    for (const mat of mats.reverse()) mat.delete();
  }
}

self.onmessage = async ({ data }: MessageEvent<PreprocessRequest>) => {
  const send = (message: PreprocessResponse, transfer: Transferable[] = []) =>
    self.postMessage(message, transfer);
  try {
    const result = await preprocess(data.file, (message, stage) =>
      send({ type: 'progress', message, stage }),
    );
    send(
      { type: 'result', ...result },
      result.cells.flatMap(({ image, deslanted }) => [
        image.buffer as ArrayBuffer,
        deslanted.buffer as ArrayBuffer,
      ]),
    );
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
