import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const prefix = process.argv[3] ?? "portfolio";
const outputDirectory = join(process.cwd(), "reports");
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      timezoneId: "UTC",
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    const metrics = await page.evaluate(() => {
      const rectangle = (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) return null;
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
      };
      const style = (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) return null;
        const computed = getComputedStyle(node);
        return {
          color: computed.color,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          letterSpacing: computed.letterSpacing,
          lineHeight: computed.lineHeight,
        };
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        hero: rectangle(".hero"),
        heroTitle: rectangle("#hero-title"),
        selectedHeading: rectangle("#selected-work-title"),
        nocTitle: rectangle("#noc-ai-title"),
        nocCase: rectangle(".noc-case"),
        bodyStyle: style("body"),
        heroTitleStyle: style("#hero-title"),
        nocTitleStyle: style("#noc-ai-title"),
      };
    });

    const fullPath = join(outputDirectory, `${prefix}-${viewport.name}-full.png`);
    const foldPath = join(outputDirectory, `${prefix}-${viewport.name}-fold.png`);
    await page.screenshot({ path: fullPath, fullPage: true });
    await page.screenshot({ path: foldPath });
    const sectionPaths = {};
    if (viewport.name === "mobile") {
      for (const [sectionName, selector] of [["selected", "#selected-work"], ["evidence", "#evidence"], ["office-hours", "#office-hours"]]) {
        const sectionPath = join(outputDirectory, `${prefix}-mobile-${sectionName}.png`);
        await page.locator(selector).screenshot({ path: sectionPath });
        sectionPaths[sectionName] = sectionPath;
      }
    }
    observations.push({
      viewport: `${viewport.width}x${viewport.height}`,
      metrics,
      consoleErrors,
      pageErrors,
      screenshots: { fullPath, foldPath, sectionPaths },
    });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(observations, null, 2)}\n`);
