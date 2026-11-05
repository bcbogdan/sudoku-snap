import { Icon } from './Icon';
import './MistakeCounter.css';

export interface MistakeCounterProps {
  count: number;
}

export function MistakeCounter({ count }: MistakeCounterProps) {
  return (
    <span className="kit-mistake-counter" data-has-mistakes={count > 0}>
      {count > 0 ? <Icon name="alert" size={16} /> : null}
      <span className="kit-mistake-counter__text">Mistakes {count}</span>
    </span>
  );
}
