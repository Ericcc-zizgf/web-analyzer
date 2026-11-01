/* Original-source positions and conservative symbol relationships. No source is executed. */
(function (scope) {
  "use strict";
  const Source =
    typeof module !== "undefined" && module.exports
      ? require("./source-utils.js")
      : scope.SourceUtils;
  const normalize = (path) => {
    if (/^[a-z][\w+.-]*:\/\//i.test(path)) return path;
    const parts = [];
    for (const p of path.replace(/\\/g, "/").split("/")) {
      if (p === "..") parts.pop();
      else if (p && p !== ".") parts.push(p);
    }
    return parts.join("/");
  };
  function lineTable(source) {
    const out = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") out.push(i + 1);
    return out;
  }
  function position(lines, offset) {
    let lo = 0,
      hi = lines.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid] <= offset) lo = mid;
      else hi = mid;
    }
    return { line: lo + 1, column: offset - lines[lo] + 1 };
  }
  function attributeRanges(source, tag) {
    const ranges = [];
    let i = tag.start + tag.name.length + 1;
    while (i < tag.end - 1) {
      while (/[\s/]/.test(source[i] || "") && i < tag.end) i++;
      if (i >= tag.end - 1) break;
      const start = i;
      while (i < tag.end && !/[\s=/>]/.test(source[i])) i++;
      const name = source.slice(start, i).toLowerCase();
      if (!name) {
        i++;
        continue;
      }
      while (/\s/.test(source[i] || "")) i++;
      let valueStart = i,
        valueEnd = i;
      if (source[i] === "=") {
        i++;
        while (/\s/.test(source[i] || "")) i++;
        const quote = source[i];
        if (quote === '"' || quote === "'") {
          valueStart = ++i;
          while (i < tag.end && source[i] !== quote) i++;
          valueEnd = i;
          i++;
        } else {
          valueStart = i;
          while (i < tag.end && !/[\s>]/.test(source[i])) i++;
          valueEnd = i;
        }
      }
      ranges.push({
        name,
        start,
        end: i,
        valueStart,
        valueEnd,
        value: source.slice(valueStart, valueEnd),
      });
    }
    return ranges;
  }
  async function build(input, parsers, progress = () => {}) {
    const files = input.map((f) => ({ ...f, path: normalize(f.path) })),
      fileMap = new Map(files.map((f) => [f.path, f]));
    const records = [],
      edges = [],
      gaps = [],
      units = [],
      byID = new Map(),
      byOwner = new Map();
    let stopped = false;
    const CAP = 60000,
      PER_FILE = 6000;
    function add(file, type, start, end, data = {}) {
      if (records.length >= CAP) {
        stopped = true;
        return null;
      }
      const count = file.recordCount || 0;
      if (count >= PER_FILE) {
        file.capped = true;
        return null;
      }
      file.recordCount = count + 1;
      start = Math.max(0, start);
      end = Math.max(start, Math.min(file.source.length, end));
      const at = position(file.lines, start),
        last = position(file.lines, Math.max(start, end - 1));
      const r = {
        id: "r" + records.length,
        file: file.path,
        type,
        start,
        end,
        ...at,
        endLine: last.line,
        endColumn: last.column,
        ...data,
      };
      records.push(r);
      byID.set(r.id, r);
      if (r.owner) {
        if (!byOwner.has(r.owner)) byOwner.set(r.owner, []);
        byOwner.get(r.owner).push(r.id);
      }
      return r;
    }
    function edge(from, to, reason, certainty = "confirmed") {
      if (from && to && from !== to)
        edges.push({
          from: typeof from === "string" ? from : from.id,
          to: typeof to === "string" ? to : to.id,
          reason,
          certainty,
        });
    }
    function resolve(from, ref, resource = false) {
      if (!ref || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref)) return null;
      if (!resource && !ref.startsWith(".") && !ref.startsWith("/")) return null;
      let stem;
      try {
        const parent = new URL(from, "https://project.invalid/");
        const base = fileMap.get(from)?.baseHref;
        const u = new URL(ref, base ? new URL(base, parent) : parent);
        if (u.origin !== "https://project.invalid") return null;
        stem = normalize(decodeURIComponent(u.pathname));
      } catch {
        return null;
      }
      return (
        [
          "",
          ".js",
          ".mjs",
          ".cjs",
          ".ts",
          ".tsx",
          ".jsx",
          ".css",
          ".html",
          ".htm",
          "/index.js",
          "/index.ts",
          "/index.tsx",
          "/index.jsx",
        ]
          .map((s) => stem + s)
          .find((p) => fileMap.has(p)) || null
      );
    }
    async function indexJS(file, source, base, unitKey) {
      const recordBegin = records.length;
      const unit = {
        id: unitKey,
        file: file.path,
        base,
        imports: [],
        exports: [],
        bindings: [],
        calls: [],
        ast: null,
      };
      units.push(unit);
      let ast;
      try {
        ast = await parsers.js(source, /\.tsx?$/i.test(file.path));
      } catch (e) {
        gaps.push({
          file: file.path,
          line: e.loc ? position(file.lines, base + (e.pos || 0)).line : null,
          reason: "JavaScript／TypeScript 解析失敗：" + e.message,
        });
        return;
      }
      const variableRecords = new WeakMap();
      const scopes = new WeakMap(),
        declared = new WeakSet(),
        bindingsByNode = new WeakMap(),
        contexts = new WeakMap(),
        all = [];
      const root = { parent: null, functionScope: true, bindings: new Map() },
        functionTypes = new Set([
          "FunctionDeclaration",
          "FunctionExpression",
          "ArrowFunctionExpression",
          "ObjectMethod",
          "ClassMethod",
          "ClassPrivateMethod",
        ]);
      let visited = 0;
      const childEntries = (n) =>
        Object.entries(n).filter(
          ([k]) =>
            ![
              "loc",
              "extra",
              "comments",
              "tokens",
              "leadingComments",
              "trailingComments",
              "innerComments",
              "errors",
            ].includes(k),
        );
      function ids(pattern, out = []) {
        if (!pattern) return out;
        if (pattern.type === "Identifier") out.push(pattern);
        else if (pattern.type === "RestElement") ids(pattern.argument, out);
        else if (pattern.type === "AssignmentPattern") ids(pattern.left, out);
        else if (pattern.type === "ObjectPattern")
          for (const p of pattern.properties)
            ids(p.type === "RestElement" ? p.argument : p.value, out);
        else if (pattern.type === "ArrayPattern")
          pattern.elements.forEach((p) => ids(p, out));
        return out;
      }
      function declare(scope, pattern, record, extra = {}) {
        for (const id of ids(pattern)) {
          declared.add(id);
          const b = { name: id.name, record, scope, mutated: false, ...extra };
          if (!scope.bindings.has(id.name)) scope.bindings.set(id.name, []);
          scope.bindings.get(id.name).push(b);
          bindingsByNode.set(id, b);
          unit.bindings.push(b);
        }
      }
      function collect(n, scope, owner, parent, key) {
        if (!n?.type) return;
        if (++visited > 350000) throw Error("AST 節點超過 350,000 上限");
        let record = null;
        if (functionTypes.has(n.type)) {
          const title =
            n.id?.name ||
            n.key?.name ||
            (parent?.type === "VariableDeclarator" ? parent.id?.name : null) ||
            "匿名回呼";
          record = add(file, "function", base + n.start, base + n.end, {
            name: title,
            owner: owner?.id,
            unit: unitKey,
          });
          if (n.type === "FunctionDeclaration" && n.id)
            declare(scope, n.id, record, { functionNode: n });
          scope = { parent: scope, functionScope: true, bindings: new Map() };
          if (n.type === "FunctionExpression" && n.id)
            declare(scope, n.id, record, { functionNode: n });
          for (const p of n.params || [])
            declare(
              scope,
              p,
              add(file, "parameter", base + p.start, base + p.end, {
                name: source.slice(p.start, p.end),
                owner: record?.id,
                unit: unitKey,
              }),
            );
          if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
            const binding = bindingsByNode.get(parent.id);
            if (binding) {
              binding.functionNode = n;
              binding.functionRecord = record;
            }
          }
          owner = record || owner;
        } else if (
          [
            "BlockStatement",
            "CatchClause",
            "ForStatement",
            "ForInStatement",
            "ForOfStatement",
            "SwitchStatement",
          ].includes(n.type)
        ) {
          scope = { parent: scope, functionScope: false, bindings: new Map() };
          if (n.type === "CatchClause" && n.param)
            declare(
              scope,
              n.param,
              add(file, "binding", base + n.param.start, base + n.param.end, {
                name: "catch 參數",
                owner: owner?.id,
                unit: unitKey,
              }),
            );
        }
        scopes.set(n, scope);
        contexts.set(n, owner);
        all.push({ n, parent, key });
        if (n.type === "VariableDeclaration") {
          let target = scope;
          if (n.kind === "var")
            while (target.parent && !target.functionScope) target = target.parent;
          for (const d of n.declarations) {
            const names = ids(d.id)
              .map((i) => i.name)
              .join(", ");
            const r = add(file, "binding", base + d.start, base + d.end, {
              name: names,
              owner: owner?.id,
              unit: unitKey,
            });
            variableRecords.set(d, r);
            declare(target, d.id, r, { init: d.init });
          }
        }
        if (n.type === "ClassDeclaration" && n.id)
          declare(
            scope,
            n.id,
            add(file, "class", base + n.start, base + n.end, {
              name: n.id.name,
              owner: owner?.id,
              unit: unitKey,
            }),
          );
        if (n.type === "ImportDeclaration")
          for (const spec of n.specifiers) {
            const r = add(file, "import", base + n.start, base + n.end, {
              name: spec.local.name,
              reference: n.source.value,
              owner: owner?.id,
              unit: unitKey,
            });
            const imported =
              spec.type === "ImportDefaultSpecifier"
                ? "default"
                : spec.type === "ImportNamespaceSpecifier"
                  ? "*"
                  : spec.imported.name || spec.imported.value;
            declare(scope, spec.local, r, { imported, reference: n.source.value });
            unit.imports.push({
              local: spec.local.name,
              imported,
              reference: n.source.value,
              record: r,
            });
          }
        for (const [k, v] of childEntries(n)) {
          if (Array.isArray(v))
            for (const c of v)
              if (c?.type) collect(c, scope, owner, n, k);
              else {
              }
          else if (v?.type) collect(v, scope, owner, n, k);
        }
      }
      function binding(n) {
        if (n?.type !== "Identifier") return null;
        let s = scopes.get(n);
        while (s && !s.bindings.has(n.name)) s = s.parent;
        const list = s?.bindings.get(n.name);
        return list?.length === 1 ? list[0] : null;
      }
      function string(n) {
        return ["StringLiteral", "Literal"].includes(n?.type) &&
          typeof n.value === "string"
          ? n.value
          : n?.type === "TemplateLiteral" && !n.expressions.length
            ? n.quasis[0].value.cooked
            : null;
      }
      function expressionName(n) {
        if (n?.type === "Identifier") return n.name;
        if (["MemberExpression", "OptionalMemberExpression"].includes(n?.type))
          return (
            expressionName(n.object) +
            "." +
            (n.computed ? string(n.property) || "?" : n.property.name)
          );
        return "";
      }
      function selector(n, seen = new Set()) {
        if (n?.type === "Identifier") {
          const b = binding(n);
          if (!b || b.mutated || seen.has(b)) return null;
          seen.add(b);
          return selector(b.init, seen);
        }
        if (["CallExpression", "OptionalCallExpression"].includes(n?.type)) {
          const call = expressionName(n.callee),
            arg = string(n.arguments[0]);
          if (
            n.callee?.object?.type === "Identifier" &&
            n.callee.object.name === "document" &&
            !binding(n.callee.object) &&
            arg !== null
          ) {
            if (call === "document.getElementById") return { kind: "id", value: arg };
            if (["document.querySelector", "document.querySelectorAll"].includes(call))
              return { kind: "selector", value: arg };
            if (call === "document.getElementsByClassName")
              return { kind: "classes", value: arg };
            if (call === "document.getElementsByTagName")
              return { kind: "tag", value: arg };
          }
        }
        if (["MemberExpression", "OptionalMemberExpression"].includes(n?.type))
          return selector(n.object, seen);
        return null;
      }
      try {
        collect(ast.program || ast, root, null, null, "");
      } catch (e) {
        gaps.push({ file: file.path, reason: e.message });
        return;
      }
      for (const { n } of all) {
        if (n.type === "AssignmentExpression") {
          for (const id of ids(n.left)) {
            const b = binding(id);
            if (b) b.mutated = true;
          }
        }
        if (
          ["ForInStatement", "ForOfStatement"].includes(n.type) &&
          n.left?.type !== "VariableDeclaration"
        ) {
          for (const id of ids(n.left)) {
            const b = binding(id);
            if (b) b.mutated = true;
          }
        }
        if (n.type === "UpdateExpression") {
          const b = binding(n.argument);
          if (b) b.mutated = true;
        }
      }
      for (const b of unit.bindings) {
        if (b.functionRecord) edge(b.record, b.functionRecord, "變數初始化為函式");
        if (b.record) b.record.mutated = b.mutated;
      }
      const recordByNode = new WeakMap(),
        parents = new WeakMap(),
        referenceContainers = [];
      for (const item of all) if (item.parent) parents.set(item.n, item.parent);
      const definedFunctions = new Map(
        records
          .slice(recordBegin)
          .filter((r) => r.type === "function")
          .map((r) => [r.start, r]),
      );
      for (const { n, parent, key } of all) {
        const owner = contexts.get(n);
        let r = null;
        if (
          n.type === "Identifier" &&
          !declared.has(n) &&
          !(
            ["MemberExpression", "OptionalMemberExpression"].includes(parent?.type) &&
            key === "property" &&
            !parent.computed
          ) &&
          !(
            ["ObjectProperty", "ObjectMethod", "ClassMethod"].includes(parent?.type) &&
            key === "key" &&
            !parent.computed
          ) &&
          ![
            "ImportSpecifier",
            "ImportDefaultSpecifier",
            "ImportNamespaceSpecifier",
            "ExportSpecifier",
          ].includes(parent?.type)
        ) {
          const b = binding(n);
          if (b?.record) {
            r = add(file, "reference", base + n.start, base + n.end, {
              name: n.name,
              owner: owner?.id,
              unit: unitKey,
              definition: b.record.id,
            });
            referenceContainers.push({ record: r, node: n });
            edge(r, b.record, "同一詞法綁定的引用");
            edge(owner, b.record, "讀取／使用變數或函式");
          }
        }
        if (["CallExpression", "OptionalCallExpression"].includes(n.type)) {
          const name = expressionName(n.callee),
            target = selector(n.callee.object),
            ownSelector = selector(n),
            prop = n.callee?.computed
              ? string(n.callee.property)
              : n.callee?.property?.name;
          const b = binding(n.callee);
          r = add(
            file,
            ownSelector ? "selector" : prop === "addEventListener" ? "event" : "call",
            base + n.start,
            base + n.end,
            {
              name,
              event: prop === "addEventListener" ? string(n.arguments[0]) : null,
              handlerName:
                prop === "addEventListener" ? expressionName(n.arguments[1]) : null,
              selector: ownSelector || target,
              owner: owner?.id,
              unit: unitKey,
              globalEvent:
                prop === "addEventListener" &&
                ["document", "window"].includes(expressionName(n.callee.object)) &&
                !binding(n.callee.object),
            },
          );
          if (r && b?.record && !b.mutated)
            edge(r, b.functionRecord || b.record, "靜態函式呼叫／綁定");
          if (r && n.callee?.object?.type === "Identifier") {
            const objectBinding = binding(n.callee.object);
            if (objectBinding?.record) edge(r, objectBinding.record, "呼叫接收物件");
            if (objectBinding?.imported === "*" && prop)
              unit.calls.push({ record: r, namespace: objectBinding, exported: prop });
          }
          if (prop === "addEventListener") {
            const handler = n.arguments[1],
              hb = binding(handler);
            if (hb?.record && !hb.mutated)
              edge(r, hb.functionRecord || hb.record, "事件回呼");
            else if (functionTypes.has(handler?.type)) {
              const fn = definedFunctions.get(base + handler.start);
              edge(r, fn, "直接事件回呼");
            }
            if (!target && r) r.uncertainTarget = true;
          }
          if (owner && r) edge(owner, r, "函式包含的呼叫");
        }
        if (
          n.type === "AssignmentExpression" &&
          ["MemberExpression", "OptionalMemberExpression"].includes(n.left?.type)
        ) {
          r = add(file, "write", base + n.start, base + n.end, {
            name: expressionName(n.left),
            selector: selector(n.left.object),
            owner: owner?.id,
            unit: unitKey,
          });
          if (owner) edge(owner, r, "函式包含的屬性寫入");
          const b = binding(n.left.object);
          if (b?.record) edge(r, b.record, "寫入接收物件");
          const prop = n.left.property?.name;
          if (prop?.startsWith("on")) {
            if (r) {
              r.type = "event";
              r.event = prop.slice(2);
              r.handlerName = expressionName(n.right);
            }
            const hb = binding(n.right);
            if (hb?.record && !hb.mutated)
              edge(r, hb.functionRecord || hb.record, "事件屬性回呼");
            else if (functionTypes.has(n.right?.type))
              edge(r, definedFunctions.get(base + n.right.start), "直接事件屬性回呼");
          }
        }
        if (
          n.type === "StringLiteral" ||
          (n.type === "Literal" && typeof n.value === "string")
        )
          r = add(file, "literal", base + n.start, base + n.end, {
            value: n.value,
            owner: owner?.id,
            unit: unitKey,
          });
        if (n.type === "JSXOpeningElement")
          r = add(file, "jsx", base + n.start, base + n.end, {
            name: source.slice(n.start, n.end),
            owner: owner?.id,
            unit: unitKey,
          });
        if (r) {
          recordByNode.set(n, r);
          if (owner && ["selector", "event", "write"].includes(r.type))
            edge(r, owner, "此位置所屬函式");
        }
        if (n.type === "ExportNamedDeclaration") {
          if (n.declaration) {
            const declaration = n.declaration;
            for (const id of declaration.id
              ? [declaration.id]
              : declaration.declarations?.flatMap((d) => ids(d.id)) || []) {
              const b = bindingsByNode.get(id);
              if (b?.record)
                unit.exports.push({
                  exported: id.name,
                  record: b.functionRecord || b.record,
                });
            }
          }
          for (const spec of n.specifiers || [])
            unit.exports.push(
              n.source
                ? {
                    via: add(file, "export", base + n.start, base + n.end, {
                      name: spec.exported.name || spec.exported.value,
                      unit: unitKey,
                    }),
                    exported: spec.exported.name || spec.exported.value,
                    reference: n.source.value,
                    imported: spec.local?.name || spec.local?.value || "*",
                  }
                : {
                    exported: spec.exported.name || spec.exported.value,
                    local: spec.local.name,
                    record: binding(spec.local)?.record,
                  },
            );
        }
        if (n.type === "ExportDefaultDeclaration") {
          const decl = n.declaration;
          const b = binding(decl);
          const defined = records.find(
            (r) =>
              r.file === file.path &&
              r.start === base + decl.start &&
              ["function", "class"].includes(r.type),
          );
          unit.exports.push({
            exported: "default",
            record:
              b?.functionRecord ||
              b?.record ||
              defined ||
              add(file, "export", base + n.start, base + n.end, {
                name: "default",
                unit: unitKey,
              }),
          });
        }
        if (n.type === "ExportAllDeclaration")
          unit.exports.push({
            via: add(file, "export", base + n.start, base + n.end, {
              name: "*",
              unit: unitKey,
            }),
            exported: "*",
            reference: n.source.value,
          });
      }
      for (const item of referenceContainers) {
        let parent = parents.get(item.node);
        while (parent && !functionTypes.has(parent.type)) {
          if (parent.type === "VariableDeclarator") {
            const target = variableRecords.get(parent);
            edge(item.record, target, "此引用初始化的變數");
            edge(target, byID.get(item.record.definition), "變數初始化的依賴");
            break;
          }
          if (
            ["CallExpression", "OptionalCallExpression", "AssignmentExpression"].includes(
              parent.type,
            )
          ) {
            edge(item.record, recordByNode.get(parent), "此引用所屬呼叫或寫入");
            break;
          }
          parent = parents.get(parent);
        }
      }
      // Initializers contain selector/call records too, even outside a function.
      const initializerRecords = records
        .slice(recordBegin)
        .filter((r) => ["selector", "event", "call"].includes(r.type));
      for (const b of unit.bindings)
        if (b.init && b.record) {
          b.record.domBinding = b.mutated ? null : selector(b.init);
          for (const r of initializerRecords.filter(
            (r) =>
              r.unit === unitKey &&
              r.start >= base + b.init.start &&
              r.end <= base + b.init.end &&
              r.id !== b.record.id,
          )) {
            if (["selector", "event", "call"].includes(r.type)) {
              edge(b.record, r, "變數初始化使用");
              if (r.type === "selector") edge(r, b.record, "選擇器所屬變數");
            }
          }
        }
      for (const call of unit.calls) {
        const target = resolve(file.path, call.namespace.reference);
        call.target = target;
      }
      for (const { n } of all)
        if (
          ["ImportExpression"].includes(n.type) ||
          (n.type === "CallExpression" &&
            ["require", "import"].includes(expressionName(n.callee)))
        )
          gaps.push({
            file: file.path,
            line: position(file.lines, base + n.start).line,
            reason: "動態 import／CommonJS 目前僅保留來源與字面線索，不推定符號綁定",
          });
      // Keep only serializable symbol metadata between files; do not retain every AST.
      unit.bindings = unit.bindings.map((b) => ({
        name: b.name,
        record: b.record,
        functionRecord: b.functionRecord,
        topLevel: b.scope.parent === null,
      }));
      for (const call of unit.calls) delete call.namespace;
    }
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      file.lines = lineTable(file.source);
      file.recordCount = 0;
      if (stopped) {
        gaps.push({
          file: file.path,
          reason: "專案索引已達 60,000 個位置上限，此檔未索引",
        });
        continue;
      }
      const ext = file.kind || file.path.split(".").pop().toLowerCase();
      if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext))
        await indexJS(file, file.source, 0, file.path);
      else if (["html", "htm"].includes(ext)) {
        const tags = Source.htmlTags(file.source);
        file.baseHref = tags.find((t) => t.name === "base")?.attrs.href;
        for (const tag of tags) {
          add(file, "html", tag.start, tag.end, {
            name: tag.name,
            attrs: tag.attrs,
            template: tag.templateDepth > 0,
            resource:
              tag.name === "script" && tag.attrs.src
                ? resolve(file.path, tag.attrs.src, true)
                : tag.name === "link" && /stylesheet/i.test(tag.attrs.rel || "")
                  ? resolve(file.path, tag.attrs.href, true)
                  : null,
          });
          for (const attr of attributeRanges(file.source, tag))
            if (attr.name === "style")
              add(file, "inline-style", attr.start, attr.end, {
                name: "style",
                tagStart: tag.start,
              });
            else if (/^on./.test(attr.name))
              add(file, "inline-event", attr.start, attr.end, {
                name: attr.name,
                value: attr.value,
                tagStart: tag.start,
              });
          if (
            tag.name === "script" &&
            !tag.attrs.src &&
            tag.contentStart !== undefined &&
            /^(?:|module|text\/javascript|application\/javascript)$/i.test(
              tag.attrs.type || "",
            )
          )
            await indexJS(
              file,
              file.source.slice(tag.contentStart, tag.contentEnd),
              tag.contentStart,
              file.path + "#script:" + tag.start,
            );
          if (tag.name === "style" && tag.contentStart !== undefined)
            await indexCSS(
              file,
              file.source.slice(tag.contentStart, tag.contentEnd),
              tag.contentStart,
            );
        }
      } else if (["css", "scss", "less"].includes(ext))
        await indexCSS(file, file.source, 0);
      else {
        gaps.push({
          file: file.path,
          reason: ["vue", "svelte"].includes(ext)
            ? "尚未解析單檔元件：只有文字搜尋，沒有可確認的框架符號綁定"
            : "此檔案目前只提供原始文字搜尋，未建立語法關聯",
        });
      }
      if (file.capped)
        gaps.push({ file: file.path, reason: "此檔案位置超過 6,000 筆上限，索引已截斷" });
      progress(index + 1, files.length, file.path);
    }
    async function indexCSS(file, text, base) {
      for (const imp of Source.cssImports(text))
        add(file, "css-import", base + imp.start, base + imp.end, {
          reference: imp.reference,
          resource: resolve(file.path, imp.reference, true),
          conditions: imp.conditions ? [imp.conditions] : [],
        });
      try {
        const ast = await parsers.css(text);
        let count = 0;
        function visit(node, conditions = []) {
          if (++count > 25000) throw Error("CSS 語法節點超過上限");
          if (node.type === "css-atrule" && /keyframes$/i.test(node.name))
            add(
              file,
              "keyframes",
              base + node.source.start.offset,
              base + node.source.end.offset,
              { name: node.raws?.params || "", conditions },
            );
          if (
            node.type === "css-rule" &&
            !conditions.some((c) => /^@(?:-[\w]+-)?keyframes/.test(c))
          ) {
            const start = node.source?.start.offset,
              end = node.source?.end.offset;
            const selector =
              node.raws?.selector || text.slice(start, text.indexOf("{", start)).trim();
            const r = add(file, "css", base + start, base + Math.min(text.length, end), {
              selector,
              conditions,
            });
            for (const d of node.nodes || [])
              if (d.type === "css-decl")
                add(
                  file,
                  "css-declaration",
                  base + d.source.start.offset,
                  base + d.source.end.offset,
                  {
                    name: d.prop,
                    value: d.raws?.value || d.value?.text || "",
                    selector,
                    conditions,
                    rule: r?.id,
                  },
                );
          }
          for (const child of node.nodes || [])
            visit(
              child,
              node.type === "css-atrule"
                ? [...conditions, "@" + node.name + " " + (node.raws?.params || "")]
                : conditions,
            );
        }
        visit(ast);
      } catch (e) {
        gaps.push({ file: file.path, reason: "CSS 解析失敗：" + e.message });
      }
    }
    const unitsByFile = new Map();
    for (const u of units) {
      if (!unitsByFile.has(u.file)) unitsByFile.set(u.file, []);
      unitsByFile.get(u.file).push(u);
    }
    function exported(file, name, seen = new Set(), via = []) {
      const key = file + ":" + name;
      if (seen.has(key)) return null;
      seen.add(key);
      const candidates = [],
        routes = [];
      for (const u of unitsByFile.get(file) || [])
        for (const e of u.exports) {
          if (e.exported === name) {
            if (e.record) candidates.push(e.record);
            else if (e.local) {
              const b = u.bindings.filter((b) => b.topLevel && b.name === e.local);
              if (b.length === 1) candidates.push(b[0].functionRecord || b[0].record);
            } else if (e.reference) {
              const next = resolve(file, e.reference),
                chain = [];
              const result = next && exported(next, e.imported, new Set(seen), chain);
              if (result) {
                candidates.push(result);
                routes.push(...chain);
                if (e.via) routes.push(e.via);
              }
            }
          } else if (e.exported === "*" && name !== "default") {
            const next = resolve(file, e.reference),
              chain = [];
            const result = next && exported(next, name, new Set(seen), chain);
            if (result) {
              candidates.push(result);
              routes.push(...chain);
              if (e.via) routes.push(e.via);
            }
          }
        }
      const ids = [...new Set(candidates.filter(Boolean).map((r) => r.id))];
      if (ids.length === 1) {
        via.push(...routes);
        return byID.get(ids[0]);
      }
      return null;
    }
    for (const u of units) {
      for (const imp of u.imports) {
        const target = resolve(u.file, imp.reference);
        if (!target) {
          gaps.push({
            file: u.file,
            line: imp.record?.line,
            reason: "匯入無法解析（套件、別名、缺少或略過）：" + imp.reference,
          });
          continue;
        }
        if (imp.imported !== "*") {
          const via = [];
          const def = exported(target, imp.imported, new Set(), via);
          if (def) {
            edge(imp.record, def, "ES module 匯入／匯出符號");
            for (const r of via) edge(imp.record, r, "經過的轉匯出位置");
          } else
            gaps.push({
              file: u.file,
              line: imp.record?.line,
              reason: "無法確認匯出符號 " + imp.imported + "，來源 " + target,
            });
        }
      }
      for (const call of u.calls) {
        const via = [];
        const def = call.target && exported(call.target, call.exported, new Set(), via);
        if (def) {
          edge(call.record, def, "命名空間匯入的成員");
          for (const r of via) edge(call.record, r, "經過的轉匯出位置");
        } else
          gaps.push({
            file: u.file,
            line: call.record?.line,
            reason: "無法確認命名空間成員 " + call.exported,
          });
      }
    }
    const variables = new Map(),
      animations = new Map();
    for (const r of records) {
      if (r.type === "css-declaration" && r.name.startsWith("--")) {
        if (!variables.has(r.name)) variables.set(r.name, []);
        variables.get(r.name).push(r);
      }
      if (r.type === "keyframes") {
        if (!animations.has(r.name)) animations.set(r.name, []);
        animations.get(r.name).push(r);
      }
    }
    for (const r of records)
      if (r.type === "css-declaration" && r.rule) {
        for (const found of String(r.value).matchAll(/var\(\s*(--[\w-]+)/g))
          for (const def of variables.get(found[1]) || [])
            edge(
              r.rule,
              def,
              "CSS 自訂屬性的同名定義，需對照作用域與覆蓋規則",
              "possible",
            );
        if (["animation", "animation-name"].includes(r.name))
          for (const name of String(r.value).match(/[A-Za-z_-][\w-]*/g) || [])
            for (const def of animations.get(name) || [])
              edge(r.rule, def, "CSS 動畫名稱的同名 @keyframes 定義", "possible");
      }
    const linkedCalls = new Set(
      edges.filter((e) => /靜態函式|命名空間/.test(e.reason)).map((e) => e.from),
    );
    const unresolved = new Map();
    for (const r of records)
      if (r.type === "call" && !linkedCalls.has(r.id))
        unresolved.set(r.file, (unresolved.get(r.file) || 0) + 1);
    for (const [file, count] of unresolved)
      gaps.push({
        file,
        reason:
          count +
          " 處呼叫未確認專案內定義（包含標準 API、外部套件與動態成員）；保留呼叫原始位置，不猜測目標",
      });
    // Return only cloneable data, never AST or binding objects.
    return {
      records,
      edges: edges.filter((e) => e.from && e.to),
      gaps,
      coverage: {
        files: files.length,
        records: records.length,
        cap: CAP,
        capped: stopped,
      },
      files: files.map((f) => ({
        path: f.path,
        length: f.source.length,
        lines: f.lines.length,
        capped: !!f.capped,
      })),
    };
  }
  function query(index, selection) {
    const records = index.records,
      map = new Map(records.map((r) => [r.id, r])),
      outgoing = new Map(),
      refs = new Map(),
      owned = new Map(),
      functionNames = new Map();
    for (const r of records)
      if (r.type === "function") {
        if (!functionNames.has(r.name)) functionNames.set(r.name, []);
        functionNames.get(r.name).push(r);
      }
    for (const r of records)
      if (r.owner) {
        if (!owned.has(r.owner)) owned.set(r.owner, []);
        owned.get(r.owner).push(r);
      }
    for (const edge of index.edges) {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from).push(edge);
      if (!refs.has(edge.to)) refs.set(edge.to, []);
      refs.get(edge.to).push(edge);
    }
    const found = new Map(),
      queue = [];
    function include(record, certainty, reason, follow = true) {
      if (!record) return;
      const old = found.get(record.id);
      if (old) {
        if (old.certainty === "possible" && certainty === "confirmed") {
          old.certainty = "confirmed";
          old.reasons.push(reason);
          if (follow) queue.push(record.id);
        } else if (!old.reasons.includes(reason)) old.reasons.push(reason);
        return;
      }
      found.set(record.id, { ...record, certainty, reasons: [reason] });
      if (follow) queue.push(record.id);
    }
    for (const id of selection.seedIDs || [])
      include(map.get(id), "confirmed", "由使用者指定此原始碼符號開始追查");
    const tracing = Boolean(selection.seedIDs?.length);
    const selectedStarts = new Set(selection.htmlStarts || []),
      activeFiles = new Set(selection.activeFiles || []),
      tokens = new Set(selection.tokens || []);
    for (const r of records) {
      if (tracing) continue;
      if (r.file === selection.file && r.type === "html" && selectedStarts.has(r.start))
        include(r, "confirmed", "原始 HTML 標籤與預覽元素的來源標記一致", false);
      if (
        r.file === selection.file &&
        ["inline-event", "inline-style"].includes(r.type) &&
        selectedStarts.has(r.tagStart)
      )
        include(
          r,
          "confirmed",
          r.type === "inline-style"
            ? "選取元素的行內 style 原始位置"
            : "選取元素的 HTML 事件屬性",
          false,
        );
      if (r.type === "css" && selection.cssMatches?.includes(r.id))
        include(
          r,
          activeFiles.has(r.file) ? "confirmed" : "possible",
          activeFiles.has(r.file)
            ? "已載入的 CSS 選擇器匹配此元件／子元素"
            : "專案其他樣式檔有匹配選擇器，未確認本頁載入",
        );
      if (r.selector && selection.selectorMatches?.includes(r.id))
        include(
          r,
          activeFiles.has(r.file) ? "confirmed" : "possible",
          activeFiles.has(r.file)
            ? "靜態 DOM 選擇器匹配此元件／子元素"
            : "其他檔案存在相同 DOM 選擇器，未確認本頁執行",
        );
      if (r.globalEvent && activeFiles.has(r.file))
        include(r, "possible", "全域事件可能透過事件委派或全頁狀態影響元件");
      if (
        ["literal", "jsx"].includes(r.type) &&
        [...tokens].some(
          (t) =>
            t.length > 1 &&
            ([t, "#" + t, "." + t].includes(r.value) ||
              (r.type === "jsx" && r.name.includes(t))),
        )
      )
        include(r, "possible", "同名 id／class／屬性字面線索；未確認引用關係", false);
    }
    for (const r of records) {
      if (tracing) continue;
      if (r.type === "css" && selection.cssAncestorMatches?.includes(r.id))
        include(r, "possible", "祖先元素的 CSS，可能透過繼承或排版影響元件", false);
      if (r.type === "event" && selection.eventAncestorMatches?.includes(r.id))
        include(r, "possible", "事件綁定於祖先元素，可能透過冒泡或事件委派影響元件");
      if (r.type === "css" && selection.cssPossibleMatches?.includes(r.id))
        include(r, "possible", "偽狀態／偽元素或同名選擇器線索，未確認目前套用", false);
      if (
        r.type === "html" &&
        r.file !== selection.file &&
        [...tokens].some(
          (t) =>
            r.attrs?.id === t ||
            String(r.attrs?.class || "")
              .split(/\s+/)
              .includes(t),
        )
      )
        include(
          r,
          "possible",
          "其他 HTML／模板有同名 id 或 class，未確認是同一元件",
          false,
        );
    }
    for (const r of [...found.values()])
      if (r.type === "inline-event") {
        const called = /^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(r.value || "");
        if (called)
          for (const fn of records)
            if (fn.type === "function" && fn.name === called[1])
              include(fn, "possible", "HTML 字串事件中的同名函式，尚未確認全域綁定");
      }
    // Follow dependencies only; do not pull every caller of a shared utility into the component.
    let cursor = 0;
    while (cursor < queue.length) {
      const id = queue[cursor++],
        current = found.get(id),
        record = map.get(id);
      const routes = outgoing.get(id) || [];
      if (
        ["call", "event"].includes(record.type) &&
        !routes.some((e) => /靜態函式|命名空間|事件回呼|事件屬性回呼/.test(e.reason))
      ) {
        const name = (record.handlerName || record.name || "").split(".").pop();
        for (const fn of functionNames.get(name) || [])
          if (activeFiles.has(fn.file))
            include(fn, "possible", "同名函式／方法線索，尚未確認執行時或跨腳本綁定");
      }
      for (const e of routes)
        include(
          map.get(e.to),
          current.certainty === "possible" || e.certainty === "possible"
            ? "possible"
            : "confirmed",
          e.reason,
        );
      if (["function", "binding", "class"].includes(record.type)) {
        for (const r of owned.get(id) || [])
          include(
            r,
            current.certainty,
            "已關聯程式區塊中的原始位置",
            r.type !== "reference",
          );
        for (const e of refs.get(id) || []) {
          const from = map.get(e.from);
          if (
            ["event", "selector", "write"].includes(from?.type) &&
            current.certainty === "confirmed"
          )
            include(
              from,
              record.mutated || from.uncertainTarget ? "possible" : current.certainty,
              record.mutated ? "接收變數曾重新賦值，元素目標未確認" : e.reason,
            );
          else if (from?.type === "reference") {
            include(
              from,
              activeFiles.has(from.file) ? current.certainty : "possible",
              "此符號的引用位置",
              Boolean(record.domBinding),
            );
            if (record.domBinding && from.owner)
              include(
                map.get(from.owner),
                activeFiles.has(from.file) ? current.certainty : "possible",
                "函式使用了此 DOM 元素綁定",
              );
          }
        }
      }
    }
    const relatedFiles = new Set([...found.values()].map((r) => r.file));
    for (const r of records)
      if (
        r.resource &&
        relatedFiles.has(r.resource) &&
        ((r.type === "html" && r.file === selection.file) ||
          (r.type === "css-import" && relatedFiles.has(r.file)))
      )
        include(r, "confirmed", "已關聯來源的載入／匯入位置", false);
    const values = [...found.values()];
    return {
      results: values.sort(
        (a, b) =>
          (a.certainty === "confirmed" ? 0 : 1) - (b.certainty === "confirmed" ? 0 : 1) ||
          a.file.localeCompare(b.file) ||
          a.start - b.start,
      ),
      gaps: index.gaps,
      coverage: index.coverage,
    };
  }
  const api = { build, query, lineTable, position, attributeRanges, normalize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.LocatorCore = api;
})(globalThis);
