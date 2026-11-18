import { useEffect, useState } from 'react';
import { slowTracker } from '../../lib/pending';

/** Explains a long wait (typically a sleeping free-tier server) instead of leaving the screen looking frozen. */
export function SlowServerNotice({ tracker = slowTracker }) {
  const [slow, setSlow] = useState(tracker.isSlow());
  useEffect(() => tracker.subscribe(setSlow), [tracker]);
  if (!slow) return null;
  return (
    <div className="slow-notice" role="status" aria-live="polite">
      The server is taking longer than usual to respond. On the free hosting plan it sleeps when idle and can take up to a minute to wake up. Your work is safe; please wait.
    </div>
  );
}
