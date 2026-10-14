/* Requires Playwright in the maintainer's environment; the website has no dependencies.
   Run: node Web/tools/test_vip_browser.js
   Optional: PLAYWRIGHT_CHANNEL, MAYUAN_TEST_SCREENSHOTS (output directory). */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "../..");
const screenshotDir = process.env.MAYUAN_TEST_SCREENSHOTS;
const errors = [];
let browser;

async function openVersion(file, route, { vip = false, levels = {}, blockedStorage = false, mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    reducedMotion: "reduce"
  });
  await context.addInitScript(({ vip, levels, blockedStorage }) => {
    if (!sessionStorage.getItem("mayuan.test.seeded")) {
      localStorage.clear();
      localStorage.setItem("mayuan.study.v1", JSON.stringify({ levels }));
      if (vip) localStorage.setItem("mayuan.vip.v1", JSON.stringify({ vip: true }));
      sessionStorage.setItem("mayuan.test.seeded", "true");
    }
    if (blockedStorage) {
      Storage.prototype.getItem = Storage.prototype.setItem = () => {
        throw new Error("Storage unavailable in this test");
      };
    }
  }, { vip, levels, blockedStorage });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${file}: ${error.message}`));
  await page.goto(pathToFileURL(path.join(projectRoot, file)).href + "#/" + route);
  await page.waitForSelector(route === "map" ? "#mmGraph .mm-node" : "#vipUnlockBtn", { state: "attached" });
  return { page, context };
}

async function treeInfo(page) {
  return page.evaluate(() => {
    function count(n) { return 1 + (n.children || []).reduce((sum, c) => sum + count(c), 0); }
    return {
      id: DB.chapters.id,
      count: count(DB.chapters),
      shallow: 1 + DB.chapters.children.length,
      branch: DB.chapters.children[0].id,
      scope: DB.chapters.children[1].id,
      scopeCount: count(DB.chapters.children[1]),
      scopeShallow: 1 + DB.chapters.children[1].children.length
    };
  });
}

const visibleCount = page => page.locator("#mmGraph .mm-node").count();

async function screenshot(page, name) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(screenshotDir, name + ".png"), fullPage: true });
}

async function checkDisabledUnlock(page) {
  const button = page.locator("#vipUnlockBtn");
  assert.equal(await button.isDisabled(), true);
  assert.equal(await button.textContent(), "全部关卡已解锁");
  assert.equal(await page.locator(".level-item.locked").count(), 0);
  assert.equal(await button.evaluate(el => getComputedStyle(el).filter), "grayscale(1)");
  await button.evaluate(el => el.click());
  assert.equal(await page.locator(".vip-overlay").count(), 0, "A completed unlock cannot open another modal");
  assert.doesNotMatch(await page.locator(".challenge-intro").innerText(), /VIP 已解锁全部|并解锁下一关|随之解锁展开/);
}

async function finishPerfectLevel(page, index) {
  await page.locator(`button[data-lv="${index}"]`).click();
  const total = await page.locator(".answer-sheet button").count();
  for (let i = 0; i < total; i++) {
    const answer = await page.evaluate(() => {
      const stem = document.querySelector(".q-stem").innerHTML;
      const parsed = document.createElement("div");
      const question = DB.questions.find(q => {
        parsed.innerHTML = mdLite(q.stem);
        return parsed.innerHTML === stem;
      });
      if (!question) throw new Error("Question not found in the embedded bank");
      return question.answer;
    });
    for (const key of answer) await page.locator(`.opt[data-key="${key}"]`).click();
    if (i + 1 < total) await page.locator("#nextQ").click();
  }
  await page.locator("#handin").click();
  return page.locator(".score-hero").innerText();
}

async function checkMapGrant(file, name) {
  const { page, context } = await openVersion(file, "map");
  try {
    const tree = await treeInfo(page);
    await page.locator("#mmSearch").fill("否定");
    assert.match(await page.locator("#mmResults").innerText(), /未解锁分支/);
    assert.ok(await page.locator(".mm-locked-hint").count() > 0);
    await page.locator('button[data-command="all"]').click();
    await page.locator(".vip-direct").click();

    assert.equal(await visibleCount(page), tree.count, "VIP activation must expand the complete current tree");
    assert.equal(await page.locator(".journey-node.is-locked,.mm-locked-hint,.mm-toggle.is-locked").count(), 0);
    assert.doesNotMatch(await page.locator("#mmResults").innerText(), /未解锁分支/);
    assert.equal(await page.locator('button[data-command="all"]').textContent(), "全部展开");
    assert.doesNotMatch(await page.locator('button[data-command="all"]').getAttribute("title"), /VIP/);
    await page.locator('button[data-command="clearsearch"]').click();

    await page.locator('button[data-command="reset"]').click();
    assert.equal(await visibleCount(page), tree.shallow, "Reset must remove progress-driven expansions");
    await page.locator(`#mmGraph [data-toggle="${tree.id}"] rect`).click();
    assert.equal(await visibleCount(page), 1, "The actual SVG pointer control must collapse the root");
    await page.locator(`#mmGraph [data-toggle="${tree.id}"] rect`).click();
    assert.equal(await visibleCount(page), tree.shallow);
    await page.locator('button[data-command="one"]').click();
    const oneLayerCount = await visibleCount(page);
    assert.ok(oneLayerCount > tree.shallow && oneLayerCount < tree.count);

    await page.locator('button[data-mode="outline"]').click();
    const toggle = page.locator(`#mmOutline button[data-toggle="${tree.branch}"]`);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await toggle.click();
    const collapsedCount = await visibleCount(page);
    assert.ok(collapsedCount < oneLayerCount, "An automatically expanded branch must stay collapsed");
    await page.locator(`#mmOutline [data-node="${tree.branch}"]`).click();
    assert.equal(await visibleCount(page), collapsedCount, "Reading a node must preserve its collapsed state");
    await toggle.click();
    assert.equal(await visibleCount(page), oneLayerCount);
    await page.locator(`#mmOutline [data-node="${tree.id}"]`).press("ArrowLeft");
    assert.equal(await visibleCount(page), 1, "Keyboard collapse must share the same expansion state");
    await page.locator(`#mmOutline [data-node="${tree.id}"]`).press("ArrowRight");
    assert.equal(await visibleCount(page), oneLayerCount);
    await page.locator('button[data-mode="map"]').click();
    await page.locator(`#mmGraph [data-node="${tree.id}"]`).press("ArrowLeft");
    assert.equal(await visibleCount(page), 1);
    await page.locator(`#mmGraph [data-node="${tree.id}"]`).press("ArrowRight");
    assert.equal(await visibleCount(page), oneLayerCount);

    await page.locator(`[data-scope="${tree.scope}"]`).click();
    await page.locator('button[data-command="all"]').click();
    assert.equal(await visibleCount(page), tree.scopeCount);
    await page.locator('button[data-command="reset"]').click();
    assert.equal(await visibleCount(page), tree.scopeShallow);
    await page.locator("#mmSearch").fill("人工智能");
    await page.locator(".mm-result").first().click();
    assert.match(await page.locator("#mmPanel h3").innerText(), /人工智能/);
    assert.equal(await page.locator("#mmGraph .is-selected").count(), 1, "Search must reveal a path after collapse");
    await page.locator('button[data-command="clearsearch"]').click();
    await page.locator('button[data-command="reset"]').click();
    await screenshot(page, name + "-map-desktop");

    await page.locator('#nav a[data-route="challenge"]').click();
    await checkDisabledUnlock(page);
    assert.equal(await page.evaluate(() => Object.keys(Store.data.levels).length), 0, "VIP must not award stars");
    await screenshot(page, name + "-challenge-desktop");
    assert.doesNotMatch(await finishPerfectLevel(page, 9), /已解锁下一关|通关全部关卡/);
    await page.locator(".score-hero a").click();
    const result = await finishPerfectLevel(page, 0);
    assert.match(result, /可继续挑战/);
    assert.doesNotMatch(result, /已解锁下一关/);
    await page.locator(".score-hero a").click();
    await page.reload();
    await page.waitForSelector("#vipUnlockBtn");
    await checkDisabledUnlock(page);
    await page.locator('#nav a[data-route=""]').click();
    assert.doesNotMatch(await page.locator("#view").innerText(), /递进解锁|解锁到哪|按解锁进度/);
  } finally {
    await context.close();
  }
}

