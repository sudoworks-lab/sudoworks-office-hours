import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a browser-test port.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitUntilReady(baseUrl: string, process: ChildProcess, output: string[]): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Local server exited early.\n${output.join("")}`);
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`);
      if (response.ok) return;
    } catch {
      // The listener may not have opened yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Local server did not become ready.\n${output.join("")}`);
}

async function clearFocusForReviewScreenshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  assert.equal(await page.locator(":focus").count(), 0);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "office-hours-browser-"));
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const childEnvironment: NodeJS.ProcessEnv = {
  HOST: "127.0.0.1",
  NODE_ENV: "test",
  PORT: String(port),
  BOOKING_DB_PATH: join(temporaryDirectory, "browser.sqlite"),
  STATIC_DIR: join(process.cwd(), "dist", "public"),
};
if (process.env.PATH) childEnvironment.PATH = process.env.PATH;

const localServer = spawn(process.execPath, ["dist/local/server.mjs"], {
  cwd: process.cwd(),
  env: childEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});
localServer.stdout?.on("data", (chunk: Buffer) => serverOutput.push(chunk.toString("utf8")));
localServer.stderr?.on("data", (chunk: Buffer) => serverOutput.push(chunk.toString("utf8")));

let browser: Browser | undefined;
try {
  await waitUntilReady(baseUrl, localServer, serverOutput);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    timezoneId: "UTC",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const unexpectedConsoleErrors: string[] = [];
  const expectedHttpConsoleDiagnostics: string[] = [];
  const errorResponses: Array<{ status: number; url: string }> = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/^Failed to load resource: the server responded with a status of (?:400|409|500) \((?:Bad Request|Conflict|Internal Server Error)\)$/u.test(message.text())) {
      expectedHttpConsoleDiagnostics.push(message.text());
      return;
    }
    unexpectedConsoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errorResponses.push({ status: response.status(), url: response.url() });
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const slotsResponse = await context.request.get(`${baseUrl}/api/slots`);
  assert.equal(slotsResponse.status(), 200);
  const slotsPayload = await slotsResponse.json() as {
    slots: Array<{ id: string; startAt: string; endAt: string; available: boolean }>;
  };
  const firstOfferedSlot = slotsPayload.slots[0];
  assert.ok(firstOfferedSlot);
  await mkdir(join(process.cwd(), "reports"), { recursive: true });
  const desktopScreenshot = join(process.cwd(), "reports", "final-ja-desktop-portfolio-utc.png");
  const desktopFoldScreenshot = join(process.cwd(), "reports", "final-ja-desktop-fold-utc.png");
  const tabletScreenshot = join(process.cwd(), "reports", "final-ja-tablet-portfolio-utc.png");
  const tabletFoldScreenshot = join(process.cwd(), "reports", "final-ja-tablet-fold-utc.png");
  const mobileScreenshot = join(process.cwd(), "reports", "final-ja-mobile-portfolio-utc.png");
  const mobileFoldScreenshot = join(process.cwd(), "reports", "final-ja-mobile-fold-utc.png");
  const successScreenshot = join(process.cwd(), "reports", "final-ja-booking-success-utc.png");
  await clearFocusForReviewScreenshot(page);
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  await page.screenshot({ path: desktopFoldScreenshot });

  await page.getByRole("heading", { level: 1, name: /信頼性を/u }).waitFor();
  const heroText = await page.locator(".hero").innerText();
  assert.match(heroText, /CLOUD INFRASTRUCTURE ENGINEER/iu);
  assert.match(heroText, /AWS・IaC・可観測性・運用改善を軸に/u);
  assert.match(heroText, /障害時にも正しく振る舞うシステムを設計・実装しています/u);
  const flagshipName = page.getByText("NOC-AI", { exact: true }).first();
  const flagshipBox = await flagshipName.boundingBox();
  if (!flagshipBox) throw new Error("NOC-AI is not rendered in the desktop view.");
  assert.ok(flagshipBox.y < 1000, "NOC-AI is not apparent in the desktop first view.");
  assert.equal(await page.locator("#selected-work article").count(), 3);
  assert.equal(await page.locator("#capabilities li").count(), 6);
  assert.equal(await page.locator("#supporting article").count(), 4);
  const flagship = page.locator("#selected-work .noc-case");
  const featuredSecondary = page.locator("#selected-work .work-card").first();
  const supportingCard = page.locator("#supporting article").first();
  assert.equal(await flagship.getAttribute("aria-labelledby"), "noc-ai-title");
  const readHierarchyStyle = async (locator: typeof flagship) => locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { boxShadow: style.boxShadow, borderWidth: style.borderTopWidth, transform: style.transform };
  });
  const [flagshipStyle, featuredStyle, supportingStyle] = await Promise.all([
    readHierarchyStyle(flagship),
    readHierarchyStyle(featuredSecondary),
    readHierarchyStyle(supportingCard),
  ]);
  assert.equal(flagshipStyle.boxShadow, "none");
  assert.equal(featuredStyle.boxShadow, "none");
  assert.equal(supportingStyle.boxShadow, "none");
  assert.equal(flagshipStyle.borderWidth, "1px");
  assert.equal(flagshipStyle.transform, "none");
  const [flagshipBounds, secondaryBounds] = await Promise.all([flagship.boundingBox(), featuredSecondary.boundingBox()]);
  assert.ok(flagshipBounds && secondaryBounds && flagshipBounds.height > secondaryBounds.height, "NOC-AI must have the richer footprint.");
  const nocText = await flagship.innerText();
  assert.match(nocText, /7日間継続稼働検証：実施中/u);
  assert.match(nocText, /AIの判断だけに運用操作を任せず/u);
  assert.match(nocText, /一般的なexactly-onceは主張しません/iu);
  assert.doesNotMatch(nocText, /commercial production|商用本番(?:で|に)(?:稼働|利用)|enterprise adoption|企業導入|7日間継続稼働検証[^\n]*(?:完了|完了済み)/iu);
  assert.match(await page.locator("#evidence").innerText(), /リクエストを受け付けられます/u);
  assert.equal(await page.locator("main").count(), 1);
  assert.equal(await page.locator("nav[aria-label='メインナビゲーション']").count(), 1);
  assert.equal(await page.locator("#visitor-timezone").innerText(), "日本時間（JST）");
  const desktopDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(desktopDimensions.scrollWidth <= desktopDimensions.clientWidth + 1, `Desktop page overflows by ${desktopDimensions.scrollWidth - desktopDimensions.clientWidth}px.`);

  assert.match(await page.locator("#office-hours").innerText(), /技術対話リクエスト/u);
  assert.match(await page.locator("#office-hours").innerText(), /送信は面談確定ではありません/u);
  assert.equal(await page.locator("#name").getAttribute("aria-describedby"), "field-name");
  assert.equal(await page.locator("#email").getAttribute("aria-describedby"), "field-email");
  assert.equal(await page.locator("#slot-list").getAttribute("aria-describedby"), "field-slotId");
  assert.equal(await page.locator("#slot-list").getAttribute("aria-label"), "選択可能な技術対話リクエストの時間枠");
  const expectedFirstSlotDay = new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(firstOfferedSlot.startAt));
  const expectedFirstSlotTime = new Intl.DateTimeFormat("ja-JP", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(firstOfferedSlot.startAt));
  const firstRenderedSlot = page.locator(".slot-button").first();
  assert.equal(await firstRenderedSlot.locator("strong").innerText(), expectedFirstSlotDay);
  assert.equal(await firstRenderedSlot.locator("span").innerText(), expectedFirstSlotTime);
  assert.equal(new Date(firstOfferedSlot.startAt).toISOString(), firstOfferedSlot.startAt);
  const bookingSectionText = await page.locator("#office-hours").innerText();
  assert.doesNotMatch(bookingSectionText, /Etc\/GMT-9|GMT\+9/u);
  for (const slotText of await page.locator(".slot-button").allInnerTexts()) {
    assert.doesNotMatch(slotText, /Etc\/GMT-9|GMT\+9|JST/u);
  }
  const firstSlotAccessibleName = await page.locator(".slot-button").first().getAttribute("aria-label") ?? "";
  assert.equal(firstSlotAccessibleName, `${expectedFirstSlotDay} ${expectedFirstSlotTime}`);
  assert.doesNotMatch(firstSlotAccessibleName, /\bat\b|unavailable/iu);

  const submit = page.getByRole("button", { name: /面談リクエストを送信する/u });
  await page.route("**/api/bookings", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  }, { times: 1 });
  await submit.click();
  await page.getByRole("button", { name: /送信しています/u }).waitFor();
  await page.locator("#form-error").waitFor();
  assert.match(await page.locator("#field-name").innerText(), /2〜80文字/u);
  assert.match(await page.locator("#field-email").innerText(), /254文字以内の有効なメールアドレス/u);
  assert.match(await page.locator("#field-slotId").innerText(), /有効なOffice Hoursの時間枠/u);
  assert.match(await page.locator("#field-privacyConsent").innerText(), /入力内容を保存するには同意が必要/u);
  assert.match(await page.locator("#form-error").innerText(), /入力内容を確認してから、リクエストをもう一度送信/u);

  const initialSlot = page.locator(".slot-button:not(:disabled)").first();
  const initialSlotId = await initialSlot.getAttribute("data-slot-id");
  assert.ok(initialSlotId);
  await initialSlot.click();
  await page.locator("#name").fill("Browser Reviewer");
  await page.locator("#email").fill("browser-reviewer@example.test");
  await page.locator("#privacy-consent").check();

  await page.route("**/api/bookings", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNEXPECTED_ERROR", message: "Stubbed browser-test failure." } }),
    });
  }, { times: 1 });
  await submit.click();
  await page.locator("#form-error").waitFor();
  assert.match(await page.locator("#form-error").innerText(), /予期しない問題により、リクエストを送信できませんでした/u);

  const claimed = await context.request.post(`${baseUrl}/api/bookings`, {
    headers: { "idempotency-key": "browser-conflict-owner-001" },
    data: {
      name: "Concurrent Owner",
      email: "owner@example.test",
      slotId: initialSlotId,
      timezone: "UTC",
      privacyConsent: true,
    },
  });
  assert.equal(claimed.status(), 201);
  await submit.click();
  await page.locator("#form-error").waitFor();
  assert.match(await page.locator("#form-error").innerText(), /時間枠は別のリクエストで確保されました/u);

  const successfulSlot = page.locator(".slot-button:not(:disabled)").first();
  const successfulSlotId = await successfulSlot.getAttribute("data-slot-id");
  assert.ok(successfulSlotId);
  const unchangedSuccessfulSlot = slotsPayload.slots.find((slot) => slot.id === successfulSlotId);
  assert.ok(unchangedSuccessfulSlot);
  await successfulSlot.click();
  const successfulRequestPromise = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/bookings");
  const successfulResponsePromise = page.waitForResponse((response) =>
    response.status() === 201 && new URL(response.url()).pathname === "/api/bookings");
  await submit.click();
  const [successfulRequest, successfulResponse] = await Promise.all([
    successfulRequestPromise,
    successfulResponsePromise,
  ]);
  assert.deepEqual(successfulRequest.postDataJSON(), {
    name: "Browser Reviewer",
    email: "browser-reviewer@example.test",
    slotId: successfulSlotId,
    timezone: "Asia/Tokyo",
    privacyConsent: true,
  });
  const successfulPayload = await successfulResponse.json() as {
    booking: { slotId: string; startAt: string; endAt: string };
  };
  assert.equal(successfulPayload.booking.slotId, successfulSlotId);
  assert.equal(successfulPayload.booking.startAt, unchangedSuccessfulSlot.startAt);
  assert.equal(successfulPayload.booking.endAt, unchangedSuccessfulSlot.endAt);
  const renderedSuccessState = page.locator("#success-state");
  await renderedSuccessState.waitFor();
  assert.equal(await renderedSuccessState.evaluate((node) => node === document.activeElement), true);
  assert.match(await renderedSuccessState.innerText(), /リクエストを受け付けました/u);
  assert.match(await renderedSuccessState.innerText(), /選択した時間枠を仮確保しました/u);
  assert.match(await renderedSuccessState.innerText(), /面談確定ではありません/u);
  assert.match(await renderedSuccessState.innerText(), /Google Calendarへの登録や自動メール通知は行いません/u);
  assert.match(await renderedSuccessState.innerText(), /Request ID/iu);
  assert.match(await page.locator("#booking-reference").innerText(), /^[0-9a-f-]{36}$/u);
  assert.doesNotMatch(await renderedSuccessState.innerText(), /example\.test/u);
  await clearFocusForReviewScreenshot(page);
  await page.screenshot({ path: successScreenshot });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => scrollTo(0, 0));
  const tabletDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(tabletDimensions.scrollWidth <= tabletDimensions.clientWidth + 1, `Tablet page overflows by ${tabletDimensions.scrollWidth - tabletDimensions.clientWidth}px.`);
  assert.match(await page.locator(".hero").innerText(), /CLOUD INFRASTRUCTURE ENGINEER/iu);
  await clearFocusForReviewScreenshot(page);
  await page.screenshot({ path: tabletScreenshot, fullPage: true });
  await page.screenshot({ path: tabletFoldScreenshot });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => scrollTo(0, 0));
  const mobileHeroTitleBox = await page.getByRole("heading", { level: 1, name: /信頼性を/u }).boundingBox();
  if (!mobileHeroTitleBox) throw new Error("The role statement is not rendered in the mobile first view.");
  assert.ok(mobileHeroTitleBox.y < 844, "The role statement is not apparent in the mobile first view.");
  await page.locator(".noc-case").scrollIntoViewIfNeeded();
  await page.getByText("NOC-AI", { exact: true }).first().waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `Mobile page overflows by ${dimensions.scrollWidth - dimensions.clientWidth}px.`);
  await page.keyboard.press("Tab");
  const focusedElement = page.locator(":focus");
  assert.equal(await focusedElement.getAttribute("class"), "skip-link");
  const focusStyle = await focusedElement.evaluate((node) => ({ outlineStyle: getComputedStyle(node).outlineStyle, top: getComputedStyle(node).top }));
  assert.notEqual(focusStyle.outlineStyle, "none");
  assert.notEqual(focusStyle.top, "-80px");
  await page.keyboard.press("Tab");
  assert.match(await page.locator(":focus").getAttribute("aria-label") ?? "", /SudoWorks ホーム/u);
  await clearFocusForReviewScreenshot(page);
  await page.screenshot({ path: mobileScreenshot, fullPage: true });
  await page.screenshot({ path: mobileFoldScreenshot });

  assert.deepEqual(unexpectedConsoleErrors, [], `Unexpected browser console errors:\n${unexpectedConsoleErrors.join("\n")}`);
  assert.deepEqual(expectedHttpConsoleDiagnostics.map((message) => Number(message.match(/status of (\d+)/u)?.[1])), [400, 500, 409]);
  assert.deepEqual(errorResponses.map(({ status, url }) => ({ status, path: new URL(url).pathname })), [
    { status: 400, path: "/api/bookings" },
    { status: 500, path: "/api/bookings" },
    { status: 409, path: "/api/bookings" },
  ]);
  assert.deepEqual(pageErrors, [], `Unexpected browser page errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(failedRequests, [], `Unexpected failed network requests:\n${failedRequests.join("\n")}`);

  await context.close();
  process.stdout.write(JSON.stringify({
    status: "passed",
    pages: ["portfolio landing", "featured", "supporting", "engineering", "technical conversation request"],
    states: ["initial", "submitting", "validation error", "unexpected error", "conflict error", "success"],
    viewports: ["1440x1000", "1024x768", "390x844"],
    timezone: "UTC",
    diagnostics: {
      unexpectedConsoleErrors: unexpectedConsoleErrors.length,
      expectedHttpConsoleDiagnostics: expectedHttpConsoleDiagnostics.length,
      pageErrors: pageErrors.length,
      failedRequests: failedRequests.length,
    },
    regressionChecks: {
      desktopHorizontalOverflow: false,
      tabletHorizontalOverflow: false,
      mobileHorizontalOverflow: false,
      semanticLandmarks: "passed",
      keyboardFocus: "passed",
      visibleFocus: "passed",
      labelsAndErrors: "passed",
    },
    screenshots: [desktopScreenshot, desktopFoldScreenshot, tabletScreenshot, tabletFoldScreenshot, mobileScreenshot, mobileFoldScreenshot, successScreenshot],
  }, null, 2) + "\n");
} finally {
  await browser?.close();
  localServer.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (localServer.exitCode !== null) resolve();
    else localServer.once("exit", () => resolve());
  });
  await rm(temporaryDirectory, { recursive: true, force: true });
}
