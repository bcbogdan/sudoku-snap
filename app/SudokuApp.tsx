'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import NumberDial from './NumberDial';
import AppHeader from './components/AppHeader';
import AttemptHistory from './components/AttemptHistory';
import CreatePuzzle from './components/CreatePuzzle';
import GameToolbar from './components/GameToolbar';
import NumberKeypad from './components/NumberKeypad';
import PuzzleActions from './components/PuzzleActions';
import PuzzleDetail from './components/PuzzleDetail';
import PuzzleLibrary from './components/PuzzleLibrary';
import PuzzleTitle from './components/PuzzleTitle';
import StatusNotice from './components/StatusNotice';
import SudokuBoard from './components/SudokuBoard';
import { useFocusTimer } from '@/lib/use-focus-timer';
import { puzzleShareURL } from '@/lib/sharing';
import { solve } from '@/lib/sudoku';
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
  listAttempts,
  listPuzzles,
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
    [attempts, setAttempts] = useState<Attempt[]>([]);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null);
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState(0),
    [notesMode, setNotesMode] = useState(false),
    [check, setCheck] = useState(true);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const saving = useRef(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);
  const [dialCell, setDialCell] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false),
    [nameValue, setNameValue] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.all([listPuzzles(), listAttempts()])
      .then(async ([saved, plays]) => {
        if (cancelled) return;
        setPuzzles(saved);
        setAttempts(plays);

        const query = new URLSearchParams(window.location.search),
          id = query.get('puzzle'),
          attemptId = query.get('attempt');
        if (query.has('p')) {
          const imported = await importSharedPuzzle(query.get('p')!, query.get('n'));
          if (cancelled) return;
          setPuzzle(imported);
          setPuzzles(await listPuzzles());
          setScreen(imported.status === 'draft' ? 'review' : 'detail');
          window.history.replaceState(null, '', puzzleURL(imported.id));
          return;
        }
        if (query.has('new')) setScreen('create');
        else if (id) {
          const p = saved.find((p) => p.id === id);
          if (!p) {
            setMessage('This puzzle is not saved in this browser.');
            return;
          }
          setPuzzle(p);
          if (attemptId) {
            const a = plays.find((a) => a.id === attemptId && a.puzzleId === id);
            if (!a) {
              setMessage('This attempt is unavailable.');
              setScreen('detail');
              return;
            }
            setAttempt(a);
            setStep(a.moves.length);
            setSelected(
              Math.max(
                0,
                p.clues.findIndex((v) => !v),
              ),
            );
            setScreen('play');
          } else setScreen(p.status === 'draft' ? 'review' : 'detail');
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
  const focusTimer = useFocusTimer(attempt, setMessage);
  const solution = useMemo(
    () => (puzzle?.status === 'ready' ? solve(puzzle.clues).solution : null),
    [puzzle],
  );
  const position = useMemo(
    () => (attempt ? positionAt(attempt, step) : puzzle ? initialPosition(puzzle.clues) : null),
    [attempt, step, puzzle],
  );
  const board = position?.board ?? [];
  const wrongCells = useMemo(
    () =>
      position && screen === 'play' && check
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
      : (attempt.durationMs ?? focusTimer.elapsed)
    : 0;
  async function action(work: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
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
  async function processPhoto(file: File) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Please use an image smaller than 20 MB.');
    const { readSudoku } = await import('@/lib/localSudokuReader');
    const result = await readSudoku(file, setMessage);
    const saved = await createPuzzle(result.board, file, result.uncertain);
    window.location.assign(puzzleURL(saved.id));
  }
  async function pasteImage() {
    await action(async () => {
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
        const type = item.types.find((type) => type.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        await processPhoto(new File([blob], 'pasted-image', { type: blob.type || type }));
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
    if (!puzzle || readOnly || saving.current || (screen === 'play' && puzzle.clues[cell])) return;
    if (value && board[cell] === value && !notesMode) value = 0;
    await action(async () => {
      if (screen === 'review') {
        const clues = puzzle.clues.map((v, i) => (i === cell ? value : v));
        const updated = await saveDraft(
          puzzle,
          clues,
          puzzle.uncertain.filter((i) => i !== cell),
        );
        setPuzzle(updated);
      } else if (attempt) {
        await focusTimer.flush();
        const updated = await recordMove(attempt, cell, value, notesMode, check);
        setAttempt(updated);
        setStep(updated.moves.length);
      }
    });
  }
  async function undo() {
    if (!attempt || readOnly) return;
    await action(async () => {
      await focusTimer.flush();
      const updated = await undoLastMove(attempt);
      setAttempt(updated);
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
            setCopied(true);
          } catch {
            throw new Error('Could not copy the link. Allow clipboard access and try again.');
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
          setPuzzle(updated);
          setPuzzles((old) => old.map((p) => (p.id === updated.id ? updated : p)));
          setEditingName(false);
        })
      }
      onCancel={() => setEditingName(false)}
    />
  ) : null;
  const lastMove = attempt && step ? attempt.moves[step - 1] : null;
  const moveDescription = lastMove
    ? `${lastMove.kind === 'undo' ? 'Move undone' : lastMove.kind === 'note' ? 'Pencil note' : lastMove.value ? 'Number entered' : 'Cell erased'} · Row ${Math.floor(lastMove.cell / 9) + 1}, column ${(lastMove.cell % 9) + 1} · ${dateLabel(lastMove.at)}`
    : 'Original puzzle';

  if (!loaded)
    return (
      <main>
        {header}
        {copied ? <StatusNotice kind="copied" message="Link copied to clipboard." /> : null}
        <StatusNotice kind="loading" message="Opening your puzzles…" />
      </main>
    );
  return (
    <main className={screen === 'play' || screen === 'review' ? 'board-screen' : ''}>
      {header}
      {screen === 'library' ? (
        <PuzzleLibrary
          items={puzzles.map((p) => {
            const plays = attempts.filter((a) => a.puzzleId === p.id);
            return {
              id: p.id,
              name: p.name,
              clues: p.clues,
              createdLabel: dateLabel(p.createdAt),
              status: p.status,
              attemptCount: plays.length,
              completedCount: plays.filter((a) => a.completedAt !== null).length,
              href: plays[0] ? attemptURL(p.id, plays[0].id) : puzzleURL(p.id),
            };
          })}
        />
      ) : null}
      {screen === 'create' ? (
        <CreatePuzzle
          busy={busy}
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
              moveCount: a.moves.length,
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
                  <time aria-label="Attempt duration">{durationLabel(elapsed)}</time>
                </>
              ) : (
                <span className="badge">Review clues · Draft saved</span>
              )}
            </div>
          </div>
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
              busy={busy}
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
              busy={busy}
              onSelect={setSelected}
              onEnter={(value, cell) => void enter(value, cell)}
              onToggleNotes={() => setNotesMode((v) => !v)}
              onOpenDial={setDialCell}
            />
            {!complete ? (
              <NumberKeypad disabled={readOnly || busy} onEnter={(value) => void enter(value)} />
            ) : null}
          </div>
          {attempt ? (
            <AttemptHistory
              step={step}
              moveCount={attempt.moves.length}
              busy={busy}
              readOnly={readOnly}
              complete={complete}
              canUndo={undoTarget(attempt) !== undefined}
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
      {copied ? <StatusNotice kind="copied" message="Link copied to clipboard." /> : null}
      <StatusNotice message={message} />
    </main>
  );
}
