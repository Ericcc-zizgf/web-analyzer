const assert = require("node:assert/strict");
const Layout = require("../frontend/canvas-layout.js");
const boxes = [
  { id: "a", x: 30, y: 100, width: 200, height: 200 },
  { id: "b", x: 300, y: 120, width: 240, height: 150 },
  { id: "c", x: 300, y: 400, width: 240, height: 200 },
];
assert.equal(
  Layout.canPlace("a", 200, 120, boxes),
  false,
  "drag cannot overlap neighbor",
);
assert.equal(Layout.canPlace("a", 30, 100, boxes), true, "legal position retained");
assert.equal(Layout.canPlace("a", -1, 100, boxes), false);
assert.equal(Layout.canPlace("a", 30, 0, boxes), false, "label remains within canvas");
const grown = boxes.map((b) => (b.id === "b" ? { ...b, height: 400 } : b));
const settled = Layout.settle(grown);
for (let i = 0; i < settled.length; i++)
  for (let j = i + 1; j < settled.length; j++)
    assert.equal(Layout.overlaps(settled[i], settled[j]), false);
assert.equal(settled[0].y, 100);
assert.ok(settled[2].y > settled[1].y + settled[1].height);
const all = Layout.settle(
  Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    x: 0,
    y: 40,
    width: 200,
    height: 100 + i * 20,
  })),
);
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++)
    assert.equal(Layout.overlaps(all[i], all[j]), false);
assert.deepEqual(Layout.settle(all), all, "reflow stable");
console.log(
  "PASS node collision, label/spacing bounds, dynamic-height reflow, cascaded collisions and stable layout",
);
