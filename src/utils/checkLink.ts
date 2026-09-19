import {
  collection,
  getDocs,
  query,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * A cheque (customerChecks) and its mirror row in `payments` are two
 * documents that must stay in step. They are linked by `checkId` on the
 * payment.
 *
 * Rows created before that field existed have no link, so we fall back to
 * matching on cheque number + customer. That fallback is NOT safe on its
 * own: a customer can hold two cheque books whose numbers overlap, and
 * picking "the first match" silently rewrites the other cheque's payment
 * row (this really happened — a ₪3,000 row was overwritten with a
 * ₪2,000 cheque's data and the totals drifted apart). So an ambiguous
 * match is reported, never guessed.
 */
export type LinkResult =
  | { status: "found"; id: string }
  | { status: "none" }
  | { status: "ambiguous"; count: number };

/** Message to show the user when a link cannot be resolved safely. */
export const AMBIGUOUS_LINK_MESSAGE =
  "يوجد أكثر من شيك بنفس الرقم لهذا العميل، لذا لم يتم تعديل السجل المقابل تلقائياً لتفادي تعديل الشيك الخطأ. يرجى تعديله يدوياً.";

/** Find the payment row that mirrors this cheque. */
export async function findPaymentForCheck(check: {
  id: string;
  customerId: string;
  checkNumber: string;
}): Promise<LinkResult> {
  const linked = await getDocs(
    query(collection(db, "payments"), where("checkId", "==", check.id))
  );
  if (linked.size === 1) return { status: "found", id: linked.docs[0].id };
  if (linked.size > 1) return { status: "ambiguous", count: linked.size };

  // Legacy rows: match by number, but ignore any row already claimed by
  // a different cheque.
  const legacy = await getDocs(
    query(
      collection(db, "payments"),
      where("customerId", "==", check.customerId),
      where("checkNumber", "==", check.checkNumber),
      where("type", "==", "check")
    )
  );
  const free = legacy.docs.filter((d) => !d.data().checkId);
  if (free.length === 1) {
    // Heal the link so this lookup is unambiguous from now on.
    await updateDoc(doc(db, "payments", free[0].id), { checkId: check.id });
    return { status: "found", id: free[0].id };
  }
  if (free.length === 0) return { status: "none" };
  return { status: "ambiguous", count: free.length };
}

/** Find the cheque that this payment row mirrors. */
export async function findCheckForPayment(payment: {
  id: string;
  customerId: string;
  checkNumber?: string;
  checkId?: string;
}): Promise<LinkResult> {
  if (payment.checkId) return { status: "found", id: payment.checkId };
  if (!payment.checkNumber) return { status: "none" };

  const legacy = await getDocs(
    query(
      collection(db, "customerChecks"),
      where("customerId", "==", payment.customerId),
      where("checkNumber", "==", payment.checkNumber)
    )
  );
  if (legacy.size === 1) {
    await updateDoc(doc(db, "payments", payment.id), {
      checkId: legacy.docs[0].id,
    });
    return { status: "found", id: legacy.docs[0].id };
  }
  if (legacy.empty) return { status: "none" };
  return { status: "ambiguous", count: legacy.size };
}
