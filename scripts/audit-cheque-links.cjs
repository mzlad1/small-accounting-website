#!/usr/bin/env node
/**
 * Health check for the cheque <-> payment mirror.
 *
 * Every cheque in `customerChecks` has a mirror row in `payments` (type
 * "check"). They must always agree on amount, bank, cheque number and due
 * date. They used to be matched by cheque number, which is NOT unique — a
 * customer can hold two cheque books with overlapping numbers — so an edit
 * could silently rewrite the wrong row. Rows are now linked by `checkId`.
 *
 * Usage:
 *   node scripts/audit-cheque-links.cjs <projectId>            # report only
 *   node scripts/audit-cheque-links.cjs <projectId> --link     # also backfill
 *                                                              # missing checkId
 *
 * Reads the access token from the gcloud CLI, so sign in first with the
 * account that owns the project:
 *   gcloud auth login
 */
const https = require("https");
const { execSync } = require("child_process");

const PROJECT = process.argv[2];
const LINK = process.argv.includes("--link");

if (!PROJECT || PROJECT.startsWith("--")) {
  console.error("usage: node scripts/audit-cheque-links.cjs <projectId> [--link]");
  process.exit(1);
}

let TOKEN;
try {
  TOKEN = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
} catch {
  console.error("Could not get an access token. Run `gcloud auth login` first.");
  process.exit(1);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: "Bearer " + TOKEN,
          ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}),
        },
      },
      (res) => {
        // Collect Buffers and decode once: `str += chunk` decodes each chunk on
        // its own and mangles Arabic that straddles a chunk boundary.
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`${res.statusCode} ${text.slice(0, 400)}`));
          }
          resolve(text ? JSON.parse(text) : {});
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const readValue = (v) => {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(readValue);
  if ("mapValue" in v) return toObject({ fields: v.mapValue.fields || {} });
  return null;
};
const toObject = (doc) => {
  const out = {};
  Object.entries(doc.fields || {}).forEach(([k, v]) => (out[k] = readValue(v)));
  return out;
};

