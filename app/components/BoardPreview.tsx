import './BoardPreview.css';

export interface BoardPreviewProps {
  clues: readonly number[];
  board?: readonly number[];
  completed?: boolean;
  className?: string;
}

// The containing card supplies the accessible puzzle summary.
export default function BoardPreview({
  clues,
  board,
  completed = false,
  className,
}: BoardPreviewProps) {
  return (
    <div
      className={`kit-board-preview${className ? ` ${className}` : ''}`}
      data-completed={completed}
      aria-hidden="true"
    >
      {Array.from({ length: 81 }, (_, index) => {
        const given = !!clues[index];
        const value = clues[index] || board?.[index] || 0;
        return (
          <span
            key={index}
            className="kit-board-preview__cell"
            data-given={given}
            data-entered={!given && !!value}
          >
            {value || ''}
          </span>
        );
      })}
    </div>
  );
}
