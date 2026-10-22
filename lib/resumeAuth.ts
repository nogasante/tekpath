import { useEffect, useRef } from 'react';

/** Run one waiting action after a guest or email session appears. */
export function useResumeWhenSignedIn<T>(signedIn: boolean, run: (token: T) => void) {
  const pending = useRef<T | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!signedIn || pending.current == null) return;
    const token = pending.current;
    pending.current = null;
    runRef.current(token);
  }, [signedIn]);

  return (token: T) => {
    pending.current = token;
  };
}
