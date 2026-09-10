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
    <section className="library">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR COLLECTION</p>
          <h1>My puzzles</h1>
        </div>
        <a className="primary" href="/?new">
          ＋ New puzzle
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
            <a className="puzzle-card" key={item.id} href={item.href}>
              <div className="mini-board" aria-hidden="true">
                {item.clues.map((value, index) => (
                  <span key={index}>{value || ''}</span>
                ))}
              </div>
              <div>
                <span className="badge">
                  {item.status === 'draft' ? 'Draft' : `${item.completedCount} completed`}
                </span>
                <h2>{item.name}</h2>
                <p>{item.createdLabel}</p>
                <p>
                  {item.clues.filter(Boolean).length} clues · {item.attemptCount}{' '}
                  {item.attemptCount === 1 ? 'attempt' : 'attempts'}
                </p>
              </div>
              <span className="card-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
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
