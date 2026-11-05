import { Badge } from './Badge';
import BoardPreview from './BoardPreview';
import { Icon } from './Icon';
import type { PuzzleCardModel } from './PuzzleLibrary';
import './PuzzleCard.css';

export interface PuzzleCardProps {
  item: PuzzleCardModel;
  // Completion belongs to the supplied preview attempt, not the puzzle's aggregate count.
  preview?: { board: readonly number[]; completed?: boolean };
}

export default function PuzzleCard({ item, preview }: PuzzleCardProps) {
  return (
    <a className="kit-puzzle-card" href={item.href}>
      <BoardPreview
        clues={item.clues}
        board={preview?.board}
        completed={preview?.completed ?? false}
      />
      <div className="kit-puzzle-card__body">
        <div className="kit-puzzle-card__heading">
          <h2 className="kit-puzzle-card__title">{item.name}</h2>
          <Icon name="arrow-right" size={16} className="kit-puzzle-card__arrow" />
        </div>
        <div className="kit-puzzle-card__badges">
          {item.status === 'draft' ? (
            <Badge kind="draft">Draft</Badge>
          ) : (
            <Badge kind={item.completedCount > 0 ? 'completed' : 'neutral'}>
              {item.completedCount} completed
            </Badge>
          )}
        </div>
        <p className="kit-puzzle-card__meta">
          <span>{item.clues.filter(Boolean).length} clues</span>
          <span>
            <span aria-hidden="true"> · </span>
            {item.attemptCount} {item.attemptCount === 1 ? 'attempt' : 'attempts'}
          </span>
        </p>
      </div>
    </a>
  );
}
