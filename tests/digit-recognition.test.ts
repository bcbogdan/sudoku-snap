import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsDeslant, selectDigit } from '../lib/digit-recognition';

test('confident single digits bypass augmentation, regardless of an alternative', () => {
  const primary = { text: '1\n', confidence: 86 };
  assert.equal(needsDeslant(primary), false);
  assert.deepEqual(selectDigit(primary, { text: '7', confidence: 96 }), {
    digit: 1,
    uncertain: false,
  });
});

test('a conservative de-slanted read can recover weak text but remains review-visible', () => {
  for (const text of ['', '4', '74']) {
    const primary = { text, confidence: 21 };
    assert.equal(needsDeslant(primary), true);
    assert.deepEqual(selectDigit(primary, { text: '7\n', confidence: 89 }), {
      digit: 7,
      uncertain: true,
    });
  }
});

test('invalid or still-weak alternatives never replace the original reading', () => {
  for (const alternative of [
    { text: '54', confidence: 99 },
    { text: '', confidence: 99 },
    { text: '7', confidence: 79 },
  ])
    assert.deepEqual(selectDigit({ text: '4', confidence: 0 }, alternative), {
      digit: 4,
      uncertain: true,
    });
  assert.deepEqual(selectDigit({ text: '', confidence: 0 }), { digit: 0, uncertain: true });
  assert.equal(needsDeslant({ text: '74', confidence: 99 }), true);
});
