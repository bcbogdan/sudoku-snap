'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import NumberDial from './NumberDial';
import AppHeader from './components/AppHeader';
import AttemptHistory from './components/AttemptHistory';
import CreatePuzzle from './components/CreatePuzzle';
import CopyNotice from './components/CopyNotice';
import GameToolbar from './components/GameToolbar';
import NumberKeypad from './components/NumberKeypad';
import PuzzleActions from './components/PuzzleActions';
import PuzzleDetail from './components/PuzzleDetail';
import PuzzleLibrary from './components/PuzzleLibrary';
import PuzzleTitle from './components/PuzzleTitle';
import StatusNotice from './components/StatusNotice';
import SudokuBoard from './components/SudokuBoard';
import OriginalPhoto from './components/OriginalPhoto';
import AttemptTimer from './components/AttemptTimer';
import { CommandQueue, type QueueStatus } from '@/lib/command-queue';
import { useFocusTimer } from '@/lib/use-focus-timer';
import { puzzleShareURL } from '@/lib/sharing';
import { solveCached } from '@/lib/solver-client';
import {
  durationLabel,
  undoTarget,
  initialPosition,
  positionAt,
  type Attempt,
  type Puzzle,
} from '@/lib/attempts';
import {
  createPuzzle,
  importSharedPuzzle,
  removePuzzle,
  getPuzzle,
  getAttempt,
  listAttemptSummaries,
  listPuzzleSummaries,
  type AttemptSummary,
  recordMove,
  undoLastMove,
  renamePuzzle,
  saveDraft,
  startAttempt,
} from '@/lib/storage';

