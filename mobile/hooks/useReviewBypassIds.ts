import { useEffect, useState } from 'react';

import { fetchReviewBypassIds } from '../services/reviewMode';

const NONE: ReadonlySet<string> = new Set();

/** The venues the server lets this person into from anywhere (review group); empty for everybody else. */
export function useReviewBypassIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    let alive = true;
    void fetchReviewBypassIds().then((next) => { if (alive && next.size > 0) setIds(next); });
    return () => { alive = false; };
  }, []);
  return ids;
}
