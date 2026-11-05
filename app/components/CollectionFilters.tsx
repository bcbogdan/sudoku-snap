'use client';

import './CollectionFilters.css';

export type CollectionFilter = 'all' | 'in-progress' | 'completed';

export interface CollectionFiltersProps {
  value: CollectionFilter;
  onChange: (value: CollectionFilter) => void;
  counts?: Partial<Record<CollectionFilter, number>>;
}

const filters = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
] as const;

export default function CollectionFilters({ value, onChange, counts }: CollectionFiltersProps) {
  return (
    <div className="kit-collection-filters" role="group" aria-label="Filter puzzles">
      {filters.map((filter) => (
        <button
          className="kit-collection-filters__button"
          key={filter.value}
          type="button"
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
          {counts?.[filter.value] !== undefined && (
            <span className="kit-collection-filters__count">
              <span className="kit-collection-filters__count-label"> — </span>
              {counts[filter.value]}
              <span className="kit-collection-filters__count-label">
                {counts[filter.value] === 1 ? ' puzzle' : ' puzzles'}
              </span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
