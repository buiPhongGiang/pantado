import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createPublicClient, erc20Abi, http, keccak256, toBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { indexRegistryAbi } from "@pantado/sdk";
import { ANVIL_KEYS } from "@pantado/sdk/testing";
import { findRepoRoot, type Deployment } from "@pantado/shared";

function readStack() {
  const stackFile = join(findRepoRoot(), "test/e2e-app/.stack.json");
  const { rpcUrl, deployment } = JSON.parse(readFileSync(stackFile, "utf8")) as { rpcUrl: string; deployment: string };
  const { contracts } = JSON.parse(readFileSync(deployment, "utf8")) as Deployment;
  if (!contracts.indexRegistry) throw new Error("The Anvil stack has no IndexRegistry deployment.");
  const registry = contracts.indexRegistry;
  const client = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const indexByTicker = (ticker: string): Promise<Address> =>
    client.readContract({ address: registry, abi: indexRegistryAbi, functionName: "indexByTicker", args: [keccak256(toBytes(ticker))] });
  return { client, contracts, registry, indexByTicker };
}

const user = privateKeyToAccount(ANVIL_KEYS[1]); // the app's local Anvil wallet

async function connect(page: Page): Promise<void> {
  await page.goto("/connect");
  await page.getByRole("button", { name: "Core", exact: true }).click();
  await expect(page.getByLabel("Account menu")).toBeVisible();
}

async function openAsk(page: Page) {
  await page.getByRole("button", { name: "Open Ask PantadoAI" }).click();
  return page.getByRole("dialog", { name: "Ask PantadoAI" });
}

test("renders the Index Layer routes on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { indexByTicker } = readStack();
  const seeded = await indexByTicker("TBB");
  const routes: [string, RegExp][] = [
    ["/", /^Market$/],
    ["/create", /^Create index$/],
    ["/workspace", /^Workspace$/],
    ["/network", /^Network$/],
    ["/connect", /^Connect to Pantado$/],
    ["/asset/nvda", /^NVDA$/],
    [`/index/${seeded}`, /^Tech \+ BTC Balanced$/],
    [`/version/${seeded}`, /Propose .*version/i],
  ];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [path, heading] of routes) {
      const response = await page.goto(path);
      expect(response?.ok(), path).toBe(true);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open Ask PantadoAI" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    }
  }

  await page.goto("/");
  const market = page.locator("#app");
  await expect(market).toContainText("Magnificent 7");
  await expect(market).not.toContainText("My basket");
  expect(errors).toEqual([]);
});

test("creates a private index without spending USDC and makes it public", async ({ page }) => {
  const { client, contracts, registry, indexByTicker } = readStack();
  const balance = () => client.readContract({ address: contracts.usdc, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
  const usdcBefore = await balance();
  const draft = Buffer.from(JSON.stringify({
    name: "E2E Basket",
    ticker: "E2EB",
    description: "e2e",
    components: ["nvda", "btcb"],
    weights: [60, 40],
    mode: "Manual",
    preset: "custom",
  })).toString("base64url");

  await connect(page);
  await page.goto(`/create?draft=${draft}`);
  const app = page.locator("#app");
  await expect(page.getByLabel("Account menu")).toContainText("0x7099");
  await expect(app).toContainText("Network fee only");
  await expect(app).not.toContainText(/first buy|USDC/i);
  await page.getByRole("radio", { name: /^Private/ }).click();
  await page.getByRole("button", { name: "Review: create", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review: create E2EB" });
  await expect(review).toBeVisible();
  await page.getByRole("button", { name: "Confirm in wallet", exact: true }).click();
  await expect(app.getByText(/Created E2EB/)).toBeVisible();

  const index = await indexByTicker("E2EB");
  const level = await client.readContract({ address: registry, abi: indexRegistryAbi, functionName: "levelOf", args: [index] });
  expect(Number(level) / 1e18).toBeCloseTo(100, 6);
  expect(await balance()).toBe(usdcBefore);

  await page.goto("/");
  await expect(app).toContainText("Magnificent 7");
  await expect(app).not.toContainText("E2E Basket");
  await page.goto(`/index/${index}`);
  await page.getByRole("button", { name: "Make public", exact: true }).click();
  await expect.poll(async () => {
    const row = await client.readContract({ address: registry, abi: indexRegistryAbi, functionName: "indexOf", args: [index] });
    return row.isPublic;
  }).toBe(true);
  await page.goto("/");
  await expect(app).toContainText("E2E Basket", { timeout: 60_000 });
});

test("filters and reopens chats from the connected wallet in Ask", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => localStorage.getItem("pantado-ask-session"));
  await page.evaluate((address) => {
    const now = Date.now();
    const conversation = (id: string, title: string) => ({
      id, title, created: now, updated: now,
      turns: [{ q: title, mode: "auto", text: "Saved answer", cards: [], meta: null, status: "done" }],
    });
    localStorage.setItem(`pantado-ask:wallet:${address}`, JSON.stringify([
      conversation("home-a", "Market overview"),
      conversation("home-b", "Index performance"),
    ]));
  }, user.address.toLowerCase());

  const guestAsk = await openAsk(page);
  await guestAsk.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(guestAsk).toContainText("Connect to keep your chats.");
  await expect(guestAsk).not.toContainText("Index performance");

  await connect(page);
  const ask = await openAsk(page);
  await ask.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(ask).toContainText("Market overview");
  await ask.getByRole("textbox", { name: "Search chats" }).fill("performance");
  await expect(ask).not.toContainText("Market overview");
  await ask.getByRole("button", { name: /Index performance/ }).click();
  await expect(ask).toContainText("Saved answer");
});

test("Ask streams a reply without saving a guest conversation", async ({ page }) => {
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  await page.route("**/ask", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({
      contentType: "text/event-stream",
      headers,
      body: 'event: token\ndata: {"text":"An index tracks a basket."}\n\nevent: done\ndata: {}\n\n',
    });
  });

  await page.goto("/network");
  const ask = await openAsk(page);
  const question = "How does an index work?";
  await ask.getByPlaceholder("Ask PantadoAI about a token, a stock or an index").fill(question);
  await ask.getByRole("button", { name: "Send", exact: true }).click();
  await expect(ask).toContainText(question);
  await expect(ask).toContainText("An index tracks a basket.");
  await expect(page).toHaveURL(/\/network$/);

  await page.reload();
  const reloadedAsk = await openAsk(page);
  await reloadedAsk.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(reloadedAsk).not.toContainText(question);
});
