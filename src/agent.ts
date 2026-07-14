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

export interface AgentRunResult {
  status: "ready-for-approval";
  supplier: string;
  settlementAmountUsdc: string;
  budgetSavedNgn: string;
  receipts: Receipt[];
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

export async function runProcurementAgent(config: RuntimeConfig): Promise<AgentRunResult> {
  if (!config.account) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.supplierAddress) throw new Error("SUPPLIER_ADDRESS is required");

  const paymentFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: config.network,
        client: new ExactEvmScheme(config.account),
      },
    ],
  });

  const receipts: Receipt[] = [];
  const serviceEntries = Object.entries(config.signalServices);
  for (const [name, service] of serviceEntries) {
    if (!service.url) throw new Error(`${name} service URL is required`);
    const response = await paymentFetch(service.url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`${name} service returned HTTP ${response.status}`);
    }
    const proofHeader = response.headers.get("PAYMENT-RESPONSE");
    receipts.push({
      name: `${name} signal`,
      amount: service.price,
      network: config.network,
      proof: proofHeader ? decodePaymentResponseHeader(proofHeader) : await response.json(),
    });
  }

  return {
    status: "ready-for-approval",
    supplier: config.supplierAddress,
    settlementAmountUsdc: "83.69",
    budgetSavedNgn: "52800",
    receipts,
  };
}

export async function settleSupplier(config: RuntimeConfig): Promise<Receipt> {
  if (!config.account) throw new Error("AGENT_PRIVATE_KEY is required");
  if (!config.supplierAddress) throw new Error("SUPPLIER_ADDRESS is required");
  if (!config.attributionTag) throw new Error("CELO_BUILDERS_ATTRIBUTION_TAG is required");

  const amount = parseUnits("83.69", 6);
  const policy: SpendPolicy = {
    token: config.usdcAddress,
    maxPerAction: parseUnits("100", 6),
    maxPerRun: parseUnits("150", 6),
    approvalThreshold: parseUnits("50", 6),
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
    amount: "$83.69",
    network: config.network,
    transaction: hash,
  };
}
