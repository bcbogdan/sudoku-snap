export interface DigitReading {
  text: string;
  confidence: number;
}

export function needsDeslant(reading: DigitReading) {
  return !/^[1-9]$/.test(reading.text.trim()) || reading.confidence < 65;
}

function strongAlternative(reading?: DigitReading): reading is DigitReading {
  return Boolean(reading && /^[1-9]$/.test(reading.text.trim()) && reading.confidence >= 80);
}

export function needsCondensed(primary: DigitReading, deslanted?: DigitReading) {
  return needsDeslant(primary) && !strongAlternative(deslanted);
}

export function selectDigit(
  primary: DigitReading,
  deslanted?: DigitReading,
  condensed?: DigitReading,
) {
  const uncertain = needsDeslant(primary);
  // An alternate rendering is evidence, not a calibrated correction. Never
  // replace a confident primary or remove the original reason for review.
  const alternative = strongAlternative(deslanted) ? deslanted : condensed;
  const text =
    uncertain && strongAlternative(alternative) ? alternative.text.trim() : primary.text.trim();
  return { digit: /^[1-9]$/.test(text) ? Number(text) : 0, uncertain };
}
