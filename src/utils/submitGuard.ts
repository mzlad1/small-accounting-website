import { useCallback, useRef, useState } from "react";

/**
 * Blocks a second save while the first one is still running.
 *
 * A dialog's save button stays clickable during the await, so a fast
 * double-click runs the handler twice. In series mode that once wrote a
 * whole 41-cheque batch twice over, 44ms apart.
 *
 * The ref is what actually stops the second run — a state flag is not
 * updated soon enough to be trusted for that. The returned boolean exists
 * so the button can show the save in progress.
 */
export function useSubmitGuard() {
  const running = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const runGuarded = useCallback(
    async (action: () => unknown | Promise<unknown>) => {
      if (running.current) return;
      running.current = true;
      setSubmitting(true);
      try {
        await action();
      } finally {
        running.current = false;
        setSubmitting(false);
      }
    },
    []
  );

  return [submitting, runGuarded] as const;
}
