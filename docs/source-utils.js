/* Small source-only tokenizers. Never put source markup into a live DOM. */
(function (scope) {
  "use strict";
  const named = {
    amp: "&",
    AMP: "&",
    lt: "<",
    LT: "<",
    gt: ">",
    GT: ">",
    quot: '"',
    QUOT: '"',
    apos: "'",
    nbsp: "\u00a0",
    colon: ":",
    sol: "/",
    period: ".",
    Tab: "\t",
    NewLine: "\n",
  };
  function decodeEntities(text) {
    return text.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]*);/gi, (whole, name) => {
      if (name[0] !== "#")
        return Object.prototype.hasOwnProperty.call(named, name) ? named[name] : whole;
      const value =
        name[1].toLowerCase() === "x"
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value)
        : "\ufffd";
    });
  }
  function htmlTags(source) {
    const tags = [];
    let cursor = 0,
      line = 1,
      previous = 0,
      templateDepth = 0;
    while (cursor < source.length) {
      const start = source.indexOf("<", cursor);
      if (start < 0) break;
      if (source.startsWith("<!--", start)) {
        const end = source.indexOf("-->", start + 4);
        cursor = end < 0 ? source.length : end + 3;
        continue;
      }
      const closeTemplate = /^<\/\s*template(?=[\s>])[^>]*>/i.exec(source.slice(start));
      if (closeTemplate) {
        templateDepth = Math.max(0, templateDepth - 1);
        cursor = start + closeTemplate[0].length;
        continue;
      }
      const open = /^<([a-z][\w:-]*)(?=[\s/>])/i.exec(source.slice(start));
      if (!open) {
        cursor = start + 1;
        continue;
      }
      const name = open[1].toLowerCase(),
        attrs = Object.create(null);
      let i = start + open[0].length,
        closed = false;
      while (i < source.length) {
        while (/\s/.test(source[i] || "")) i++;
        if (source[i] === ">") {
          i++;
          closed = true;
          break;
        }
        if (source[i] === "/" && source[i + 1] === ">") {
          i += 2;
          closed = true;
          break;
        }
        const attrStart = i;
        while (i < source.length && !/[\s=/>]/.test(source[i])) i++;
        if (i === attrStart) {
          i++;
          continue;
        }
        const attribute = source.slice(attrStart, i).toLowerCase();
        while (/\s/.test(source[i] || "")) i++;
        let value = "";
        if (source[i] === "=") {
          i++;
          while (/\s/.test(source[i] || "")) i++;
          if (source[i] === '"' || source[i] === "'") {
            const quote = source[i++],
              begin = i;
            while (i < source.length && source[i] !== quote) i++;
            value = source.slice(begin, i);
            if (source[i] === quote) i++;
          } else {
            const begin = i;
            while (i < source.length && !/[\s>]/.test(source[i])) i++;
            value = source.slice(begin, i);
          }
        }
        if (!Object.prototype.hasOwnProperty.call(attrs, attribute))
          attrs[attribute] = decodeEntities(value);
      }
      if (!closed) break;
      line += (source.slice(previous, start).match(/\n/g) || []).length;
      previous = start;
      const tag = { name, attrs, start, end: i, line, templateDepth };
      tags.push(tag);
      if (name === "template") templateDepth++;
      cursor = i;
      if (["script", "style", "textarea", "title"].includes(name)) {
        const endTag = new RegExp("</\\s*" + name + "(?:\\s[^>]*)?>", "ig");
        endTag.lastIndex = i;
        const end = endTag.exec(source);
        tag.contentStart = i;
        tag.contentEnd = end ? end.index : source.length;
        cursor = end ? endTag.lastIndex : source.length;
      }
    }
    return tags;
  }
  const decodeCSS = (text) =>
    text.replace(/\\(?:\r\n|[\r\n\f])/g, "").replace(
      /\\([\da-f]{1,6})(?:\r\n|[ \t\r\n\f])?|\\([^\r\n\f])/gi,
      (_, hex, char) => {
        if (!hex) return char;
        const code = parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code) : "\ufffd";
      },
    );
  function cssImports(source) {
    const imports = [];
    let i = 0,
      depth = 0;
    const skipComment = (at) => {
      const end = source.indexOf("*/", at + 2);
      return end < 0 ? source.length : end + 2;
    };
    function skipSpace(at) {
      while (at < source.length) {
        if (/\s/.test(source[at])) at++;
        else if (source.startsWith("/*", at)) at = skipComment(at);
        else break;
      }
      return at;
    }
    function string(at) {
      const quote = source[at++];
      let value = "";
      while (at < source.length) {
        if (source[at] === "\\") {
          value += source[at++];
          if (at < source.length) value += source[at++];
        } else if (source[at] === quote) return { value: decodeCSS(value), end: at + 1 };
        else value += source[at++];
      }
      return null;
    }
    while (i < source.length) {
      if (source.startsWith("/*", i)) {
        i = skipComment(i);
        continue;
      }
      if (source[i] === '"' || source[i] === "'") {
        i = string(i)?.end || source.length;
        continue;
      }
      if (source[i] === "{") {
        depth++;
        i++;
        continue;
      }
      if (source[i] === "}") {
        depth = Math.max(0, depth - 1);
        i++;
        continue;
      }
      if (depth !== 0 || source[i] !== "@" || !/^@import\b/i.test(source.slice(i))) {
        i++;
        continue;
      }
      const start = i;
      let p = skipSpace(i + 7),
        reference = null;
      if (source[p] === '"' || source[p] === "'") {
        const quoted = string(p);
        if (quoted) {
          reference = quoted.value;
          p = quoted.end;
        }
      } else if (/^url\s*\(/i.test(source.slice(p))) {
        p += /^url\s*\(/i.exec(source.slice(p))[0].length;
        p = skipSpace(p);
        if (source[p] === '"' || source[p] === "'") {
          const quoted = string(p);
          if (quoted) {
            reference = quoted.value;
            p = skipSpace(quoted.end);
          }
        } else {
          let raw = "";
          while (p < source.length && source[p] !== ")") {
            if (source[p] === "\\" && p + 1 < source.length)
              raw += source[p++] + source[p++];
            else raw += source[p++];
          }
          reference = decodeCSS(raw.trim());
        }
        if (source[p] !== ")") {
          i = start + 1;
          continue;
        }
        p++;
      }
      if (reference === null) {
        i = start + 1;
        continue;
      }
      const conditionStart = p;
      let parens = 0;
      while (p < source.length) {
        if (source.startsWith("/*", p)) {
          p = skipComment(p);
          continue;
        }
        if (source[p] === '"' || source[p] === "'") {
          p = string(p)?.end || source.length;
          continue;
        }
        if (source[p] === "(") parens++;
        else if (source[p] === ")") parens--;
        else if ((source[p] === ";" || source[p] === "{") && parens === 0) break;
        p++;
      }
      if (source[p] === ";")
        imports.push({
          start,
          end: p + 1,
          reference,
          conditions: source.slice(conditionStart, p).trim(),
          line: source.slice(0, start).split("\n").length,
        });
      i = Math.max(start + 1, p + 1);
    }
    return imports;
  }
  const api = { htmlTags, cssImports, decodeEntities };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.SourceUtils = api;
})(globalThis);
