import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsCondensed, needsDeslant, selectDigit } from '../lib/digit-recognition';

test('confident single digits bypass augmentation, regardless of an alternative', () => {
  const primary = { text: '1\n', confidence: 86 };
  assert.equal(needsDeslant(primary), false);
  assert.deepEqual(selectDigit(primary, { text: '7', confidence: 96 }), {
    digit: 1,
    uncertain: false,
  });
});

test('width normalization is a last resort, not maximum-confidence voting', () => {
  const weak = { text: '', confidence: 0 };
  const accepted = { text: '4', confidence: 80 };
  const condensed = { text: '7', confidence: 99 };
  assert.equal(needsCondensed(weak, accepted), false);
  assert.equal(needsCondensed({ text: '1', confidence: 65 }, weak), false);
  assert.equal(needsCondensed(weak, { text: '54', confidence: 99 }), true);
  assert.deepEqual(selectDigit(weak, accepted, condensed), { digit: 4, uncertain: true });
  assert.deepEqual(selectDigit(weak, weak, condensed), { digit: 7, uncertain: true });
  for (const fallback of [{ text: '7', confidence: 79 }, { text: '54', confidence: 99 }, weak])
    assert.deepEqual(selectDigit({ text: '4', confidence: 0 }, weak, fallback), {
      digit: 4,
      uncertain: true,
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