async function checkOrdinaryProgress(file) {
  const { page, context } = await openVersion(file, "map");
  try {
    const tree = await treeInfo(page);
    await page.locator('button[data-mode="outline"]').click();
    await page.locator(`#mmOutline [data-toggle="${tree.branch}"]`).click();
    assert.equal(await page.locator(`#mmOutline [data-toggle="${tree.branch}"]`).getAttribute("aria-expanded"), "false");
    await page.locator('button[data-command="reset"]').click();
    assert.equal(await visibleCount(page), tree.shallow);
    await page.locator('button[data-command="one"]').click();
    const locked = page.locator("#mmOutline .is-locked").first();
    assert.ok(await locked.count());
    const before = await visibleCount(page);
    await locked.click();
    assert.equal(await visibleCount(page), before, "Ordinary users must still respect locked branches");
    assert.match(await page.locator(".toast").innerText(), /尚未解锁/);
    await page.locator('button[data-command="all"]').click();
    assert.equal(await page.locator(".vip-overlay").count(), 1);
    await page.locator(".vip-close").click();
    await page.locator('#nav a[data-route="challenge"]').click();
    assert.equal(await page.locator("#vipUnlockBtn").isDisabled(), false);
    assert.equal(await page.locator(".level-item.locked").count(), 9);
    const result = await finishPerfectLevel(page, 0);
    assert.match(result, /已解锁下一关/);
    await page.locator(".score-hero a").click();
    assert.equal(await page.locator(".level-item.locked").count(), 8);
    assert.doesNotMatch(await finishPerfectLevel(page, 0), /已解锁下一关/);
  } finally {
    await context.close();
  }
}

