import type { Board } from './sudoku';
import type { OcrResponse, PreprocessResponse } from './sudoku-reader-protocol';
import { needsDeslant, selectDigit } from './digit-recognition';

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
  const pendingRejects = new Set<(error: unknown) => void>();
  let stopped = false;
  const abort = () => {
    for (const worker of workers) worker.terminate();
    for (const reject of pendingRejects)
      reject(signal?.reason ?? new DOMException('Photo reading cancelled.', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });

  function request<T>(
    worker: Worker,
    payload: unknown,
    receive: (data: unknown, resolve: (value: T) => void, reject: (error: unknown) => void) => void,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (stopped) throw new Error('Photo reading stopped.');
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, result?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        pendingRejects.delete(cancel);
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
      const cancel = (error: unknown) => finish(error);
      pendingRejects.add(cancel);
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
    let ocr: Worker;
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
    let initializing: Promise<void> | undefined;
    const initialize = () => {
      if (initializing) return initializing;
      initializing = (async () => {
        signal?.throwIfAborted();
        // Own the worker before its startup handshake so abort can always terminate it.
        ocr = new Worker('/vendor/worker.min.js');
        workers.push(ocr);
        await run('load', { options: { lstmOnly: true, corePath: '/vendor', logging: false } });
        await run('loadLanguage', {
          langs: 'eng',
          options: { langPath: '/vendor', gzip: true, lstmOnly: true },
        });
        await run('initialize', { langs: 'eng', oem: 1, config: {} });
        await run('setParameters', {
          params: { tessedit_char_whitelist: '123456789', tessedit_pageseg_mode: '8' },
        });
      })();
      return initializing;
    };
    progress('Loading the local image reader…');
    const preprocessing = new Worker(new URL('./sudoku-preprocess.worker.ts', import.meta.url));
    workers.push(preprocessing);
    const { cells, uncertain: extractionUncertain = [] } = await request<
      Extract<PreprocessResponse, { type: 'result' }>
    >(preprocessing, { file }, (value, resolve, reject) => {
      const data = value as PreprocessResponse;
      if (data.type === 'progress') {
        if (data.stage === 'processing') void initialize().catch(reject);
        progress(data.message);
      } else if (data.type === 'error') reject(new Error(data.message));
      else if (data.type === 'result') resolve(data);
    });
    preprocessing.terminate();
    signal?.throwIfAborted();
    if (!cells.length) throw new Error('No digits were recognized. Try a sharper photo.');
    progress('Loading local digit recognition…');
    await initialize();
    const board: Board = Array(81).fill(0);
    const uncertain = new Set(extractionUncertain);
    for (const { index, image, deslanted } of cells) {
      progress(`Reading cells… ${index + 1} / 81`);
      const result = await run('recognize', { image, options: {}, output: { text: true } });
      const alternative =
        deslanted && needsDeslant(result)
          ? await run('recognize', { image: deslanted, options: {}, output: { text: true } })
          : undefined;
      const selected = selectDigit(result, alternative);
      board[index] = selected.digit;
      if (selected.uncertain) uncertain.add(index);
    }
    if (!board.some(Boolean)) throw new Error('No digits were recognized. Try a sharper photo.');
    signal?.throwIfAborted();
    return { board, uncertain: [...uncertain].sort((a, b) => a - b) };
  } finally {
    stopped = true;
    signal?.removeEventListener('abort', abort);
    for (const reject of pendingRejects) reject(new Error('Photo reading stopped.'));
    for (const worker of workers) worker.terminate();
  }
}
