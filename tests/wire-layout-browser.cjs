const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
      viewport: { width: 1512, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = process.env.ANALYZER_URL || "http://127.0.0.1:8765/docs/";
  const main = ".main-wire-tools",
    layer = ".flow-world > .wire-edit-layer";
  const stored = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("web-analyzer:layout:v1:main")),
    );
  async function drag(locator, dx, dy) {
    const r = await locator.boundingBox();
    assert.ok(r);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, {
      steps: 12,
    });
    await page.mouse.up();
  }
  async function inject(extra = "") {
    await page.evaluate((extra) => {
      document.body.classList.add("component-mode");
      document.querySelector("#component-workspace").hidden = false;
      window.dispatchEvent(
        new CustomEvent("locator:function-flow", {
          detail: {
            nodes: [
              {
                id: "a",
                type: "function",
                kind: "functions",
                title: "save" + extra,
                file: "main.js",
                source: "function save(){helper()}",
                column: 0,
              },
              {
                id: "b",
                type: "function",
                kind: "functions",
                title: "helper",
                file: "main.js",
                source: "function helper(){return 1}",
                column: 1,
              },
            ],
            edges: [
              {
                from: "a",
                to: "b",
                label: "call",
                certainty: "confirmed",
                evidence: [],
              },
            ],
            warnings: [],
          },
        }),
      );
    }, extra);
  }
  try {
    await page.goto(url);
    await page
      .locator(main + " .wire-toolbar button")
      .first()
      .waitFor();
    await page
      .locator(main + " .wire-toolbar button")
      .first()
      .click();
    await page
      .locator(main + " select")
      .last()
      .selectOption("orthogonal");
    await page.waitForFunction(() =>
      document
        .querySelector(".flow-edges path")
        .getAttribute("d")
        .includes(" L"),
    );
    await drag(page.locator(layer + " .wire-handle-via").first(), 48, 34);
    await drag(page.locator(layer + " .wire-handle-from"), -12, 80);
    let state = await stored(),
      id = Object.keys(state.routes)[0];
    assert.equal(state.routes[id].style, "orthogonal");
    assert.ok(state.routes[id].via);
    assert.ok(state.routes[id].from);
    await page.locator(layer + " .wire-handle-to").press("ArrowDown");
    const routesBefore = (await stored()).routes;
    // Header moves and route persistence through a real reload.
    await page.locator("#source-node .flow-node-heading").focus();
    await page.keyboard.press("ArrowDown");
    const pos = (await stored()).nodes["source-node"];
    assert.ok(pos);
    await page.reload();
    await page
      .locator(main + " .wire-toolbar button")
      .first()
      .waitFor();
    assert.deepEqual((await stored()).routes, routesBefore);
    assert.equal(
      await page.locator("#source-node").evaluate((el) => el.offsetTop),
      pos.y,
    );
    assert.match(
      await page.locator(".flow-edges path").first().getAttribute("d"),
      / L/,
    );
    await page
      .locator(main + " .wire-toolbar button")
      .first()
      .click();
    await page
      .locator(main + " select")
      .last()
      .selectOption("curve");
    await page.waitForFunction(() =>
      document
        .querySelector(".flow-edges path")
        .getAttribute("d")
        .includes(" C"),
    );
    // Test actual pointer dragging while zoomed out: coordinates must use world scale.
    await page.getByRole("button", { name: "縮小畫布", exact: true }).click();
    await drag(page.locator(layer + " .wire-handle-via").first(), 20, 20);
    assert.ok((await stored()).routes[id].via.x > routesBefore[id].via.x);
    await inject();
    await page.getByRole("button", { name: "展開全部", exact: true }).click();
    const ft = ".component-flow-top .wire-toolbar",
      fl = ".component-flow-world > .wire-edit-layer";
    await page
      .locator(ft + " button")
      .first()
      .click();
    await page
      .locator(ft + " select")
      .last()
      .selectOption("orthogonal");
    await drag(page.locator(fl + " .wire-handle-via"), 50, 60);
    await drag(page.locator(fl + " .wire-handle-to"), 20, 30);
    await page.locator(".component-flow-handle").first().press("ArrowDown");
    const functionState = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => k.includes("functions-")),
      ),
    );
    const functionKey = Object.keys(functionState)[0],
      fs = JSON.parse(functionState[functionKey]);
    assert.ok(fs.nodes.a);
    assert.ok(Object.values(fs.routes)[0].via);
    await page.reload();
    await inject();
    await page.getByRole("button", { name: "展開全部", exact: true }).click();
    assert.match(
      await page
        .locator(".component-flow-edges > path")
        .first()
        .getAttribute("d"),
      / L/,
    );
    assert.equal(
      await page.locator('[data-flow-node="a"]').evaluate((e) => e.offsetTop),
      fs.nodes.a.y,
    );
    await page.locator(".component-flow-edge-hit").press("Enter");
    assert.equal(
      await page.locator(".component-flow-evidence").isVisible(),
      true,
    );
    await inject("different");
    await page.getByRole("button", { name: "展開全部", exact: true }).click();
    assert.match(
      await page
        .locator(".component-flow-edges > path")
        .first()
        .getAttribute("d"),
      / C/,
      "different graph has independent routes",
    );
    // Corrupt/blocked storage must not prevent the application from starting.
    await page.evaluate(() =>
      localStorage.setItem("web-analyzer:layout:v1:main", "bad-json"),
    );
    await page.reload();
    await page
      .locator(main + " .wire-toolbar button")
      .first()
      .click();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("quota");
      };
    });
    await page
      .locator(main + " select")
      .last()
      .selectOption("orthogonal");
    assert.match(
      await page.locator(main + " .wire-save-status").textContent(),
      /無法儲存/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator(main).isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS browser: endpoint/waypoint pointer drag, keyboard, curve/orthogonal switch, zoom, card position and route reload, function graph persistence/isolation, invalid/blocked storage and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
