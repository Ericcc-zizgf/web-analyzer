const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const Core = require("../frontend/project-core.js");
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function harness(core = Core) {
  const elements = new Map(),
    workers = [],
    timers = [];
  function element() {
    return {
      hidden: false,
      value: "",
      textContent: "",
      disabled: false,
      open: false,
      replaceChildren() {},
      setAttribute() {},
      click() {
        this.onclick?.();
      },
    };
  }
  const document = {
    currentScript: { src: "http://localhost/project-ui.js?v=test-release" },
    body: { classList: { add() {} } },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
  };
  class Worker {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      workers.push(this);
    }
    postMessage(value) {
      this.input = value;
    }
    terminate() {
      this.terminated = true;
    }
  }
  const workbench = {
    cancel() {},
    reset() {},
    lastStatus() {
      return "failure";
    },
    async analyzeProject() {
      return true;
    },
  };
  const context = {
    document,
    window: { PageWorkbench: workbench },
    ProjectCore: core,
    Worker,
    AbortController,
    URL,
    FormData,
    Map,
    Promise,
    setTimeout(fn, delay) {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
  };
  vm.createContext(context);
  const source = fs
    .readFileSync(path.join(__dirname, "../frontend/project-ui.js"), "utf8")
    .replace(/\}\)\(\);\s*$/, "globalThis.__test = {run,stop,openPage,state};})();");
  vm.runInContext(source, context);
  return {
    api: context.__test,
    el: (selector) => document.querySelector(selector),
    workers,
    timers,
    workbench,
  };
}
const file = (name, text) => ({
  name,
  webkitRelativePath: "demo/" + name,
  size: 20,
  text,
});
async function waitFor(test) {
  for (let i = 0; i < 40 && !test(); i++) await tick();
  assert.ok(test(), "async fixture did not settle");
}
(async () => {
  // The delayed read can settle after cancel; it must not publish its old progress.
  {
    const h = harness(),
      read = deferred();
    h.el("#project-folder").value = "selected-folder";
    const pending = h.api.run([file("old.html", () => read.promise)]);
    h.el("#project-cancel").click();
    read.resolve("<main>old</main>");
    await pending;
    assert.equal(h.el("#project-status").textContent, "已取消。重新選擇資料夾即可分析。");
    assert.equal(h.el("#project-folder").value, "");
    assert.equal(h.workers.length, 0);
  }
  // An old read finishing after the newer run failed must not restore old status/state.
  {
    const h = harness(),
      oldRead = deferred();
    const old = h.api.run([file("old.html", () => oldRead.promise)]);
    const fresh = h.api.run([file("new.html", async () => "<main>new</main>")]);
    await waitFor(() => h.workers.length === 1);
    h.workers[0].onmessage({ data: { error: "new fixture failure" } });
    await fresh;
    oldRead.resolve("<main>old</main>");
    await old;
    assert.equal(h.el("#project-status").textContent, "new fixture failure");
    assert.equal(h.workers.length, 1);
    assert.equal(h.api.state.worker, null);
  }
  // Even a timeout/message that was already queued for the old worker is harmless.
  {
    const core = {
      async collect() {
        return {
          entries: [{ path: "x.html", source: "<p>x</p>" }],
          skipped: [],
          bytes: 8,
          root: "demo",
        };
      },
    };
    const h = harness(core);
    const old = h.api.run([]);
    await waitFor(() => h.workers.length === 1);
    const timeout = h.timers.find((t) => t.delay === 60000);
    assert.equal(h.workers[0].url.search, "?v=test-release");
    const fresh = h.api.run([]);
    await waitFor(() => h.workers.length === 2);
    h.el("#project-folder").value = "new-selection";
    timeout.fn();
    h.workers[0].onmessage({ data: { error: "stale failure" } });
    await old;
    assert.equal(h.api.state.worker, h.workers[1]);
    assert.equal(h.workers[1].terminated, false);
    assert.equal(h.el("#project-folder").value, "new-selection");
    assert.equal(h.el("#project-status").textContent, "正在分析結構、職責與檔案引用…");
    h.workers[1].onmessage({ data: { error: "fresh failure" } });
    await fresh;
    assert.equal(h.el("#project-status").textContent, "fresh failure");
    assert.equal(h.el("#project-folder").value, "");
  }
  // Page selection is also latest-run-wins, even if the former page finishes last.
  {
    const h = harness(),
      a = deferred(),
      b = deferred();
    h.api.state.report = {};
    h.api.state.pageProfiles = [];
    h.workbench.analyzeProject = (input) =>
      input.entry === "a.html" ? a.promise : b.promise;
    const old = h.api.openPage("a.html"),
      fresh = h.api.openPage("b.html");
    b.resolve(true);
    await fresh;
    a.resolve(false);
    await old;
    assert.match(h.el("#project-page-status").textContent, /已分析「b.html」/);
    assert.equal(h.el("#project-page-link").hidden, false);
  }
  console.log(
    "PASS cancelled picker reset, stale read progress, reselected folder isolation, old worker timeout/message isolation, and latest page selection",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
