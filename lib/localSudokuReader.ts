import type { Board } from './sudoku';
import type { OcrResponse, PreprocessResponse } from './sudoku-reader-protocol';

export async function readSudoku(
  file: File,
  progress: (message: string) => void,
  options: { signal?: AbortSignal } = {},
): Promise<{ board: Board; uncertain: number[] }> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  )
    throw new Error(
      'Photo reading needs browser workers, OffscreenCanvas and ImageBitmap support. Update your browser, or enter clues by hand.',
    );

  const workers: Worker[] = [];
  let pendingReject: ((error: unknown) => void) | undefined;
  const abort = () => {
    for (const worker of workers) worker.terminate();
    pendingReject?.(signal?.reason ?? new DOMException('Photo reading cancelled.', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });

  function request<T>(
    worker: Worker,
    payload: unknown,
    receive: (data: unknown, resolve: (value: T) => void, reject: (error: unknown) => void) => void,
  ): Promise<T> {
    signal?.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const finish = (error?: unknown, result?: T) => {
        clearTimeout(timeout);
        pendingReject = undefined;
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        if (error !== undefined) reject(error);
        else resolve(result as T);
      };
      const timeout = setTimeout(
        () => finish(new Error('Photo reading took too long. Please retry with a smaller photo.')),
        60000,
      );
      pendingReject = (error) => finish(error);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(
          new Error(
            `The local image reader failed: ${event.message || 'worker could not load'}. Please retry.`,
          ),
        );
      };
      worker.onmessageerror = () =>
        finish(new Error('The local image reader returned an unreadable message. Please retry.'));
      worker.onmessage = ({ data }) => {
        try {
          receive(
            data,
            (value) => finish(undefined, value),
            (error) => finish(error),
          );
        } catch (error) {
          finish(error);
        }
      };
      try {
        worker.postMessage(payload);
      } catch (error) {
        finish(error);
      }
    });
  }

  try {
    progress('Loading the local image reader…');
    const preprocessing = new Worker(new URL('./sudoku-preprocess.worker.ts', import.meta.url));
    workers.push(preprocessing);
    const { cells } = await request<Extract<PreprocessResponse, { type: 'result' }>>(
      preprocessing,
      { file },
      (value, resolve, reject) => {
        const data = value as PreprocessResponse;
        if (data.type === 'progress') progress(data.message);
        else if (data.type === 'error') reject(new Error(data.message));
        else if (data.type === 'result') resolve(data);
      },
    );
    preprocessing.terminate();
    // Own the Tesseract worker before initialization so cancellation can terminate it
    // even while createWorker would still be awaiting its startup handshake.
    // This job protocol is covered by the real OCR fixtures; recheck it on upgrades.
    const ocr = new Worker('/vendor/worker.min.js');
    workers.push(ocr);
    let nextJob = 0;
    const run = (action: string, payload: unknown) => {
      const jobId = String(nextJob++);
      return request<{ text: string; confidence: number }>(
        ocr,
        { workerId: 'sudoku', jobId, action, payload },
        (value, resolve, reject) => {
          const response = value as OcrResponse;
          if (response.jobId !== jobId) return;
          if (response.status === 'reject') reject(new Error(String(response.data)));
          else if (response.status === 'resolve')
            resolve(response.data as { text: string; confidence: number });
        },
      );
    };
    progress('Loading local digit recognition…');
    await run('load', { options: { lstmOnly: true, corePath: '/vendor', logging: false } });
    await run('loadLanguage', {
      langs: 'eng',
      options: { langPath: '/vendor', gzip: true, lstmOnly: true },
    });
    await run('initialize', { langs: 'eng', oem: 1, config: {} });
    await run('setParameters', {
      params: { tessedit_char_whitelist: '123456789', tessedit_pageseg_mode: '8' },
    });
    const board: Board = Array(81).fill(0);
    const uncertain: number[] = [];
    for (const { index, image } of cells) {
      progress(`Reading cells… ${index + 1} / 81`);
      const result = await run('recognize', { image, options: {}, output: { text: true } });
      const text = result.text.trim();
      if (/^[1-9]$/.test(text)) {
        board[index] = Number(text);
        if (result.confidence < 65) uncertain.push(index);
      } else uncertain.push(index);
    }
    if (!board.some(Boolean)) throw new Error('No digits were recognized. Try a sharper photo.');
    signal?.throwIfAborted();
    return { board, uncertain };
  } finally {
    signal?.removeEventListener('abort', abort);
    for (const worker of workers) worker.terminate();
  }
}
