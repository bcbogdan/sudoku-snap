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
import { Badge } from './components/Badge';
import type { CollectionFilter } from './components/CollectionFilters';
import { Alert } from './components/Alert';
import { Button } from './components/Button';
import { Icon } from './components/Icon';
import { CornerFrame } from './components/CornerFrame';
import './styles/presentation.css';
import { CommandQueue, type QueueStatus } from '@/lib/command-queue';
import { useFocusTimer } from '@/lib/use-focus-timer';
import { puzzleShareURL } from '@/lib/sharing';
import { solveCached } from '@/lib/solver-client';
import {
  attemptsByPuzzle,
  attemptStatistics,
  continueAttempt,
  entryProgress,
  newestAttempts,
  previewAttempt,
} from '@/lib/collection-model';
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
  getPuzzleSummary,
  getAttempt,
  listAttemptSummaries,
  listAttemptPresentations,
  listPuzzleSummaries,
  type AttemptSummary,
  type AttemptPresentation,
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
  const [presentations, setPresentations] = useState<readonly AttemptPresentation[]>([]);
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all');
  const [loadError, setLoadError] = useState('');
  const [actionFailed, setActionFailed] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null);
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState(0),
    [notesMode, setNotesMode] = useState(false),
    [check, setCheck] = useState(true);
  const [attemptView, setAttemptView] = useState<'play' | 'replay'>('play');
  const [actionBusy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ pending: 0, error: '' });
  const boardError = useRef<HTMLDivElement>(null);
  const focusBeginError = useRef(false);
  useEffect(() => {
    if (!focusBeginError.current || !message || !boardError.current) return;
    focusBeginError.current = false;
    boardError.current.focus({ preventScroll: true });
    boardError.current.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [message, actionFailed]);
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
    const loadAttemptRows = async (puzzleId: string) => {
      const rows = await listAttemptSummaries(puzzleId);
      const views = await listAttemptPresentations(rows.map((row) => row.id));
      if (cancelled) return;
      setAttempts(newestAttempts(views));
      setPresentations(views);
    };
    Promise.resolve()
      .then(async () => {
        const query = new URLSearchParams(window.location.search),
          id = query.get('puzzle'),
          attemptId = query.get('attempt');
        if (query.has('p')) {
          const imported = await importSharedPuzzle(query.get('p')!, query.get('n'));
          if (cancelled) return;
          publishPuzzle(imported);
          if (imported.status === 'ready') await loadAttemptRows(imported.id);
          setScreen(imported.status === 'draft' ? 'review' : 'detail');
          window.history.replaceState(null, '', puzzleURL(imported.id));
          return;
        }
        if (query.has('new')) setScreen('create');
        else if (id) {
          const summary = await getPuzzleSummary(id);
          const p = summary?.status === 'draft' ? await getPuzzle(id) : summary;
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
              await loadAttemptRows(id);
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
            if (p.status === 'ready') await loadAttemptRows(id);
            if (!cancelled) setScreen(p.status === 'draft' ? 'review' : 'detail');
          }
        } else {
          const [saved, plays] = await Promise.all([listPuzzleSummaries(), listAttemptSummaries()]);
          const groups = attemptsByPuzzle(plays);
          const previewIds = saved.flatMap((item) => {
            if (item.status === 'draft') return [];
            const selected = previewAttempt(groups.get(item.id) ?? []);
            return selected ? [selected.id] : [];
          });
          const previews = await listAttemptPresentations(previewIds);
          if (cancelled) return;
          setPuzzles(saved);
          setAttempts(plays);
          setPresentations(previews);
          const filter = query.get('filter');
          if (filter === 'in-progress' || filter === 'completed') setCollectionFilter(filter);
        }
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : 'Local storage is unavailable.');
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
  const replay = attemptView === 'replay';
  const [replaySelected, setReplaySelected] = useState(0);
  const historical = !!attempt && step < attempt.moves.length,
    complete = attempt?.completedAt !== null && !!attempt;
  const readOnly = replay || historical || complete;
  const elapsed = attempt
    ? replay
      ? step
        ? attempt.moves[step - 1].elapsedMs
        : 0
      : attempt.durationMs
    : 0;
  function changeReplay(next = step) {
    if (!attempt || saving.current || busy) return;
    if (!Number.isInteger(next) || next < 0 || next > attempt.moves.length) return;
    setDialCell(null);
    if (!replay) setReplaySelected(selected);
    setStep(next);
    setAttemptView('replay');
  }
  function exitReplay() {
    if (!attempt || saving.current || busy) return;
    setStep(attempt.moves.length);
    setAttemptView('play');
  }
  async function action(work: () => Promise<void>) {
    if (saving.current || queueStatus.pending) return;
    saving.current = true;
    setBusy(true);
    setMessage('');
    setActionFailed(false);
    try {
      await work();
    } catch (error) {
      if (mounted.current && !(error instanceof DOMException && error.name === 'AbortError')) {
        setActionFailed(true);
        setMessage(error instanceof Error ? error.message : 'Could not save. Please try again.');
      }
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
      try {
        const result = await startAttempt(puzzle);
        window.location.assign(attemptURL(result.puzzle.id, result.attempt.id));
      } catch (error) {
        focusBeginError.current = true;
        throw error;
      }
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
      onRemove={screen !== 'play' ? () => void removeCurrentPuzzle() : undefined}
    />
  ) : null;
  const header = (
    <AppHeader
      screen={screen}
      backLink={
        screen === 'play' && puzzle
          ? { href: puzzleURL(puzzle.id), label: 'All attempts' }
          : screen !== 'library'
            ? { href: '/', label: 'My puzzles' }
            : undefined
      }
      status={
        screen === 'play' && attempt ? (
          <Badge kind={replay ? 'replaying' : complete ? 'completed' : 'in-progress'}>
            {replay ? 'Viewing history' : complete ? 'Completed' : 'In progress'}
          </Badge>
        ) : screen === 'review' ? (
          <Badge kind="draft">Review clues</Badge>
        ) : undefined
      }
    />
  );
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
      ? `${lastMove.kind === 'undo' ? 'Move undone' : lastMove.kind === 'note' ? `Pencil note ${lastMove.value} ${lastMove.position.notes[lastMove.cell].includes(lastMove.value) ? 'added' : 'removed'}` : lastMove.value ? `Number ${lastMove.value} entered` : 'Cell erased'} · Row ${Math.floor(lastMove.cell / 9) + 1}, column ${(lastMove.cell % 9) + 1} · ${dateLabel(lastMove.at)}`
      : `Original puzzle${attempt ? ` · ${dateLabel(attempt.startedAt)}` : ''}`;
  }, [attempt, step]);
  const presentationById = useMemo(
    () => new Map(presentations.map((view) => [view.id, view])),
    [presentations],
  );
  const libraryItems = useMemo(() => {
    const grouped = attemptsByPuzzle(attempts);
    return puzzles.map((p) => {
      const rows = grouped.get(p.id) ?? [];
      const selectedAttempt = p.status === 'ready' ? previewAttempt(rows) : undefined;
      const view = selectedAttempt ? presentationById.get(selectedAttempt.id) : undefined;
      const completedCount = rows.filter((row) => row.completedAt !== null).length;
      return {
        id: p.id,
        name: p.name,
        clues: p.clues,
        createdLabel: dateLabel(p.createdAt),
        status: p.status,
        attemptCount: rows.length,
        completedCount,
        unfinishedCount: rows.length - completedCount,
        preview: view
          ? { board: view.position.board, completed: view.completedAt !== null }
          : undefined,
        href: selectedAttempt ? attemptURL(p.id, selectedAttempt.id) : puzzleURL(p.id),
      };
    });
  }, [puzzles, attempts, presentationById]);
  const detailAttempts = useMemo(
    () => newestAttempts(attempts.filter((row) => row.puzzleId === puzzle?.id)),
    [attempts, puzzle?.id],
  );
  const detailStats = useMemo(
    () => attemptStatistics(presentations.filter((view) => view.puzzleId === puzzle?.id)),
    [presentations, puzzle?.id],
  );
  const detailPreviewId = previewAttempt(detailAttempts)?.id;
  const detailPreview = detailPreviewId ? presentationById.get(detailPreviewId) : undefined;
  const continueTarget = continueAttempt(detailAttempts);
  const gameBoard =
    puzzle && position ? (
      <SudokuBoard
        mode={screen === 'review' ? 'review' : 'play'}
        board={board}
        notes={position.notes}
        clues={puzzle.clues}
        uncertain={puzzle.uncertain}
        wrongCells={wrongCells}
        selected={replay ? replaySelected : selected}
        replay={replay}
        replayCurrentCell={replay && step ? attempt?.moves[step - 1].cell : undefined}
        completed={complete && !replay}
        readOnly={readOnly}
        busy={actionBusy || !!queueStatus.error}
        onSelect={replay ? setReplaySelected : setSelected}
        onEnter={(value, cell) => void enter(value, cell)}
        onToggleNotes={() => setNotesMode((v) => !v)}
        onOpenDial={setDialCell}
      />
    ) : null;

  if (!loaded)
    return (
      <main>
        {header}
        <CopyNotice sequence={copySequence} />
        <StatusNotice kind="loading" message="Opening your puzzles…" />
      </main>
    );
  if (loadError)
    return (
      <main className="sudoku-app">
        {header}
        <Alert>{loadError}</Alert>
        <button className="secondary" onClick={() => window.location.reload()}>
          Reload saved puzzles
        </button>
      </main>
    );
  return (
    <main
      className={`sudoku-app sudoku-app--${screen} ${screen === 'play' || screen === 'review' ? 'board-screen' : ''}`}
    >
      {header}
      {screen === 'library' ? (
        <PuzzleLibrary
          items={libraryItems}
          filter={collectionFilter}
          onFilterChange={(filter) => {
            setCollectionFilter(filter);
            const url = new URL(window.location.href);
            if (filter === 'all') url.searchParams.delete('filter');
            else url.searchParams.set('filter', filter);
            window.history.replaceState(null, '', url);
          }}
        />
      ) : null}
      {screen === 'create' ? (
        <CreatePuzzle
          busy={busy}
          notice={message}
          failed={actionFailed}
          onCancel={() => {
            photoController.current?.abort();
            setActionFailed(false);
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
          clues={puzzle.clues}
          preview={
            detailPreview
              ? {
                  board: detailPreview.position.board,
                  completed: detailPreview.completedAt !== null,
                }
              : undefined
          }
          bestTime={detailStats.bestMs === null ? null : durationLabel(detailStats.bestMs)}
          totalTime={detailStats.totalMs === null ? null : durationLabel(detailStats.totalMs)}
          continueHref={continueTarget ? attemptURL(puzzle.id, continueTarget.id) : null}
          attempts={detailAttempts.map((a, i, all) => {
            const view = presentationById.get(a.id);
            return {
              id: a.id,
              href: attemptURL(puzzle.id, a.id),
              number: all.length - i,
              startedLabel: dateLabel(a.startedAt),
              complete: a.completedAt !== null,
              moveCount: a.moveCount,
              durationLabel: view?.elapsedMs != null ? durationLabel(view.elapsedMs) : null,
              mistakes: view?.position.mistakes,
              progress: view ? entryProgress(puzzle.clues, view.position.board) : null,
            };
          })}
        />
      ) : null}
      {(screen === 'play' || screen === 'review') && puzzle && position ? (
        <section className="play-surface" aria-label="Sudoku game">
          <div className="puzzle-console">
            <div className="play-heading">
              <div>{puzzleTitle}</div>
            </div>
            {queueStatus.error || message || timerError ? (
              <div ref={boardError} tabIndex={-1} role="alert" className="board-save-error">
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
            ) : screen === 'review' ? (
              <p role="status" className="save-state">
                {busy ? 'Saving…' : 'Draft saved'}
              </p>
            ) : null}
            {screen === 'review' ? (
              <GameToolbar
                mode="review"
                clueCount={board.filter(Boolean).length}
                uncertainCount={puzzle.uncertain.length}
                busy={busy}
                onBegin={() => void begin()}
                showConfirmation={false}
              />
            ) : replay ? (
              <p className="replay-introduction">Every move, in order. This replay is read-only.</p>
            ) : (
              <GameToolbar
                mode="play"
                notesMode={notesMode}
                check={check}
                mistakes={position.mistakes}
                status={
                  <>
                    {attempt ? (
                      <AttemptTimer store={focusTimer.store} fixedElapsed={elapsed} />
                    ) : null}
                    {!queueStatus.error && !message && !timerError ? (
                      <span role="status" className="save-state">
                        {busy ? 'Saving…' : 'Saved'}
                      </span>
                    ) : null}
                  </>
                }
                busy={actionBusy}
                readOnly={readOnly}
                onToggleNotes={() => setNotesMode((v) => !v)}
                onToggleCheck={() => setCheck((v) => !v)}
              />
            )}
          </div>
          <div className="board-wrap">
            {screen === 'review' ? (
              <CornerFrame state="checking" className="review-board-frame">
                {gameBoard}
              </CornerFrame>
            ) : (
              gameBoard
            )}
            {!complete && !replay ? (
              <NumberKeypad
                board={board}
                selectedDigit={board[selected] || undefined}
                disabled={readOnly || actionBusy || !!queueStatus.error}
                onEnter={(value) => void enter(value)}
              />
            ) : null}
          </div>
          <div className="play-support">
            {screen === 'review' && puzzle.image ? <OriginalPhoto image={puzzle.image} /> : null}
            {attempt ? (
              <AttemptHistory
                step={step}
                moveCount={attempt.moves.length}
                busy={busy}
                readOnly={readOnly}
                replay={replay}
                onEnterReplay={() => changeReplay()}
                onExitReplay={exitReplay}
                complete={complete}
                canUndo={canUndo}
                moveDescription={moveDescription}
                completionDuration={complete ? durationLabel(attempt.durationMs!) : ''}
                onStepChange={changeReplay}
                onUndo={() => void undo()}
                onBegin={() => void begin()}
              />
            ) : (
              <div>
                {puzzle.uncertain.length ? (
                  <p className="hint">
                    Highlighted clues need review. Compare them with your original photo.
                  </p>
                ) : null}
                <p className="hint">
                  Select a square, then use 1–9 or Delete. Your draft saves automatically.
                </p>
                <p className="review-legend">
                  <span aria-hidden="true" /> Unclear clues have a dashed outline.
                </p>
                <Button variant="ink" disabled={busy} onClick={() => void begin()}>
                  Confirm clues &amp; play <Icon name="arrow-right" />
                </Button>
              </div>
            )}
          </div>
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
      {screen !== 'play' && screen !== 'review' && screen !== 'create' ? (
        <StatusNotice message={message} />
      ) : null}
    </main>
  );
}
