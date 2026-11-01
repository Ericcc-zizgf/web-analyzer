/* Parsing only: page scripts are never evaluated. Prettier's bundled Babel parser builds an AST. */
importScripts(
  "learning-core.js",
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
function bindingIdentifiers(pattern, ids = []) {
  if (!pattern) return ids;
  if (pattern.type === "Identifier") ids.push(pattern);
  else if (pattern.type === "RestElement") bindingIdentifiers(pattern.argument, ids);
  else if (pattern.type === "AssignmentPattern") bindingIdentifiers(pattern.left, ids);
  else if (pattern.type === "ArrayPattern")
    for (const item of pattern.elements) bindingIdentifiers(item, ids);
  else if (pattern.type === "ObjectPattern")
    for (const item of pattern.properties)
      bindingIdentifiers(item.type === "RestElement" ? item.argument : item.value, ids);
  else if (pattern.type === "TSParameterProperty")
    bindingIdentifiers(pattern.parameter, ids);
  return ids;
}
// Find bindings that may be reassigned, including writes in nested closures.
// A static inspector must not keep an old DOM target when execution order is unknown.
function mutatedBindings(ast) {
  const scopes = new WeakMap(),
    mutated = new WeakSet();
  const root = { parent: null, functionScope: true, bindings: new Map() };
  let visited = 0;
  const functions = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
    "ObjectMethod",
    "ClassMethod",
    "ClassPrivateMethod",
  ]);
  function identifiers(pattern, visit) {
    for (const id of bindingIdentifiers(pattern)) visit(id);
  }
  function declare(scope, pattern) {
    identifiers(pattern, (id) => {
      if (!scope.bindings.has(id.name)) scope.bindings.set(id.name, new Set());
      scope.bindings.get(id.name).add(id);
    });
  }
  function children(node, visit) {
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
        for (const child of value) if (child?.type) visit(child);
      } else if (value?.type) visit(value);
    }
  }
  function collect(node, scope) {
    if (++visited > 350000) throw Error("語法樹節點超過分析上限");
    if (functions.has(node.type)) {
      if (node.type === "FunctionDeclaration" && node.id) declare(scope, node.id);
      scope = { parent: scope, functionScope: true, bindings: new Map() };
      if (node.type === "FunctionExpression" && node.id) declare(scope, node.id);
      for (const param of node.params || []) declare(scope, param);
    } else if (
      [
        "BlockStatement",
        "CatchClause",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "SwitchStatement",
      ].includes(node.type)
    ) {
      scope = { parent: scope, functionScope: false, bindings: new Map() };
      if (node.type === "CatchClause") declare(scope, node.param);
    }
    scopes.set(node, scope);
    if (node.type === "VariableDeclaration") {
      let owner = scope;
      if (node.kind === "var")
        while (owner.parent && !owner.functionScope) owner = owner.parent;
      for (const declaration of node.declarations) declare(owner, declaration.id);
    }
    if (node.type === "ClassDeclaration" && node.id) declare(scope, node.id);
    children(node, (child) => collect(child, scope));
  }
  function mark(pattern, scope) {
    identifiers(pattern, (id) => {
      let owner = scope;
      while (owner && !owner.bindings.has(id.name)) owner = owner.parent;
      if (owner)
        for (const declaration of owner.bindings.get(id.name)) mutated.add(declaration);
    });
  }
  function assignments(node) {
    const scope = scopes.get(node);
    if (node.type === "AssignmentExpression") mark(node.left, scope);
    if (node.type === "UpdateExpression") mark(node.argument, scope);
    if (
      ["ForInStatement", "ForOfStatement"].includes(node.type) &&
      node.left?.type !== "VariableDeclaration"
    )
      mark(node.left, scope);
    // Repeated var declarations are also assignments to the same binding.
    if (node.type === "VariableDeclaration")
      for (const declaration of node.declarations) {
        if (!declaration.init) continue;
        identifiers(declaration.id, (id) => {
          let owner = scope;
          while (owner && !owner.bindings.has(id.name)) owner = owner.parent;
          const declarations = owner?.bindings.get(id.name);
          if (declarations?.size > 1)
            for (const binding of declarations) mutated.add(binding);
        });
      }
    children(node, assignments);
  }
  collect(ast.program || ast, root);
  assignments(ast.program || ast);
  return { mutated, scopes };
}
function inspect(ast, source) {
  const lists = {
      functions: [],
      calls: [],
      bindings: [],
      events: [],
      selectors: [],
      network: [],
      writes: [],
      storage: [],
      timers: [],
      imports: [],
    },
    counts = Object.fromEntries(Object.keys(lists).map((k) => [k, 0]));
  const bindingInfo = mutatedBindings(ast);
  const uncertainBindings = bindingInfo.mutated;
  const variableKinds = new WeakMap();
  const functionBindings = new Map(),
    declarationBindings = new Map(),
    references = [],
    identifierUses = [];
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
    if (
      ["CallExpression", "OptionalCallExpression"].includes(node.type) &&
      name(node.callee).startsWith("document.")
    ) {
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
    if (node.type === "VariableDeclaration")
      for (const declaration of node.declarations)
        variableKinds.set(declaration, node.kind);
    if (node.type === "Identifier" && identifierUses.length < 10000)
      identifierUses.push(node);
    const functionNode = [
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
      "ObjectMethod",
      "ClassMethod",
      "ClassPrivateMethod",
    ].includes(node.type);
    if (functionNode) {
      if (node.id) functionBindings.set(node.id, node.start);
      const fnName = node.id?.name || node.key?.name || label || "匿名回呼";
      add(
        "functions",
        {
          name: fnName,
          kind: node.type,
          async: !!node.async,
          params: (node.params || []).map((p) =>
            source.slice(p.start, p.end).slice(0, 100),
          ),
        },
        node,
      );
      env = new Map(env);
      if (node.id) env.delete(node.id.name);
      for (const param of node.params || [])
        for (const id of bindingIdentifiers(param)) env.delete(id.name);
    } else if (
      [
        "BlockStatement",
        "CatchClause",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "SwitchStatement",
      ].includes(node.type)
    ) {
      env = new Map(env);
      if (node.type === "CatchClause")
        for (const id of bindingIdentifiers(node.param)) env.delete(id.name);
    }
    if (
      functionNode ||
      [
        "BlockStatement",
        "CatchClause",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "SwitchStatement",
      ].includes(node.type)
    ) {
      // Shadow lexical/hoisted declarations before visiting statements, including TDZ cases.
      for (const key of bindingInfo.scopes.get(node)?.bindings.keys() || [])
        env.delete(key);
    }
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      if (["FunctionExpression", "ArrowFunctionExpression"].includes(node.init?.type))
        functionBindings.set(node.id, node.init.start);
      if (
        node.init &&
        !["FunctionExpression", "ArrowFunctionExpression"].includes(node.init.type)
      ) {
        declarationBindings.set(node.id, node.start);
        add(
          "bindings",
          { name: node.id.name, declarationKind: variableKinds.get(node) },
          node,
        );
      }
      const resolved = uncertainBindings.has(node.id) ? null : target(node.init, env);
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
      if (callee && property !== "addEventListener") {
        add("calls", { name: callee }, node);
        references.push({
          record: lists.calls.find((item) => item.start === node.start),
          ref: node.callee,
        });
      }
      if (property === "addEventListener") {
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
        const record = lists.events.find((item) => item.start === node.start);
        if (args[1]?.type === "Identifier")
          references.push({ record, ref: args[1], event: true });
        else if (
          record &&
          ["FunctionExpression", "ArrowFunctionExpression"].includes(args[1]?.type)
        )
          record.resolvedHandlerStart = args[1].start;
      }
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
        add(
          "network",
          { api: "fetch", url: literal(args[0]) || "動態 URL", method },
          node,
        );
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
      if (property?.startsWith("on")) {
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
        const record = lists.events.find((item) => item.start === node.start);
        if (node.right?.type === "Identifier")
          references.push({ record, ref: node.right, event: true });
        else if (
          record &&
          ["FunctionExpression", "ArrowFunctionExpression"].includes(node.right?.type)
        )
          record.resolvedHandlerStart = node.right.start;
      }
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
  // Resolve only immutable lexical function bindings. A matching name alone is not proof.
  for (const { record, ref, event } of references) {
    if (!record) continue;
    let scope = bindingInfo.scopes.get(ref);
    while (scope && !scope.bindings.has(ref.name)) scope = scope.parent;
    const bindings = scope?.bindings.get(ref.name);
    if (bindings?.size !== 1) continue;
    const binding = [...bindings][0];
    if (uncertainBindings.has(binding) || !functionBindings.has(binding)) continue;
    record[event ? "resolvedHandlerStart" : "resolvedStart"] =
      functionBindings.get(binding);
  }
  const dependencies = [];
  for (const ref of identifierUses) {
    let scope = bindingInfo.scopes.get(ref);
    while (scope && !scope.bindings.has(ref.name)) scope = scope.parent;
    const bindings = scope?.bindings.get(ref.name);
    if (bindings?.size !== 1) continue;
    const binding = [...bindings][0];
    if (declarationBindings.has(binding) && !uncertainBindings.has(binding))
      dependencies.push({
        start: ref.start,
        end: ref.end,
        bindingStart: declarationBindings.get(binding),
      });
  }
  for (const item of [
    ...lists.functions,
    ...lists.events,
    ...lists.bindings,
    ...lists.selectors,
  ])
    item.dependencyStarts = [
      ...new Set(
        dependencies
          .filter(
            (ref) =>
              ref.start >= item.start &&
              ref.end <= item.end &&
              ref.bindingStart !== item.start,
          )
          .map((ref) => ref.bindingStart),
      ),
    ];
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
    const handlers = lists.functions.filter(
      (fn) => fn.start === event.resolvedHandlerStart,
    );
    for (const fn of handlers) fnTargets.get(fn).add(event.target);
  }
  for (const [kind, items] of Object.entries(lists))
    for (const item of items) {
      const targets = new Set();
      if (item.target) targets.add(item.target);
      if (kind === "selectors" && item.selector !== "動態選擇器")
        targets.add(item.selector);
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
    dependenciesTruncated: identifierUses.length >= 10000,
    counts,
    visited,
    truncated: Object.keys(lists).filter((k) => counts[k] > lists[k].length),
  };
}
self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "teach") {
      const source = event.data.source;
      if (typeof source !== "string" || source.length > 200000)
        throw Error("教學片段最多 200,000 字元，請改選較小的函式。");
      const ast = await self.prettierPlugins.babel.parsers.babel.parse(source, {});
      const result = self.LearningCore.explain(ast, source);
      result.reference = self.LearningCore.methodMap;
      if (event.data.simulation) {
        const simulation = self.LearningCore.simulate(
          ast,
          event.data.simulation.index,
          event.data.simulation.args,
        );
        result.simulation = {
          ...simulation,
          display: self.LearningCore.format(simulation.result),
        };
      }
      self.postMessage({ id, result });
      return;
    }
    if (type === "format") {
      const { source, kind } = event.data;
      const parser =
        kind === "js"
          ? "babel"
          : kind === "css"
            ? "css"
            : kind === "data"
              ? "json"
              : "html";
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
        const parser = /\.tsx?(?:[?#]|$)/i.test(file.label || "") ? "babel-ts" : "babel";
        const ast = await self.prettierPlugins.babel.parsers[parser].parse(
          file.source,
          {},
        );
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
