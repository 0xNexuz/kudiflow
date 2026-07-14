import type { Address } from "viem";

export type ActionKind =
  | "x402-service"
  | "swap"
  | "supplier-payment"
  | "platform-fee";

export interface SpendIntent {
  id: string;
  kind: ActionKind;
  token: Address;
  recipient: Address;
  amount: bigint;
  /** Basis points of expected price movement for swaps. */
  slippageBps?: number;
  /** Human-readable source used in the audit log. */
  rationale: string;
}

export interface SpendPolicy {
  token: Address;
  maxPerAction: bigint;
  maxPerRun: bigint;
  approvalThreshold: bigint;
  maxSlippageBps: number;
  allowedRecipients: readonly Address[];
}

export type PolicyDecision =
  | { status: "allow" }
  | { status: "approval-required"; reason: string }
  | { status: "deny"; reason: string };

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Pure, deterministic authorization gate. An AI model may construct an intent,
 * but it cannot bypass this decision before signing or sending a transaction.
 */
export function evaluateSpend(
  policy: SpendPolicy,
  intent: SpendIntent,
  spentThisRun: bigint,
): PolicyDecision {
  if (intent.amount <= 0n) {
    return { status: "deny", reason: "Amount must be greater than zero" };
  }

  if (!sameAddress(policy.token, intent.token)) {
    return { status: "deny", reason: "Token is not authorized by this policy" };
  }

  const recipientAllowed = policy.allowedRecipients.some((recipient) =>
    sameAddress(recipient, intent.recipient),
  );
  if (!recipientAllowed) {
    return { status: "deny", reason: "Recipient is not allowlisted" };
  }

  if (intent.amount > policy.maxPerAction) {
    return { status: "deny", reason: "Per-action limit exceeded" };
  }

  if (spentThisRun + intent.amount > policy.maxPerRun) {
    return { status: "deny", reason: "Run budget exceeded" };
  }

  if (
    intent.kind === "swap" &&
    (intent.slippageBps === undefined ||
      intent.slippageBps < 0 ||
      intent.slippageBps > policy.maxSlippageBps)
  ) {
    return { status: "deny", reason: "Swap slippage is outside policy" };
  }

  if (intent.amount >= policy.approvalThreshold) {
    return {
      status: "approval-required",
      reason: "Amount requires merchant approval",
    };
  }

  return { status: "allow" };
}

