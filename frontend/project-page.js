/* Resolve one selected HTML page and its dependencies from an in-memory folder snapshot. */
(function (scope) {
  "use strict";
  const bytes = (text) => new TextEncoder().encode(text).length;
  function pages(report, sources) {
    return report.files
      .filter(
        (f) =>
          /^html?$/.test(f.kind) && (!sources || typeof sources.get(f.path) === "string"),
      )
      .map((f) => f.path)
      .sort((a, b) => {
        const rank = (p) =>
          p === "index.html"
            ? 0
            : p === "index.htm"
              ? 1
              : /(^|\/)index\.html?$/.test(p)
                ? 2
                : 3;
        return (
          rank(a) - rank(b) ||
          a.split("/").length - b.split("/").length ||
          a.localeCompare(b)
        );
      });
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
        const parent = new URL(from, origin + "/");
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
    function expandCSS(source, from, stack = []) {
      if (stack.includes(from) || stack.length >= 20) {
        warn(from + "：循環或過深的 CSS @import，已停止展開。");
        return "";
      }
      let size = bytes(source);
      const result = source.replace(
        /\/\*[\s\S]*?\*\/|@import\s+(?:url\(\s*["']?([^"'\s)]+)["']?\s*\)|["']([^"']+)["'])\s*([^;]*);/gi,
        (match, url, quoted, conditions) => {
          if (match.startsWith("/*")) return match;
          const reference = url || quoted;
          if (/\b(?:layer|supports)\b/i.test(conditions)) {
            warn(from + "：含 layer／supports 的 CSS @import 暫未展開。");
            return "";
          }
          const target = resolve(from, reference);
          const imported = target ? read(target) : undefined;
          if (imported === undefined) {
            warn(from + " → " + reference + "：未能從資料夾載入 CSS @import。");
            return "";
          }
          const expanded = expandCSS(imported, target, [...stack, from]);
          size += bytes(expanded);
          if (size > 2 * 1024 * 1024) {
            warn(from + "：展開後 CSS 超過 2 MB，已略過部分匯入。");
            return "";
          }
          return conditions.trim()
            ? "@media " + conditions.trim() + " {\n" + expanded + "\n}"
            : expanded;
        },
      );
      return result;
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
  const api = { pages, create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ProjectPage = api;
})(globalThis);
