export interface NumberKeypadProps {
  disabled: boolean;
  onEnter: (value: number) => void;
}

export default function NumberKeypad({ disabled, onEnter }: NumberKeypadProps) {
  return (
    <div className="keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((number) => (
        <button
          key={number}
          aria-label={number ? `Enter ${number}` : 'Erase cell'}
          disabled={disabled}
          onClick={() => onEnter(number)}
        >
          {number || '⌫'}
        </button>
      ))}
    </div>
  );
}
