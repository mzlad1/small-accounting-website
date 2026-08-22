import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
} from "firebase/firestore";

/**
 * Cache-first read for one or more Firestore queries/collections.
 *
 * 1. Reads the persistent local cache; when it has data, `apply` runs
 *    immediately (instant paint) and `onCachePaint` fires so the page
 *    can hide its loading state.
 * 2. Then always fetches fresh data from the server and runs `apply`
 *    again, silently replacing what was on screen.
 *
 * `apply` MUST fully replace state (setX(newData)), never append —
 * it runs up to twice per call. Its second argument says whether the
 * snapshots came from the cache pass (true) or the server pass
 * (false): any WRITE side effects inside apply must be guarded with
 * `if (!fromCache)` so they run once, against fresh data.
 *
 * Note: the user's own writes (addDoc/updateDoc/deleteDoc) update the
 * local cache instantly, so a refetch after a write already sees them.
 */
export async function fetchCacheFirst(
  queries: Array<Query<DocumentData>>,
  apply: (
    snapshots: Array<QuerySnapshot<DocumentData>>,
    fromCache: boolean
  ) => void,
  onCachePaint?: () => void
): Promise<void> {
  try {
    const cached = await Promise.all(queries.map((q) => getDocsFromCache(q)));
    if (cached.some((snapshot) => !snapshot.empty)) {
      apply(cached, true);
      onCachePaint?.();
    }
  } catch {
    // Nothing cached yet — first visit on this device.
  }
  const fresh = await Promise.all(queries.map((q) => getDocs(q)));
  apply(fresh, false);
}

/** Same contract as fetchCacheFirst, for single-document reads. */
export async function fetchDocsCacheFirst(
  refs: Array<DocumentReference<DocumentData>>,
  apply: (
    snapshots: Array<DocumentSnapshot<DocumentData>>,
    fromCache: boolean
  ) => void,
  onCachePaint?: () => void
): Promise<void> {
  try {
    const cached = await Promise.all(refs.map((r) => getDocFromCache(r)));
    if (cached.some((snapshot) => snapshot.exists())) {
      apply(cached, true);
      onCachePaint?.();
    }
  } catch {
    // Nothing cached yet.
  }
  const fresh = await Promise.all(refs.map((r) => getDoc(r)));
  apply(fresh, false);
}
