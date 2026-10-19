import type {
  AttemptRecord,
  CandidateProjection,
  Command,
  CommandContext,
  CoreErrorCode,
  PositionRecord,
  PuzzleRecord,
  RawCandidate,
  RawSession,
  SharedPuzzle,
  WasmBindings,
} from './core-wasm-types';

export class CoreWasmError extends Error {
  constructor(
    public readonly code: CoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CoreWasmError';
  }
}

function validString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new CoreWasmError('InvalidUnicode', 'Unpaired UTF-16 surrogate.');
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new CoreWasmError('InvalidUnicode', 'Unpaired UTF-16 surrogate.');
    }
  }
}

// Validate before stringify: JSON would silently coerce NaN, omit undefined,
// invoke toJSON, and escape lone surrogates instead of preserving the boundary.
function encode(value: unknown): string {
  const ancestors = new Set<object>();
  function visit(v: unknown): void {
    if (typeof v === 'string') return validString(v);
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v) || v < 0)
        throw new CoreWasmError('InvalidInput', 'Expected a nonnegative safe integer.');
      return;
    }
    if (v === null || typeof v === 'boolean') return;
    if (typeof v !== 'object') throw new CoreWasmError('InvalidInput', 'Expected JSON data.');
    if (ancestors.has(v)) throw new CoreWasmError('InvalidInput', 'Cyclic JSON data.');
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    ) {
      throw new CoreWasmError('InvalidInput', 'Expected a plain record.');
    }
    ancestors.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) visit(v[i]);
    } else {
      for (const key of Object.keys(v)) {
        validString(key);
        const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
        if (!('value' in descriptor))
          throw new CoreWasmError('InvalidInput', 'Accessors are not JSON data.');
        visit(descriptor.value);
      }
    }
    ancestors.delete(v);
  }
  visit(value);
  return JSON.stringify(value);
}

function call<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CoreWasmError) throw error;
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
      throw new CoreWasmError(error.code as CoreErrorCode, error.message);
    }
    throw error;
  }
}

const candidateHandles = new WeakMap<CoreCandidate, RawCandidate>();
class CoreCandidate {
  private constructor(raw: RawCandidate) {
    candidateHandles.set(this, raw);
  }
  static fromPrepared(raw: RawCandidate): CoreCandidate {
    return new CoreCandidate(raw);
  }
  project(): CandidateProjection {
    const raw = candidateHandles.get(this);
    if (!raw) throw new CoreWasmError('StaleCandidate', 'Candidate already consumed or disposed.');
    return call(() => JSON.parse(raw.project()) as CandidateProjection);
  }
  free(): void {
    const raw = candidateHandles.get(this);
    if (raw) {
      candidateHandles.delete(this);
      raw.free();
    }
  }
}

class CoreSession {
  #raw: RawSession | undefined;
  constructor(raw: RawSession) {
    this.#raw = raw;
  }
  #handle(): RawSession {
    if (!this.#raw) throw new CoreWasmError('Disposed', 'Session disposed.');
    return this.#raw;
  }
  prepare(command: Command, context: CommandContext): CoreCandidate {
    return call(() =>
      CoreCandidate.fromPrepared(this.#handle().prepare(encode(command), encode(context))),
    );
  }
  accept(candidate: CoreCandidate): void {
    const raw = candidateHandles.get(candidate);
    if (!raw) throw new CoreWasmError('StaleCandidate', 'Candidate already consumed or disposed.');
    try {
      const session = this.#handle();
      call(() => session.accept(raw));
    } finally {
      candidate.free();
    }
  }
  current(): PositionRecord {
    return call(() => JSON.parse(this.#handle().current()) as PositionRecord);
  }
  positionAt(step: number): PositionRecord {
    return call(() => JSON.parse(this.#handle().position_at(encode(step))) as PositionRecord);
  }
  exportRecord(): AttemptRecord {
    return call(() => JSON.parse(this.#handle().export_record()) as AttemptRecord);
  }
  free(): void {
    this.#raw?.free();
    this.#raw = undefined;
  }
}

export type { CoreCandidate, CoreSession };

export interface CoreWasm {
  restore(puzzle: PuzzleRecord, attempt: AttemptRecord): CoreSession;
  create(puzzle: PuzzleRecord, id: string, at: number): CoreSession;
  finalizePuzzle(draft: PuzzleRecord, at: number): PuzzleRecord;
  encodeShared(board: number[]): string;
  decodeShared(encoded: string, name?: string): SharedPuzzle;
}

/** The loader initializes the generated web module or loads the Node target.
 * Await this before opening a storage transaction; all returned methods are sync. */
export async function initializeCoreWasm(load: () => Promise<WasmBindings>): Promise<CoreWasm> {
  const bindings = await load();
  return {
    restore: (puzzle, attempt) =>
      call(() => new CoreSession(bindings.WasmSession.restore(encode(puzzle), encode(attempt)))),
    create: (puzzle, id, at) =>
      call(() => {
        encode(id);
        return new CoreSession(bindings.WasmSession.create(encode(puzzle), id, encode(at)));
      }),
    finalizePuzzle: (draft, at) =>
      call(() => JSON.parse(bindings.finalize_puzzle(encode(draft), encode(at))) as PuzzleRecord),
    encodeShared: (board) => call(() => bindings.encode_shared(encode(board))),
    decodeShared: (encoded, name) =>
      call(() => {
        encode(encoded);
        if (name !== undefined) encode(name);
        return JSON.parse(bindings.decode_shared(encoded, name)) as SharedPuzzle;
      }),
  };
}
