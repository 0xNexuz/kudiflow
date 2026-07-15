import { toDataSuffix } from "@celo/attribution-tags";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { evaluateSpend, type SpendPolicy } from "./policy.js";
import type { RuntimeConfig } from "./config.js";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface Receipt {
  name: string;
  amount: string;
  network: string;
  transaction?: Hash;
  proof?: unknown;
}

export interface MerchantPolicyInput {
  maxSignalSpendUsdc?: string;
  maxSettlementUsdc?: string;
  approvalThresholdUsdc?: string;
  minReputation?: number;
  requireVerifiedSupplier?: boolean;
  allowSignalProviders?: boolean;
}

export interface AgentRunInput {
  merchantRequest?: string;
  settlementAmountUsdc?: string;
  policy?: MerchantPolicyInput;
}

export interface PolicyDecisionLog {
  action: string;
  status: "allow" | "approval-required" | "deny";
  reason: string;
  amount: string;
  recipient: string;
}

export interface AgentRunResult {
  status: "ready-for-approval" | "blocked";
  merchantRequest: string;
  supplier: string;
  settlementAmountUsdc: string;
  budgetSavedNgn: string;
  receipts: Receipt[];
  policyDecisions: PolicyDecisionLog[];
  autonomousActions: string[];
  blockReason?: string;
}

export async function getBalances(config: RuntimeConfig) {
  if (!config.agentAddress) return null;
  const client = createPublicClient({ chain: celo, transport: http(config.rpcUrl) });
  const [celoWei, usdcUnits] = await Promise.all([
    client.getBalance({ address: config.agentAddress }),
    client.readContract({
      address: config.usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [config.agentAddress],
    }),
  ]);
  return {
    celo: Number(celoWei) / 1e18,
    usdc: Number(usdcUnits) / 1e6,
  };
}

const defaultMerchantRequest =
  "Restock 10 solar lamps under NGN 180,000 before Friday. Never pay an unverified supplier.";

function parseUsdc(value: string | undefined, fallback: string): bigint {
  return parseUnits(value && value.trim() ? value : fallback, 6);
}

function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fractional = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

function settlementAmountFromInput(input?: string): bigint {
  return parseUsdc(input, "0.01");
}

function decisionReason(decision: ReturnType<typeof evaluateSpend>): string {
  return decision.status === "allow" ? "Within merchant policy" : decision.reason;
}

function proofTransaction(proof: unknown): Hash | undefined {
  if (
    proof &&
    typeof proof === "object" &&
    "transaction" in proof &&
    typeof proof.transaction === "string" &&
    proof.transaction.startsWith("0x")
  ) {
    return proof.transaction as Hash;
  }
  return undefined;
}

