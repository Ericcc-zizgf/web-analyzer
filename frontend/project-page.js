/* Resolve one selected HTML page and its dependencies from an in-memory folder snapshot. */
(function (scope) {
  "use strict";
  const SourceUtils =
    typeof module !== "undefined" && module.exports
      ? require("./source-utils.js")
      : scope.SourceUtils;
  const bytes = (text) => new TextEncoder().encode(text).length;
  // Rank document content and navigation evidence, never a privileged filename.
  function profiles(report, sources) {
    const candidates = report.files.filter(
      (f) =>
        /^html?$/.test(f.kind) && (!sources || typeof sources.get(f.path) === "string"),
    );
    const paths = new Set(candidates.map((f) => f.path));
    const incoming = new Map(),
      outgoing = new Map();
    for (const link of report.links || []) {
      if (
        link.kind !== "頁面連結" ||
        !paths.has(link.from) ||
        !paths.has(link.target) ||
        link.from === link.target
      )
        continue;
      if (!incoming.has(link.target)) incoming.set(link.target, new Set());
      if (!outgoing.has(link.from)) outgoing.set(link.from, new Set());
      incoming.get(link.target).add(link.from);
      outgoing.get(link.from).add(link.target);
    }
    return candidates
      .map((file) => {
        const source = sources?.get(file.path) || "";
        const tags = SourceUtils.htmlTags(source).filter(
          (tag) => tag.templateDepth === 0,
        );
        const clean = source.replace(/<!--[\s\S]*?-->/g, "");
        const titleTag = tags.find((tag) => tag.name === "title");
        const title = titleTag
          ? SourceUtils.decodeEntities(
              source.slice(titleTag.contentStart, titleTag.contentEnd),
            ).trim()
          : "";
        const body = clean.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
        const text = body
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const full =
          tags.some((tag) => ["html", "body"].includes(tag.name)) ||
          /^\s*<!doctype\s+html\b/i.test(clean);
        const main = tags.some((tag) => tag.name === "main" || tag.attrs.role === "main");
        const nav = tags.some(
          (tag) => tag.name === "nav" || tag.attrs.role === "navigation",
        );
        const controls = tags.filter((tag) =>
          ["form", "button", "input", "select", "textarea"].includes(tag.name),
        ).length;
        const resources = tags.filter((tag) =>
          ["script", "link"].includes(tag.name),
        ).length;
        const incomingCount = incoming.get(file.path)?.size || 0;
        const outgoingCount = outgoing.get(file.path)?.size || 0;
        const reasons = [];
        let score =
          Math.min(12, Math.sqrt(text.length) / 2) +
          Math.min(8, controls * 2) +
          Math.min(6, resources);
        if (full) {
          score += 8;
          reasons.push("完整 HTML 文件");
        }
        if (main) {
          score += 10;
          reasons.push("包含主要內容區");
        }
        if (nav) {
          score += 6;
          reasons.push("包含導覽區");
        }
        if (controls) reasons.push("包含 " + controls + " 個表單／操作元素");
        if (incomingCount) {
          score += Math.min(16, incomingCount * 4);
          reasons.push("被 " + incomingCount + " 個頁面連入");
        }
        if (outgoingCount) {
          score += Math.min(9, outgoingCount * 3);
          reasons.push("連到 " + outgoingCount + " 個頁面");
        }
        if (!full && !main) {
          score -= 10;
          reasons.push("可能是 HTML 片段");
        }
        if (
          /(?:^|\/)(?:tests?|fixtures?|examples?|demos?|__tests__)(?:\/|$)/i.test(
            file.path,
          )
        ) {
          score -= 25;
          reasons.push("位於測試／範例目錄");
        }
        if (
          tags.some(
            (tag) =>
              tag.name === "meta" && tag.attrs["http-equiv"]?.toLowerCase() === "refresh",
          )
        ) {
          score -= 25;
          reasons.push("轉址頁面");
        }
        if (!reasons.length) reasons.push("依可讀內容與資源標籤推測");
        return {
          path: file.path,
          title: title || file.path,
          score: Math.round(score * 10) / 10,
          reasons,
          incoming: incomingCount,
          outgoing: outgoingCount,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.path.split("/").length - b.path.split("/").length ||
          a.path.localeCompare(b.path),
      );
  }
  function pages(report, sources) {
    return profiles(report, sources).map((page) => page.path);
  }
  function create({ entry, sources, report }) {
    if (
      !(sources instanceof Map) ||
      typeof sources.get(entry) !== "string" ||
      !/\.html?$/i.test(entry)
    )
      throw Error("請選擇資料夾中可讀取的 HTML 頁面。");
    const warnings = [],
      used = new Set(),
      loadedScripts = new Set();
    let total = bytes(sources.get(entry));
    const warn = (text) => {
      if (warnings.length < 80 && !warnings.includes(text)) warnings.push(text);
    };
    function resolve(from, reference, base) {
      try {
        const origin = "https://project.invalid";
        const parent = new URL(
          from.split("/").map(encodeURIComponent).join("/"),
          origin + "/",
        );
        const url = new URL(reference, base ? new URL(base, parent) : parent);
        if (url.origin !== origin || !["https:"].includes(url.protocol)) return null;
        const path = decodeURIComponent(url.pathname).replace(/^\//, "");
        const candidate = [
          path,
          ...(!/\.[^/]+$/.test(path)
            ? [
                ".js",
                ".mjs",
                ".ts",
                ".tsx",
                ".jsx",
                "/index.js",
                "/index.ts",
                "/index.tsx",
              ].map((ext) => path + ext)
            : []),
        ].find((p) => typeof sources.get(p) === "string");
        return candidate || null;
      } catch (_) {
        return null;
      }
    }
    function read(path) {
      const source = sources.get(path);
      if (typeof source !== "string") return undefined;
      if (bytes(source) > 768 * 1024) {
        warn(path + "：單檔超過 768 KB，未載入。");
        return undefined;
      }
      if (!used.has(path)) {
        if (used.size >= 60) {
          warn("單頁依賴超過 60 份，其餘未載入。");
          return undefined;
        }
        if (total + bytes(source) > 8 * 1024 * 1024) {
          warn("單頁 HTML 與依賴合計超過 8 MB，其餘未載入。");
          return undefined;
        }
        used.add(path);
        total += bytes(source);
      }
      return source;
    }
    function asset(reference, base) {
      const path = resolve(entry, reference, base);
      if (!path) return { path: null, source: undefined };
      return { path, source: read(path) };
    }
    let cssWork = 0;
    function expandCSS(source, from, stack = []) {
      if (stack.includes(from) || stack.length >= 20) {
        warn(from + "：循環或過深的 CSS @import，已停止展開。");
        return "";
      }
      let result = "",
        cursor = 0,
        size = bytes(source);
      for (const item of SourceUtils.cssImports(source)) {
        result += source.slice(cursor, item.start);
        cursor = item.end;
        if (++cssWork > 2000) {
          warn("CSS 匯入展開工作量超過 2,000 筆，已停止其餘匯入。");
          continue;
        }
        const conditions = item.conditions.replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (/\b(?:layer|supports)\b/i.test(conditions)) {
          warn(from + "：含 layer／supports 的 CSS @import 暫未展開。");
          continue;
        }
        const target = resolve(from, item.reference),
          imported = target ? read(target) : undefined;
        if (imported === undefined) {
          warn(from + " → " + item.reference + "：未能從資料夾載入 CSS @import。");
          continue;
        }
        const expanded = expandCSS(imported, target, [...stack, from]);
        size += bytes(expanded);
        if (size > 2 * 1024 * 1024) {
          warn(from + "：展開後 CSS 超過 2 MB，已略過部分匯入。");
          continue;
        }
        result += conditions
          ? "@media " + conditions + " {\n" + expanded + "\n}"
          : expanded;
      }
      return result + source.slice(cursor);
    }
    function scripts(roots) {
      const found = [],
        queue = [...roots],
        seen = new Set();
      while (queue.length) {
        const from = queue.shift();
        if (seen.has(from)) continue;
        seen.add(from);
        const refs = report.links.filter((l) => l.from === from && /模組/.test(l.kind));
        for (const ref of refs) {
          const target =
            ref.target ||
            (/^\//.test(ref.reference) ? resolve(from, ref.reference) : null);
          if (!target) {
            warn(from + " → " + ref.reference + "：套件、別名或動態模組未展開。");
            continue;
          }
          if (!/\.(?:js|mjs|cjs|jsx|ts|tsx|css)$/i.test(target)) {
            warn(target + "：這種依賴類型尚未展開。");
            continue;
          }
          if (loadedScripts.has(target)) continue;
          const source = read(target);
          if (source === undefined) continue;
          loadedScripts.add(target);
          found.push({
            path: target,
            source,
            kind: /\.css$/i.test(target) ? "css" : "js",
          });
          queue.push(target);
        }
      }
      return found;
    }
    return {
      entry,
      html: sources.get(entry),
      warnings,
      resolve,
      asset,
      read,
      expandCSS,
      scripts,
      loadedScripts,
    };
  }
  const api = { pages, profiles, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ProjectPage = api;
})(globalThis);
