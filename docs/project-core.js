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
  const textExtensions = /\.(html?|css)$/i;
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
      /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|\.DS_Store)$/.test(
        name,
      )
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
      if (!reason && !textExtensions.test(path))
        reason = "非 HTML 或預覽樣式，已略過";
      if (!reason && file.size > LIMITS.perFile) reason = "超過單檔 768 KB";
      if (!reason && entries.length >= LIMITS.files)
        reason = "超過 1,500 個檔案上限";
      if (
        !reason &&
        textExtensions.test(path) &&
        bytes + file.size > LIMITS.total
      )
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
  const api = { collect, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.ProjectCore = api;
})(globalThis);
