import { Icon } from './Icon';
import './SaveStatus.css';

export interface SaveStatusProps {
  state: 'saving' | 'saved' | 'error';
  errorText?: string;
}

const states = {
  saving: { label: 'Saving…', icon: 'clock' },
  saved: { label: 'Saved', icon: 'check' },
  error: { label: 'Could not save', icon: 'alert' },
} as const;

export function SaveStatus({ state, errorText }: SaveStatusProps) {
  const { label, icon } = states[state];

  return (
    <span
      className="kit-save-status"
      data-state={state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon name={icon} size={16} />
      <span className="kit-save-status__text">
        {label}
        {state === 'error' && errorText ? ` · ${errorText}` : null}
      </span>
    </span>
  );
}
