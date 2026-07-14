import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { evaluateSpend, type SpendIntent, type SpendPolicy } from "../src/index.js";

const token = "0x0000000000000000000000000000000000000001" as Address;
const supplier = "0x0000000000000000000000000000000000000002" as Address;

const policy: SpendPolicy = {
  token,
  maxPerAction: 500_000_000n,
  maxPerRun: 1_000_000_000n,
  approvalThreshold: 250_000_000n,
  maxSlippageBps: 100,
  allowedRecipients: [supplier],
};

function intent(overrides: Partial<SpendIntent> = {}): SpendIntent {
  return {
    id: "intent-1",
    kind: "supplier-payment",
    token,
    recipient: supplier,
    amount: 100_000_000n,
    rationale: "Pay selected supplier",
    ...overrides,
  };
}

describe("evaluateSpend", () => {
  it("allows a payment within all policy limits", () => {
    assert.deepEqual(evaluateSpend(policy, intent(), 0n), { status: "allow" });
  });

  it("requires approval at the configured threshold", () => {
    assert.equal(
      evaluateSpend(policy, intent({ amount: 250_000_000n }), 0n).status,
      "approval-required",
    );
  });

  it("denies an untrusted recipient", () => {
    const recipient = "0x0000000000000000000000000000000000000003" as Address;
    assert.equal(evaluateSpend(policy, intent({ recipient }), 0n).status, "deny");
  });

  it("denies cumulative spend above the run budget", () => {
    assert.equal(
      evaluateSpend(policy, intent({ amount: 200_000_000n }), 900_000_001n).status,
      "deny",
    );
  });

  it("denies swaps without an acceptable slippage bound", () => {
    assert.equal(
      evaluateSpend(
        policy,
        intent({ kind: "swap", slippageBps: 101 }),
        0n,
      ).status,
      "deny",
    );
  });
});

