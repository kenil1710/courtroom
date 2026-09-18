"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, CheckCircle2, Coins, Gavel, KeyRound,
  Loader2, Scale,
} from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { gen, toWei } from "@/lib/format";
import { txUrl } from "@/lib/chain";
import { Notice } from "@/components/ui";
import type { Config, Preview } from "@/lib/types";

/**
 * Filing a claim.
 *
 * The one thing this form does that a generic form would not: it shows, live,
 * what the evidence on the page will ALLOW a jury to award, before any money is
 * spent. The window is pure arithmetic over the filing, so it can be computed
 * from a view — and a plaintiff who can see that an unsubstantiated claim caps
 * out at a token award is a plaintiff who can go and find their invoice first,
 * rather than paying to discover it.
 */

const LS_SEEN = "courtroom.filed.v1";

interface Props {
  config: Config;
}

export function FileForm({ config }: Props) {
  const router = useRouter();
  const { ready, address, balanceWei, send, fund, funding, create } = useWallet();

  const [defendant, setDefendant] = useState("");
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string; caseId?: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [firstTime, setFirstTime] = useState(false);

  // Whether to show the onboarding note depends on `localStorage`, which does
  // not exist while this renders on the server. Reading it after mount is the
  // only way that does not disagree with the server's HTML; the lint rule
  // cannot tell this apart from a cascading render.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFirstTime(!window.localStorage.getItem(LS_SEEN));
    } catch { /* storage blocked; assume a returning visitor and say less */ }
  }, []);

  const fee = BigInt(config.filing_fee_wei);
  const amountWei = toWei(amount);
  const minWei = BigInt(config.min_claim_wei);
  const maxWei = BigInt(config.max_claim_wei);

  const problems = useMemo(() => {
    const out: string[] = [];
    if (defendant && !/^0x[0-9a-fA-F]{40}$/.test(defendant.trim())) {
      out.push("The defendant must be a wallet address — 0x followed by 40 hex characters.");
    }
    if (address && defendant.trim().toLowerCase() === address.toLowerCase()) {
      out.push("You cannot file a claim against yourself.");
    }
    if (claim.trim() && claim.trim().length < config.min_filing_chars) {
      out.push(`Describe the claim in at least ${config.min_filing_chars} characters.`);
    }
    if (evidence.trim() && evidence.trim().length < config.min_filing_chars) {
      out.push(`Give at least ${config.min_filing_chars} characters of evidence.`);
    }
    if (amount.trim()) {
      if (amountWei === null) out.push("The amount must be a plain number of GEN, like 2.5.");
      else if (BigInt(amountWei) < minWei) out.push(`Claim at least ${gen(config.min_claim_wei)} GEN.`);
      else if (BigInt(amountWei) > maxWei) out.push(`Claim at most ${gen(config.max_claim_wei)} GEN.`);
    }
    return out;
  }, [defendant, claim, evidence, amount, amountWei, address, config, minWei, maxWei]);

  const complete =
    /^0x[0-9a-fA-F]{40}$/.test(defendant.trim()) &&
    claim.trim().length >= config.min_filing_chars &&
    evidence.trim().length >= config.min_filing_chars &&
    amountWei !== null &&
    BigInt(amountWei) >= minWei &&
    BigInt(amountWei) <= maxWei &&
    problems.length === 0;

  const funded = balanceWei >= fee;

  /* --- the live window ---------------------------------------------------- */
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether there is enough text to score is DERIVED, not stored. Clearing the
  // preview from inside the effect would be a synchronous setState on every
  // keystroke below the threshold, and the answer was always just a function of
  // what is on screen.
  const longEnough = claim.trim().length >= 20 || evidence.trim().length >= 20;
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (claim.trim().length < 20 && evidence.trim().length < 20) return;
    debounce.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claim, evidence }),
        });
        setPreview(res.ok ? await res.json() : null);
      } catch {
        setPreview(null); // a window we could not compute is simply not shown
      } finally {
        setPreviewing(false);
      }
    }, 700);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [claim, evidence]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || !address || busy) return;
    setBusy(true);
    setResult(null);
    const out = await send(
      "file_case",
      [defendant.trim(), claim.trim(), evidence.trim(), amountWei!],
      fee,
    );
    setBusy(false);

    if (out.status === "REJECTED") {
      setResult({ ok: false, text: out.reason ?? "The court refused this filing.", hash: out.hash });
      return;
    }
    if (!out.ok) {
      setResult({ ok: false, text: out.error ?? "The filing did not settle.", hash: out.hash });
      return;
    }
    try { window.localStorage.setItem(LS_SEEN, "1"); } catch { /* fine */ }

    // The case id comes from the return value when it is readable, and from the
    // contract's own state when it is not. A transaction can settle ACCEPTED
    // with `consensus_data` unpopulated, which makes the return value
    // unreadable — the case was still filed, and sending somebody away thinking
    // it failed would be the worse error by far.
    let caseId = Number(out.returned?.case_id ?? 0);
    if (!caseId) {
      try {
        const q = new URLSearchParams({
          address, amount: amountWei!, head: claim.trim().slice(0, 60),
        });
        const res = await fetch(`/api/find-case?${q}`);
        if (res.ok) caseId = Number((await res.json()).case_id ?? 0);
      } catch { /* the filing still happened; we just cannot link to it */ }
    }
    setResult({
      ok: true,
      text: caseId
        ? `Case #${caseId} is on the docket. The defendant has ${Math.round(config.response_window_s / 3600)} hours to answer.`
        : "Your case is on the docket.",
      hash: out.hash,
      caseId: caseId || undefined,
    });
    if (caseId) setTimeout(() => router.push(`/case/${caseId}`), 2200);
  }

  if (!ready) {
    return <div className="card p-8 text-center text-ink-3">Loading…</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] items-start">
      <form onSubmit={submit} className="card p-5 sm:p-7 min-w-0">
        {firstTime ? (
          <div className="mb-6">
            <Notice title="First time here?">
              You need three things: a key (made in your browser, one click), some
              test GEN (free, from the faucet), and the wallet address of whoever
              you are claiming against. Nothing here is real money.
            </Notice>
          </div>
        ) : null}

        <Field
          label="Who are you claiming against?"
          hint="Their wallet address. Only this address will be able to answer."
        >
          <input
            className="field mono-addr"
            placeholder="0x0000000000000000000000000000000000000000"
            value={defendant}
            onChange={(e) => setDefendant(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field
          label="What happened?"
          hint="The claim itself, in plain words. Dates and amounts help."
          count={`${claim.length} / ${config.max_claim_chars}`}
        >
          <textarea
            className="field min-h-[7rem] resize-y leading-relaxed"
            maxLength={config.max_claim_chars}
            placeholder="On 14 March I paid 2.5 GEN for a website due 30 April. Nothing was delivered and they stopped replying on 2 May."
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
          />
        </Field>

        <Field
          label="Your evidence"
          hint="Invoice numbers, dates, transaction hashes, what was agreed and where. This is what the jury reads."
          count={`${evidence.length} / ${config.max_evidence_chars}`}
        >
          <textarea
            className="field min-h-[10rem] resize-y leading-relaxed"
            maxLength={config.max_evidence_chars}
            placeholder="Invoice INV-2026-0314 dated 14 March for 2.5 GEN. Payment 0x9f21… on 14 March. Emails of 2 April, 19 April and 2 May promising delivery. The signed agreement at example.com/contract, clause 4."
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </Field>

        <Field
          label="How much are you claiming?"
          hint={`Between ${gen(config.min_claim_wei)} and ${gen(config.max_claim_wei)} GEN. The defendant must bond this whole amount to answer.`}
        >
          <div className="relative">
            <input
              className="field tnum pr-14"
              placeholder="2.5"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.85rem] text-ink-3">GEN</span>
          </div>
        </Field>

        {problems.length ? (
          <div className="mt-5">
            <Notice tone="warn" title="Fix these before filing">
              <ul className="mt-1 space-y-1 list-disc pl-4">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </Notice>
          </div>
        ) : null}

        <div className="mt-6 pt-5 border-t border-rule">
          <div className="flex items-baseline justify-between text-[0.9rem]">
            <span className="text-ink-2">Filing fee, payable now</span>
            <span className="tnum font-semibold">{gen(config.filing_fee_wei)} GEN</span>
          </div>
          <p className="mt-1.5 text-[0.84rem] text-ink-3 leading-relaxed">
            Returned to you unless the defendant wins, in which case it goes to
            them. This court keeps none of it either way.
          </p>

          {!address ? (
            <button type="button" onClick={create} className="btn btn-primary w-full mt-5">
              <KeyRound size={15} aria-hidden />
              Create a testnet key to file
            </button>
          ) : !funded ? (
            <>
              <button type="button" onClick={() => void fund()} disabled={funding} className="btn btn-primary w-full mt-5">
                {funding ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
                {funding ? "Asking the faucet…" : "Get test GEN to cover the fee"}
              </button>
              <p className="mt-2 text-[0.82rem] text-ink-3 text-center">
                You have {gen(balanceWei.toString())} GEN and need {gen(config.filing_fee_wei)}.
              </p>
            </>
          ) : (
            <button type="submit" disabled={!complete || busy} className="btn btn-primary w-full mt-5">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Gavel size={15} />}
              {busy ? "Filing…" : "File this case"}
            </button>
          )}
        </div>

        {result ? (
          <div className="mt-5">
            <Notice tone={result.ok ? "info" : "bad"} title={result.ok ? "Filed" : "Not filed"}>
              <p className="flex items-start gap-2">
                {result.ok
                  ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-plaintiff" aria-hidden />
                  : <AlertCircle size={15} className="mt-0.5 shrink-0 text-defendant" aria-hidden />}
                <span>{result.text}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-[0.84rem]">
                {result.caseId ? (
                  <Link href={`/case/${result.caseId}`} className="link-quiet inline-flex items-center gap-1">
                    Open case #{result.caseId} <ArrowRight size={13} aria-hidden />
                  </Link>
                ) : null}
                {result.hash ? (
                  <a href={txUrl(result.hash)} target="_blank" rel="noreferrer noopener" className="link-quiet">
                    Transaction
                  </a>
                ) : null}
              </div>
            </Notice>
          </div>
        ) : null}
      </form>

      <PreviewPanel preview={longEnough ? preview : null} busy={previewing} amount={amount} />
    </div>
  );
}

