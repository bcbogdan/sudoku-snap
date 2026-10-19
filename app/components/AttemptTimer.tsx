'use client';

import { useSyncExternalStore } from 'react';
import { durationLabel } from '@/lib/attempts';
import type { TimerStore } from '@/lib/use-focus-timer';

export interface AttemptTimerProps {
  store: TimerStore;
  fixedElapsed: number | null;
}

export default function AttemptTimer({ store, fixedElapsed }: AttemptTimerProps) {
  const elapsed = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <time aria-label="Attempt duration">{durationLabel(fixedElapsed ?? elapsed)}</time>;
}
