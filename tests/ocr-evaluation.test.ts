import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseRows, scoreBoard, scoreExtraction } from './ocr-evaluation-metrics';

test('evaluation metrics distinguish missing, spurious, wrong and unflagged clues', () => {
  const expected = [1, 2, 3, 0, ...Array(77).fill(0)];
  const actual = [1, 0, 4, 5, ...Array(77).fill(0)];
  const score = scoreBoard(expected, actual, [1]);
  assert.equal(score.exactCells, 78);
  assert.equal(score.exactBoard, false);
  assert.equal(score.cluePrecision, 1 / 3);
  assert.equal(score.clueRecall, 1 / 3);
  assert.equal(score.missedClues, 1);
  assert.equal(score.spuriousClues, 1);
  assert.equal(score.wrongDigits, 1);
  assert.deepEqual(
    score.mismatches.map((cell) => cell.flagged),
    [true, false, false],
  );
});

test('empty predictions have undefined precision, not perfect recognition', () => {
  const score = scoreBoard([1, ...Array(80).fill(0)], Array(81).fill(0));
  assert.equal(score.cluePrecision, null);
  assert.equal(score.clueRecall, 0);
  assert.equal(score.exactCells, 80);
});

test('extraction diagnostics expose omitted clues independently of recognition and review flags', () => {
  const expected = [1, 2, 3, 0, ...Array(77).fill(0)];
  assert.deepEqual(scoreExtraction(expected, [0, 3], [1]), {
    extractedCells: 2,
    extractedClues: 1,
    extractedBlankCells: 1,
    omitted: [1, 2],
    unflaggedOmissions: [2],
    precision: 1 / 2,
    recall: 1 / 3,
  });
  assert.equal(scoreExtraction(expected, [], []).precision, null);
  assert.throws(() => scoreExtraction(expected, [0, 0], []));
  assert.throws(() => scoreExtraction(expected, [81], []));
});

test('malformed ground truth and predictions are rejected', () => {
  assert.throws(() => parseRows(['123456789']));
  assert.throws(() => parseRows(Array(9).fill('12345678x')));
  assert.throws(() => scoreBoard(Array(80).fill(0), Array(81).fill(0)));
  assert.throws(() => scoreBoard(Array(81).fill(0), Array(81).fill(10)));
});

test('independent fixtures have complete ground truth, provenance and bounded local images', async () => {
  const directory = new URL('./fixtures/ocr-evaluation/', import.meta.url);
  const fixtures = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.equal(fixtures.length, 3);
  assert.equal(new Set(fixtures.map((fixture: { source: string }) => fixture.source)).size, 3);
  for (const fixture of fixtures) {
    const board = parseRows(fixture.rows);
    assert.ok(board.some(Boolean));
    assert.match(fixture.source, /^https:\/\//);
    assert.ok(fixture.license && fixture.groundTruth && fixture.style);
    assert.match(fixture.file, /^[a-z0-9-]+\.(png|jpg)$/);
    const image = await readFile(new URL(fixture.file, directory));
    assert.ok(image.length > 1000 && image.length < 500000);
    assert.equal(createHash('sha256').update(image).digest('hex'), fixture.sha256);
    assert.equal(scoreBoard(board, board).exactCells, 81);
  }
});