function puzzleURL(id: string) {
  return `/?puzzle=${encodeURIComponent(id)}`;
}
function attemptURL(puzzleId: string, id: string) {
  return `${puzzleURL(puzzleId)}&attempt=${encodeURIComponent(id)}`;
}
function dateLabel(value: number) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Sudoku() {
  const [loaded, setLoaded] = useState(false),
    [screen, setScreen] = useState<'library' | 'create' | 'review' | 'detail' | 'play'>('library');
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]),
    [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null);
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState(0),
    [notesMode, setNotesMode] = useState(false),
    [check, setCheck] = useState(true);
  const [actionBusy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ pending: 0, error: '' });
  const queue = useRef<CommandQueue | null>(null);
  const committed = useRef({ puzzle, attempt });
  function publishPuzzle(value: Puzzle) {
    committed.current.puzzle = value;
    setPuzzle(value);
  }
  function publishAttempt(value: Attempt) {
    committed.current.attempt = value;
    setAttempt(value);
  }
  const mounted = useRef(true);
  const photoController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const commands = new CommandQueue(setQueueStatus);
    queue.current = commands;
    const stop = () => {
      mounted.current = false;
      queue.current?.dispose();
      photoController.current?.abort();
    };
    const resume = (event: PageTransitionEvent) => {
      // A frozen page may have missed the final transaction's publication.
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', resume);
    return () => {
      mounted.current = false;
      queue.current?.dispose();
      photoController.current?.abort();
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pageshow', resume);
    };
  }, []);
  const busy = actionBusy || queueStatus.pending > 0;
  const [timerError, setTimerError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const saving = useRef(false);
  const [copySequence, setCopySequence] = useState(0);
  const [dialCell, setDialCell] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false),
    [nameValue, setNameValue] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        const query = new URLSearchParams(window.location.search),
          id = query.get('puzzle'),
          attemptId = query.get('attempt');
        if (query.has('p')) {
          const imported = await importSharedPuzzle(query.get('p')!, query.get('n'));
          if (cancelled) return;
          publishPuzzle(imported);
          setAttempts(await listAttemptSummaries(imported.id));
          setScreen(imported.status === 'draft' ? 'review' : 'detail');
          window.history.replaceState(null, '', puzzleURL(imported.id));
          return;
        }
        if (query.has('new')) setScreen('create');
        else if (id) {
          const p = await getPuzzle(id);
          if (cancelled) return;
          if (!p) {
            setMessage('This puzzle is not saved in this browser.');
            return;
          }
          publishPuzzle(p);
          if (attemptId) {
            const a = await getAttempt(attemptId);
            if (cancelled) return;
            if (!a || a.puzzleId !== id) {
              setMessage('This attempt is unavailable.');
              setAttempts(await listAttemptSummaries(id));
              setScreen('detail');
              return;
            }
            publishAttempt(a);
            setStep(a.moves.length);
            setSelected(
              Math.max(
                0,
                p.clues.findIndex((v) => !v),
              ),
            );
            setScreen('play');
          } else {
            if (p.status === 'ready') setAttempts(await listAttemptSummaries(id));
            if (!cancelled) setScreen(p.status === 'draft' ? 'review' : 'detail');
          }
        } else {
          const [saved, plays] = await Promise.all([listPuzzleSummaries(), listAttemptSummaries()]);
          if (cancelled) return;
          setPuzzles(saved);
          setAttempts(plays);
        }
      })
      .catch((error) => {
        if (!cancelled)
          setMessage(error instanceof Error ? error.message : 'Local storage is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const focusTimer = useFocusTimer(attempt, setTimerError);
  const clueKey = puzzle?.status === 'ready' ? puzzle.clues.join('') : '';
  const [solution, setSolution] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSolution(null);
    if (clueKey)
      void solveCached(Array.from(clueKey, Number))
        .then((result) => {
          if (!cancelled) setSolution(result.solution);
        })
        .catch((error) => {
          if (!cancelled) setMessage(String(error));
        });
    return () => {
      cancelled = true;
    };
  }, [clueKey]);
  const position = useMemo(
    () => (attempt ? positionAt(attempt, step) : puzzle ? initialPosition(puzzle.clues) : null),
    [attempt, step, puzzle],
  );
  const board = position?.board ?? [];
  const wrongCells = useMemo(
    () =>
      position && solution && screen === 'play' && check
        ? position.board.flatMap((value, cell) =>
            value && !puzzle?.clues[cell] && solution?.[cell] !== value ? [cell] : [],
          )
        : [],
    [position, screen, check, puzzle, solution],
  );
  const historical = !!attempt && step < attempt.moves.length,
    complete = attempt?.completedAt !== null && !!attempt;
  const readOnly = historical || complete;
  const elapsed = attempt
    ? historical
      ? step
        ? attempt.moves[step - 1].elapsedMs
        : 0
      : attempt.durationMs
    : 0;
  async function action(work: () => Promise<void>) {
    if (saving.current || queueStatus.pending) return;
    saving.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      if (mounted.current && !(error instanceof DOMException && error.name === 'AbortError'))
        setMessage(error instanceof Error ? error.message : 'Could not save. Please try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const onImagePaste = useEffectEvent((event: ClipboardEvent) => {
    const file = Array.from(event.clipboardData?.files ?? []).find((file) =>
      file.type.startsWith('image/'),
    );
    if (!file) return;
    event.preventDefault();
    void upload(file);
  });
  useEffect(() => {
    if (screen !== 'create') return;
    const paste = (event: ClipboardEvent) => onImagePaste(event);
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [screen]);
  async function processPhoto(file: File, controller = new AbortController()) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Please use an image smaller than 20 MB.');
    photoController.current = controller;
    const { signal } = controller;
    const { readSudoku } = await import('@/lib/localSudokuReader');
    signal.throwIfAborted();
    const result = await readSudoku(
      file,
      (progress) => {
        if (!signal.aborted && mounted.current) setMessage(progress);
      },
      { signal },
    );
    signal.throwIfAborted();
    const saved = await createPuzzle(result.board, file, result.uncertain, { signal });
    window.location.assign(puzzleURL(saved.id));
  }
  async function pasteImage() {
    await action(async () => {
      const controller = new AbortController();
      photoController.current = controller;
      if (!navigator.clipboard?.read)
        throw new Error('Use your device’s Paste command, or choose a photo to upload.');
      let items: ClipboardItems;
      try {
        items = await navigator.clipboard.read();
      } catch {
        throw new Error(
          'Clipboard access was not available. Allow access, use Paste, or choose a photo.',
        );
      }
      for (const item of items) {
        controller.signal.throwIfAborted();
        const type = item.types.find((type) => type.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        controller.signal.throwIfAborted();
        await processPhoto(
          new File([blob], 'pasted-image', { type: blob.type || type }),
          controller,
        );
        return;
      }
      throw new Error('No image on the clipboard. Copy an image, then paste again.');
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    await action(() => processPhoto(file));
  }
  async function begin() {
    if (!puzzle) return;
    await action(async () => {
      const result = await startAttempt(puzzle);
      window.location.assign(attemptURL(result.puzzle.id, result.attempt.id));
    });
  }
  async function enter(value: number, cell = selected) {
    if (
      !puzzle ||
      readOnly ||
      actionBusy ||
      queueStatus.error ||
      (screen === 'play' && puzzle.clues[cell])
    )
      return;
    setMessage('');
    const puzzleId = puzzle.id,
      attemptId = attempt?.id;
    const note = notesMode,
      mistakeCheck = check;
    queue.current?.enqueue(async () => {
      const { puzzle, attempt } = committed.current;
      if (!mounted.current || puzzle?.id !== puzzleId || attempt?.id !== attemptId) return;
      const currentBoard = attempt ? positionAt(attempt).board : puzzle.clues;
      const nextValue = value && currentBoard[cell] === value && !note ? 0 : value;
      if (screen === 'review') {
        const clues = puzzle.clues.map((v, i) => (i === cell ? nextValue : v));
        const updated = await saveDraft(
          puzzle,
          clues,
          puzzle.uncertain.filter((i) => i !== cell),
        );
        if (mounted.current) publishPuzzle(updated);
      } else if (attempt) {
        if (attempt.completedAt !== null) return;
        await focusTimer.flush();
        if (!mounted.current || committed.current.attempt?.id !== attemptId) return;
        const updated = await recordMove(attempt, cell, nextValue, note, mistakeCheck);
        if (mounted.current) {
          publishAttempt(updated);
          setStep(updated.moves.length);
        }
      }
    });
  }
  async function undo() {
    if (!attempt || readOnly) return;
    await action(async () => {
      await focusTimer.flush();
      const updated = await undoLastMove(attempt);
      publishAttempt(updated);
      setStep(updated.moves.length);
    });
  }
  async function removeCurrentPuzzle() {
    if (!puzzle || saving.current) return;
    if (
      !window.confirm(
        `Remove “${puzzle.name}” and all its attempts from this device? This cannot be undone.`,
      )
    )
      return;
    await action(async () => {
      await removePuzzle(puzzle);
      window.location.assign('/');
    });
  }
  const puzzleActions = puzzle ? (
    <PuzzleActions
      busy={busy}
      onShare={() =>
        void action(async () => {
          const link = puzzleShareURL(window.location.origin, puzzle.clues, puzzle.name);
          try {
            await navigator.clipboard.writeText(link);
            setCopySequence((sequence) => sequence + 1);
            setShareLink('');
          } catch {
            setShareLink(link);
          }
        })
      }
      onRemove={() => void removeCurrentPuzzle()}
    />
  ) : null;
  const header = <AppHeader screen={screen} />;
  const puzzleTitle = puzzle ? (
    <PuzzleTitle
      name={puzzle.name}
      editing={editingName}
      value={nameValue}
      busy={busy}
      onEdit={() => {
        setNameValue(puzzle.name);
        setEditingName(true);
      }}
      onValueChange={setNameValue}
      onSave={() =>
        void action(async () => {
          const updated = await renamePuzzle(puzzle, nameValue);
          publishPuzzle(updated);
          setPuzzles((old) => old.map((p) => (p.id === updated.id ? updated : p)));
          setEditingName(false);
        })
      }
      onCancel={() => setEditingName(false)}
    />
  ) : null;
  const canUndo = useMemo(() => !!attempt && undoTarget(attempt) !== undefined, [attempt]);
  const moveDescription = useMemo(() => {
    const lastMove = attempt && step ? attempt.moves[step - 1] : null;
    return lastMove
      ? `${lastMove.kind === 'undo' ? 'Move undone' : lastMove.kind === 'note' ? 'Pencil note' : lastMove.value ? 'Number entered' : 'Cell erased'} · Row ${Math.floor(lastMove.cell / 9) + 1}, column ${(lastMove.cell % 9) + 1} · ${dateLabel(lastMove.at)}`
      : 'Original puzzle';
  }, [attempt, step]);
  const libraryItems = useMemo(() => {
    const counts = new Map<string, { count: number; completed: number; latest: string }>();
    for (const play of attempts) {
      const summary = counts.get(play.puzzleId) ?? { count: 0, completed: 0, latest: play.id };
      summary.count++;
      if (play.completedAt !== null) summary.completed++;
      counts.set(play.puzzleId, summary);
    }
    return puzzles.map((p) => {
      const summary = counts.get(p.id);
      return {
        id: p.id,
        name: p.name,
        clues: p.clues,
        createdLabel: dateLabel(p.createdAt),
        status: p.status,
        attemptCount: summary?.count ?? 0,
        completedCount: summary?.completed ?? 0,
        href: summary ? attemptURL(p.id, summary.latest) : puzzleURL(p.id),
      };
    });
  }, [puzzles, attempts]);

  if (!loaded)
    return (
      <main>
        {header}
        <CopyNotice sequence={copySequence} />
        <StatusNotice kind="loading" message="Opening your puzzles…" />
      </main>
    );
  return (
    <main className={screen === 'play' || screen === 'review' ? 'board-screen' : ''}>
      {header}
      {screen === 'library' ? <PuzzleLibrary items={libraryItems} /> : null}
      {screen === 'create' ? (
        <CreatePuzzle
          busy={busy}
          onCancel={() => {
            photoController.current?.abort();
            setMessage('Photo processing cancelled. Choose another photo or enter clues manually.');
          }}
          onUpload={(file) => void upload(file)}
          onPasteImage={() => void pasteImage()}
          onCreateManual={() =>
            void action(async () => {
              const p = await createPuzzle();
              window.location.assign(puzzleURL(p.id));
            })
          }
        />
      ) : null}
      {screen === 'detail' && puzzle ? (
        <PuzzleDetail
          createdLabel={dateLabel(puzzle.createdAt)}
          clueCount={puzzle.clues.filter(Boolean).length}
          busy={busy}
          title={puzzleTitle}
          actions={puzzleActions}
          onBegin={() => void begin()}
          attempts={attempts
            .filter((a) => a.puzzleId === puzzle.id)
            .map((a, i, all) => ({
              id: a.id,
              href: attemptURL(puzzle.id, a.id),
              number: all.length - i,
              startedLabel: dateLabel(a.startedAt),
              complete: a.completedAt !== null,
              moveCount: a.moveCount,
              durationLabel: a.durationMs !== null ? durationLabel(a.durationMs) : null,
            }))}
        />
      ) : null}
      {(screen === 'play' || screen === 'review') && puzzle && position ? (
        <section className="play-surface" aria-label="Sudoku game">
          <div className="play-heading">
            <div>
              <a className="back" href={screen === 'play' ? puzzleURL(puzzle.id) : '/'}>
                ← {screen === 'play' ? 'All attempts' : 'My puzzles'}
              </a>
              {puzzleTitle}
            </div>
            <div className="play-meta">
              {attempt ? (
                <>
                  <span className="badge">
                    {complete ? 'Completed' : historical ? 'Viewing history' : 'In progress'}
                  </span>
                  <AttemptTimer store={focusTimer.store} fixedElapsed={elapsed} />
                </>
              ) : (
                <span className="badge">Review clues</span>
              )}
            </div>
          </div>
          {queueStatus.error || message || timerError ? (
            <div role="alert" className="board-save-error">
              {queueStatus.error || message}
              {timerError ? (
                <p>
                  Timer could not save: {timerError} Keep this tab open; timing will retry
                  automatically.
                </p>
              ) : null}
              {queueStatus.error ? (
                <button className="secondary" onClick={() => queue.current?.reset()}>
                  Resume editing
                </button>
              ) : null}
            </div>
          ) : (
            <p role="status" className="save-state">
              {busy ? 'Saving…' : screen === 'review' ? 'Draft saved' : 'Saved'}
            </p>
          )}
          {screen === 'review' ? (
            <GameToolbar
              mode="review"
              clueCount={board.filter(Boolean).length}
              uncertainCount={puzzle.uncertain.length}
              busy={busy}
              onBegin={() => void begin()}
            />
          ) : (
            <GameToolbar
              mode="play"
              notesMode={notesMode}
              check={check}
              mistakes={position.mistakes}
              busy={actionBusy}
              readOnly={readOnly}
              onToggleNotes={() => setNotesMode((v) => !v)}
              onToggleCheck={() => setCheck((v) => !v)}
            />
          )}
          <div className="board-wrap">
            <SudokuBoard
              mode={screen}
              board={board}
              notes={position.notes}
              clues={puzzle.clues}
              uncertain={puzzle.uncertain}
              wrongCells={wrongCells}
              selected={selected}
              readOnly={readOnly}
              busy={actionBusy || !!queueStatus.error}
              onSelect={setSelected}
              onEnter={(value, cell) => void enter(value, cell)}
              onToggleNotes={() => setNotesMode((v) => !v)}
              onOpenDial={setDialCell}
            />
            {!complete ? (
              <NumberKeypad
                disabled={readOnly || actionBusy || !!queueStatus.error}
                onEnter={(value) => void enter(value)}
              />
            ) : null}
          </div>
          {screen === 'review' && puzzle.image ? <OriginalPhoto image={puzzle.image} /> : null}
          {attempt ? (
            <AttemptHistory
              step={step}
              moveCount={attempt.moves.length}
              busy={busy}
              readOnly={readOnly}
              complete={complete}
              canUndo={canUndo}
              moveDescription={moveDescription}
              completionDuration={complete ? durationLabel(attempt.durationMs!) : ''}
              onStepChange={setStep}
              onUndo={() => void undo()}
              onBegin={() => void begin()}
            />
          ) : (
            <p className="hint">
              Select a square, then use 1–9 or Delete. Your draft saves automatically.
            </p>
          )}
        </section>
      ) : null}
      {screen === 'play' || screen === 'review' ? puzzleActions : null}
      {dialCell !== null ? (
        <NumberDial
          onChoose={(value) => {
            const cell = dialCell;
            setDialCell(null);
            void enter(value, cell);
          }}
          onClose={() => {
            setDialCell(null);
          }}
        />
      ) : null}
      {shareLink ? (
        <section className="share-link" aria-label="Share puzzle link">
          <label htmlFor="share-link">Copy this link to share the puzzle</label>
          <input
            id="share-link"
            readOnly
            value={shareLink}
            onFocus={(event) => event.target.select()}
          />
          <button className="secondary" onClick={() => setShareLink('')}>
            Close link
          </button>
        </section>
      ) : null}
      <CopyNotice sequence={copySequence} />
      {screen !== 'play' && screen !== 'review' ? <StatusNotice message={message} /> : null}
    </main>
  );
}