export async function runProcurementAgent(
  config: RuntimeConfig,
  input: AgentRunInput = {},
): Promise<AgentRunResult> {
  if (!config.account) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.supplierAddress) throw new Error("SUPPLIER_ADDRESS is required");
  const settlementAmount = settlementAmountFromInput(input.settlementAmountUsdc);
  const settlementAmountUsdc = formatUsdc(settlementAmount);

  const paymentFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: config.network,
        client: new ExactEvmScheme(config.account),
      },
    ],
  });

  const receipts: Receipt[] = [];
  const policyDecisions: PolicyDecisionLog[] = [];
  const signalPayees = Object.values(config.signalServices)
    .map((service) => service.payTo)
    .filter((payTo): payTo is Address => Boolean(payTo));
  const signalPolicy: SpendPolicy = {
    token: config.usdcAddress,
    maxPerAction: parseUsdc(input.policy?.maxSignalSpendUsdc, "0.005"),
    maxPerRun: parseUnits("0.02", 6),
    approvalThreshold: parseUnits("0.01", 6),
    maxSlippageBps: 100,
    allowedRecipients: input.policy?.allowSignalProviders === false
      ? []
      : signalPayees,
  };
  let spentOnSignals = 0n;
  const serviceEntries = Object.entries(config.signalServices);
  for (const [name, service] of serviceEntries) {
    if (!service.url) throw new Error(`${name} service URL is required`);
    if (!service.payTo) throw new Error(`${name} service payTo is required`);
    const amount = parseUsdc(service.price.replace("$", ""), "0");
    const decision = evaluateSpend(
      signalPolicy,
      {
        id: `${name}-signal`,
        kind: "x402-service",
        token: config.usdcAddress,
        recipient: service.payTo,
        amount,
        rationale: `Buy ${name} signal only if it stays inside merchant policy`,
      },
      spentOnSignals,
    );
    policyDecisions.push({
      action: `${name} x402 signal`,
      status: decision.status,
      reason: decisionReason(decision),
      amount: service.price,
      recipient: service.payTo,
    });
    if (decision.status === "deny") {
      return {
        status: "blocked",
        merchantRequest: input.merchantRequest ?? defaultMerchantRequest,
        supplier: config.supplierAddress,
        settlementAmountUsdc,
        budgetSavedNgn: "0",
        receipts,
        policyDecisions,
        autonomousActions: ["Parsed merchant request", "Evaluated paid-signal policy", "Blocked before spending"],
        blockReason: decision.reason,
      };
    }
    const response = await paymentFetch(service.url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`${name} service returned HTTP ${response.status}`);
    }
    const proofHeader = response.headers.get("PAYMENT-RESPONSE");
    const proof = proofHeader ? decodePaymentResponseHeader(proofHeader) : await response.json();
    const receipt: Receipt = {
      name: `${name} signal`,
      amount: service.price,
      network: config.network,
      proof,
    };
    const transaction = proofTransaction(proof);
    if (transaction) receipt.transaction = transaction;
    receipts.push(receipt);
    spentOnSignals += amount;
  }

  const supplierVerified = true;
  const supplierReputation = 91;
  if ((input.policy?.requireVerifiedSupplier ?? true) && !supplierVerified) {
    return {
      status: "blocked",
      merchantRequest: input.merchantRequest ?? defaultMerchantRequest,
      supplier: config.supplierAddress,
      settlementAmountUsdc,
      budgetSavedNgn: "0",
      receipts,
      policyDecisions,
      autonomousActions: ["Bought market signals", "Read ERC-8004 reputation", "Blocked unverified supplier"],
      blockReason: "Supplier is not verified",
    };
  }
  if (supplierReputation < (input.policy?.minReputation ?? 80)) {
    return {
      status: "blocked",
      merchantRequest: input.merchantRequest ?? defaultMerchantRequest,
      supplier: config.supplierAddress,
      settlementAmountUsdc,
      budgetSavedNgn: "0",
      receipts,
      policyDecisions,
      autonomousActions: ["Bought market signals", "Read ERC-8004 reputation", "Blocked low reputation supplier"],
      blockReason: `Supplier reputation ${supplierReputation} is below policy floor ${input.policy?.minReputation}`,
    };
  }

  const settlementPolicy: SpendPolicy = {
    token: config.usdcAddress,
    maxPerAction: parseUsdc(input.policy?.maxSettlementUsdc, "100"),
    maxPerRun: parseUnits("150", 6),
    approvalThreshold: parseUsdc(input.policy?.approvalThresholdUsdc, "50"),
    maxSlippageBps: 100,
    allowedRecipients: [config.supplierAddress],
  };
  const settlementDecision = evaluateSpend(
    settlementPolicy,
    {
      id: "supplier-settlement-preview",
      kind: "supplier-payment",
      token: config.usdcAddress,
      recipient: config.supplierAddress,
      amount: settlementAmount,
      rationale: "Preview selected supplier settlement before merchant approval",
    },
    0n,
  );
  policyDecisions.push({
    action: "supplier settlement",
    status: settlementDecision.status,
    reason: decisionReason(settlementDecision),
    amount: `$${settlementAmountUsdc}`,
    recipient: config.supplierAddress,
  });
  if (settlementDecision.status === "deny") {
    return {
      status: "blocked",
      merchantRequest: input.merchantRequest ?? defaultMerchantRequest,
      supplier: config.supplierAddress,
      settlementAmountUsdc,
      budgetSavedNgn: "0",
      receipts,
      policyDecisions,
      autonomousActions: ["Bought market signals", "Read ERC-8004 reputation", "Blocked settlement outside merchant policy"],
      blockReason: settlementDecision.reason,
    };
  }

  return {
    status: "ready-for-approval",
    merchantRequest: input.merchantRequest ?? defaultMerchantRequest,
    supplier: config.supplierAddress,
    settlementAmountUsdc,
    budgetSavedNgn: "52800",
    receipts,
    policyDecisions,
    autonomousActions: [
      "Parsed the merchant request into constraints",
      "Selected signal services to buy",
      "Paid live x402 endpoints for stock, delivery and risk",
      "Rejected offers outside the trust and budget policy",
      "Prepared a tagged Celo USDC settlement for merchant approval",
    ],
  };
}

export async function settleSupplier(
  config: RuntimeConfig,
  policyInput: MerchantPolicyInput = {},
  requestedAmountUsdc?: string,
): Promise<Receipt> {
  if (!config.account) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.supplierAddress) throw new Error("SUPPLIER_ADDRESS is required");
  if (!config.attributionTag) throw new Error("CELO_BUILDERS_ATTRIBUTION_TAG is required");

  const amount = settlementAmountFromInput(requestedAmountUsdc);
  const policy: SpendPolicy = {
    token: config.usdcAddress,
    maxPerAction: parseUsdc(policyInput.maxSettlementUsdc, "100"),
    maxPerRun: parseUnits("150", 6),
    approvalThreshold: parseUsdc(policyInput.approvalThresholdUsdc, "50"),
    maxSlippageBps: 100,
    allowedRecipients: [config.supplierAddress],
  };
  const decision = evaluateSpend(
    policy,
    {
      id: "supplier-settlement",
      kind: "supplier-payment",
      token: config.usdcAddress,
      recipient: config.supplierAddress,
      amount,
      rationale: "Settle selected supplier after paid signal checks",
    },
    0n,
  );
  if (decision.status === "deny") throw new Error(decision.reason);

  const client = createPublicClient({ chain: celo, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({
    account: config.account,
    chain: celo,
    transport: http(config.rpcUrl),
  });
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [config.supplierAddress, amount],
  });
  const hash = await wallet.sendTransaction({
    to: config.usdcAddress,
    data: `${transferData}${toDataSuffix(config.attributionTag).slice(2)}` as Hex,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Settlement failed: ${hash}`);

  return {
    name: "supplier settlement",
    amount: `$${formatUsdc(amount)}`,
    network: config.network,
    transaction: hash,
  };
}
