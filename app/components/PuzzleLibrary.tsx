'use client';

import { useState } from 'react';
import CollectionFilters, { type CollectionFilter } from './CollectionFilters';
import PuzzleCard from './PuzzleCard';
import { Icon } from './Icon';
import './PuzzleLibrary.css';

export interface PuzzleCardModel {
  readonly id: string;
  readonly name: string;
  readonly clues: readonly number[];
  readonly createdLabel: string;
  readonly status: 'draft' | 'ready';
  readonly attemptCount: number;
  readonly completedCount: number;
  readonly unfinishedCount?: number;
  readonly preview?: { readonly board: readonly number[]; readonly completed?: boolean };
  readonly href: string;
}

export interface PuzzleLibraryProps {
  items: readonly PuzzleCardModel[];
  filter?: CollectionFilter;
  onFilterChange?: (filter: CollectionFilter) => void;
}

export default function PuzzleLibrary({ items, filter, onFilterChange }: PuzzleLibraryProps) {
  const [localFilter, setLocalFilter] = useState<CollectionFilter>('all');
  const selectedFilter = filter ?? localFilter;
  const inProgress = (item: PuzzleCardModel) =>
    item.status === 'ready' &&
    (item.unfinishedCount ?? item.attemptCount - item.completedCount) > 0;
  const completed = (item: PuzzleCardModel) => item.completedCount > 0;
  const counts = {
    all: items.length,
    'in-progress': items.filter(inProgress).length,
    completed: items.filter(completed).length,
  };
  const visibleItems = items.filter((item) =>
    selectedFilter === 'all'
      ? true
      : selectedFilter === 'in-progress'
        ? inProgress(item)
        : completed(item),
  );

  return (
    <section className="library puzzle-library">
      <div className="section-heading">
        <div>
          <h1>My puzzles</h1>
        </div>
        <a className="primary" href="/?new">
          <Icon name="plus" /> New puzzle
        </a>
      </div>
      <p className="puzzle-library__summary">
        {counts.all} {counts.all === 1 ? 'puzzle' : 'puzzles'} · {counts.completed}{' '}
        {counts.completed === 1 ? 'puzzle' : 'puzzles'} completed
      </p>
      <CollectionFilters
        value={selectedFilter}
        counts={counts}
        onChange={(value) => {
          setLocalFilter(value);
          onFilterChange?.(value);
        }}
      />
      {items.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">▦</span>
          <h2>A place for every puzzle.</h2>
          <p>Choose a photo or enter clues to start your collection.</p>
          <a href="/?new" className="primary">
            Create a puzzle
          </a>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state" role="status">
          <h2>
            No {selectedFilter === 'completed' ? 'completed puzzles' : 'puzzles in progress'} yet.
          </h2>
          <p>
            {selectedFilter === 'completed'
              ? 'Completed puzzles will appear here after you finish an attempt.'
              : 'Start an attempt on a ready puzzle to see it here.'}
          </p>
        </div>
      ) : (
        <div className="puzzle-list">
          {visibleItems.map((item) => (
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
