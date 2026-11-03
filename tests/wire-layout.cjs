const assert = require("node:assert/strict");
const W = require("../frontend/wire-layout.js");
const a = { x: 40, y: 80, width: 200, height: 160 },
  b = { x: 600, y: 350, width: 240, height: 200 };
for (const side of ["left", "right", "top", "bottom"]) {
  const saved = {
    from: { side, t: 0.35 },
    to: { side, t: 0.65 },
    via: { x: 440, y: 240 },
  };
  for (const style of ["curve", "orthogonal"]) {
    const r = W.route(a, b, { ...saved, style });
    assert.ok(!/NaN|undefined|Infinity/.test(r.d));
    assert.equal(r.via.x, 440);
    assert.equal(r.via.y, 240);
    assert.match(r.d, style === "curve" ? / C/ : / L/);
  }
}
const orth = W.route(a, b, { style: "orthogonal", via: { x: 430, y: 220 } });
const coords = [...orth.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
  Number(m[1]),
  Number(m[2]),
]);
for (let i = 1; i < coords.length; i++)
  assert.ok(
    coords[i - 1][0] === coords[i][0] || coords[i - 1][1] === coords[i][1],
    "all orthogonal segments remain axis aligned",
  );
assert.deepEqual(W.nearest(a, { x: 125, y: 79 }), { side: "top", t: 0.425 });
assert.equal(
  W.route(a, b, { from: { side: "bottom", t: 0.5 } }).from.y,
  a.y + a.height,
);
assert.deepEqual(W.load({ getItem: () => "{broken" }, "x"), {
  version: 1,
  nodes: {},
  routes: {},
});
const stored = {
  version: 1,
  nodes: { a: { x: 11, y: 42 }, bad: { x: "bad", y: 4 } },
  routes: {
    edge: {
      style: "orthogonal",
      from: { side: "top", t: 8 },
      to: { side: "other", t: 0.5 },
      via: { x: 430, y: 220 },
    },
  },
};
const loaded = W.load({ getItem: () => JSON.stringify(stored) }, "x");
assert.deepEqual(loaded.nodes, { a: { x: 11, y: 42 } });
assert.equal(loaded.routes.edge.from.t, 1);
assert.equal(loaded.routes.edge.to, undefined);
assert.equal(loaded.routes.edge.style, "orthogonal");
assert.ok(!/NaN/.test(W.route(a, a, {}, true).d));
assert.notEqual(W.hash("project-a"), W.hash("project-b"));
console.log(
  "PASS routing from all four sides, orthogonal segments, normalized anchors, self-loop, persistence validation, corrupt storage recovery",
);
