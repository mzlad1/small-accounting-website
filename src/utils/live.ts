import {
  onSnapshot,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
} from "firebase/firestore";

/**
 * Real-time subscription to one or more Firestore queries/collections.
 *
 * `apply` runs with the full set of snapshots every time ANY of them
 * changes — first from the persistent cache (instant paint), then from
 * the server, then live on every later change (your own writes appear
 * immediately; other devices' writes stream in). `apply` MUST fully
 * replace state, never append. Its second argument is true while the
 * data is cache-only — guard any WRITE side effects inside apply with
 * `if (!fromCache)`.
 *
 * `onFirstPaint` fires once, when every query has produced its first
 * snapshot (use it to clear the loading flag).
 *
 * Returns the unsubscribe function — ALWAYS return it from the
 * useEffect that created the subscription.
 */
export function subscribeAll(
  queries: Array<Query<DocumentData>>,
  apply: (
    snapshots: Array<QuerySnapshot<DocumentData>>,
    fromCache: boolean
  ) => void,
  onFirstPaint?: () => void,
  onError?: (error: unknown) => void
): () => void {
  const latest: Array<QuerySnapshot<DocumentData> | null> = queries.map(
    () => null
  );
  let painted = false;

  const unsubscribers = queries.map((q, i) =>
    onSnapshot(
      q,
      (snapshot) => {
        latest[i] = snapshot;
        if (latest.every((s) => s !== null)) {
          const snapshots = latest as Array<QuerySnapshot<DocumentData>>;
          const fromCache = snapshots.some((s) => s.metadata.fromCache);
          apply(snapshots, fromCache);
          if (!painted) {
            painted = true;
            onFirstPaint?.();
          }
        }
      },
      (error) => {
        onError?.(error);
        if (!painted) {
          painted = true;
          onFirstPaint?.();
        }
      }
    )
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/**
 * Same contract as subscribeAll, for single-document references.
 *
 * A cache emission where the doc is missing is SKIPPED (the cache may
 * simply not hold it yet) — a not-found only ever reaches `apply` from
 * the server, so exists() checks inside apply can safely alert/navigate.
 */
export function subscribeDocs(
  refs: Array<DocumentReference<DocumentData>>,
  apply: (
    snapshots: Array<DocumentSnapshot<DocumentData>>,
    fromCache: boolean
  ) => void,
  onFirstPaint?: () => void,
  onError?: (error: unknown) => void
): () => void {
  const latest: Array<DocumentSnapshot<DocumentData> | null> = refs.map(
    () => null
  );
  let painted = false;

  const unsubscribers = refs.map((ref, i) =>
    onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists() && snapshot.metadata.fromCache) {
          return; // wait for the server's verdict on a cache miss
        }
        latest[i] = snapshot;
        if (latest.every((s) => s !== null)) {
          const snapshots = latest as Array<DocumentSnapshot<DocumentData>>;
          const fromCache = snapshots.some((s) => s.metadata.fromCache);
          apply(snapshots, fromCache);
          if (!painted) {
            painted = true;
            onFirstPaint?.();
          }
        }
      },
      (error) => {
        onError?.(error);
        if (!painted) {
          painted = true;
          onFirstPaint?.();
        }
      }
    )
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
