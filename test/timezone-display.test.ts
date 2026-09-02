import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("UTC slot instants are presented in Asia/Tokyo without offset labels or instant mutation", async () => {
  const [html, javascript] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/app.js", "utf8"),
  ]);
  const startAt = "2026-09-03T09:00:00.000Z";
  const originalInstant = Date.parse(startAt);
  const start = new Date(startAt);
  const day = new Intl.DateTimeFormat("ja-JP", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(start);
  const time = new Intl.DateTimeFormat("ja-JP", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(start);

  assert.equal(day, "9月3日(木)");
  assert.equal(time, "18:00");
  assert.equal(start.getTime(), originalInstant);
  assert.equal(start.toISOString(), startAt);
  assert.match(javascript, /const displayTimezone = "Asia\/Tokyo";/u);
  assert.match(javascript, /timeZone: displayTimezone/u);
  assert.doesNotMatch(javascript, /timeZoneName/u);
  assert.match(html, /<p id="visitor-timezone">日本時間（JST）<\/p>/u);
  assert.doesNotMatch(`${html}\n${javascript}`, /Etc\/GMT-9|GMT\+9/u);
});
