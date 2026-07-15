import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, missingLiveConfig } from "../src/config.js";
import { getBalances, runProcurementAgent } from "../src/agent.js";

interface Args {
  runs?: number;
  currentCount?: number;
  targetCount?: number;
  maxUsdc: number;
  minUsdcBalance: number;
  delayMs: number;
  execute: boolean;
}

const scenarios = [
  "Restock solar lamps for a neighborhood kiosk. Prefer verified suppliers and fastest delivery.",
  "Compare phone charger suppliers for weekend demand. Reject low-reputation counterparties.",
  "Find POS paper roll inventory with same-week delivery and clear supplier reputation.",
  "Restock rice bags for a small market stall. Require verified supplier data before settlement.",
  "Compare cooking gas accessory suppliers with delivery and counterparty risk checks.",
  "Source sachet water packs for a corner shop. Buy only useful stock, freight and risk signals.",
  "Restock LED bulbs under a strict merchant budget with verified supplier checks.",
  "Compare small generator spare-part suppliers with freight and risk validation.",
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxUsdc: 0,
    minUsdcBalance: 0.05,
    delayMs: 1_000,
    execute: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--execute") {
      args.execute = true;
      continue;
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (flag === "--runs") args.runs = positiveInt(value, flag);
    else if (flag === "--current-count") args.currentCount = nonNegativeInt(value, flag);
    else if (flag === "--target-count") args.targetCount = positiveInt(value, flag);
    else if (flag === "--max-usdc") args.maxUsdc = positiveNumber(value, flag);
    else if (flag === "--min-usdc-balance") args.minUsdcBalance = positiveNumber(value, flag);
    else if (flag === "--delay-ms") args.delayMs = nonNegativeInt(value, flag);
    else throw new Error(`Unknown flag: ${flag}`);
    index += 1;
  }

  if (!args.runs) {
    if (args.currentCount === undefined || args.targetCount === undefined) {
      throw new Error("Pass either --runs or both --current-count and --target-count.");
    }
    if (args.targetCount <= args.currentCount) {
      throw new Error("--target-count must be greater than --current-count.");
    }
  }

  if (args.maxUsdc <= 0) throw new Error("--max-usdc is required and must be greater than zero.");
  return args;
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function nonNegativeInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer.`);
  return parsed;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number.`);
  return parsed;
}

function signalPriceUsdc(price: string): number {
  const parsed = Number(price.replace("$", ""));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid signal price: ${price}`);
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorWithCause(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message}${cause}`;
}

async function preflightSignalServices(config: ReturnType<typeof loadConfig>): Promise<void> {
  for (const [name, service] of Object.entries(config.signalServices)) {
    if (!service.url) throw new Error(`${name} service URL is missing`);
    try {
      const response = await fetch(service.url, { method: "GET" });
      if (response.status !== 402 && response.status !== 200) {
        throw new Error(`${name} signal preflight returned HTTP ${response.status}`);
      }
    } catch (error) {
      const hint = service.url.includes("localhost")
        ? " Start the local server in another PowerShell with: npm run serve"
        : "";
      throw new Error(`${name} signal service is unreachable at ${service.url}: ${errorWithCause(error)}.${hint}`);
    }
  }
}

function usage(): string {
  return `
KudiFlow x402 campaign runner

Dry-run target math:
  npm run campaign:x402 -- --current-count 18 --target-count 604 --max-usdc 2

Execute real x402 payments:
  npm run campaign:x402 -- --current-count 18 --target-count 604 --max-usdc 2 --execute

Direct run count:
  npm run campaign:x402 -- --runs 196 --max-usdc 2 --execute

Safety:
  - Dry-run is the default.
  - --execute is required to spend real USDC.
  - The runner only calls runProcurementAgent; it does not settle suppliers.
  - Logs are written under work/ and are ignored by Git.
`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const missing = missingLiveConfig(config);
  if (missing.length > 0) {
    throw new Error(`Live configuration missing: ${missing.join(", ")}`);
  }

  const signalNames = Object.keys(config.signalServices);
  const signalsPerRun = signalNames.length;
  const costPerRun = Object.values(config.signalServices)
    .reduce((total, service) => total + signalPriceUsdc(service.price), 0);
  const runs = args.runs ?? Math.ceil(((args.targetCount ?? 0) - (args.currentCount ?? 0)) / signalsPerRun);
  const plannedPayments = runs * signalsPerRun;
  const estimatedCost = runs * costPerRun;

  const balances = await getBalances(config);
  const balanceUsdc = balances?.usdc ?? 0;
  await preflightSignalServices(config);

  const summary = {
    mode: args.execute ? "execute" : "dry-run",
    runs,
    signalsPerRun,
    plannedPayments,
    costPerRun,
    estimatedCost,
    maxUsdc: args.maxUsdc,
    balanceUsdc,
    minUsdcBalance: args.minUsdcBalance,
    delayMs: args.delayMs,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (estimatedCost > args.maxUsdc) {
    throw new Error(`Estimated cost ${estimatedCost.toFixed(6)} USDC exceeds --max-usdc ${args.maxUsdc}.`);
  }

  if (!args.execute) {
    console.log(usage());
    console.log("Dry-run complete. Add --execute to spend real x402 payments.");
    return;
  }

  if (balanceUsdc < estimatedCost + args.minUsdcBalance) {
    throw new Error(
      `Insufficient USDC balance. Need about ${(estimatedCost + args.minUsdcBalance).toFixed(6)} USDC including reserve; wallet has ${balanceUsdc.toFixed(6)}.`,
    );
  }

  await mkdir("work", { recursive: true });
  const logPath = join("work", `x402-campaign-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  let successfulPayments = 0;

  for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
    const scenario = scenarios[(runIndex - 1) % scenarios.length];
    const startedAt = new Date().toISOString();
    try {
      const result = await runProcurementAgent(config, {
        merchantRequest: `${scenario} Campaign run ${runIndex}/${runs}.`,
        settlementAmountUsdc: "0.01",
        policy: {
          maxSignalSpendUsdc: "0.005",
          maxSettlementUsdc: "0.01",
          approvalThresholdUsdc: "0.005",
          minReputation: 80,
          requireVerifiedSupplier: true,
          allowSignalProviders: true,
        },
      });
      successfulPayments += result.receipts.length;
      const logEntry = {
        runIndex,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: result.status,
        receipts: result.receipts.map((receipt) => ({
          name: receipt.name,
          amount: receipt.amount,
          transaction: receipt.transaction,
        })),
        successfulPayments,
      };
      await appendFile(logPath, `${JSON.stringify(logEntry)}\n`);
      console.log(`run ${runIndex}/${runs}: ${result.receipts.length} x402 receipts, total ${successfulPayments}`);
    } catch (error) {
      const message = errorWithCause(error);
      await appendFile(logPath, `${JSON.stringify({ runIndex, startedAt, error: message })}\n`);
      throw new Error(`Campaign stopped on run ${runIndex}: ${message}`);
    }

    if (args.delayMs > 0 && runIndex < runs) await sleep(args.delayMs);
  }

  const endingBalances = await getBalances(config).catch(() => null);
  console.log(JSON.stringify({
    complete: true,
    logPath,
    successfulPayments,
    endingUsdc: endingBalances?.usdc,
  }, null, 2));
}

main().catch((error) => {
  console.error(errorWithCause(error));
  console.error(usage());
  process.exitCode = 1;
});
