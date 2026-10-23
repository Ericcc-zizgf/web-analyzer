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
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(process.env.ANALYZER_URL || "http://127.0.0.1:5240/");
    await page.locator('[data-mode="html"]').click();
    await page.locator("#html")
      .fill(`<button id="one">One</button><button id="two">Two</button><div id="output">Output</div><p id="plain">Plain</p><button id="inline" onclick="console.log('inline')">Inline</button><script>
const one = document.querySelector('#one');
const two = document.getElementById('two');
const output = document.getElementById('output');
function first() { output.textContent='done'; fetch('/one'); localStorage.setItem('one','yes'); }
function unused() { fetch('/unused'); }
one.addEventListener('click', first);
two.addEventListener('click', () => { fetch('/two'); two.classList.toggle('active'); });
</script>`);
    await page.locator("#analyze").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("分析完成"),
    );
    const frame = page.frameLocator("#preview");
    const cards = () => page.locator("#inspect-content .js-card").allTextContents();
    await frame.locator("#one").click();
    await page.locator('[data-inspect="js"]').click();
    assert.equal(await page.locator("#js-scope").inputValue(), "element");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /#one.*first/);
    assert.doesNotMatch((await cards()).join(""), /#two/);
    await page.locator("#js-category").selectOption("functions");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /first\(/);
    await page.locator("#js-category").selectOption("network");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /\/one/);
    assert.doesNotMatch((await cards()).join(""), /\/two|\/unused/);
    await page.locator("#js-category").selectOption("writes");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /output.textContent/);
    await page.locator("#js-category").selectOption("storage");
    assert.equal((await cards()).length, 1);
    await frame.locator("#two").click();
    await page.locator("#js-category").selectOption("network");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /\/two/);
    await page.locator("#js-category").selectOption("writes");
    assert.match((await cards()).join(""), /classList.toggle/);
    await page.locator("#js-scope").selectOption("page");
    await page.locator("#js-category").selectOption("network");
    assert.equal((await cards()).length, 3);
    await frame.locator("#plain").click();
    assert.equal(await page.locator("#js-scope").inputValue(), "element");
    assert.equal((await cards()).length, 0);
    assert.match(await page.locator("#inspect-content").textContent(), /未找到可確認/);
    await frame.locator("#inline").click();
    await page.locator("#js-category").selectOption("events");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /onclick/);
    await frame.locator("#output").click();
    await page.locator("#js-category").selectOption("writes");
    assert.equal((await cards()).length, 1);
    await page.locator("#demo").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("分析完成"),
    );
    await frame.locator("#increase").click();
    await page.locator("#js-category").selectOption("events");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /updateCount/);
    await page.locator("#js-category").selectOption("functions");
    assert.equal((await cards()).length, 1);
    assert.match((await cards())[0], /updateCount/);
    await page.locator("#js-category").selectOption("events");
    assert.deepEqual(errors, []);
    console.log(
      "PASS per-element events/functions/API/writes/storage, anonymous callbacks, inline events, unrelated node empty state, explicit whole-page mode, selection resets scope, demo regression; no page errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
