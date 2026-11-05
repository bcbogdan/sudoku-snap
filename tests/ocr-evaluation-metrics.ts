export function parseRows(rows: string[]): number[] {
  if (rows.length !== 9 || rows.some((row) => !/^[0-9]{9}$/.test(row)))
    throw new Error('Ground truth must contain nine rows of nine digits (zero means blank).');
  return rows.join('').split('').map(Number);
}

export function scoreBoard(expected: number[], actual: number[], uncertain: number[] = []) {
  for (const board of [expected, actual])
    if (
      board.length !== 81 ||
      board.some((value) => !Number.isInteger(value) || value < 0 || value > 9)
    )
      throw new Error('Expected an 81-cell board with values 0–9.');
  const mismatches = expected.flatMap((value, index) =>
    value === actual[index]
      ? []
      : [
          {
            row: Math.floor(index / 9) + 1,
            column: (index % 9) + 1,
            expected: value,
            actual: actual[index],
            flagged: uncertain.includes(index),
          },
        ],
  );
  const expectedClues = expected.filter(Boolean).length;
  const predictedClues = actual.filter(Boolean).length;
  const correctClues = expected.filter(
    (value, index) => value !== 0 && value === actual[index],
  ).length;
  return {
    exactCells: 81 - mismatches.length,
    exactBoard: mismatches.length === 0,
    expectedClues,
    predictedClues,
    correctClues,
    cluePrecision: predictedClues ? correctClues / predictedClues : null,
    clueRecall: expectedClues ? correctClues / expectedClues : null,
    missedClues: expected.filter((value, index) => value !== 0 && actual[index] === 0).length,
    spuriousClues: expected.filter((value, index) => value === 0 && actual[index] !== 0).length,
    wrongDigits: expected.filter(
      (value, index) => value !== 0 && actual[index] !== 0 && value !== actual[index],
    ).length,
    mismatches,
  };
}

export function scoreExtraction(expected: number[], extracted: number[], uncertain: number[]) {
  scoreBoard(expected, expected);
  if (
    new Set(extracted).size !== extracted.length ||
    extracted.some((index) => !Number.isInteger(index) || index < 0 || index >= 81)
  )
    throw new Error('Expected unique extracted indices in 0–80.');
  const clues = expected.flatMap((value, index) => (value ? [index] : []));
  const omitted = clues.filter((index) => !extracted.includes(index));
  const extractedClues = clues.length - omitted.length;
  return {
    extractedCells: extracted.length,
    extractedClues,
    extractedBlankCells: extracted.length - extractedClues,
    omitted,
    unflaggedOmissions: omitted.filter((index) => !uncertain.includes(index)),
    precision: extracted.length ? extractedClues / extracted.length : null,
    recall: clues.length ? extractedClues / clues.length : null,
  };
}
