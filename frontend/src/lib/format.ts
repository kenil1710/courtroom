import type { CaseCard, CaseStatus, Outcome, Quality } from "./types";

/**
 * Wei to GEN, by string arithmetic.
 *
 * Never `Number(wei) / 1e18`. A claim of 10,000 GEN is 1e22 wei, which is far
 * past the largest integer a JS number holds exactly, so the division quietly
 * returns a number that is close to right. Close to right is not a thing a
 * court gets to be about money.
 */
export function gen(wei: string | bigint | undefined | null, dp = 4): string {
  if (wei === undefined || wei === null || wei === "") return "0";
  let v: bigint;
  try {
    v = BigInt(wei);
  } catch {
    return "0";
  }
  if (v < 0n) v = 0n;
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n) / 10n ** BigInt(18 - dp);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (frac === 0n) return grouped;
  const text = frac.toString().padStart(dp, "0").replace(/0+$/, "");
  return text ? `${grouped}.${text}` : grouped;
}

export const shortAddress = (a?: string) =>
  !a ? "" : `${a.slice(0, 6)}…${a.slice(-4)}`;

export const sameAddress = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** A duration a person can read. Always the two largest units that matter, so
 *  "1d 4h" rather than "28h" and never "0 minutes". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** An absolute instant, because a docket entry is a record and a record has a
 *  date on it. Rendered in UTC so a case reads the same wherever it is opened —
 *  the contract's own clock is UTC and a local rendering would disagree with
 *  the deadline it is describing. */
export function stamp(epoch: number): string {
  if (!epoch) return "—";
  const d = new Date(epoch * 1000);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

export function relative(epoch: number, now: number): string {
  if (!epoch) return "—";
  const delta = now - epoch;
  if (delta < 0) return `in ${duration(-delta)}`;
  if (delta < 45) return "just now";
  return `${duration(delta)} ago`;
}

/* --- outcome and status vocabulary --------------------------------------- */

export interface Tone {
  label: string;
  color: string;
  wash: string;
  /** What actually happened to the money, in one line. */
  meaning: string;
}

export const OUTCOME_TONE: Record<Exclude<Outcome, "">, Tone> = {
  PLAINTIFF_WINS: {
    label: "Plaintiff wins",
    color: "var(--plaintiff)",
    wash: "var(--plaintiff-wash)",
    meaning: "The full amount claimed goes to the plaintiff, with the filing fee returned.",
  },
  DEFENDANT_WINS: {
    label: "Defendant wins",
    color: "var(--defendant)",
    wash: "var(--defendant-wash)",
    meaning: "The bond goes back to the defendant, and the filing fee goes to them too.",
  },
  PARTIAL: {
    label: "Partial award",
    color: "var(--partial)",
    wash: "var(--partial-wash)",
    meaning: "Part of the claim is awarded; the rest of the bond returns to the defendant.",
  },
  DISMISSED: {
    label: "Dismissed",
    color: "var(--dismissed)",
    wash: "var(--dismissed-wash)",
    meaning: "Neither side is found against. Both are made whole.",
  },
};

export const STATUS_TONE: Record<CaseStatus, Tone> = {
  FILED: {
    label: "Awaiting answer",
    color: "var(--brand)",
    wash: "var(--brand-wash)",
    meaning: "The defendant has 48 hours to answer and post a bond.",
  },
  RESPONDED: {
    label: "Ready for the jury",
    color: "var(--partial)",
    wash: "var(--partial-wash)",
    meaning: "Both sides have filed. Anyone can send it to the jury.",
  },
  SETTLED: {
    label: "Settled",
    color: "var(--plaintiff)",
    wash: "var(--plaintiff-wash)",
    meaning: "Decided and paid out.",
  },
  DEFAULTED: {
    label: "Default judgment",
    color: "var(--partial)",
    wash: "var(--partial-wash)",
    meaning: "The defendant never answered, so judgment was entered without them.",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    color: "var(--dismissed)",
    wash: "var(--dismissed-wash)",
    meaning: "The plaintiff dropped it before any answer. No finding either way.",
  },
  STALLED: {
    label: "Stalled",
    color: "var(--dismissed)",
    wash: "var(--dismissed-wash)",
    meaning: "The jury round never settled. Both sides were refunded in full.",
  },
};

export const QUALITY_LABEL: Record<Exclude<Quality, "">, string> = {
  PLAINTIFF: "Plaintiff's evidence was stronger",
  DEFENDANT: "Defendant's evidence was stronger",
  EQUAL: "Evenly matched on the evidence",
};

/** The colour a docket row's file edge is keyed by: the outcome once there is
 *  one, the status until then. */
export function edgeColor(c: Pick<CaseCard, "outcome" | "status">): string {
  if (c.outcome && c.outcome in OUTCOME_TONE) {
    return OUTCOME_TONE[c.outcome as Exclude<Outcome, "">].color;
  }
  return STATUS_TONE[c.status]?.color ?? "var(--rule-strong)";
}

export function headline(c: Pick<CaseCard, "outcome" | "status" | "resolution">): Tone {
  if (c.outcome && c.outcome in OUTCOME_TONE) {
    return OUTCOME_TONE[c.outcome as Exclude<Outcome, "">];
  }
  return STATUS_TONE[c.status] ?? STATUS_TONE.FILED;
}

export const isTerminal = (s: CaseStatus) =>
  s === "SETTLED" || s === "WITHDRAWN" || s === "DEFAULTED" || s === "STALLED";

/** GEN as a decimal string to wei, exactly, without ever building a float.
 *  Returns null for anything that is not a plain decimal number. */
export function toWei(input: string): string | null {
  const t = input.trim();
  if (!t || !/^\d*\.?\d*$/.test(t) || t === ".") return null;
  const [whole = "0", frac = ""] = t.split(".");
  if (frac.length > 18) return null;
  const padded = (frac + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(whole || "0") * 10n ** 18n + BigInt(padded || "0");
  return wei.toString();
}
