import { solve, type Board } from './sudoku';

self.onmessage = (event: MessageEvent<{ id: number; clues: Board }>) => {
  self.postMessage({ id: event.data.id, result: solve(event.data.clues) });
};
