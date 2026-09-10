export interface StatusNoticeProps {
  message: string;
  kind?: 'message' | 'loading' | 'copied';
}

export default function StatusNotice({ message, kind = 'message' }: StatusNoticeProps) {
  if (kind === 'copied') {
    return (
      <div className="copy-notice" role="status">
        {message}
      </div>
    );
  }
  return (
    <p className="status" role="status" aria-live={kind === 'message' ? 'polite' : undefined}>
      {message}
    </p>
  );
}