async function checkGrantPaths(file, name) {
  for (const blockedStorage of [false, true]) {
    const { page, context } = await openVersion(file, "challenge", { blockedStorage });
    try {
      await page.locator("#vipUnlockBtn").click();
      await page.locator(".vip-direct").click();
      await checkDisabledUnlock(page);
      assert.match(await page.locator(".toast").innerText(), /VIP 已开通/);
      assert.equal(await page.evaluate(() => VIP.get()), true);
      await page.locator('#nav a[data-route="map"]').click();
      assert.equal(await page.locator(".journey-node.is-locked,.mm-locked-hint").count(), 0);
    } finally {
      await context.close();
    }
  }
  const { page, context } = await openVersion(file, "map", { mobile: true });
  try {
    const tree = await treeInfo(page);
    await page.locator('button[data-command="all"]').click();
    await page.locator(".vip-watch").click();
    await page.waitForSelector(".vip-overlay", { state: "detached", timeout: 10000 });
    assert.equal(await visibleCount(page), tree.count, "The advertisement path must activate the same permissions");
    await page.locator('button[data-command="reset"]').click();
    assert.equal(await visibleCount(page), tree.shallow);
    await page.locator(`#mmOutline [data-toggle="${tree.id}"]`).click();
    assert.equal(await visibleCount(page), 1);
    await page.locator(`#mmOutline [data-toggle="${tree.id}"]`).click();
    await page.evaluate(() => document.querySelector(".toast")?.remove());
    await screenshot(page, name + "-map-mobile");
    await page.locator('#nav a[data-route="challenge"]').click();
    await checkDisabledUnlock(page);
    await screenshot(page, name + "-challenge-mobile");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await context.close();
  }
  const levels = Object.fromEntries(Array.from({ length: 9 }, (_, i) =>
    ["lv" + (i + 1), { stars: 1, bestPct: 60, plays: 1 }]));
  const complete = await openVersion(file, "challenge", { levels });
  try {
    assert.equal(await complete.page.locator("#vipUnlockBtn").isDisabled(), true,
      "Unlock must also be disabled when ordinary progress has already opened all levels");
    assert.match(await finishPerfectLevel(complete.page, 9), /通关全部关卡/);
  } finally {
    await complete.context.close();
  }
}

async function main() {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined)
  });
  try {
    for (const [file, name] of [["Web/index.html", "folder"], ["Offline/马原研习社.html", "single-file"]]) {
      await checkMapGrant(file, name);
      await checkOrdinaryProgress(file);
      await checkGrantPaths(file, name);
      console.log(`PASS ${name}: SVG/outline/keyboard collapse; scoped reset/expand/search; VIP live refresh; disabled unlock; result messages; direct/advertisement/storage failure; desktop/mobile.`);
    }
    assert.deepEqual(errors, [], "Both offline versions must run without browser errors");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
