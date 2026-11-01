const assert = require("node:assert/strict");
const Page = require("../frontend/project-page.js");
const Core = require("../frontend/project-core.js");
const babel = require("../frontend/vendor/babel.js");
(async () => {
  const sources = new Map([
    ["index.html", '<link href="./styles/a.css"><script src="src/main.ts"></script>'],
    ["pages/about.html", "<main>About</main>"],
    [
      "styles/a.css",
      '@import "nested/b.css" screen and (min-width:1px); body{color:red}',
    ],
    ["styles/nested/b.css", '@import "../a.css"; .nested{color:blue}'],
    [
      "src/main.ts",
      'import {a} from "./nested/same"; import "./a/same.js"; import "./app.css"; import "react";',
    ],
    ["src/nested/same.ts", "export const a:number=1;"],
    ["src/a/same.js", "export const a=2;"],
    ["src/app.css", "p{padding:3px}"],
    ["assets/js/same.js", "export const wrong=1;"],
  ]);
  const report = await Core.analyze(
    {
      root: "demo",
      entries: [...sources].map(([path, source]) => ({
        path,
        source,
        size: source.length,
      })),
      skipped: [],
      bytes: 0,
    },
    (s, e) => babel.parsers[e === "ts" ? "babel-ts" : "babel"].parse(s, {}),
  );
  assert.deepEqual(Page.pages(report, sources), ["pages/about.html", "index.html"]);
  const companySources = new Map([
    [
      "index.html",
      '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=PortalMain.htm"></head><body>轉址</body></html>',
    ],
    [
      "PortalMain.htm",
      '<!doctype html><html><head><title>公司作業平台</title></head><body><nav><a href="reports/report.html">報表</a><a href="login.html">登入</a></nav><main><h1>公司作業總覽</h1><form><input><button>查詢</button></form></main></body></html>',
    ],
    [
      "login.html",
      '<!doctype html><html><body><form><input><button>登入</button></form><a href="PortalMain.htm">回平台</a></body></html>',
    ],
    [
      "reports/report.html",
      '<!doctype html><html><body><main>每月報表</main><a href="../PortalMain.htm">平台</a></body></html>',
    ],
    [
      "tests/index.html",
      "<!doctype html><html><body><nav>test</nav><main><button>測試</button></main></body></html>",
    ],
  ]);
  const companyReport = await Core.analyze(
    {
      root: "company",
      entries: [...companySources].map(([path, source]) => ({
        path,
        source,
        size: source.length,
      })),
      skipped: [],
      bytes: 0,
    },
    (s, e) => babel.parsers.babel.parse(s, {}),
  );
  const profiles = Page.profiles(companyReport, companySources);
  assert.equal(profiles[0].path, "PortalMain.htm");
  assert.ok(profiles[0].reasons.some((reason) => reason.includes("連入")));
  assert.equal(profiles.length, 5);
  const noIndex = new Map(companySources);
  noIndex.delete("index.html");
  assert.equal(Page.pages(companyReport, noIndex)[0], "PortalMain.htm");
  assert.ok(!Page.pages(companyReport, noIndex).includes("index.html"));
  const unreadable = new Map(companySources);
  unreadable.set("PortalMain.htm", null);
  assert.ok(!Page.pages(companyReport, unreadable).includes("PortalMain.htm"));
  const markupSources = new Map([
    [
      "fake.htm",
      `<div data-html="<main><nav><form><input><link>">fragment</div><script>const fake='<!doctype html><html><body><main><nav><button>';</script>`,
    ],
    ["real.htm", "<!doctype html><title>Real</title><main>real content</main>"],
  ]);
  const markupReport = {
    files: [...markupSources.keys()].map((path) => ({ path, kind: "htm" })),
    links: [],
  };
  const fakeProfile = Page.profiles(markupReport, markupSources).find(
    (page) => page.path === "fake.htm",
  );
  assert.ok(
    !fakeProfile.reasons.some((reason) => /完整|主要內容|導覽|表單/.test(reason)),
    "script strings and attribute values are not page structure",
  );
  assert.equal(Page.pages(markupReport, markupSources)[0], "real.htm");
  const templateSources = new Map([
    [
      "template-only.htm",
      "<template><html><body><main><nav><form><input></template><p>fragment</p>",
    ],
  ]);
  const templateProfile = Page.profiles(
    { files: [{ path: "template-only.htm", kind: "htm" }], links: [] },
    templateSources,
  )[0];
  assert.ok(
    !templateProfile.reasons.some((reason) => /完整|主要內容|導覽|表單/.test(reason)),
    "template content is not an active document entry",
  );
  const page = Page.create({ entry: "index.html", sources, report });
  assert.equal(page.asset("./src/main.ts?v=1").path, "src/main.ts");
  assert.equal(page.resolve("pages/about.html", "../styles/a.css"), "styles/a.css");
  assert.equal(page.asset("main.ts", "src/").path, "src/main.ts");
  assert.equal(page.asset("https://other.invalid/same.js").path, null);
  assert.equal(page.asset("/src/main.ts").path, "src/main.ts");
  assert.equal(page.asset("./missing.js").source, undefined);
  const css = page.expandCSS(sources.get("styles/a.css"), "styles/a.css");
  assert.match(css, /@media screen and/);
  assert.match(css, /nested\{color:blue/);
  assert.ok(page.warnings.some((w) => w.includes("循環")));
  const scripts = page.scripts(["src/main.ts"]);
  assert.ok(scripts.some((f) => f.path === "src/nested/same.ts"));
  assert.ok(scripts.some((f) => f.path === "src/a/same.js"));
  assert.ok(scripts.some((f) => f.path === "src/app.css"));
  assert.ok(!scripts.some((f) => f.path === "assets/js/same.js"));
  assert.ok(page.warnings.some((w) => w.includes("react")));
  assert.throws(() => Page.create({ entry: "none.html", sources, report }), /HTML/);
  const huge = new Map(sources);
  huge.set("big.css", "x".repeat(768 * 1024 + 1));
  const limited = Page.create({ entry: "index.html", sources: huge, report });
  assert.equal(limited.asset("big.css").source, undefined);
  const entriesOnly = { files: [{ kind: "js", path: "src/main.js" }] };
  assert.deepEqual(Page.pages(entriesOnly), []);
  const specialSources = new Map([
    ["公司#1/main.html", "<main>hello</main>"],
    ["公司#1/app.js", "function hi(){}"],
  ]);
  const specialPage = Page.create({
    entry: "公司#1/main.html",
    sources: specialSources,
    report: { links: [] },
  });
  assert.equal(specialPage.asset("app.js").path, "公司#1/app.js");
  const textCSS = `body::before { content: '@import "x.css";'; }`;
  const cssSource = new Map([
    ["main.html", "<main>test</main>"],
    ["x.css", "p{color:red}"],
  ]);
  const cssPage = Page.create({
    entry: "main.html",
    sources: cssSource,
    report: { links: [] },
  });
  assert.equal(
    cssPage.expandCSS(textCSS, "main.css"),
    textCSS,
    "CSS import examples inside strings must remain literal",
  );
  const deepSource = new Map([["main.html", "<main>test</main>"]]);
  for (let i = 0; i < 18; i++)
    deepSource.set(`s${i}.css`, `@import "s${i + 1}.css";@import "s${i + 1}.css";`);
  deepSource.set("s18.css", "p{color:red}");
  const deep = Page.create({
    entry: "main.html",
    sources: deepSource,
    report: { links: [] },
  });
  deep.expandCSS(deepSource.get("s0.css"), "s0.css");
  assert.ok(
    deep.warnings.some((w) => /工作量|匯入數|展開.*上限/.test(w)),
    "repeated imports must have a global work budget",
  );
  console.log(
    "PASS content-based discovery (custom .htm entry, no index, redirect/test penalties, incoming links), nested/root/base paths, duplicate basenames, local module graph, CSS imports/media/cycles, external isolation, missing files, size limits and no-HTML projects",
  );
})();