async function readCollection(name) {
  const out = [];
  let pageToken = null;
  do {
    const url = `${BASE}/${name}?pageSize=300${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`;
    const page = await request("GET", url);
    (page.documents || []).forEach((d) => out.push({ id: d.name.split("/").pop(), ...toObject(d) }));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

const norm = (v) => String(v == null ? "" : v).trim();
const money = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

/**
 * Pair a cheque with its mirror. `checkId` wins. Otherwise match on the
 * cheque number: a series is written in a single batch so every row shares
 * one createdAt, which makes time-proximity useless on its own — it is only
 * used to break ties between rows that share a number.
 */
function findMirror(cheque, payments, used) {
  const linked = payments.find((p) => p.checkId === cheque.id && !used.has(p.id));
  if (linked) return { row: linked, how: "checkId" };

  const free = payments.filter((p) => !used.has(p.id) && !p.checkId && p.customerId === cheque.customerId);
  const sameNumber = free.filter((p) => norm(p.checkNumber) === norm(cheque.checkNumber));
  const pool = sameNumber.length ? sameNumber : free;
  if (!pool.length) return { row: null, how: "none" };

  const tiers = [
    (p) => Number(p.amount) === Number(cheque.amount) && norm(p.checkBank) === norm(cheque.bank) && norm(p.checkDate) === norm(cheque.dueDate),
    (p) => Number(p.amount) === Number(cheque.amount) && norm(p.checkBank) === norm(cheque.bank),
    (p) => Number(p.amount) === Number(cheque.amount),
    () => true,
  ];
  for (const tier of tiers) {
    const hits = pool.filter(tier);
    if (hits.length === 1) return { row: hits[0], how: sameNumber.length ? "number" : "guess" };
    if (hits.length > 1) {
      hits.sort(
        (a, b) =>
          Math.abs(Date.parse(a.createdAt) - Date.parse(cheque.createdAt)) -
          Math.abs(Date.parse(b.createdAt) - Date.parse(cheque.createdAt))
      );
      return { row: hits[0], how: sameNumber.length ? "number+time" : "guess" };
    }
  }
  return { row: null, how: "none" };
}

(async () => {
  const [allPayments, cheques, customers] = await Promise.all([
    readCollection("payments"),
    readCollection("customerChecks"),
    readCollection("customers"),
  ]);
  const names = {};
  customers.forEach((c) => (names[c.id] = c.name));
  const nameOf = (id) => names[id] || id;
  const payments = allPayments.filter((p) => p.type === "check");

  console.log(`=== ${PROJECT} ===`);
  console.log(`customers ${customers.length} | cheques ${cheques.length} | cheque-payments ${payments.length}`);
  if (!cheques.length && !payments.length) {
    console.log("No cheque data — nothing to check.");
    return;
  }
  console.log(`cheques total ${money(cheques)} | payments total ${money(payments)} | diff ${money(cheques) - money(payments)}`);
  console.log(`linked by checkId: ${payments.filter((p) => p.checkId).length}/${payments.length}`);

  const grouped = {};
  cheques.forEach((c) => ((grouped[c.customerId] = grouped[c.customerId] || { c: [], p: [] }).c.push(c)));
  payments.forEach((p) => ((grouped[p.customerId] = grouped[p.customerId] || { c: [], p: [] }).p.push(p)));

  console.log("\n-- customers whose two totals disagree --");
  let totalsOff = 0;
  Object.entries(grouped).forEach(([id, g]) => {
    if (money(g.c) !== money(g.p)) {
      totalsOff++;
      console.log(`   ${nameOf(id)}: cheques ${money(g.c)} (${g.c.length}) vs payments ${money(g.p)} (${g.p.length}) -> ${money(g.c) - money(g.p)}`);
    }
  });
  if (!totalsOff) console.log("   none");

  console.log("\n-- customers holding duplicate cheque numbers --");
  let dupes = 0;
  Object.entries(grouped).forEach(([id, g]) => {
    const seen = {};
    g.c.forEach((c) => (seen[norm(c.checkNumber)] = (seen[norm(c.checkNumber)] || 0) + 1));
    const repeated = Object.entries(seen).filter(([, n]) => n > 1);
    if (repeated.length) {
      dupes++;
      console.log(`   ${nameOf(id)}: ${repeated.map(([n, k]) => `#${n} x${k}`).join(", ")}`);
    }
  });
  if (!dupes) console.log("   none");

  console.log("\n-- each cheque against its payment row --");
  const used = new Set();
  const toLink = [];
  let mismatched = 0;
  [...cheques]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .forEach((cheque) => {
      const { row, how } = findMirror(cheque, payments, used);
      if (!row) {
        mismatched++;
        console.log(`   NO PAYMENT  #${cheque.checkNumber} ${cheque.amount} ${cheque.bank} — ${nameOf(cheque.customerId)}`);
        return;
      }
      used.add(row.id);
      if (how !== "checkId") toLink.push({ paymentId: row.id, checkId: cheque.id });
      const diffs = [];
      if (Number(row.amount) !== Number(cheque.amount)) diffs.push(`amount ${row.amount} vs ${cheque.amount}`);
      if (norm(row.checkBank) !== norm(cheque.bank)) diffs.push(`bank "${row.checkBank}" vs "${cheque.bank}"`);
      if (norm(row.checkNumber) !== norm(cheque.checkNumber)) diffs.push(`number ${row.checkNumber} vs ${cheque.checkNumber}`);
      if (norm(row.checkDate) !== norm(cheque.dueDate)) diffs.push(`due date ${row.checkDate} vs ${cheque.dueDate}`);
      if (diffs.length) {
        mismatched++;
        console.log(`   MISMATCH    ${nameOf(cheque.customerId)} — cheque ${cheque.id} / payment ${row.id}`);
        diffs.forEach((d) => console.log(`               ${d}`));
      }
    });
  const orphans = payments.filter((p) => !used.has(p.id));
  orphans.forEach((p) =>
    console.log(`   NO CHEQUE   #${p.checkNumber} ${p.amount} ${p.checkBank} — ${nameOf(p.customerId)} (${p.id})`)
  );
  if (!mismatched && !orphans.length) console.log("   every cheque matches its payment row");

  console.log(
    `\nsummary: ${totalsOff} customers with wrong totals | ${mismatched} mismatched or missing | ${orphans.length} payments with no cheque | ${toLink.length} rows missing a checkId link`
  );

  if (!toLink.length) return;
  if (!LINK) {
    console.log("Re-run with --link to write the missing checkId links.");
    return;
  }

  for (let i = 0; i < toLink.length; i += 400) {
    const writes = toLink.slice(i, i + 400).map((x) => ({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/payments/${x.paymentId}`,
        fields: { checkId: { stringValue: x.checkId } },
      },
      updateMask: { fieldPaths: ["checkId"] },
    }));
    await request("POST", `${BASE}:commit`, { writes });
  }
  const after = (await readCollection("payments")).filter((p) => p.type === "check");
  console.log(`linked ${toLink.length} rows — now ${after.filter((p) => p.checkId).length}/${after.length} carry a checkId.`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
