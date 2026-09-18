/**
 * The shapes CourtRoom returns.
 *
 * Every wei figure is a STRING here because it is a string on the contract too.
 * A JSON number above 2**53 loses precision before any of this code sees it,
 * and an amount that silently rounds is an amount somebody disputes — which is
 * the one thing a court cannot afford to be sloppy about.
 */

export type Outcome =
  | "PLAINTIFF_WINS"
  | "DEFENDANT_WINS"
  | "PARTIAL"
  | "DISMISSED"
  | "";

export type CaseStatus =
  | "FILED"
  | "RESPONDED"
  | "SETTLED"
  | "WITHDRAWN"
  | "DEFAULTED"
  | "STALLED";

export type Resolution =
  | "VERDICT"
  | "ACCEPTED"
  | "DEFAULT"
  | "WITHDRAWN"
  | "STALLED"
  | "";

export type Quality = "PLAINTIFF" | "DEFENDANT" | "EQUAL" | "";

export interface TimelineEvent {
  event: string;
  at: number;
  by: string;
  detail: string;
}

export interface CaseCard {
  case_id: number;
  status: CaseStatus;
  resolution: Resolution;
  outcome: Outcome;
  plaintiff: string;
  defendant: string;
  summary: string;
  amount_claimed_wei: string;
  amount_claimed_gen: string;
  award_bps: number;
  award_pct: number;
  award_wei: string;
  award_gen: string;
  evidence_quality: Quality;
  filed_at: number;
  respond_by: number;
  responded_at: number;
  settled_at: number;
  seconds_left_to_respond: number;
  response_overdue: boolean;
  can_judge: boolean;
  /** Only on the verdict feed. */
  reasoning?: string;
  verdict_key?: string;
  content_hash?: string;
  unenforced_wei?: string;
  to_plaintiff_wei?: string;
  to_defendant_wei?: string;
}

export interface CaseDetail extends CaseCard {
  found: boolean;
  claim_text: string;
  evidence_text: string;
  response_text: string;
  counter_evidence: string;
  counter_amount_wei: string;
  counter_amount_gen: string;
  filing_fee_wei: string;
  filing_fee_gen: string;
  escrow_wei: string;
  escrow_gen: string;
  award_rung: number;
  verdict_key: string;
  reasoning: string;
  content_hash: string;
  signals_csv: string;
  bracket_lo: number;
  bracket_hi: number;
  bracket_pct: [number, number];
  jury_option: number;
  option_count: number;
  dismissible: boolean;
  model_called: boolean;
  rubric_version: string;
  to_plaintiff_wei: string;
  to_plaintiff_gen: string;
  to_defendant_wei: string;
  to_defendant_gen: string;
  unenforced_wei: string;
  unenforced_gen: string;
  judged_by: string;
  now: number;
  can_default: boolean;
  can_withdraw: boolean;
  can_respond: boolean;
  judging_since: number;
  judging_stuck: boolean;
  timeline: TimelineEvent[];
  reason?: string;
}

export interface Stats {
  total_cases: number;
  total_settled: number;
  total_rejected: number;
  open_cases: number;
  awaiting_answer: number;
  awaiting_jury: number;
  outcomes: Record<string, number>;
  statuses: Record<string, number>;
  verdicts_returned: number;
  average_award_bps: number;
  average_award_pct: number;
  plaintiff_win_rate_pct: number;
  defendant_win_rate_pct: number;
  partial_rate_pct: number;
  total_claimed_wei: string;
  total_claimed_gen: string;
  total_awarded_wei: string;
  total_awarded_gen: string;
  balance_wei: string;
  balance_gen: string;
  escrowed_wei: string;
  payable_wei: string;
  claimed_total_wei: string;
  ledger_balanced: boolean;
  chain_balance_wei: string;
  undelivered_wei: string;
  payouts_are_queued_not_pushed: boolean;
  holds_protocol_revenue: boolean;
  paused: boolean;
}

export interface Config {
  owner: string;
  paused: boolean;
  rubric_version: string;
  filing_fee_wei: string;
  filing_fee_gen: string;
  min_claim_wei: string;
  min_claim_gen: string;
  max_claim_wei: string;
  max_claim_gen: string;
  response_window_s: number;
  stall_ttl_s: number;
  default_response_window_s: number;
  file_cooldown_s: number;
  max_cases: number;
  min_filing_chars: number;
  max_claim_chars: number;
  max_evidence_chars: number;
  max_response_chars: number;
  max_counter_evidence_chars: number;
  bond_rule: string;
  award_ladder_bps: number[];
  outcomes: string[];
  statuses: string[];
  terminal_statuses: string[];
  resolutions: string[];
  qualities: string[];
  consensus_key: string;
  consensus_also_binds: string[];
  owner_powers: string[];
  owner_cannot: string[];
  deadlines_immutable: boolean;
  writes_never_raise: boolean;
  holds_protocol_revenue: boolean;
}

export interface PreviewOption {
  option: number;
  outcome: Exclude<Outcome, "">;
  award_bps: number;
  award_pct: number;
  evidence_quality: Exclude<Quality, "">;
  dismiss: boolean;
}

export interface Preview {
  signals: Record<string, number>;
  signals_csv: string;
  plaintiff_specificity: number;
  defendant_specificity: number;
  gap: number;
  dismissible: boolean;
  bracket: [number, number];
  bracket_pct: [number, number];
  options: PreviewOption[];
  note: string;
}

export interface Verification {
  found: boolean;
  case_id: number;
  verifiable: boolean;
  matches: boolean;
  decided_by?: "jury" | "contract";
  resolution?: string;
  checks?: Record<string, boolean>;
  failed?: string[];
  stored?: Record<string, unknown>;
  recomputed?: Record<string, unknown>;
  reason?: string;
  note?: string;
}
