import "./styles.css";

type StageState = "waiting" | "active" | "done" | "approval" | "blocked";

interface ApiConfig {
  live: boolean;
  network: string;
  wallet?: string;
  balances?: { celo: number; usdc: number } | null;
  missing: string[];
}

interface Receipt {
  name: string;
  amount: string;
  network: string;
  transaction?: string;
  proof?: unknown;
}

interface MerchantPolicyInput {
  maxSignalSpendUsdc: string;
  maxSettlementUsdc: string;
  approvalThresholdUsdc: string;
  minReputation: number;
  requireVerifiedSupplier: boolean;
  allowSignalProviders: boolean;
}

interface PolicyDecisionLog {
  action: string;
  status: "allow" | "approval-required" | "deny";
  reason: string;
  amount: string;
  recipient: string;
}

interface RunResult {
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

const stages = [
  { id: "policy", label: "Read merchant policy", detail: "budget - deadline - trust floor", state: "waiting" as StageState },
  { id: "discover", label: "Discover supplier agents", detail: "ERC-8004 identity & reputation", state: "waiting" as StageState },
  { id: "signals", label: "Buy market signals", detail: "3 x402 calls - stock - freight - risk", state: "waiting" as StageState },
  { id: "decide", label: "Choose best valid offer", detail: "landed cost normalized to NGN", state: "waiting" as StageState },
  { id: "settle", label: "Settle supplier", detail: "USDC transfer - tagged on Celo", state: "waiting" as StageState },
];

let running = false;
let awaitingApproval = false;
let merchantBlocked = false;
let lastConfig: ApiConfig | null = null;
let lastRun: RunResult | null = null;
const merchantPolicyChoices = new Map<number, "allow" | "block">();

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <div class="site-shell">
    <header class="masthead" id="top">
      <a class="micro-logo" href="#top" aria-label="KudiFlow home">
        <svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="29" />
          <path d="M21 45V19M21 33l18-14M28 31l17 14" />
          <path class="logo-accent" d="M43 18v28" />
        </svg>
        <small>KudiFlow<br/>Commerce Co.</small>
      </a>
      <p>Agentic procurement for growing merchants - built on Celo</p>
      <a class="mast-link" href="#demo">Run the agent -></a>
    </header>

    <main>
      <section class="hero-section">
        <p class="presenter">KudiFlow Commerce System presents</p>
        <h1 aria-label="KudiFlow"><span>KUDI</span><span>FLOW</span></h1>
        <p class="hero-kicker">Autonomous buying. Bound by your policy.</p>
        <div class="hero-frame">
          <img src="/assets/kudiflow-hero.webp" alt="Three merchants, procurement goods and a retro computer" fetchpriority="high" decoding="async" />
        </div>
        <p class="edition-line">A procurement agent for the merchants who keep cities moving</p>
      </section>

      <section class="manifesto section-pad" id="story">
        <p class="section-note">One brief. Every step handled.</p>
        <h2 class="script-title">Because Restocking Shouldn't<br/>Require Ten Different Tabs.</h2>
        <div class="rule"></div>
        <div class="copy-columns">
          <p>For many merchants, sourcing stock means comparing scattered quotes, checking unfamiliar suppliers, guessing at freight, and losing margin in currency conversion. KudiFlow turns one plain-language request into a complete, auditable buying plan.</p>
          <p>Your agent discovers verified supplier services, pays only for the data it needs, rejects risky offers, converts the exact settlement amount, and keeps every Celo receipt. It works quickly, but never outside the limits you set.</p>
        </div>
        <div class="policy-art">
          <img src="/assets/policy-device.webp" alt="A hand holding a retro policy control device" loading="lazy" decoding="async" />
          <div class="policy-caption">
            <span>Policy no. 001</span>
            <strong>The merchant stays in control.</strong>
            <p>Per-call caps, per-order limits, trusted payees, slippage ceilings and human approval are enforced before any signature.</p>
          </div>
        </div>
      </section>

