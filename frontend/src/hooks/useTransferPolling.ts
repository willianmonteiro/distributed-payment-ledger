import { useEffect, useRef } from 'react';
import { bankA, type InterbankTransfer } from '../api';
import type { TrackedTransfer } from '../types';

const POLL_INTERVAL_MS = 800;

/** Polls every in-flight (DEBITED) transfer until its saga status settles, then reports it. */
export function useTransferPolling(
  transfers: TrackedTransfer[],
  onSettled: (fresh: InterbankTransfer) => void,
): void {
  const transfersRef = useRef(transfers);
  transfersRef.current = transfers;

  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    const interval = setInterval(() => {
      const inFlight = transfersRef.current.filter((t) => t.status === 'DEBITED');
      for (const t of inFlight) {
        bankA
          .getInterbankTransfer(t.transferId)
          .then((fresh) => {
            if (fresh.status !== t.status) onSettledRef.current(fresh);
          })
          .catch(() => {
            // transient network hiccup — next tick retries
          });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
