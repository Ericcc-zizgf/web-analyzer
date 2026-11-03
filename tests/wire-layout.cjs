const assert = require("node:assert/strict"),
  W = require("../frontend/wire-layout.js");
const a = { x: 37, y: 81, width: 203, height: 157 },
  b = { x: 601, y: 351, width: 241, height: 199 };
function check(r) {
  assert.ok(!/[CQ]|NaN|Infinity|undefined/.test(r.d));
  for (const p of r.points) {
    assert.equal(p.x % W.GRID, 0);
    assert.equal(p.y % W.GRID, 0);
  }
  for (const s of r.segments)
    assert.ok(
      s.a.x === s.b.x || s.a.y === s.b.y,
      "only horizontal/vertical segments",
    );
}
for (const side of ["left", "right", "top", "bottom"])
  for (const other of ["left", "right", "top", "bottom"]) {
    check(
      W.route(a, b, {
        from: { side, t: 0.37 },
        to: { side: other, t: 0.62 },
        waypoints: [
          { x: 433, y: 287 },
          { x: 519, y: 113 },
        ],
      }),
    );
  }
check(W.route(a, b));
check(W.route(a, a, {}, true));
const below = W.route(a, { ...a, y: 400 });
assert.equal(below.from.dy, 1);
assert.equal(below.to.dy, -1);
assert.ok(
  below.points.length <= 4,
  "vertical neighbors use simple facing ports",
);
assert.equal(W.route(a, b).waypoints.length, 0, "no invented joint handles");
assert.deepEqual(W.route(a, b, { waypoints: [{ x: 433, y: 287 }] }).waypoints, [
  { x: 440, y: 280 },
]);
const old = W.load(
  {
    getItem: () =>
      JSON.stringify({
        version: 1,
        nodes: { a: { x: 10, y: 50 } },
        routes: {
          edge: {
            style: "curve",
            via: { x: 12, y: 18 },
            from: { side: "top", t: 0.5 },
          },
        },
      }),
  },
  "x",
);
assert.equal(old.version, 2);
assert.deepEqual(old.nodes.a, { x: 10, y: 50 });
assert.deepEqual(old.routes.edge.waypoints, []);
assert.equal(old.routes.edge.from.side, "top");
assert.equal(old.routes.edge.via, undefined);
const state = W.load(
  {
    getItem: () =>
      JSON.stringify({
        version: 2,
        nodes: { bad: { x: "bad", y: 1 } },
        routes: {
          e: {
            waypoints: [
              { x: 31, y: 49 },
              { x: "bad", y: 1 },
            ],
          },
        },
      }),
  },
  "x",
);
assert.deepEqual(state.routes.e.waypoints, [{ x: 40, y: 40 }]);
assert.deepEqual(state.nodes, {});
assert.deepEqual(W.load({ getItem: () => "{bad" }, "x"), {
  version: 2,
  nodes: {},
  routes: {},
});
console.log(
  "PASS all endpoints/sides on grid, orthogonal segments, simple default routes, explicit joints, legacy migration and invalid storage",
);