      <section class="catalog-section section-pad" id="how-it-works">
        <p class="section-note">The buying flow</p>
        <h2 class="script-title">One Brief, Many Trusted Suppliers</h2>
        <div class="rule short"></div>
        <img class="catalog-art" src="/assets/supplier-catalog.webp" alt="Merchants beside a catalog of solar lantern options" loading="lazy" decoding="async" />
        <div class="choice-grid">
          <article>
            <span class="choice-no">01</span>
            <h3>Write Your Buying Brief</h3>
            <p>Tell KudiFlow what to buy, how much you can spend, when you need it, and what must never happen.</p>
            <div class="tag-row"><span>10 solar lamps</span><span>under NGN 180k</span><span>before Friday</span></div>
          </article>
          <div class="or-seal">&</div>
          <article>
            <span class="choice-no">02</span>
            <h3>Select the Best Valid Offer</h3>
            <p>The agent pays for live signals, rejects suppliers below your trust floor, then explains the winning landed cost.</p>
            <div class="tag-row"><span>3 x402 calls</span><span>trust >= 80</span><span>0.01 USDC pilot</span></div>
          </article>
        </div>
        <button class="navy-action start-demo" type="button"><span>Run this buying brief</span><b>-></b></button>
      </section>

      <section class="portrait-section">
        <div class="portrait-heading"><span>Trust Before</span><span>Transfer</span></div>
        <img src="/assets/trust-portrait.webp" alt="Confident merchant wearing green sunglasses" loading="lazy" decoding="async" />
        <p>EVERY SUPPLIER IS IDENTITY-CHECKED - EVERY DECISION IS POLICY-CHECKED - EVERY PAYMENT LEAVES A RECEIPT</p>
      </section>

      <section class="demo-section section-pad" id="demo">
        <p class="section-note">Live build</p>
        <h2 class="script-title">Watch KudiFlow Take the Brief</h2>
        <p class="demo-intro" id="readiness-copy">Checking live Celo and x402 readiness...</p>
        <p class="autonomy-note">Agent autonomy: KudiFlow discovers suppliers, buys allowed signal data and prepares the best valid order by itself. Merchant policy can still block spend before signing, and settlement requires explicit approval.</p>

        <div class="brief-slip">
          <div class="request-box">
            <small>Merchant request</small>
            <select id="request-preset" aria-label="Request preset">
              <option value="solar">Restock solar lamps</option>
              <option value="chargers">Emergency phone chargers</option>
              <option value="rice">Compare rice wholesalers</option>
              <option value="custom">Custom instruction</option>
            </select>
            <textarea id="merchant-request" rows="3">Restock 10 solar lamps under NGN 180,000 before Friday. Never pay an unverified supplier.</textarea>
          </div>
          <div><small>Agent wallet</small><strong id="wallet-line">Loading...</strong></div>
          <button type="button" id="run-agent"><span>Begin</span><b>-></b></button>
        </div>

        <div class="policy-desk">
          <div class="policy-head">
            <small>Merchant policy</small>
            <strong>Policy auto-decides. Merchant can still allow or block.</strong>
          </div>
          <label>Max x402 signal spend <input id="policy-max-signal" type="number" min="0" step="0.001" value="0.005" /></label>
          <label>Settlement amount <input id="settlement-amount" type="number" min="0" step="0.01" value="0.01" /></label>
          <label>Max supplier settlement <input id="policy-max-settlement" type="number" min="0" step="0.01" value="1.00" /></label>
          <label>Approval threshold <input id="policy-approval-threshold" type="number" min="0" step="0.001" value="0.005" /></label>
          <label>Minimum trust score <input id="policy-min-reputation" type="number" min="0" max="100" step="1" value="80" /></label>
          <label class="check-policy"><input id="policy-require-verified" type="checkbox" checked /> Require verified supplier</label>
          <label class="check-policy"><input id="policy-allow-signals" type="checkbox" checked /> Allow paid signal providers</label>
        </div>

