'use client';

import { useEffect, useState } from 'react';

export default function CopyNotice({ sequence }: { sequence: number }) {
  const [present, setPresent] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!sequence) return;
    setPresent(true);
    setOpen(true);
    const timeout = setTimeout(() => setOpen(false), 3000);
    return () => clearTimeout(timeout);
  }, [sequence]);
  useEffect(() => {
    if (!present || open) return;
    // Keep the same surface during exit so another copy can reverse the transition.
    const timeout = setTimeout(() => setPresent(false), 140);
    return () => clearTimeout(timeout);
  }, [present, open]);

  if (!present) return null;
  return (
    <div className="copy-notice" data-closing={!open || undefined} role="status" aria-atomic="true">
      <span key={sequence}>Link copied to clipboard.</span>
    </div>
  );
}
