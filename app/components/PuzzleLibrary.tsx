import PuzzleCard from './PuzzleCard';
import { Icon } from './Icon';

export interface PuzzleCardModel {
  readonly id: string;
  readonly name: string;
  readonly clues: readonly number[];
  readonly createdLabel: string;
  readonly status: 'draft' | 'ready';
  readonly attemptCount: number;
  readonly completedCount: number;
  readonly href: string;
}

export interface PuzzleLibraryProps {
  items: readonly PuzzleCardModel[];
}

export default function PuzzleLibrary({ items }: PuzzleLibraryProps) {
  return (
    <section className="library puzzle-library">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR COLLECTION</p>
          <h1>My puzzles</h1>
        </div>
        <a className="primary" href="/?new">
          <Icon name="plus" /> New puzzle
        </a>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">▦</span>
          <h2>A place for every puzzle.</h2>
          <p>Choose a photo or enter clues to start your collection.</p>
          <a href="/?new" className="primary">
            Create a puzzle
          </a>
        </div>
      ) : (
        <div className="puzzle-list">
          {items.map((item) => (
            <PuzzleCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <p className="storage-note">
        Saved in this browser on this device. Clearing browser data removes your puzzles and
        attempts.
      </p>
    </section>
  );
}
