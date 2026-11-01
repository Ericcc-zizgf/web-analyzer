const assert = require("node:assert/strict");
const core = require("../frontend/project-core.js");
const SourceUtils = require("../frontend/source-utils.js");
const babel = require("../frontend/vendor/babel.js");
const parse = (source, ext) =>
  babel.parsers[/^tsx?$/.test(ext) ? "babel-ts" : "babel"].parse(source, {});
const entry = (path, source) => ({
  path,
  source,
  size: source === null ? 8 : Buffer.byteLength(source),
});
(async () => {
  const input = {
    root: "demo",
    bytes: 100,
    skipped: [{ path: "vendor/helper.js", reason: "vendor" }],
    entries: [
      entry(
        "index.html",
        '<title>我的作品</title><script src="./src/main.tsx"></script><link href="./styles/site.css"><img src="./assets/a.png"><a href="./missing.html">missing</a>',
      ),
      entry(
        "src/main.tsx",
        `import React from 'react'; import App from './App'; import './theme.css'; import alias from '@/api'; export function main(): number { return 1; } const x = () => fetch('/api/notes'); document.querySelector('#app')?.addEventListener('click', x); const text="import phantom from './ghost.js'"; // import fake from './comment.js'
 const worker = new Worker('./worker.js');`,
      ),
      entry("src/App.tsx", `export default function App(){return <div>Hello</div>}`),
      entry(
        "src/theme.css",
        '@import "../styles/site.css"; div { background: url(../assets/a.png); }',
      ),
      entry("src/worker.js", "self.onmessage = () => 1"),
      entry("styles/site.css", "@media(max-width:600px){.card{display:flex}}"),
      entry("assets/a.png", null),
      entry("a/same.js", "export const a=1"),
      entry("b/same.js", "export const b=2"),
      entry("broken.js", "function {"),
      entry("server.py", "@app.get('/notes')\ndef notes():\n return []"),
      entry(
        "package.json",
        JSON.stringify({
          scripts: { dev: "vite" },
          dependencies: { react: "1", vite: "1" },
        }),
      ),
      entry(
        "main.js",
        "import './vendor/helper.js'; import('./a/same.js'); export {b} from './b/same.js';",
      ),
    ],
  };
  const report = await core.analyze(input, parse);
  const link = (from, reference) =>
    report.links.find((l) => l.from === from && l.reference === reference);
  assert.equal(link("src/main.tsx", "./App").target, "src/App.tsx");
  assert.equal(link("src/main.tsx", "react").status, "package");
  assert.ok(
    report.files.find((f) => f.path === "src/main.tsx").signals.includes("事件互動"),
  );
  assert.equal(link("src/main.tsx", "@/api").status, "unresolved");
  assert.equal(link("src/main.tsx", "./worker.js").target, "src/worker.js");
  assert.equal(link("src/main.tsx", "./ghost.js"), undefined);
  assert.equal(link("src/main.tsx", "./comment.js"), undefined);
  assert.equal(link("src/theme.css", "../assets/a.png").target, "assets/a.png");
  assert.equal(link("main.js", "./vendor/helper.js").status, "skipped");
  assert.equal(link("main.js", "./a/same.js").target, "a/same.js");
  assert.equal(link("main.js", "./b/same.js").target, "b/same.js");
  assert.equal(link("index.html", "./missing.html").status, "missing");
  assert.ok(report.files.find((f) => f.path === "broken.js").diagnostics.length);
  assert.match(report.files.find((f) => f.path === "server.py").role, /後端/);
  assert.deepEqual(report.frameworks, ["react", "vite"]);
  assert.equal(
    report.files
      .find((f) => f.path === "src/main.tsx")
      .functions.find((f) => f.name === "main").line,
    1,
  );
  assert.ok(core.exclusion(".env.local"));
  assert.ok(core.exclusion("src/.env"));
  assert.ok(core.exclusion("secrets.json"));
  assert.equal(core.normalize("../../outside.js"), null);
  const fake = (path, source = "hi", size = source.length) => ({
    webkitRelativePath: path,
    name: path.split("/").at(-1),
    size,
    text: async () => source,
  });
  let reads = 0;
  const secret = fake("demo/.env");
  secret.text = async () => {
    reads++;
    return "secret";
  };
  const collected = await core.collect([
    fake("demo/index.html"),
    fake("demo/a/x.js"),
    secret,
    fake("demo/node_modules/a.js"),
    fake("demo/big.js", "x", 800000),
    fake("demo/a.png"),
  ]);
  assert.equal(reads, 0);
  assert.equal(collected.root, "demo");
  assert.equal(collected.skipped.length, 3);
  assert.equal(collected.entries.find((e) => e.path === "a.png").source, null);
  await assert.rejects(
    () =>
      core.collect(
        [fake("demo/a.js")],
        () => {},
        () => true,
      ),
    /取消/,
  );
  const tokens = SourceUtils.htmlTags(`<title>literal <a href="bad"> title</title>
<script>const x='<a href="bad">'</script>
<style>p{content:'<a href="bad">'}</style>
<textarea><script src="bad"></textarea>
<A data-href="bad" HREF='real&#46;htm?x=1&amp;y=2' title="a > b">`);
  assert.deepEqual(
    tokens.map((t) => t.name),
    ["title", "script", "style", "textarea", "a"],
  );
  assert.equal(tokens.at(-1).attrs.href, "real.htm?x=1&y=2");
  assert.equal(tokens.at(-1).attrs.title, "a > b");
  assert.equal(tokens.at(-1).line, 5);
  assert.deepEqual(
    SourceUtils.cssImports(
      `p{content:'@import "bad.css";'} /* @import "comment.css"; */ @import url('real.css') screen;`,
    ).map((i) => [i.reference, i.conditions]),
    [["real.css", "screen"]],
  );
  const templateTags = SourceUtils.htmlTags(
    '<template><body id="fake"><template><base href="wrong/"></template></body></template><body id="real">',
  );
  assert.deepEqual(
    templateTags
      .filter((t) => t.name === "body")
      .map((t) => [t.attrs.id, t.templateDepth]),
    [
      ["fake", 1],
      ["real", 0],
    ],
  );
  const templateReport = await core.analyze(
    {
      root: "t",
      bytes: 0,
      skipped: [],
      entries: [
        entry(
          "main.html",
          '<template><base href="wrong/"><a href="fake.htm">fake</a></template><base href="pages/"><a href="detail.htm">real</a>',
        ),
        entry("pages/detail.htm", "real"),
      ],
    },
    parse,
  );
  assert.equal(templateReport.links[0].target, "pages/detail.htm");
  assert.equal(templateReport.links.length, 1);
  const namedRoot = await core.collect([
    fake("專案/main.html", '<script src="/app.js"></script>'),
    fake("專案/app.js", "function hi(){}"),
  ]);
  assert.deepEqual(
    namedRoot.entries.map((e) => e.path),
    ["main.html", "app.js"],
    "folder named 專案 must still strip its root",
  );
  const edgeInput = {
    root: "edge",
    bytes: 0,
    skipped: [],
    entries: [
      entry(
        "main.html",
        `<BASE HREF="pages/"><!-- <a href="fake.htm">ignored</a> --><script>const fake='<a href="fake.htm">';</script><SCRIPT data-src="wrong.js" SRC=../app.js></SCRIPT><A HREF="detail.htm?x=1&amp;y=2">Detail</A><img src=../logo>`,
      ),
      entry("pages/detail.htm", "<main>detail</main>"),
      entry("app.js", ""),
      entry("logo.js", ""),
      entry(
        "many.js",
        Array.from({ length: 151 }, (_, i) => `function f${i}(){}`).join("\n"),
      ),
      entry(
        "many-imports.js",
        Array.from({ length: 301 }, (_, i) => `import './m${i}.js';`).join("\n"),
      ),
      entry(
        "demo.css",
        `p:before{content:'@import "fake.css";'} /* @import "comment.css"; */ @import "real.css";`,
      ),
      entry("real.css", "p{color:red}"),
    ],
  };
  const edge = await core.analyze(edgeInput, parse);
  const edgeLinks = edge.links.filter((l) => l.from === "main.html");
  assert.equal(edgeLinks.find((l) => l.reference === "../app.js").target, "app.js");
  assert.equal(
    edgeLinks.find((l) => l.reference === "detail.htm?x=1&y=2").target,
    "pages/detail.htm",
  );
  assert.equal(
    edgeLinks.find((l) => l.reference === "detail.htm?x=1&y=2").kind,
    "頁面連結",
  );
  assert.ok(!edgeLinks.some((l) => /wrong|fake/.test(l.reference)));
  assert.equal(edgeLinks.find((l) => l.reference === "../logo").status, "missing");
  assert.equal(edge.files.find((f) => f.path === "many.js").counts.functions, 151);
  assert.ok(
    edge.files
      .find((f) => f.path === "many.js")
      .diagnostics.some((d) => d.includes("150")),
  );
  assert.equal(
    edge.files.find((f) => f.path === "many-imports.js").counts.references,
    301,
  );
  assert.ok(
    edge.files
      .find((f) => f.path === "many-imports.js")
      .diagnostics.some((d) => d.includes("300")),
  );
  assert.deepEqual(
    edge.links
      .filter((l) => l.from === "demo.css" && l.kind === "樣式匯入")
      .map((l) => l.reference),
    ["real.css"],
  );
  console.log(
    "PASS AST JS/TS/JSX, functions, module references, CSS assets, same names, missing/skipped files, package detection, Python routes, syntax errors, exclusion before read, limits and cancellation",
  );
})();
