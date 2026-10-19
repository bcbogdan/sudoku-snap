export interface PreprocessRequest {
  file: File;
}

export type PreprocessResponse =
  | { type: 'progress'; message: string }
  | { type: 'result'; cells: { index: number; image: Uint8Array }[] }
  | { type: 'error'; message: string };

// Tesseract's local worker uses the same job protocol as its createWorker wrapper.
// Owning the Worker directly lets abort terminate even a pending initialization.
export interface OcrResponse {
  jobId: string;
  status: 'progress' | 'resolve' | 'reject';
  data: { text: string; confidence: number } | string;
}
