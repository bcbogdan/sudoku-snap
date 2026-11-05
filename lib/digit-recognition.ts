export interface DigitReading {
  text: string;
  confidence: number;
}

export function needsDeslant(reading: DigitReading) {
  return !/^[1-9]$/.test(reading.text.trim()) || reading.confidence < 65;
}

export function selectDigit(primary: DigitReading, deslanted?: DigitReading) {
  const uncertain = needsDeslant(primary);
  // An alternate rendering is evidence, not a calibrated correction. Never
  // replace a confident primary or remove the original reason for review.
  const alternative = deslanted?.text.trim() ?? '';
  const text =
    uncertain && deslanted && /^[1-9]$/.test(alternative) && deslanted.confidence >= 80
      ? alternative
      : primary.text.trim();
  return { digit: /^[1-9]$/.test(text) ? Number(text) : 0, uncertain };
}