        <div class="agent-console">
          <div class="console-top"><span>KUDIFLOW PROCUREMENT TERMINAL</span><span id="console-state">CHECKING</span></div>
          <div class="stage-list" id="stage-list"></div>
          <div class="approval-slip" id="approval-slip" hidden>
            <span>Approval required</span>
            <p id="approval-copy">KudiFlow is ready to settle the selected supplier on Celo mainnet.</p>
            <div class="approval-actions">
              <button id="block-payment" class="danger" type="button">Block order</button>
              <button id="approve-payment" type="button">Approve settlement</button>
            </div>
          </div>
          <div class="console-bottom">
            <div><span id="count-metric">0</span><small>x402 payments</small></div>
            <div><span id="volume-metric">$0.00</span><small>Celo volume</small></div>
            <div><span id="saving-metric">NGN 0</span><small>budget saved</small></div>
          </div>
        </div>

        <div class="policy-ledger">
          <div class="receipts-heading"><h3>Policy Ledger</h3><span>Allow / approve / block</span></div>
          <div id="policy-list" class="policy-list"><p class="empty-receipt">Policy decisions will appear before any tx is sent.</p></div>
        </div>

        <div class="receipts-wrap">
          <div class="receipts-heading"><h3>Receipt Book</h3><button id="reset-demo" type="button">Refresh status</button></div>
          <div id="receipt-list" class="receipt-list"><p class="empty-receipt">Real receipts will appear here after paid x402 calls settle.</p></div>
        </div>
      </section>

      <section class="economy-section section-pad" id="system">
        <p class="section-note">The system behind the agent</p>
        <h2 class="script-title">The World of Buying Agents</h2>
        <div class="rule short"></div>
        <p class="economy-copy">KudiFlow is more than a chatbot. It is a bounded economic actor: trusted identity, paid information, deterministic authorization and transparent settlement, composed into one merchant workflow.</p>
        <img class="economy-art" src="/assets/agent-economy.webp" alt="A small service robot connecting a market, supplier and delivery scooter" loading="lazy" decoding="async" />
        <div class="feature-heading"><h3>Featured Capabilities</h3><span>See the architecture</span></div>
        <div class="feature-grid">
          <article><span>01</span><h4>Discover & Verify</h4><p>Find supplier agents through ERC-8004 identity and filter reputation before spending.</p><a href="https://docs.celo.org/build-on-celo/build-with-ai/8004" target="_blank">Identity layer -></a></article>
          <article><span>02</span><h4>Pay for Intelligence</h4><p>Purchase stock, delivery and risk signals as genuine pay-per-request x402 services.</p><a href="https://docs.celo.org/build-on-celo/build-with-ai/x402" target="_blank">Payment layer -></a></article>
          <article><span>03</span><h4>Settle with Proof</h4><p>Settle the supplier and attribute direct activity with ERC-8021.</p><a href="https://github.com/celo-org/attribution-tags" target="_blank">Receipt layer -></a></article>
        </div>
        <div class="monogram-lockup">
          <svg class="logo-mark large" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="29" />
            <path d="M21 45V19M21 33l18-14M28 31l17 14" />
            <path class="logo-accent" d="M43 18v28" />
          </svg>
          <strong>KudiFlow</strong><small>Policy-Controlled Procurement on Celo</small>
        </div>
      </section>

      <section class="closing-section">
        <div class="closing-copy">
          <p class="section-note">Your next order, handled</p>
          <h2 class="script-title">Put the Next Restock<br/>on KudiFlow.</h2>
          <p>From one merchant brief to one verified receipt book.</p>
          <button class="navy-action start-demo" type="button"><span>Run the agent</span><b>-></b></button>
        </div>
        <img src="/assets/settlement-table.webp" alt="Hands exchanging a solar lamp and procurement receipt" loading="lazy" decoding="async" />
      </section>
    </main>

