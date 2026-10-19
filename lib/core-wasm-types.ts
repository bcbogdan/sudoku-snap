export interface PuzzleRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  clues: number[];
  status: 'draft' | 'ready';
  uncertain: number[];
  revision: number;
  shareKey?: string;
}
export interface PositionRecord {
  board: number[];
  notes: number[][];
  mistakes: number;
}
export interface MoveRecord {
  cell: number;
  kind: 'entry' | 'note' | 'undo';
  undoOf?: number;
  value: number;
  at: number;
  elapsedMs: number;
  position: PositionRecord;
}
export interface AttemptHeader {
  id: string;
  puzzleId: string;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  activeMs?: number;
  lastActiveEnd?: number;
  revision: number;
}
export interface AttemptRecord extends AttemptHeader {
  initial: PositionRecord;
  moves: MoveRecord[];
}
export type Command =
  | { kind: 'setEntry' | 'enterDigit'; cell: number; value: number; check: boolean }
  | { kind: 'toggleNote'; cell: number; value: number }
  | { kind: 'erase'; cell: number }
  | { kind: 'undo' | 'checkpoint' };
export interface CommandContext {
  at: number;
  focusedInterval?: { start: number; end: number };
  normalizeLegacyTime: boolean;
}
export interface CandidateProjection {
  header: AttemptHeader;
  appendedMove: MoveRecord | null;
  current: PositionRecord;
  effect: 'unchanged' | 'metadataOnly' | 'appendedMove';
}
export interface SharedPuzzle {
  clues: number[];
  name: string;
  shareKey: string;
  legacyShareKey: string;
}
export type CoreErrorCode =
  | 'InvalidInput'
  | 'InvalidUnicode'
  | 'Disposed'
  | 'InvalidBoard'
  | 'InvalidMove'
  | 'InvalidNotes'
  | 'InvalidHistory'
  | 'InvalidRecord'
  | 'InvalidTime'
  | 'InvalidInterval'
  | 'Overflow'
  | 'Locked'
  | 'StaleCandidate'
  | 'TooFewClues'
  | 'NoEmptyCells'
  | 'NoSolution'
  | 'Ambiguous'
  | 'InvalidLink'
  | 'ConflictingClues'
  | 'InvalidName';

/** Structural contract implemented by both generated wasm-bindgen targets. */
export interface WasmBindings {
  WasmSession: {
    restore(puzzle: string, attempt: string): RawSession;
    create(puzzle: string, id: string, at: string): RawSession;
  };
  finalize_puzzle(draft: string, at: string): string;
  encode_shared(board: string): string;
  decode_shared(encoded: string, name?: string): string;
}
export interface RawSession {
  prepare(command: string, context: string): RawCandidate;
  accept(candidate: RawCandidate): void;
  current(): string;
  position_at(step: string): string;
  export_record(): string;
  free(): void;
}
export interface RawCandidate {
  project(): string;
  free(): void;
}
