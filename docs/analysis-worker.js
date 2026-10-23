/* Parsing only: page scripts are never evaluated. Prettier's bundled Babel parser builds an AST. */
importScripts(
  "vendor/standalone.js",
  "vendor/babel.js",
  "vendor/estree.js",
  "vendor/html.js",
  "vendor/postcss.js",
);
const literal = (node) =>
  node &&
  (node.type === "StringLiteral" ||
    (node.type === "Literal" && typeof node.value === "string"))
    ? node.value
    : node?.type === "TemplateLiteral" && node.expressions.length === 0
      ? node.quasis[0].value.cooked
      : null;
function name(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")
    return (
      name(node.object) +
      "." +
      (node.computed ? literal(node.property) || "?" : node.property.name)
    );
  return "";
}
function inspect(ast, source) {
  const lists = {
      functions: [],
      events: [],
      selectors: [],
      network: [],
      writes: [],
      storage: [],
      timers: [],
      imports: [],
    },
    counts = Object.fromEntries(Object.keys(lists).map((k) => [k, 0]));
  let visited = 0;
  const add = (kind, record, node) => {
    counts[kind]++;
    if (lists[kind].length < 160)
      lists[kind].push({
        ...record,
        start: node.start,
        end: node.end,
        line: node.loc?.start.line || 1,
        endLine: node.loc?.end.line || 1,
        snippet: source.slice(node.start, node.end).slice(0, 400),
      });
  };
  function target(node, env) {
    if (!node) return null;
    if (node.type === "Identifier") return env.get(node.name) || null;
    if (
      ["MemberExpression", "OptionalMemberExpression"].includes(node.type) &&
      ["style", "classList"].includes(node.property?.name)
    )
      return target(node.object, env);
    if (node.type === "CallExpression" && name(node.callee).startsWith("document.")) {
      const method = name(node.callee).split(".").pop(),
        value = literal(node.arguments[0]);
      if (!value) return null;
      if (method === "getElementById") return "#" + value;
      if (method === "getElementsByClassName")
        return "." + value.trim().split(/\s+/).join(".");
      if (method === "getElementsByTagName") return value;
      if (["querySelector", "querySelectorAll"].includes(method)) return value;
    }
    return null;
  }
  function walk(node, env = new Map(), label = "") {
    if (!node || typeof node !== "object" || !node.type) return;
    if (++visited > 350000) throw Error("語法樹節點超過分析上限");
    const functionNode = [
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
      "ObjectMethod",
      "ClassMethod",
      "ClassPrivateMethod",
    ].includes(node.type);
    if (functionNode) {
      const fnName = node.id?.name || node.key?.name || label || "匿名回呼";
      add(
        "functions",
        {
          name: fnName,
          kind: node.type,
          async: !!node.async,
          params: (node.params || []).map((p) => source.slice(p.start, p.end).slice(0, 100)),
        },
        node,
      );
      env = new Map(env);
      for (const param of node.params || [])
        if (param.type === "Identifier") env.delete(param.name);
    } else if (node.type === "BlockStatement") env = new Map(env);
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      const resolved = target(node.init, env);
      if (resolved) env.set(node.id.name, resolved);
      else env.delete(node.id.name);
    }
    if (
      node.type === "ImportDeclaration" ||
      (node.type === "ExportNamedDeclaration" && node.source)
    )
      add(
        "imports",
        { name: literal(node.source) || "動態", kind: "模組依賴（未展開）" },
        node,
      );
    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      const callee = name(node.callee),
        property = node.callee?.property?.name || literal(node.callee?.property),
        args = node.arguments || [];
      if (property === "addEventListener")
        add(
          "events",
          {
            event: literal(args[0]) || "動態事件",
            target: target(node.callee.object, env),
            receiver: name(node.callee.object) || "動態目標",
            handler: args[1]?.name || "匿名回呼",
            handlerStart: args[1]?.start,
            handlerEnd: args[1]?.end,
          },
          node,
        );
      if (
        callee.startsWith("document.") &&
        [
          "querySelector",
          "querySelectorAll",
          "getElementById",
          "getElementsByClassName",
          "getElementsByTagName",
        ].includes(property)
      )
        add(
          "selectors",
          { method: property, selector: target(node, env) || "動態選擇器" },
          node,
        );
      if (callee === "fetch" || callee === "window.fetch") {
        let method = "GET";
        const opts = args[1];
        if (opts?.type === "ObjectExpression") {
          const field = opts.properties.find(
            (p) => (p.key?.name || literal(p.key)) === "method",
          );
          if (field) method = literal(field.value) || "動態方法";
        }
        add("network", { api: "fetch", url: literal(args[0]) || "動態 URL", method }, node);
      }
      if (/^axios\.(get|post|put|patch|delete|request)$/.test(callee))
        add(
          "network",
          {
            api: callee,
            url: literal(args[0]) || "動態 URL",
            method: callee.split(".")[1].toUpperCase(),
          },
          node,
        );
      if (/(^|\.)localStorage\.|(^|\.)sessionStorage\./.test(callee))
        add("storage", { api: callee, key: literal(args[0]) || "動態 key" }, node);
      if (
        [
          "setTimeout",
          "setInterval",
          "requestAnimationFrame",
          "window.setTimeout",
          "window.setInterval",
        ].includes(callee)
      )
        add("timers", { api: callee }, node);
      if (
        [
          "append",
          "appendChild",
          "prepend",
          "remove",
          "replaceChildren",
          "insertAdjacentHTML",
        ].includes(property) ||
        /\.classList\.(add|remove|toggle|replace)$/.test(callee)
      )
        add(
          "writes",
          {
            api: callee || property,
            kind: "DOM 方法",
            target: target(node.callee.object, env),
          },
          node,
        );
      if (node.callee?.type === "Import")
        add(
          "imports",
          { name: literal(args[0]) || "動態模組", kind: "動態 import（未展開）" },
          node,
        );
    }
    if (
      node.type === "AssignmentExpression" &&
      ["MemberExpression", "OptionalMemberExpression"].includes(node.left?.type)
    ) {
      const property = node.left.property?.name || literal(node.left.property);
      if (
        [
          "textContent",
          "innerHTML",
          "innerText",
          "className",
          "value",
          "hidden",
          "src",
        ].includes(property) ||
        name(node.left).includes(".style.")
      )
        add(
          "writes",
          {
            api: name(node.left),
            kind: "DOM 屬性寫入",
            target: target(node.left.object, env),
          },
          node,
        );
      if (property?.startsWith("on"))
        add(
          "events",
          {
            event: property.slice(2),
            target: target(node.left.object, env),
            receiver: name(node.left.object),
            handler: node.right?.name || "函式／動態指定",
            handlerStart: node.right?.start,
            handlerEnd: node.right?.end,
          },
          node,
        );
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          "loc",
          "start",
          "end",
          "extra",
          "comments",
          "tokens",
          "leadingComments",
          "trailingComments",
          "innerComments",
          "errors",
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) walk(child, env, "");
      } else if (value?.type)
        walk(
          value,
          env,
          node.type === "VariableDeclarator" && key === "init"
            ? node.id?.name || ""
            : node.type === "ObjectProperty" && key === "value"
              ? node.key?.name || ""
              : "",
        );
    }
  }
  walk(ast.program || ast);
  // Associate by exact AST ranges, never by snippet text or substring matching.
  const owner = (item) =>
    lists.functions
      .filter((fn) => fn.start <= item.start && fn.end >= item.end && fn !== item)
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  const fnTargets = new Map(lists.functions.map((fn) => [fn, new Set()]));
  for (const item of [...lists.selectors, ...lists.writes]) {
    const fn = owner(item),
      selector = item.target || item.selector;
    if (fn && selector && selector !== "動態選擇器") fnTargets.get(fn).add(selector);
  }
  for (const event of lists.events) {
    if (!event.target) continue;
    let handlers = lists.functions.filter(
      (fn) => fn.start === event.handlerStart && fn.end === event.handlerEnd,
    );
    if (!handlers.length && !["匿名回呼", "函式／動態指定"].includes(event.handler)) {
      handlers = lists.functions.filter(
        (fn) =>
          fn.name === event.handler &&
          !["ObjectMethod", "ClassMethod", "ClassPrivateMethod"].includes(fn.kind),
      );
      if (handlers.length !== 1) handlers = [];
    }
    for (const fn of handlers) fnTargets.get(fn).add(event.target);
  }
  for (const [kind, items] of Object.entries(lists))
    for (const item of items) {
      const targets = new Set();
      if (item.target) targets.add(item.target);
      if (kind === "selectors" && item.selector !== "動態選擇器") targets.add(item.selector);
      if (kind === "functions")
        for (const selector of fnTargets.get(item)) targets.add(selector);
      else if (!["events", "selectors", "imports"].includes(kind)) {
        const fn = owner(item);
        if (fn) for (const selector of fnTargets.get(fn)) targets.add(selector);
      }
      item.relatedTargets = [...targets];
    }
  return {
    ...lists,
    counts,
    visited,
    truncated: Object.keys(lists).filter((k) => counts[k] > lists[k].length),
  };
}
self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "format") {
      const { source, kind } = event.data;
      const parser =
        kind === "js" ? "babel" : kind === "css" ? "css" : kind === "data" ? "json" : "html";
      const result = await self.prettier.format(source, {
        parser,
        plugins: Object.values(self.prettierPlugins),
        tabWidth: 2,
        printWidth: 90,
      });
      self.postMessage({ id, result });
      return;
    }
    const results = [];
    for (const file of event.data.files) {
      try {
        const ast = await self.prettierPlugins.babel.parsers.babel.parse(file.source, {});
        results.push({ id: file.id, ...inspect(ast, file.source) });
      } catch (error) {
        results.push({
          id: file.id,
          error: error.message.slice(0, 500),
          line: error.loc?.line || null,
        });
      }
    }
    self.postMessage({ id, result: results });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