function Field({
  label, hint, count, children,
}: { label: string; hint?: string; count?: string; children: React.ReactNode }) {
  return (
    <label className="block mt-5 first:mt-0">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[0.94rem]">{label}</span>
        {count ? <span className="tnum text-[0.76rem] text-ink-3">{count}</span> : null}
      </span>
      {hint ? <span className="block mt-0.5 mb-2 text-[0.84rem] text-ink-3 leading-snug">{hint}</span> : <span className="block mb-2" />}
      {children}
    </label>
  );
}

/**
 * What this filing can win, before it is filed.
 *
 * The bracket is the court's own arithmetic over the text on the left, read
 * live from the contract. It is not advice and it is not a prediction of the
 * verdict — it is the range the jury will be allowed to choose within, which is
 * a fact about the filing rather than an opinion about the dispute.
 */
function PreviewPanel({ preview, busy, amount }: { preview: Preview | null; busy: boolean; amount: string }) {
  const wei = toWei(amount);
  return (
    <aside className="card p-5 lg:sticky lg:top-20">
      <div className="flex items-center gap-2">
        <Scale size={16} strokeWidth={1.9} className="text-brand" aria-hidden />
        <h2 className="font-semibold text-[0.95rem]">What your evidence supports</h2>
      </div>
      <p className="mt-1.5 text-[0.84rem] text-ink-3 leading-relaxed">
        The court scores how checkable each side&rsquo;s filing is and fixes the
        range a jury may award within. This is that range, computed from what you
        have written so far.
      </p>

      {!preview ? (
        <p className="mt-5 text-[0.86rem] text-ink-3">
          {busy ? "Reading your filing…" : "Start writing your claim and evidence and the range appears here."}
        </p>
      ) : (
        <>
          <div className="mt-5">
            <p className="tnum serif text-[2rem] leading-none">
              {preview.bracket_pct[0]}–{preview.bracket_pct[1]}
              <span className="text-[0.55em] text-ink-3 ml-0.5">%</span>
            </p>
            <p className="mt-1 text-[0.84rem] text-ink-3">
              of the amount you claim, if the defendant files nothing stronger
            </p>
          </div>

          {wei ? (
            <p className="mt-3 text-[0.88rem] text-ink-2">
              On {gen(wei)} GEN that is{" "}
              <span className="tnum font-semibold text-ink">
                {gen(((BigInt(wei) * BigInt(preview.bracket_pct[0] * 100)) / 10000n).toString())}
              </span>
              {" – "}
              <span className="tnum font-semibold text-ink">
                {gen(((BigInt(wei) * BigInt(preview.bracket_pct[1] * 100)) / 10000n).toString())}
              </span>{" "}
              GEN.
            </p>
          ) : null}

          <dl className="mt-5 pt-4 border-t border-rule space-y-2.5 text-[0.85rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-3">How checkable your filing is</dt>
              <dd className="tnum font-semibold">{preview.plaintiff_specificity} / 7</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-3">Verdicts this leaves open</dt>
              <dd className="tnum font-semibold">{preview.options.length}</dd>
            </div>
          </dl>

          {preview.dismissible ? (
            <div className="mt-4">
              <Notice tone="warn">
                As written, nothing here is checkable — no dates, figures or
                documents. A filing like this can only be dismissed or lost. Add
                what you have before you pay the fee.
              </Notice>
            </div>
          ) : preview.bracket_pct[1] < 100 ? (
            <p className="mt-4 text-[0.84rem] text-ink-3 leading-relaxed">
              To reach a full award you need a filing that is markedly more
              specific than the answer you expect: dates, amounts, and documents
              somebody else could look at.
            </p>
          ) : (
            <p className="mt-4 text-[0.84rem] text-ink-3 leading-relaxed">
              A full award is within reach on this evidence. A well-documented
              answer from the defendant will narrow it.
            </p>
          )}
        </>
      )}
    </aside>
  );
}