    <nav class="dock" aria-label="Primary">
      <a class="dock-logo" href="#top">KudiFlow</a>
      <a href="#story">Story</a>
      <a href="#how-it-works">How it works</a>
      <a href="#demo">Agent</a>
      <a href="#system">System</a>
      <button class="start-demo" type="button">Run agent -></button>
    </nav>
  </div>
`;

function renderStages(): void {
  const list = document.querySelector<HTMLDivElement>("#stage-list");
  if (!list) return;
  list.innerHTML = stages.map((stage, index) => `
    <div class="agent-stage ${stage.state}">
      <span class="stage-index">${stage.state === "done" ? "OK" : String(index + 1).padStart(2, "0")}</span>
      <div><strong>${stage.label}</strong><small>${stage.detail}</small></div>
      <b>${stage.state === "active" ? "WORKING" : stage.state === "done" ? "COMPLETE" : stage.state === "approval" ? "APPROVAL" : stage.state === "blocked" ? "BLOCKED" : "WAITING"}</b>
    </div>
  `).join("");
}

function setStage(id: string, state: StageState): void {
  const stage = stages.find((item) => item.id === id);
  if (stage) stage.state = state;
  renderStages();
}

function setText(selector: string, text: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function addReceipt(receipt: Receipt, tone = "data"): void {
  const list = document.querySelector<HTMLDivElement>("#receipt-list");
  if (!list) return;
  list.querySelector(".empty-receipt")?.remove();
  const transaction = receipt.transaction ?? proofTransaction(receipt.proof);
  const proof = transaction ?? shortProof(receipt.proof) ?? receipt.network;
  const txLink = transaction
    ? `<a class="tx-link" href="https://celoscan.io/tx/${escapeHtml(transaction)}" target="_blank" rel="noreferrer">View tx hash -></a>`
    : `<small>${escapeHtml(proof)}</small>`;
  list.insertAdjacentHTML("beforeend", `
    <article class="receipt ${tone}">
      <span>${tone === "data" ? "402" : "OK"}</span>
      <div><strong>${escapeHtml(receipt.name)}</strong>${txLink}</div>
      <b>${escapeHtml(receipt.amount)}</b>
    </article>
  `);
}

function renderPolicyLedger(decisions: PolicyDecisionLog[]): void {
  const list = document.querySelector<HTMLDivElement>("#policy-list");
  if (!list) return;
  if (decisions.length === 0) {
    list.innerHTML = '<p class="empty-receipt">Policy decisions will appear before any tx is sent.</p>';
    return;
  }
  list.innerHTML = decisions.map((decision, index) => {
    const choice = merchantPolicyChoices.get(index);
    const choiceLabel = choice === "allow" ? "Merchant allowed" : choice === "block" ? "Merchant blocked" : "";
    return `
    <article class="policy-row ${decision.status} ${choice ? `merchant-${choice}` : ""}">
      <span>${decision.status.toUpperCase()}</span>
      <div>
        <strong>${escapeHtml(decision.action)} · ${escapeHtml(decision.amount)}</strong>
        <small>${escapeHtml(decision.reason)} · ${shortAddress(decision.recipient)}</small>
        ${choiceLabel ? `<em>${choiceLabel}</em>` : ""}
      </div>
      <div class="policy-actions" aria-label="Merchant policy choice">
        <button type="button" data-policy-choice="${index}" data-choice="allow">Allow</button>
        <button type="button" data-policy-choice="${index}" data-choice="block">Block</button>
      </div>
    </article>
  `;
  }).join("");
  list.querySelectorAll<HTMLButtonElement>("[data-policy-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.policyChoice ?? "-1");
      const choice = button.dataset.choice === "block" ? "block" : "allow";
      setMerchantPolicyChoice(index, choice);
    });
  });
}

interface AgentRunPayload {
  merchantRequest: string;
  settlementAmountUsdc: string;
  policy: MerchantPolicyInput;
}

function setMerchantPolicyChoice(index: number, choice: "allow" | "block"): void {
  if (!lastRun?.policyDecisions[index]) return;
  merchantPolicyChoices.set(index, choice);
  merchantBlocked = Array.from(merchantPolicyChoices.values()).includes("block");
  if (merchantBlocked) {
    awaitingApproval = false;
    const slip = document.querySelector<HTMLDivElement>("#approval-slip");
    if (slip) slip.hidden = true;
    setStage("settle", "blocked");
    setText("#console-state", "MERCHANT BLOCKED");
    setText("#readiness-copy", `Merchant blocked "${lastRun.policyDecisions[index].action}". No supplier settlement will be sent unless the order is rerun with updated policy.`);
  } else if (lastRun.status === "ready-for-approval") {
    awaitingApproval = true;
    const slip = document.querySelector<HTMLDivElement>("#approval-slip");
    if (slip) slip.hidden = false;
    setStage("settle", "approval");
    setText("#console-state", "MERCHANT APPROVAL NEEDED");
    setText("#readiness-copy", "Merchant allowed the visible policy decisions. Settlement still requires explicit approval.");
  } else {
    setText("#console-state", "POLICY REVIEWED");
  }
  renderPolicyLedger(lastRun.policyDecisions);
}

async function loadReadiness(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#run-agent");
  const response = await fetch("/api/config");
  lastConfig = await response.json() as ApiConfig;
  setText("#wallet-line", lastConfig.wallet ?? "No wallet configured");
  if (lastConfig.balances) {
    setText("#volume-metric", `$${lastConfig.balances.usdc.toFixed(2)}`);
  }
  if (lastConfig.live) {
    setText("#readiness-copy", "Live Celo mainnet wallet, x402 services, attribution tag and settlement recipients are configured.");
    setText("#console-state", "READY");
    if (button) button.disabled = false;
  } else {
    setText("#readiness-copy", `Waiting for live setup: ${lastConfig.missing.join(", ")}`);
    setText("#console-state", "SETUP REQUIRED");
    for (const stage of stages) stage.state = "blocked";
    renderStages();
    if (button) button.disabled = true;
  }
}

async function runAgent(): Promise<void> {
  if (running || awaitingApproval || !lastConfig?.live) return;
  running = true;
  merchantBlocked = false;
  merchantPolicyChoices.clear();
  renderPolicyLedger([]);
  setText("#console-state", "AGENT RUNNING");
  setStage("policy", "active");
  setStage("policy", "done");
  setStage("discover", "active");
  setStage("discover", "done");
  setStage("signals", "active");
  try {
    const payload = buildAgentPayload();
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await apiError(response);
    lastRun = await response.json() as RunResult;
    renderPolicyLedger(lastRun.policyDecisions ?? []);
    for (const receipt of lastRun.receipts) addReceipt(receipt);
    setText("#count-metric", String(lastRun.receipts.length));
    setStage("signals", "done");
    if (lastRun.status === "blocked") {
      setStage("decide", "blocked");
      setStage("settle", "blocked");
      setText("#console-state", "POLICY BLOCKED");
      setText("#readiness-copy", lastRun.blockReason ?? "The policy blocked this run before settlement.");
      return;
    }
    setStage("decide", "done");
    setStage("settle", "approval");
    setText("#saving-metric", `NGN ${Number(lastRun.budgetSavedNgn).toLocaleString()}`);
    setText("#approval-copy", `Approve ${lastRun.settlementAmountUsdc} USDC to ${lastRun.supplier}.`);
    const slip = document.querySelector<HTMLDivElement>("#approval-slip");
    if (slip) slip.hidden = false;
    setText("#console-state", "MERCHANT APPROVAL NEEDED");
    awaitingApproval = true;
  } catch (error) {
    setStage("signals", "blocked");
    setText("#console-state", "RUN FAILED");
    setText("#readiness-copy", error instanceof Error ? error.message : "Agent run failed.");
  } finally {
    running = false;
  }
}

async function approvePayment(): Promise<void> {
  if (!awaitingApproval || running) return;
  if (merchantBlocked) {
    setStage("settle", "blocked");
    setText("#console-state", "MERCHANT BLOCKED");
    setText("#readiness-copy", "Merchant blocked the order. No supplier settlement was sent.");
    return;
  }
  running = true;
  awaitingApproval = false;
  document.querySelector<HTMLDivElement>("#approval-slip")!.hidden = true;
  setStage("settle", "active");
  setText("#console-state", "SETTLING ON CELO");
  try {
    const response = await fetch("/api/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: readPolicyInput(), amountUsdc: lastRun?.settlementAmountUsdc }),
    });
    if (!response.ok) throw await apiError(response);
    const receipt = await response.json() as Receipt;
    addReceipt(receipt, "settlement");
    setStage("settle", "done");
    setText("#console-state", "ORDER SECURED");
  } catch (error) {
    setStage("settle", "blocked");
    setText("#console-state", "SETTLEMENT FAILED");
    setText("#readiness-copy", error instanceof Error ? error.message : "Settlement failed.");
  } finally {
    running = false;
  }
}

function blockPayment(): void {
  if (!awaitingApproval || running) return;
  merchantBlocked = true;
  awaitingApproval = false;
  const slip = document.querySelector<HTMLDivElement>("#approval-slip");
  if (slip) slip.hidden = true;
  setStage("settle", "blocked");
  setText("#console-state", "MERCHANT BLOCKED");
  setText("#readiness-copy", "Merchant blocked the settlement. No supplier transaction was sent.");
}

function resetDemo(): void {
  for (const stage of stages) stage.state = "waiting";
  running = false;
  awaitingApproval = false;
  merchantBlocked = false;
  merchantPolicyChoices.clear();
  lastRun = null;
  renderStages();
  setText("#console-state", "CHECKING");
  setText("#count-metric", "0");
  setText("#volume-metric", "$0.00");
  setText("#saving-metric", "NGN 0");
  const list = document.querySelector<HTMLDivElement>("#receipt-list");
  if (list) list.innerHTML = '<p class="empty-receipt">Real receipts will appear here after paid x402 calls settle.</p>';
  renderPolicyLedger([]);
  const slip = document.querySelector<HTMLDivElement>("#approval-slip");
  if (slip) slip.hidden = true;
  void loadReadiness();
}

function jumpToDemo(): void {
  document.querySelector("#demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildAgentPayload(): AgentRunPayload {
  const request = document.querySelector<HTMLTextAreaElement>("#merchant-request")?.value.trim();
  return {
    merchantRequest: request || "Restock 10 solar lamps under NGN 180,000 before Friday. Never pay an unverified supplier.",
    settlementAmountUsdc: inputValue("#settlement-amount", "0.01"),
    policy: readPolicyInput(),
  };
}

function readPolicyInput(): MerchantPolicyInput {
  return {
    maxSignalSpendUsdc: inputValue("#policy-max-signal", "0.005"),
    maxSettlementUsdc: inputValue("#policy-max-settlement", "1.00"),
    approvalThresholdUsdc: inputValue("#policy-approval-threshold", "0.005"),
    minReputation: Number(inputValue("#policy-min-reputation", "80")),
    requireVerifiedSupplier: document.querySelector<HTMLInputElement>("#policy-require-verified")?.checked ?? true,
    allowSignalProviders: document.querySelector<HTMLInputElement>("#policy-allow-signals")?.checked ?? true,
  };
}

function inputValue(selector: string, fallback: string): string {
  return document.querySelector<HTMLInputElement>(selector)?.value || fallback;
}

async function apiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { message?: string; missing?: string[] };
  return new Error(body.message ?? (body.missing ? `Missing live setup: ${body.missing.join(", ")}` : `HTTP ${response.status}`));
}

function shortProof(value: unknown): string | undefined {
  if (!value) return undefined;
  const text = JSON.stringify(value);
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function proofTransaction(value: unknown): string | undefined {
  if (
    value &&
    typeof value === "object" &&
    "transaction" in value &&
    typeof value.transaction === "string"
  ) {
    return value.transaction;
  }
  return undefined;
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function setPreset(value: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>("#merchant-request");
  if (!textarea || value === "custom") return;
  const requests: Record<string, string> = {
    solar: "Restock 10 solar lamps under NGN 180,000 before Friday. Never pay an unverified supplier.",
    chargers: "Find 25 phone chargers for weekend sales. Prefer verified suppliers, cheapest landed cost, and block any signal spend above $0.005.",
    rice: "Compare rice wholesalers for a 5-bag order. Only continue if supplier reputation is at least 90 and settlement stays under $0.01.",
  };
  textarea.value = requests[value] ?? textarea.value;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

document.querySelector("#run-agent")?.addEventListener("click", () => void runAgent());
document.querySelector("#approve-payment")?.addEventListener("click", () => void approvePayment());
document.querySelector("#block-payment")?.addEventListener("click", blockPayment);
document.querySelector("#reset-demo")?.addEventListener("click", resetDemo);
document.querySelector("#request-preset")?.addEventListener("change", (event) => {
  setPreset((event.target as HTMLSelectElement).value);
});
document.querySelectorAll<HTMLButtonElement>(".start-demo").forEach((button) => button.addEventListener("click", jumpToDemo));

renderStages();
void loadReadiness();
