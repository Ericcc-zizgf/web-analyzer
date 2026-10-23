const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.ANALYZER_URL || "http://127.0.0.1:5240/");
    await page.locator('[data-mode="html"]').click();
    const input = `<style>.panel {height:100px; padding:12px; border:2px solid #444; box-sizing:border-box} #target {height:160px} .panel {height:120px!important} .parent {color:rgb(1,2,3)} .other {width:100px} .other{width:150px} @media(max-width:500px){#target{height:70px!important}} @layer test{#layer{height:30px}} </style><main class="parent"><div id="target" class="panel">Target</div><div id="other" class="other" style="padding: 5px;">Other</div><div id="layer">Layer</div></main>`;
    await page.locator("#html").fill(input);
    await page.locator("#analyze").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("分析完成"),
    );
    const frame = page.frameLocator("#preview");
    await frame.locator("#target").click();
    await page.locator('[data-inspect="css"]').click();
    assert.match(await page.locator("#box-model").textContent(), /內容/);
    assert.match(await page.locator("#css-cascade .computed-value").textContent(), /120px/);
    assert.match(
      await page.locator('[data-cascade-state="winner"]').textContent(),
      /120px !important/,
    );
    assert.equal(await page.locator('[data-cascade-state="overridden"]').count(), 2);
    await page.locator("#css-property").selectOption("padding-left");
    assert.match(await page.locator('[data-cascade-state="winner"]').textContent(), /12px/);
    await page.locator("#css-property").selectOption("color");
    assert.match(await page.locator("#css-cascade").textContent(), /祖先 main/);
    await page.locator("#css-property").selectOption("height");
    await page.locator("#css-draft").fill("height: 200px !important; padding: 20px;");
    await page.locator("#css-apply").click();
    assert.equal(
      await frame.locator("#target").evaluate((e) => getComputedStyle(e).height),
      "200px",
    );
    assert.match(
      await page.locator('[data-cascade-state="winner"]').textContent(),
      /練習修改/,
    );
    assert.match(await page.locator("#box-model").textContent(), /200.0/);
    await page.locator("#css-reset").click();
    assert.equal(await frame.locator("#target").getAttribute("style"), null);
    assert.equal(
      await frame.locator("#target").evaluate((e) => getComputedStyle(e).height),
      "120px",
    );
    await page.locator("#css-draft").fill("this is not css");
    await page.locator("#css-apply").click();
    assert.match(await page.locator("#css-edit-status").textContent(), /沒有可套用/);
    await frame.locator("#other").click();
    await page.locator("#css-property").selectOption("width");
    assert.match(await page.locator('[data-cascade-state="winner"]').textContent(), /150px/);
    await page.locator("#css-draft").fill("width: 250px; padding: 30px;");
    await page.locator("#css-apply").click();
    assert.equal(
      await frame.locator("#other").evaluate((e) => getComputedStyle(e).width),
      "250px",
    );
    await frame.locator("#target").click();
    await page.locator("#css-draft").fill("color: red;");
    await page.locator("#css-apply").click();
    await page.locator("#css-reset-all").click();
    assert.equal(await frame.locator("#other").getAttribute("style"), "padding: 5px;");
    assert.equal(await frame.locator("#target").getAttribute("style"), null);
    await page.locator('[data-width="375"]').click();
    await page.waitForTimeout(100);
    await page.locator("#css-property").selectOption("height");
    assert.match(await page.locator("#css-cascade .computed-value").textContent(), /70px/);
    await frame.locator("#layer").click();
    assert.equal(await page.locator('[data-cascade-state="winner"]').count(), 0);
    assert.match(await page.locator("#css-cascade").textContent(), /不判定唯一勝出/);
    await frame.locator("#target").click();
    await page.locator("#css-select-parent").click();
    assert.match(await page.locator("#selected-node").textContent(), /main/);
    await frame.locator("#target").click();
    await page.locator("#css-draft").fill("height: 222px !important;");
    await page.locator("#css-apply").click();
    assert.equal(await page.locator("#html").inputValue(), input);
    await page.locator("#toggle-input").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator("#demo").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("分析完成"),
    );
    assert.equal(await page.locator("#css-reset-all").isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log(
      "PASS cascade !important/specificity/source order/shorthands/media/inheritance/layer limitation; box dimensions + parent selection; edit/restore exact inline styles/all/reset on analysis; source unchanged; responsive/no JS errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
