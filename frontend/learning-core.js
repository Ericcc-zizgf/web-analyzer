/* Deterministic AST explanations and a bounded interpreter. Never evaluates source code. */
(function (scope) {
  "use strict";
  const UNKNOWN = (reason) => ({ unknown: true, reason }),
    missing = { undefined: true };
  const unknown = (v) => v && typeof v === "object" && v.unknown;
  const format = (v) =>
    unknown(v)
      ? "未知：" + v.reason
      : v === missing || v === undefined
        ? "undefined（沒有回傳值）"
        : typeof v === "number"
          ? String(v)
          : JSON.stringify(v);
  const truth = (v) => (v === missing ? false : Boolean(v));
  const methodMap = {
    "document.querySelector": [
      '傳入 CSS 選擇器，例如 "#save" 或 ".card"。',
      "尋找第一個符合的畫面元素；找不到會得到 null。這個結果是元素的參照，不是複製一份 HTML。",
    ],
    "document.querySelectorAll": [
      "傳入 CSS 選擇器。",
      "取得所有符合的元素清單（NodeList）；不是單一元素。",
    ],
    "document.getElementById": [
      '傳入 id 名稱，例如 "count"，不用加 #。',
      "取得該 id 的元素；找不到會得到 null。",
    ],
    addEventListener: [
      "第一個參數是事件名稱；第二個是事件發生時要執行的函式。",
      "先登記處理方式。這一行通常不會立刻執行回呼；例如 click 要等使用者點擊。",
    ],
    Number: [
      "傳入要轉成數字的值。",
      '例如 Number("3") 得到數字 3；不能轉換的文字會得到 NaN。',
    ],
    String: ["傳入要轉成文字的值。", '例如 String(3) 得到文字 "3"。'],
    fetch: [
      "傳入網址，可再傳入 method、headers、body 等選項。",
      "提出網路請求並回傳 Promise；回應資料不是立刻取得。分析器不會真的送出請求。",
    ],
    setTimeout: [
      "傳入稍後要做的函式，以及延遲毫秒數。",
      "排定一次稍後執行的工作；不是立即呼叫。",
    ],
    setInterval: [
      "傳入重複工作及間隔毫秒。",
      "排定重複工作；需要 clearInterval 才會停止。",
    ],
    "JSON.parse": ["傳入 JSON 文字。", "轉成 JavaScript 值；文字格式錯誤會拋出錯誤。"],
    "JSON.stringify": [
      "傳入 JavaScript 值。",
      "轉成 JSON 文字；不是所有 JavaScript 值都能完整表示。",
    ],
    "localStorage.setItem": [
      "傳入名稱與要保存的文字。",
      "把資料保存到這個網站的瀏覽器儲存空間；不是上傳到伺服器。",
    ],
    "localStorage.getItem": [
      "傳入儲存名稱。",
      "讀取先前保存的文字；沒有這筆資料會得到 null。",
    ],
    map: [
      "傳入轉換每個項目的函式。",
      "把陣列逐項轉換，回傳新陣列。回呼可以收到目前項目、索引與原陣列。",
    ],
    filter: ["傳入回傳真假值的判斷函式。", "回傳符合條件的新陣列，不直接修改原陣列。"],
    forEach: [
      "傳入每個項目要做的函式。",
      "逐項執行工作；本身回傳 undefined，不會產生 map 那樣的新陣列。",
    ],
    push: ["傳入要加入的項目。", "修改原陣列，把項目加到最後，回傳新的陣列長度。"],
    "classList.toggle": [
      "傳入 CSS class 名稱，可再指定 true／false。",
      "切換元素的 class，可能讓套用的 CSS 和畫面改變。",
    ],
    "classList.add": [
      "傳入一個或多個 class 名稱。",
      "把 class 加到元素上，讓相關樣式有機會生效。",
    ],
    "classList.remove": ["傳入一個或多個 class 名稱。", "移除元素的 class。"],
    preventDefault: [
      "通常不需要參數。",
      "阻止事件原本的預設行為，例如表單送出或連結跳頁。",
    ],
    "Math.round": ["傳入數字。", "取最接近的整數。"],
    "Math.floor": ["傳入數字。", "取不大於它的最大整數，例如 2.8 → 2、-2.2 → -3。"],
    "Math.ceil": ["傳入數字。", "取不小於它的最小整數。"],
    "Math.max": ["傳入數個數字。", "回傳其中最大的數字。"],
    "Math.min": ["傳入數個數字。", "回傳其中最小的數字。"],
    "console.log": [
      "傳入想觀察的值。",
      "把值印在開發者工具的 Console；不會直接顯示在網頁。",
    ],
  };
  function name(n) {
    if (!n) return "";
    if (n.type === "Identifier") return n.name;
    if (n.type === "ThisExpression") return "this";
    if (["MemberExpression", "OptionalMemberExpression"].includes(n.type))
      return (
        name(n.object) + "." + (n.computed ? (n.property.value ?? "?") : n.property.name)
      );
    return "";
  }
  function lookup(key) {
    if (methodMap[key]) return methodMap[key];
    const keys = Object.keys(methodMap)
      .filter((k) => key.endsWith("." + k))
      .sort((a, b) => b.length - a.length);
    return keys.length ? methodMap[keys[0]] : null;
  }
  function explain(ast, source) {
    const steps = [],
      functions = [];
    let visited = 0;
    const cut = (n) => source.slice(n.start, n.end).slice(0, 1200);
    const add = (n, title, text) => {
      if (steps.length < 100)
        steps.push({ line: n.loc?.start.line || 1, code: cut(n), title, text });
    };
    function walk(n) {
      if (!n || !n.type || ++visited > 12000) return;
      if (n.type === "VariableDeclaration")
        for (const d of n.declarations) {
          const variable = cut(d.id);
          add(
            d,
            n.kind + " " + variable,
            (n.kind === "const"
              ? "建立名稱「" +
                variable +
                "」，把右邊的結果記住，後面可以用這個名稱取回。const 表示不能再用 = 把這個名稱改指向另一個值；物件或元素的內容仍可能改變。"
              : n.kind === "let"
                ? "建立名稱「" + variable + "」記住右邊結果；之後可用 = 換成另一個值。"
                : "使用 var 宣告變數，作用域與 let／const 不同。") +
              " = 在這裡是把右邊交給左邊，不是數學的相等判斷。",
          );
        }
      if (
        [
          "FunctionDeclaration",
          "FunctionExpression",
          "ArrowFunctionExpression",
          "ObjectMethod",
          "ClassMethod",
        ].includes(n.type)
      ) {
        const params = (n.params || []).map(cut),
          index = functions.length;
        if (index < 40)
          functions.push({
            index,
            name: n.id?.name || n.key?.name || "匿名函式",
            params,
            source: cut(n),
            start: n.start,
            end: n.end,
            node: n,
          });
        add(
          n,
          "函式：把工作命名，等呼叫時再做",
          "括號裡 " +
            (params.length
              ? params.join("、") + " 是接收輸入的參數名稱；呼叫時依位置把值交給它們。"
              : "沒有宣告參數。") +
            " 宣告函式不代表現在就執行它。",
        );
      }
      if (["CallExpression", "OptionalCallExpression"].includes(n.type)) {
        const key = name(n.callee),
          entry = lookup(key);
        add(
          n,
          "呼叫 " + (key || "動態函式"),
          "實際傳入：" +
            n.arguments.map(cut).join("、") +
            "。" +
            (entry
              ? "標準 API 對照（若此名稱指向標準 API）：" + entry.join(" ")
              : "這裡會呼叫一個函式。沒有可確認的定義或執行時資料時，無法只從名稱判定結果。"),
        );
      }
      if (n.type === "ReturnStatement")
        add(
          n,
          "把結果交回呼叫的地方",
          "return " +
            (n.argument
              ? "會把「" + cut(n.argument) + "」算出的結果交回去，並結束目前函式。"
              : "沒有指定值，所以回傳 undefined。"),
        );
      if (n.type === "IfStatement")
        add(
          n,
          "依條件決定走哪一邊",
          "先判斷 " + cut(n.test) + "；成立才做第一段，否則做 else（如果有）。",
        );
      if (n.type === "AwaitExpression")
        add(
          n,
          "等待非同步結果",
          "await 等待 Promise 完成，才繼續目前這個非同步函式；不是讓整個網頁停止。",
        );
      if (n.type === "AssignmentExpression")
        add(
          n,
          "修改 " + cut(n.left),
          /\.(textContent|innerText)$/.test(name(n.left))
            ? "把右邊的結果顯示成這個元素的文字；畫面上的文字會改變。"
            : /\.innerHTML$/.test(name(n.left))
              ? "把右邊當作 HTML 改寫元素內容；外部輸入需要另外處理。"
              : "將右邊的結果寫入左邊指定的位置。寫入元素或物件的屬性，與重新指定 const 變數本身不同。",
        );
      if (["MemberExpression", "OptionalMemberExpression"].includes(n.type)) {
        if (["textContent", "innerText"].includes(n.property?.name))
          add(
            n,
            "讀取／指定元素的文字",
            "點號表示取出這個物件的一項資料。" +
              n.property.name +
              " 代表元素裡的文字；在 = 左側時是修改，其他位置通常是讀取。",
          );
      }
      for (const [key, v] of Object.entries(n)) {
        if (
          [
            "loc",
            "extra",
            "comments",
            "tokens",
            "leadingComments",
            "trailingComments",
            "innerComments",
          ].includes(key)
        )
          continue;
        if (Array.isArray(v)) v.forEach((c) => c?.type && walk(c));
        else if (v?.type) walk(v);
      }
    }
    walk(ast.program || ast);
    return {
      steps,
      functions: functions.map(({ node, ...f }) => f),
      truncated: visited > 12000 || steps.length >= 100,
      glossary: [
        [
          "const 為什麼要用",
          '例如 const button = document.querySelector("#save")：先找出按鈕，再把它的參照取名為 button，後面就能用 button 登記事件，不用每次重寫查找。const 限制的是 button 不能改指向另一個值；button.textContent 仍可改。',
        ],
        [
          "DOM",
          "瀏覽器把 HTML 變成可由程式讀取和修改的元素物件。你在預覽點到的按鈕，就是其中一個。",
        ],
        [
          "變數",
          "替一個值或元素參照取名稱，讓後面的程式能再次使用；不是每次都重新尋找或重寫。",
        ],
        [
          "參數與引數",
          "函式宣告括號中的名稱叫參數；呼叫時實際送入的值叫引數。位置通常一一對應。",
        ],
        ["回傳值", "函式用 return 交回的結果；改了畫面不一定有回傳值。"],
      ],
    };
  }
  function simulate(ast, index, args) {
    const fns = [],
      shadowed = new Set();
    let count = 0;
    function collect(n) {
      if (!n?.type || ++count > 12000) return;
      if (n.type === "VariableDeclarator" && n.id?.type === "Identifier")
        shadowed.add(n.id.name);
      if (n.type === "FunctionDeclaration" && n.id) shadowed.add(n.id.name);
      if (
        [
          "FunctionDeclaration",
          "FunctionExpression",
          "ArrowFunctionExpression",
          "ObjectMethod",
          "ClassMethod",
        ].includes(n.type)
      )
        fns.push(n);
      for (const [k, v] of Object.entries(n)) {
        if (["loc", "extra", "comments", "tokens"].includes(k)) continue;
        if (Array.isArray(v)) v.forEach((c) => c?.type && collect(c));
        else if (v?.type) collect(v);
      }
    }
    collect(ast.program || ast);
    const fn = fns[index];
    if (!fn) throw Error("請先選擇可以推演的函式。");
    if (!Array.isArray(args) || args.length > 30)
      throw Error("輸入必須是 JSON 陣列，例如 [2, 3]，最多 30 個值。");
    const env = new Map(),
      trace = [];
    let budget = 300;
    function value(n) {
      if (--budget < 0) return UNKNOWN("超過推演步數");
      if (!n) return missing;
      if (
        [
          "NumericLiteral",
          "StringLiteral",
          "BooleanLiteral",
          "NullLiteral",
          "Literal",
        ].includes(n.type)
      )
        return n.type === "NullLiteral" ? null : n.value;
      if (n.type === "Identifier")
        return env.has(n.name)
          ? env.get(n.name)
          : UNKNOWN("需要外部變數 " + n.name + " 的實際值");
      if (n.type === "BinaryExpression") {
        const a = value(n.left),
          b = value(n.right);
        if (unknown(a) || unknown(b)) return UNKNOWN("運算需要的值尚未確定");
        if (a === missing || b === missing)
          return UNKNOWN("省略的輸入沒有具體值，請提供所有運算需要的參數");
        const op = {
          "+": () => a + b,
          "-": () => a - b,
          "*": () => a * b,
          "/": () => a / b,
          "%": () => a % b,
          "===": () => a === b,
          "!==": () => a !== b,
          "==": () => a == b,
          "!=": () => a != b,
          ">": () => a > b,
          "<": () => a < b,
          ">=": () => a >= b,
          "<=": () => a <= b,
        };
        return op[n.operator] ? op[n.operator]() : UNKNOWN("尚未支援此運算子");
      }
      if (n.type === "ConditionalExpression") {
        const t = value(n.test);
        return unknown(t) ? t : value(truth(t) ? n.consequent : n.alternate);
      }
      if (n.type === "UnaryExpression") {
        const v = value(n.argument);
        if (unknown(v)) return v;
        if (v === missing && n.operator !== "!") return UNKNOWN("運算的輸入未提供");
        return n.operator === "!"
          ? !truth(v)
          : n.operator === "-"
            ? -v
            : n.operator === "+"
              ? +v
              : UNKNOWN("未支援的單元運算");
      }
      if (n.type === "LogicalExpression") {
        const a = value(n.left);
        if (unknown(a)) return a;
        return n.operator === "&&"
          ? truth(a)
            ? value(n.right)
            : a
          : n.operator === "||"
            ? truth(a)
              ? a
              : value(n.right)
            : n.operator === "??"
              ? a == null || a === missing
                ? value(n.right)
                : a
              : UNKNOWN("未支援的邏輯運算");
      }
      if (n.type === "ArrayExpression") return n.elements.map(value);
      if (n.type === "MemberExpression") {
        const obj = value(n.object),
          key = n.computed ? value(n.property) : n.property.name;
        if (unknown(obj)) return obj;
        if (
          obj != null &&
          !["__proto__", "prototype", "constructor"].includes(key) &&
          Object.hasOwn(Object(obj), key)
        )
          return obj[key];
        return UNKNOWN("無法確定這個屬性的值");
      }
      if (n.type === "CallExpression") {
        const key = name(n.callee),
          allowed = {
            Number,
            String,
            Boolean,
            "Math.round": Math.round,
            "Math.floor": Math.floor,
            "Math.ceil": Math.ceil,
            "Math.abs": Math.abs,
            "Math.min": Math.min,
            "Math.max": Math.max,
          };
        if (
          !Object.hasOwn(allowed, key) ||
          env.has(key.split(".")[0]) ||
          shadowed.has(key.split(".")[0])
        )
          return UNKNOWN("不執行 " + key + "；可能需要 DOM、網路、其他函式或執行時資料");
        const values = n.arguments.map(value);
        if (values.some((v) => unknown(v) || v === missing))
          return UNKNOWN("呼叫的輸入值尚未確定");
        if (values.some((v) => typeof v === "object" && v !== null))
          return UNKNOWN("此轉換推演只支援基本型別");
        return allowed[key](...values);
      }
      return UNKNOWN("此語法尚未支援推演：" + n.type);
    }
    for (let i = 0; i < fn.params.length; i++) {
      const p = fn.params[i];
      if (p.type !== "Identifier")
        return { result: UNKNOWN("解構、預設參數或剩餘參數尚未支援推演"), trace };
      env.set(p.name, i < args.length ? args[i] : missing);
      trace.push(p.name + " ← " + format(env.get(p.name)));
    }
    function block(statements, nested = false) {
      for (const s of statements) {
        if (--budget < 0) return { done: true, result: UNKNOWN("超過推演步數") };
        if (s.type === "ReturnStatement") {
          const v = value(s.argument);
          trace.push("return → " + format(v));
          return { done: true, result: v };
        }
        if (s.type === "VariableDeclaration") {
          if (nested && s.kind === "var")
            return { done: true, result: UNKNOWN("區塊內 var 的作用域尚未支援推演") };
          for (const d of s.declarations) {
            if (d.id.type !== "Identifier")
              return { done: true, result: UNKNOWN("未支援的變數宣告") };
            env.set(d.id.name, value(d.init));
            trace.push(d.id.name + " ← " + format(env.get(d.id.name)));
          }
        } else if (s.type === "IfStatement") {
          const t = value(s.test);
          trace.push("條件 → " + format(t));
          if (unknown(t)) return { done: true, result: t };
          const next = truth(t) ? s.consequent : s.alternate;
          if (next) {
            const saved = new Map(env);
            const out = block(next.type === "BlockStatement" ? next.body : [next], true);
            env.clear();
            for (const [key, value] of saved) env.set(key, value);
            if (out.done) return out;
          }
        } else if (s.type === "BlockStatement") {
          return { done: true, result: UNKNOWN("獨立區塊作用域尚未支援推演") };
        } else if (s.type !== "EmptyStatement")
          return {
            done: true,
            result: UNKNOWN("遇到 " + s.type + "，停止推演；沒有執行來源程式或外部操作"),
          };
      }
      return { done: false, result: missing };
    }
    let result;
    if (fn.async || fn.generator) result = UNKNOWN("非同步與產生器函式尚未支援推演");
    else
      result =
        fn.body.type === "BlockStatement" ? block(fn.body.body).result : value(fn.body);
    return { result, trace };
  }
  const api = { explain, simulate, format, methodMap };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.LearningCore = api;
})(globalThis);
