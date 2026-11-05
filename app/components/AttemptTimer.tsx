'use client';

import { useSyncExternalStore } from 'react';
import { durationLabel } from '@/lib/attempts';
import type { TimerStore } from '@/lib/use-focus-timer';
import { Icon } from './Icon';
import './AttemptTimer.css';

export interface AttemptTimerProps {
  store: TimerStore;
  fixedElapsed: number | null;
}

export default function AttemptTimer({ store, fixedElapsed }: AttemptTimerProps) {
  const elapsed = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <time className="kit-attempt-timer" aria-label="Attempt duration">
      <Icon name="clock" />
      {durationLabel(fixedElapsed ?? elapsed)}
    </time>
  );
}
