/* Static project analysis. Input is source data; it is never executed. */
(function (scope) {
  "use strict";
  const SourceUtils =
    typeof module !== "undefined" && module.exports
      ? require("./source-utils.js")
      : scope.SourceUtils;
  const LIMITS = { files: 1500, perFile: 768 * 1024, total: 16 * 1024 * 1024 };
  const ignored = new Set([
    "node_modules",
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "dist",
    "build",
    "coverage",
    ".next",
    "vendor",
  ]);
  const textExtensions =
    /\.(html?|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|vue|svelte|json|md|txt|py|ya?ml)$/i;
  function normalize(path) {
    const parts = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) return null;
        parts.pop();
      } else parts.push(part);
    }
    return parts.join("/");
  }
  function exclusion(path) {
    const parts = path.split("/"),
      name = parts.at(-1);
    if (parts.some((p) => ignored.has(p))) return "套件、版本紀錄或產生的檔案";
    if (
      parts.some((p) => p.startsWith(".env")) ||
      /(?:^|[._-])(secrets?|credentials?)(?:[._-]|$)/i.test(name) ||
      /\.(pem|key|p12|pfx)$/i.test(name)
    )
      return "環境設定或可能含憑證";
    if (
      /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|\.DS_Store)$/.test(name)
    )
      return "鎖定檔或系統檔";
    return null;
  }
  async function collect(files, progress = () => {}, cancelled = () => false) {
    if (files.length > 20000)
      throw Error("選取的資料夾超過 20,000 個檔案，請改選較小的專案。");
    const entries = [],
      skipped = [];
    let bytes = 0;
    const paths = files.map((file) => file.webkitRelativePath || file.name);
    const roots = new Set(
      paths.filter((p) => p.includes("/")).map((p) => p.split("/")[0]),
    );
    const hasRoot = roots.size === 1 && paths.every((p) => p.includes("/"));
    const root = hasRoot ? [...roots][0] : "專案";
    for (let i = 0; i < files.length; i++) {
      if (cancelled()) throw Error("已取消分析");
      const file = files[i],
        raw = paths[i];
      const path = normalize(hasRoot ? raw.slice(root.length + 1) : raw);
      if (!path) {
        skipped.push({ path: raw, reason: "無效路徑" });
        continue;
      }
      let reason = exclusion(path);
      if (!reason && file.size > LIMITS.perFile) reason = "超過單檔 768 KB";
      if (!reason && entries.length >= LIMITS.files) reason = "超過 1,500 個檔案上限";
      if (!reason && textExtensions.test(path) && bytes + file.size > LIMITS.total)
        reason = "超過文字合計 16 MB";
      if (reason) {
        skipped.push({ path, reason });
        continue;
      }
      let source = null,
        readError = null;
      if (textExtensions.test(path)) {
        try {
          source = await file.text();
          if (source.includes("\0")) {
            source = null;
            readError = "二進位內容，僅記錄檔名";
          } else bytes += file.size;
        } catch (_) {
          readError = "檔案無法讀取";
        }
      }
      entries.push({ path, size: file.size, source, readError });
      if (i % 25 === 0) {
        progress(i + 1, files.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return { root, entries, skipped, bytes };
  }
  async function analyze(input, parseJS) {
    const files = [],
      links = [];
    for (const entry of input.entries) {
      const { path, source } = entry,
        ext = path.split(".").at(-1).toLowerCase(),
        base = path.split("/").at(-1);
      const file = {
        path,
        size: entry.size,
        kind: ext,
        role: "尚無足夠線索判斷職責",
        evidence: [],
        functions: [],
        exports: [],
        references: [],
        signals: [],
        diagnostics: [],
        counts: { functions: 0, references: 0 },
        truncated: [],
        lines: source === null ? null : source.split("\n").length,
      };
      const add = (reference, line, kind) => {
        if (reference) file.counts.references++;
        if (reference && file.references.length < 300)
          file.references.push({ reference, line, kind });
      };
      const evidence = (line, text) => {
        if (file.evidence.length < 20) file.evidence.push({ line, text });
      };
      const scan = (pattern, callback) => {
        for (const m of source.matchAll(pattern))
          callback(m, source.slice(0, m.index).split("\n").length);
      };
      if (entry.readError) file.diagnostics.push(entry.readError);
      if (source !== null) {
        if (/^(js|jsx|mjs|cjs|ts|tsx)$/.test(ext)) {
          file.role = "JavaScript／TypeScript 程式模組";
          try {
            const ast = await parseJS(source, ext);
            let visited = 0;
            function walk(node, parent) {
              if (!node || typeof node !== "object") return;
              if (++visited > 200000) throw Error("語法樹過大，已停止此檔解析");
              const line = node.loc?.start.line || 1;
              if (
                [
                  "FunctionDeclaration",
                  "FunctionExpression",
                  "ArrowFunctionExpression",
                  "ObjectMethod",
                  "ClassMethod",
                ].includes(node.type)
              ) {
                file.counts.functions++;
                const name =
                  node.id?.name || node.key?.name || parent?.id?.name || "匿名回呼";
                if (file.functions.length < 150)
                  file.functions.push({ name, line, async: !!node.async });
              }
              const literal = (n) => (typeof n?.value === "string" ? n.value : null);
              if (
                [
                  "ImportDeclaration",
                  "ExportNamedDeclaration",
                  "ExportAllDeclaration",
                ].includes(node.type) &&
                node.source
              )
                add(literal(node.source), line, "模組");
              if (node.type === "ImportExpression")
                add(literal(node.source), line, "動態模組");
              if (node.type === "ExportDefaultDeclaration")
                file.exports.push({ name: "default", line });
              if (node.type === "ExportNamedDeclaration") {
                if (node.declaration?.id)
                  file.exports.push({ name: node.declaration.id.name, line });
                for (const d of node.declaration?.declarations || [])
                  if (d.id?.name) file.exports.push({ name: d.id.name, line });
                for (const s of node.specifiers || [])
                  file.exports.push({
                    name: s.exported?.name || s.exported?.value,
                    line,
                  });
              }
              if (
                node.type === "CallExpression" ||
                node.type === "OptionalCallExpression" ||
                node.type === "NewExpression"
              ) {
                const callee = node.callee,
                  prop = callee?.property?.name,
                  name = callee?.name,
                  arg = literal(node.arguments?.[0]);
                if (name === "require" || callee?.type === "Import")
                  add(arg, line, "模組");
                if (name === "importScripts")
                  for (const argument of node.arguments || [])
                    add(literal(argument), line, "Worker 模組");
                if (name === "Worker") add(arg, line, "Worker");
                if (name === "URL") add(arg, line, "資源");
                if (name === "fetch" || prop === "fetch") {
                  file.signals.push("HTTP 請求");
                  evidence(line, "fetch：" + (arg || "動態網址"));
                }
                if (prop === "addEventListener") {
                  file.signals.push("事件互動");
                  evidence(line, "事件：" + (arg || "動態事件"));
                }
                if (
                  ["querySelector", "querySelectorAll", "getElementById"].includes(prop)
                ) {
                  file.signals.push("DOM 操作");
                  evidence(line, prop + "：" + (arg || "動態元素"));
                }
                if (
                  ["createRoot", "createApp", "hydrateRoot"].includes(name) ||
                  ["createRoot", "createApp", "hydrateRoot"].includes(prop) ||
                  (prop === "render" && callee.object?.name === "ReactDOM")
                ) {
                  file.signals.push("畫面入口");
                  evidence(line, "掛載應用程式：" + (name || prop));
                }
                if (
                  ["getItem", "setItem", "removeItem"].includes(prop) &&
                  ["localStorage", "sessionStorage"].includes(callee?.object?.name)
                ) {
                  file.signals.push("瀏覽器儲存");
                  evidence(line, callee.object.name + "." + prop);
                }
                if (prop === "listen") {
                  file.signals.push("伺服器入口");
                  evidence(line, "呼叫 listen 啟動伺服器");
                }
              }
              for (const [key, value] of Object.entries(node)) {
                if (["loc", "tokens", "comments", "errors", "start", "end"].includes(key))
                  continue;
                if (Array.isArray(value)) {
                  for (const v of value) if (v?.type) walk(v, node);
                } else if (value?.type) walk(value, node);
              }
            }
            walk(ast, null);
            file.signals = [...new Set(file.signals)];
            if (file.signals.length) file.role = file.signals.join("、") + "的程式模組";
            else if (
              /^[A-Z]/.test(base) ||
              /\/(components|views|pages)\//.test("/" + path)
            )
              file.role = "畫面／元件模組（依檔名與所在資料夾推測）";
          } catch (e) {
            file.diagnostics.push("JS／TS 語法解析未完成：" + e.message.slice(0, 200));
          }
        } else if (/^html?$/.test(ext)) {
          file.role = "網頁入口與 HTML 畫面結構";
          const tags = SourceUtils.htmlTags(source).filter(
            (tag) => tag.templateDepth === 0,
          );
          const title = tags.find((tag) => tag.name === "title");
          if (title)
            evidence(
              title.line,
              "頁面標題：" +
                SourceUtils.decodeEntities(
                  source.slice(title.contentStart, title.contentEnd),
                ),
            );
          const baseTag = tags.find(
            (tag) =>
              tag.name === "base" &&
              Object.prototype.hasOwnProperty.call(tag.attrs, "href"),
          );
          if (baseTag) file.base = baseTag.attrs.href;
          for (const tag of tags) {
            const attr =
              tag.name === "a" || tag.name === "link"
                ? "href"
                : ["script", "img", "iframe", "source"].includes(tag.name)
                  ? "src"
                  : null;
            if (attr && tag.attrs[attr])
              add(tag.attrs[attr], tag.line, tag.name === "a" ? "頁面連結" : "資源");
          }
          evidence(1, "依 HTML 標籤辨識；不執行內嵌腳本");
        } else if (/^(css|scss|sass|less)$/.test(ext)) {
          file.role = "視覺樣式、版面配置與響應式規則";
          for (const item of SourceUtils.cssImports(source))
            add(item.reference, item.line, "樣式匯入");
          scan(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi, (m, line) =>
            add(m[1], line, "樣式資源"),
          );
          const media = (source.match(/@media\b/g) || []).length;
          if (media) evidence(1, "包含 " + media + " 組 @media 響應式條件");
          for (const m of source.matchAll(/([^{}]+)\{/g)) {
            if (file.evidence.length >= 6) break;
            evidence(
              source.slice(0, m.index).split("\n").length,
              m[1].trim().slice(0, 160),
            );
          }
        } else if (ext === "json") {
          file.role = "結構化資料／設定";
          try {
            const data = JSON.parse(source);
            if (base === "package.json") {
              file.role = "套件清單與開發／建置指令";
              file.package = {
                name: data.name,
                scripts: data.scripts || {},
                dependencies: Object.keys({
                  ...data.dependencies,
                  ...data.devDependencies,
                }),
              };
              for (const [name, cmd] of Object.entries(data.scripts || {}))
                evidence(1, name + " → " + cmd);
            } else if (base.startsWith("tsconfig"))
              file.role = "TypeScript 編譯與模組解析設定";
          } catch (e) {
            file.diagnostics.push(
              "不是標準 JSON（JSONC 註解等也可能造成）：" + e.message.slice(0, 100),
            );
          }
        } else if (ext === "py") {
          file.role = "Python 程式模組（文字線索分析）";
          scan(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/gm, (m, line) => {
            file.counts.functions++;
            if (file.functions.length < 150) file.functions.push({ name: m[1], line });
          });
          scan(/^\s*@\w+\.(get|post|put|delete|route)\(["']([^"']+)/gm, (m, line) => {
            file.role = "後端 HTTP 路由與請求處理";
            evidence(line, m[1].toUpperCase() + " " + m[2]);
          });
        } else if (/^(vue|svelte)$/.test(ext)) {
          file.role = "畫面元件（模板／樣式／腳本混合檔）";
          file.diagnostics.push("目前只辨識檔案類型，未展開框架模板與內嵌腳本。");
        } else if (/^(md|txt)$/.test(ext))
          file.role = /readme/i.test(base)
            ? "專案介紹與啟動操作說明"
            : "說明文件／文字資料";
        else if (/ya?ml/.test(ext)) file.role = "工具或工作流程設定（依副檔名推測）";
        if (/(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\./i.test(path))
          file.role = "自動化測試與驗證";
        if (
          /(?:vite|webpack|next|eslint|prettier|postcss|tailwind)\.config\./i.test(base)
        )
          file.role = "開發工具／建置設定";
      } else if (!entry.readError)
        file.role = "圖片、字型或其他資源（僅記錄檔名，未讀取內容）";
      for (const [kind, limit] of [
        ["functions", 150],
        ["references", 300],
      ]) {
        if (file.counts[kind] > file[kind].length) {
          file.truncated.push(kind);
          file.diagnostics.push(
            (kind === "functions" ? "函式" : "引用") +
              "共 " +
              file.counts[kind] +
              " 筆，目前只列前 " +
              limit +
              " 筆，分析關係可能不完整。",
          );
        }
      }
      file.evidence = file.evidence.slice(0, 20);
      file.signals = [...new Set(file.signals)];
      files.push(file);
    }
    const known = new Set(files.map((f) => f.path));
    const all = new Set(
      input.entries.map((e) => e.path).concat(input.skipped.map((e) => e.path)),
    );
    const extensionCandidates = [
      "",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".cjs",
      ".json",
      ".css",
      ".vue",
      ".svelte",
      "/index.js",
      "/index.jsx",
      "/index.ts",
      "/index.tsx",
      "/index.html",
    ];
    for (const file of files)
      for (const ref of file.references) {
        const raw = ref.reference;
        let status = "missing",
          target = null;
        const isModule = ref.kind.includes("模組");
        if (raw.startsWith("#")) status = isModule ? "unresolved" : "external";
        else if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) status = "external";
        else if (raw.includes("${") || (/^[~@]/.test(raw) && !raw.startsWith("@")))
          status = "unresolved";
        else if (isModule && !raw.startsWith(".") && !raw.startsWith("/"))
          status = /^(?:@\/|~\/|#)/.test(raw) ? "unresolved" : "package";
        else {
          let stem = null;
          try {
            const origin = "https://project.invalid";
            const parent = new URL(
              file.path.split("/").map(encodeURIComponent).join("/"),
              origin + "/",
            );
            const url = new URL(raw, file.base ? new URL(file.base, parent) : parent);
            if (url.origin !== origin) status = "external";
            else stem = normalize(decodeURIComponent(url.pathname).replace(/^\//, ""));
          } catch (_) {}
          if (stem !== null) {
            const candidates = (isModule ? extensionCandidates : [""]).map(
              (ext) => stem + ext,
            );
            target = candidates.find((p) => known.has(p)) || null;
            if (target) status = "resolved";
            else if (candidates.some((p) => all.has(p))) status = "skipped";
          }
          if (!target && status === "missing" && raw.startsWith("/"))
            status = "unresolved";
        }
        links.push({ from: file.path, ...ref, target, status });
      }
    const frameworks = new Set();
    for (const f of files)
      for (const dep of f.package?.dependencies || [])
        if (["react", "vue", "svelte", "next", "vite", "express", "astro"].includes(dep))
          frameworks.add(dep);
    const entries = files
      .filter(
        (f) =>
          /^html?$/.test(f.kind) ||
          f.signals.includes("畫面入口") ||
          f.signals.includes("伺服器入口"),
      )
      .map((f) => f.path);
    return {
      version: 1,
      root: input.root,
      mode: "local-static-project",
      files,
      links,
      skipped: input.skipped,
      bytes: input.bytes,
      frameworks: [...frameworks],
      entries,
      limitations: [
        "職責依語法、檔案類型與命名推斷，不代表完整業務邏輯。",
        "JS／TS 使用語法樹；HTML／CSS／Python 使用靜態文字線索，可能包含註解或範例。",
        "尚未展開框架模板、執行時動態引用與別名設定；根路徑可能對應 public 或伺服器路由，列為待確認。",
        "資料夾只讀取這次選取的快照；修改後請重新選取。來源程式不會執行或上傳。",
      ],
    };
  }
  const api = { LIMITS, normalize, exclusion, collect, analyze };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ProjectCore = api;
})(globalThis);
