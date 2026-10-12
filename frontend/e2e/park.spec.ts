import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";

// Must match `sessionUserKey` in app/lib/types.ts.
const SESSION_USER_KEY = "park-bench-session-user";

type Visitor = { context: BrowserContext; page: Page; name: string };

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * One browser context per visitor: identity lives in sessionStorage, so each
 * context is a separate person. We seed a known id/name so other visitors can
 * find this one by its cursor label.
 */
async function visit(browser: Browser, label: string): Promise<Visitor> {
  const name = `${label}-${uid()}`;
  const identity = { id: `e2e-${name}`, name, color: "#1f6f8b" };
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, value]) => {
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, value);
        }
      } catch {
        // Storage unavailable; the app falls back to a random identity.
      }
    },
    [SESSION_USER_KEY, JSON.stringify(identity)] as const,
  );
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText(`${name} (you)`, { exact: true })).toBeVisible();
  return { context, page, name };
}

/** The name pill drawn under another visitor's cursor (or seated figure). */
function cursorLabel(page: Page, name: string): Locator {
  return page.getByText(name, { exact: true });
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  return box ?? { x: Number.NaN, y: Number.NaN, width: 0, height: 0 };
}

// Points on the open lawn: clear of the header text, the bench button
// (centered, ~360–920px wide at 1280px), and the footer panels.
const LAWN_LEFT = { x: 200, y: 400 };
const LAWN_RIGHT = { x: 1100, y: 430 };

let a: Visitor;
let b: Visitor;

test.beforeEach(async ({ browser }) => {
  a = await visit(browser, "Alice");
  b = await visit(browser, "Bob");
  // Both must see each other before any scenario starts.
  await expect(cursorLabel(a.page, b.name)).toBeVisible();
  await expect(cursorLabel(b.page, a.name)).toBeVisible();
  await expect(a.page.getByText("2 here", { exact: false })).toBeVisible();
});

test.afterEach(async () => {
  await a?.context.close();
  await b?.context.close();
});

test("B sees A's remote cursor appear and move", async () => {
  await a.page.mouse.move(LAWN_LEFT.x, LAWN_LEFT.y, { steps: 5 });
  const label = cursorLabel(b.page, a.name);

  // The label sits just right of/below the cursor tip; cursors glide, so poll.
  await expect
    .poll(async () => (await boxOf(label)).x, { message: "A's cursor reaches the left lawn" })
    .toBeLessThan(LAWN_LEFT.x + 80);
  const before = await boxOf(label);

  await a.page.mouse.move(LAWN_RIGHT.x, LAWN_RIGHT.y, { steps: 10 });
  await expect
    .poll(async () => (await boxOf(label)).x, { message: "A's cursor glides right" })
    .toBeGreaterThan(before.x + 600);
  await expect
    .poll(async () => Math.abs((await boxOf(label)).x - LAWN_RIGHT.x))
    .toBeLessThan(80);
});

test("A types to sit and talk, B hears it, A stands with Escape", async () => {
  const phrase = `hello bench ${uid()}`;

  // Typing anywhere outside an input sits you down and talks.
  // Focus starts on the document body, so the global key handler gets these.
  await a.page.keyboard.type(phrase);

  await expect(a.page.getByRole("button", { name: /Stand up · Esc/ })).toBeVisible();
  await expect(b.page.getByText("2 here · 1 seated")).toBeVisible();
  await expect(b.page.getByText(phrase)).toBeVisible();

  await a.page.keyboard.press("Escape");

  await expect(a.page.getByRole("button", { name: "Sit on the bench" })).toBeVisible();
  await expect(b.page.getByText("2 here · 0 seated")).toBeVisible();
  await expect(b.page.getByText(phrase)).toBeHidden();
  await expect(cursorLabel(b.page, a.name)).toBeVisible();
});

test("A punches B and B's HP drops", async () => {
  // Park B on the left lawn, then bring A right next to it.
  await b.page.mouse.move(LAWN_LEFT.x, LAWN_LEFT.y, { steps: 5 });
  const bOnA = cursorLabel(a.page, b.name);
  // Wait until A has B's new position (B starts mid-screen at x≈640). Only a
  // loose check: perfect-cursors can leave an isolated jump visually short of
  // its target, but hit testing uses the received position, not the glide.
  await expect
    .poll(async () => Math.abs((await boxOf(bOnA)).x - LAWN_LEFT.x))
    .toBeLessThan(80);

  const strike = { x: LAWN_LEFT.x + 15, y: LAWN_LEFT.y };
  await a.page.mouse.move(strike.x, strike.y, { steps: 5 });

  // HP readouts look like "88/100"; anything under 100 (or FAINTED) means hit.
  const hurt = /^(\d{1,2}\/100|FAINTED)$/;
  // B's own HP card appears in the HUD once B is in a fight. A is unhurt, so
  // the only sub-100 readout on B's screen is B's own.
  await expect(async () => {
    await a.page.mouse.click(strike.x, strike.y);
    await expect(b.page.getByText(hurt)).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });

  // A sees B's overhead health bar drop too.
  await expect(a.page.getByText(hurt)).toBeVisible();
});

test("A drops an idea in the box and B sees it", async () => {
  const idea = `A duck pond, please ${uid()}`;

  await a.page.getByRole("button", { name: /^Idea box/ }).click();
  await a.page.getByPlaceholder("A pond with ducks you can feed…").fill(idea);
  await a.page.getByRole("button", { name: "Drop it in" }).click();
  await expect(a.page.getByText("Dropped in the box. Thanks!")).toBeVisible();

  await b.page.getByRole("button", { name: /^Idea box/ }).click();
  await expect(b.page.getByRole("listitem").filter({ hasText: idea })).toBeVisible();
});

test("B reloads and still sees A (and A still sees B)", async () => {
  await b.page.reload();
  await expect(b.page.getByText("Live", { exact: true })).toBeVisible();
  // Same sessionStorage identity survives the reload.
  await expect(b.page.getByText(`${b.name} (you)`, { exact: true })).toBeVisible();
  await expect(cursorLabel(b.page, a.name)).toBeVisible();
  await expect(cursorLabel(a.page, b.name)).toBeVisible();
  await expect(a.page.getByText("2 here", { exact: false })).toBeVisible();
});
