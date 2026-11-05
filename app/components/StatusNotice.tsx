import { Icon } from './Icon';
import './StatusNotice.css';
import './CopyNotice.css';

export interface StatusNoticeProps {
  message: string;
  kind?: 'message' | 'loading' | 'copied';
}

export default function StatusNotice({ message, kind = 'message' }: StatusNoticeProps) {
  if (kind === 'copied') {
    return (
      <div className="copy-notice kit-copy-notice" role="status">
        <Icon name="check" />
        <span>{message}</span>
      </div>
    );
  }
  return (
    <p
      className="status kit-status-notice"
      data-kind={kind}
      role="status"
      aria-live={kind === 'message' ? 'polite' : undefined}
    >
      {message}
    </p>
  );
}
