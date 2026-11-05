import { Icon } from './Icon';
import './NumberKeypad.css';

export interface NumberKeypadProps {
  disabled: boolean;
  onEnter: (value: number) => void;
  board?: readonly number[];
  selectedDigit?: number;
}

export default function NumberKeypad({
  disabled,
  onEnter,
  board,
  selectedDigit,
}: NumberKeypadProps) {
  const remaining = board
    ? Array.from({ length: 9 }, (_, index) =>
        Math.max(0, 9 - board.filter((value) => value === index + 1).length),
      )
    : null;
  return (
    <div className="keypad kit-keypad" role="group" aria-label="Number pad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((number) => (
        <button
          key={number}
          type="button"
          className="kit-keypad__key"
          aria-label={number ? `Enter ${number}` : 'Erase cell'}
          aria-description={number && remaining ? `${remaining[number - 1]} remaining` : undefined}
          aria-pressed={selectedDigit === undefined ? undefined : selectedDigit === number}
          data-exhausted={number > 0 && remaining?.[number - 1] === 0 ? true : undefined}
          disabled={disabled}
          onClick={() => onEnter(number)}
        >
          {number || <Icon name="delete" />}
          {number > 0 && remaining && (
            <span className="kit-keypad__count" aria-hidden="true">
              {remaining[number - 1] || ''}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
