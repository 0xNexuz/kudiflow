import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { parseUnits } from "viem";
import { loadConfig, missingLiveConfig, type RuntimeConfig } from "./config.js";
import { getBalances, runProcurementAgent, settleSupplier } from "./agent.js";

export function createApp(config: RuntimeConfig = loadConfig()) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  const x402ApiKey = config.x402ApiKey;
  const facilitator = new HTTPFacilitatorClient(
    x402ApiKey
      ? {
          url: config.facilitatorUrl,
          createAuthHeaders: async () => ({
            verify: { "X-API-Key": x402ApiKey },
            settle: { "X-API-Key": x402ApiKey },
            supported: { "X-API-Key": x402ApiKey },
          }),
        }
      : { url: config.facilitatorUrl },
  );
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactEvmScheme(),
  );

  const paidRoutes: RoutesConfig = {};
  for (const [name, service] of Object.entries(config.signalServices)) {
    if (service.payTo) {
      paidRoutes[`GET /api/signals/${name}`] = {
        accepts: {
          scheme: "exact",
          price: {
            amount: parseUnits(service.price.replace("$", ""), 6).toString(),
            asset: config.usdcAddress,
          },
          network: config.network,
          payTo: service.payTo,
          extra: {
            name: "USDC",
            version: "2",
          },
        },
        description: `KudiFlow ${name} procurement signal`,
      };
    }
  }
  if (Object.keys(paidRoutes).length > 0) {
    let resourceServerReady: Promise<void> | undefined;
    app.use("/api/signals", async (_req, _res, next) => {
      try {
        resourceServerReady ??= resourceServer.initialize();
        await resourceServerReady;
        next();
      } catch (error) {
        resourceServerReady = undefined;
        next(error);
      }
    });
    app.use(paymentMiddleware(paidRoutes, resourceServer, undefined, undefined, false));
  }

  app.get("/api/health", async (_req, res) => {
    const missing = missingLiveConfig(config);
    const balances = await getBalances(config).catch(() => null);
    res.json({
      ok: missing.length === 0,
      network: "celo-mainnet",
      wallet: config.agentAddress,
      balances,
      missing,
    });
  });

  app.get("/api/config", async (_req, res) => {
    const missing = missingLiveConfig(config);
    const balances = await getBalances(config).catch(() => null);
    res.json({
      live: missing.length === 0,
      network: "celo-mainnet",
      wallet: config.agentAddress,
      balances,
      missing,
    });
  });

  app.get("/api/signals/stock", (_req, res) => {
    res.json({ supplier: "SunGrid", availableUnits: 16, unitPriceUsdc: "8.00" });
  });

  app.get("/api/signals/delivery", (_req, res) => {
    res.json({ carrier: "CeloCourier", etaDays: 2, freightUsdc: "3.69" });
  });

  app.get("/api/signals/risk", (_req, res) => {
    res.json({ supplier: "SunGrid", erc8004ReputationScore: 91, verified: true });
  });

  app.post("/api/runs", async (req, res) => {
    const missing = missingLiveConfig(config);
    if (missing.length > 0) return res.status(409).json({ error: "live_config_missing", missing });
    try {
      res.json(await runProcurementAgent(config, req.body));
    } catch (error) {
      res.status(502).json({ error: "agent_run_failed", message: errorMessage(error) });
    }
  });

  app.post("/api/settle", async (req, res) => {
    const missing = missingLiveConfig(config);
    if (missing.length > 0) return res.status(409).json({ error: "live_config_missing", missing });
    try {
      res.json(await settleSupplier(config, req.body?.policy));
    } catch (error) {
      res.status(502).json({ error: "settlement_failed", message: errorMessage(error) });
    }
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const distPath = basename(here) === "src" ? join(here, "..", "dist") : here;
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => res.sendFile(join(distPath, "index.html")));
  return app;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  createApp(config).listen(config.port, () => {
    console.log(`KudiFlow listening on http://localhost:${config.port}`);
    console.log(`Agent wallet: ${config.agentAddress ?? "not configured"}`);
  });
}
