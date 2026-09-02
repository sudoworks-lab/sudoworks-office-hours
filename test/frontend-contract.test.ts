import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

test("frontend exposes the required product, state, and accessibility landmarks", async () => {
  const [html, css, javascript, manifestText] = await Promise.all([
    readFile("public/index.html", "utf8"),
    readFile("public/styles.css", "utf8"),
    readFile("public/app.js", "utf8"),
    readFile("public/site.webmanifest", "utf8"),
  ]);
  const manifest = JSON.parse(manifestText) as { name?: string; short_name?: string };

  for (const requiredId of ["main", "selected-work", "capabilities", "evidence", "principles", "supporting", "office-hours", "booking-form", "form-error", "success-state"]) {
    assert.match(html, new RegExp(`id="${requiredId}"`, "u"));
  }
  const orderedSectionIds = ["selected-work", "capabilities", "evidence", "principles", "supporting", "office-hours"];
  const orderedSectionPositions = orderedSectionIds.map((id) => html.indexOf(`id="${id}"`));
  assert.deepEqual(orderedSectionPositions, [...orderedSectionPositions].sort((left, right) => left - right));
  assert.match(html, /class="skip-link"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /aria-describedby="field-name"/u);
  assert.match(html, /<html lang="ja">/u);
  assert.match(html, /aria-label="メインナビゲーション"/u);
  assert.match(html, /aria-label="選択可能な技術対話リクエストの時間枠"/u);
  assert.match(html, /Cloud Infrastructure Engineer/u);
  assert.match(html, /AWS・IaC・可観測性・運用改善を軸に/u);
  assert.match(html, /障害時にも正しく振る舞うシステムを設計・実装しています/u);
  for (const capability of ["Reliability / SRE", "AWS / Cloud Infrastructure", "IaC / Platform Engineering", "Observability", "Automation / Developer Experience", "AI-assisted Engineering"]) {
    assert.match(html, new RegExp(capability.replace("/", "\\/"), "u"));
  }
  for (const system of ["NOC-AI", "Hooklane", "Office Hours", "FairGate", "Repo Health Doctor", "Ops Signal Lab", "AI Workflow Lab"]) {
    assert.match(html, new RegExp(system, "u"));
  }
  assert.match(html, /7日間継続稼働検証：実施中/u);
  assert.match(html, /AIの判断だけに運用操作を任せず/u);
  assert.match(html, /承認・状態・実行・Reconciliation・Verificationを分離/u);
  assert.match(html, /PostgreSQL job \/ lease/u);
  assert.match(html, /Worker crash後の処理回復/u);
  assert.match(html, /stale-owner rejection/u);
  assert.match(html, /不確実なwriteをReconciliation/u);
  assert.match(html, /実行経路から独立した結果確認/u);
  assert.match(html, /技術について話す/u);
  assert.match(html, /平日午前の30分枠から候補時間を選べます/u);
  assert.match(html, /送信された時間枠はリクエストとして仮確保されます/u);
  assert.match(html, /送信は面談確定ではありません/u);
  assert.match(html, /リクエストを受け付けました/u);
  assert.match(html, /選択した時間枠を仮確保しました/u);
  assert.match(html, /Request ID/u);
  assert.match(html, /property="og:site_name" content="SudoWorks"/u);
  assert.equal(manifest.name, "SudoWorks Cloud Infrastructure Engineer Portfolio");
  assert.equal(manifest.short_name, "SudoWorks");
  assert.match(html, /aria-describedby="field-slotId"/u);
  assert.match(javascript, /送信しています…/u);
  assert.match(javascript, /入力内容を確認してから、リクエストをもう一度送信してください/u);
  assert.match(javascript, /時間枠は別のリクエストで確保されました/u);
  assert.match(javascript, /予期しない問題により、リクエストを送信できませんでした/u);
  assert.match(javascript, /短時間に多くのリクエストを受け付けました/u);
  assert.match(javascript, /リクエスト受付を一時的に利用できません/u);
  assert.match(javascript, /名前は制御文字を含まない2〜80文字/u);
  assert.doesNotMatch(html, /Skip to content|Primary navigation|Request a technical conversation|Bring one|Request stored|Store conversation request/iu);
  assert.doesNotMatch(html, /予約確定/u);
  assert.doesNotMatch(javascript, /Storing request|Review the highlighted fields|request slot was already claimed|unexpected problem prevented/iu);
  assert.doesNotMatch(javascript, /runtime-scope-label/u);
  assert.match(css, /\.case-study/u);
  assert.match(css, /\.secondary-work/u);
  assert.match(css, /\.supporting-work/u);
  assert.match(css, /\.noc-evidence-details/u);
  assert.match(css, /@media \(max-width: 520px\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(javascript, /crypto\.randomUUID\(\)/u);
  assert.doesNotMatch(javascript, /localStorage|sessionStorage/u);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/u);
  assert.doesNotMatch(html, /mailto:|tel:/iu);
  assert.doesNotMatch(html, /<img\b/iu);
  assert.doesNotMatch(html, /PERSONAL PROJECT|Personal engineering evidence/iu);
  assert.doesNotMatch(html, /I(?:'m| am) an Infrastructure|I turn person-dependent/iu);
  assert.doesNotMatch(html, /linkedin|twitter|x\.com|instagram|facebook/iu);
  assert.doesNotMatch(html, /github\.com/iu);
  assert.match(html, /商用本番利用および一般的なexactly-onceは主張しません/iu);
  assert.doesNotMatch(html, /commercial production|enterprise adoption|(?:商用本番|企業導入).{0,16}(?:稼働中|利用中|実績)|exactly-once.{0,16}(?:保証|実現|達成)|7日間継続稼働検証[^<\n]*(?:完了|完了済み)/iu);
  assert.doesNotMatch(html, /FLAGSHIP|skill-bar|resume-timeline/iu);
  assert.doesNotMatch(css, /box-shadow\s*:|Georgia|Times New Roman|--lime/iu);
  assert.doesNotMatch(html, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  assert.doesNotMatch(html, /application\/ld\+json/iu);
});

test("public receipts do not publish repository locators or host timezone offsets", async () => {
  const receiptNames = (await readdir("docs/receipts")).filter((name) => name.endsWith(".md"));
  const receipts = (await Promise.all(receiptNames.map((name) => readFile(`docs/receipts/${name}`, "utf8")))).join("\n");
  const publicationReceipt = await readFile("docs/receipts/publication-candidate.md", "utf8");

  assert.doesNotMatch(receipts, /https?:\/\/(?:api\.)?github\.com/iu);
  assert.doesNotMatch(receipts, /\bgh\s+api\b/iu);
  assert.doesNotMatch(receipts, /\brepos\/[A-Z0-9_.-]+\/[A-Z0-9_.-]+/iu);
  assert.doesNotMatch(receipts, /(?:[+-]\d{2}:\d{2}|Asia\/Tokyo|\bJST\b)/u);
  assert.match(publicationReceipt, /^DIRECT_EXTERNAL_GITHUB_DESTINATION=ABSENT$/mu);
  assert.match(publicationReceipt, /^CDK_SYNTH_EXECUTION=PASS$/mu);
  assert.match(publicationReceipt, /^CURRENT_RETAINED_CDK_ARTIFACTS=ABSENT$/mu);
  assert.match(publicationReceipt, /states: initial, submitting, validation error, unexpected error, conflict error, success/u);
});
