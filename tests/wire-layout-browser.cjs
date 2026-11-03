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
    world = ".flow-world",
    key = "web-analyzer:layout:v1:main";
  const state = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  async function screen(selector, p) {
    return page.locator(selector).evaluate((el, p) => {
      const r = el.getBoundingClientRect(),
        s = r.width / el.offsetWidth;
      return { x: r.left + p.x * s, y: r.top + p.y * s };
    }, p);
  }
  async function clickPoint(selector, p, count = 1) {
    const s = await screen(selector, p);
    await page.mouse.click(s.x, s.y, { clickCount: count });
  }
  async function linePoint(selector) {
    return page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const p = [
          ...el.getAttribute("d").matchAll(/[ML]([\d.]+),([\d.]+)/g),
        ].map((m) => ({ x: +m[1], y: +m[2] }));
        let max = 0,
          result;
        for (let i = 1; i < p.length; i++) {
          let d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
          if (d > max) {
            max = d;
            result = {
              x: (p[i].x + p[i - 1].x) / 2,
              y: (p[i].y + p[i - 1].y) / 2,
            };
          }
        }
        return result;
      });
  }
  async function drag(locator, dx, dy) {
    const r = await locator.boundingBox();
    assert.ok(r);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, {
      steps: 10,
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
    await page.getByRole("button", { name: "展開全部", exact: true }).click();
  }
  try {
    await page.goto(url);
    await page.locator(".wire-hit").first().waitFor();
    assert.equal(
      await page.locator(world + " .wire-handle-end").count(),
      8,
      "all four wires keep both endpoints visible",
    );
    assert.equal(
      await page.locator(".wire-toolbar select").count(),
      0,
      "no curve selector",
    );
    const p = await linePoint(".flow-edges path");
    await clickPoint(world, p);
    assert.equal(
      await page.locator(world + " .wire-handle.is-selected").count(),
      2,
      "only selected wire endpoints are highlighted",
    );
    await clickPoint(world, p, 2);
    await page.locator(world + " .wire-handle-joint").waitFor();
    assert.equal(
      await page.locator(world + " .wire-handle-joint").count(),
      1,
      "double-click adds one explicit joint",
    );
    await drag(page.locator(world + " .wire-handle-joint"), 23, 37);
    let saved = await state(),
      id = Object.keys(saved.routes)[0];
    assert.equal(saved.routes[id].waypoints.length, 1);
    for (const n of Object.values(saved.routes[id].waypoints[0]))
      assert.equal(n % 20, 0);
    await page.locator(world + " .wire-handle-joint").press("Delete");
    await page
      .locator(world + " .wire-handle-joint")
      .waitFor({ state: "detached" });
    assert.equal(await page.locator(world + " .wire-handle-joint").count(), 0);
    await page
      .getByRole("button", { name: "逐點重畫", exact: true })
      .first()
      .click();
    await clickPoint(world, { x: 340, y: 200 });
    await clickPoint(world, { x: 340, y: 100 });
    await page
      .getByRole("button", { name: "完成接線", exact: true })
      .first()
      .click();
    saved = await state();
    assert.deepEqual(saved.routes[id].waypoints, [
      { x: 340, y: 200 },
      { x: 340, y: 100 },
    ]);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".flow-world .wire-handle-joint").length ===
        2,
    );
    // Explicit exit must cancel the draft, clear selection, and retain every port.
    await page
      .getByRole("button", { name: "逐點重畫", exact: true })
      .first()
      .click();
    await clickPoint(world, { x: 360, y: 120 });
    await page
      .getByRole("button", { name: "離開接線模式", exact: true })
      .first()
      .click();
    assert.deepEqual((await state()).routes, saved.routes);
    assert.equal(
      await page
        .locator(world)
        .evaluate((el) => el.classList.contains("is-wiring")),
      false,
    );
    assert.equal(await page.locator(world + " .wire-handle-joint").count(), 0);
    assert.equal(await page.locator(world + " .wire-handle-end").count(), 8);
    await page
      .locator(world + " .wire-hit")
      .first()
      .focus();
    await page.keyboard.press("Enter");
    // Cancellation must not overwrite the saved route.
    await page
      .getByRole("button", { name: "逐點重畫", exact: true })
      .first()
      .click();
    await clickPoint(world, { x: 200, y: 120 });
    await page.keyboard.press("Escape");
    assert.deepEqual((await state()).routes, saved.routes);
    await drag(
      page.locator(world + ' .wire-handle.is-selected[data-end="from"]'),
      0,
      23,
    );
    await page.reload();
    await page.locator(".wire-hit").first().waitFor();
    assert.deepEqual(
      (await state()).routes[id].waypoints,
      saved.routes[id].waypoints,
    );
    assert.equal(await page.locator(world + " .wire-handle-end").count(), 8);
    assert.equal(await page.locator(".wire-handle-joint").count(), 0);
    const actual = await page
      .locator(".flow-edges path")
      .first()
      .getAttribute("d");
    assert.ok(!actual.includes("C"));
    assert.ok(actual.includes("340,200"));
    // Zoom must not break grid snapping.
    await page.getByRole("button", { name: "縮小畫布", exact: true }).click();
    await page.locator(".wire-hit").first().focus();
    await page.keyboard.press("Enter");
    await drag(page.locator(world + " .wire-handle-joint").first(), 19, 21);
    for (const n of Object.values((await state()).routes[id].waypoints[0]))
      assert.equal(n % 20, 0);
    await inject();
    const fw = ".component-flow-world",
      ft = ".component-flow-top";
    assert.equal(await page.locator(fw + " .wire-handle-end").count(), 2);
    await page.locator(fw + " .wire-hit").focus();
    await page.keyboard.press("Enter");
    await page
      .locator(ft)
      .getByRole("button", { name: "逐點重畫", exact: true })
      .click();
    await clickPoint(fw, { x: 340, y: 220 });
    await page.locator(fw + ' .wire-handle[data-end="to"]').click();
    await page
      .locator(ft)
      .getByRole("button", { name: "查看程式碼依據", exact: true })
      .click();
    assert.equal(
      await page.locator(".component-flow-evidence").isVisible(),
      true,
    );
    await page.reload();
    await inject();
    assert.ok(
      (
        await page
          .locator(".component-flow-edges > path")
          .first()
          .getAttribute("d")
      ).includes("340,220"),
    );
    await inject("other");
    assert.ok(
      !(
        await page
          .locator(".component-flow-edges > path")
          .first()
          .getAttribute("d")
      ).includes("340,220"),
      "different graph is independent",
    );
    // Legacy curved routes are safely migrated into clean grid wires.
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            nodes: {},
            routes: {
              '["source-node","pages-node"]': {
                style: "curve",
                via: { x: 333, y: 199 },
              },
            },
          }),
        ),
      key,
    );
    await page.reload();
    await page.locator(".wire-hit").first().focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(".wire-handle-joint").count(), 0);
    assert.ok(
      !(
        await page.locator(".flow-edges path").first().getAttribute("d")
      ).includes("C"),
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw Error("quota");
      };
    });
    await page
      .getByRole("button", { name: "還原這條線", exact: true })
      .first()
      .click();
    assert.match(
      await page.locator(main + " .wire-save-status").textContent(),
      /無法儲存/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator(main).isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS browser: direct line selection, persistent endpoints, explicit exit, explicit add/delete/drag joints, point-to-point wiring, cancel, grid snap at zoom, reload, function evidence/isolation, v1 migration and denied storage",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
