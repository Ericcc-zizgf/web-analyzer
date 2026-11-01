/* Geometry-only constraints, shared by mouse/keyboard movement and automatic reflow. */
(function (scope) {
  "use strict";
  const GAP = 24,
    LABEL = 34;
  function overlaps(a, b, gap = GAP) {
    return !(
      a.x + a.width + gap <= b.x ||
      b.x + b.width + gap <= a.x ||
      a.y + a.height + gap <= b.y - LABEL ||
      b.y + b.height + gap <= a.y - LABEL
    );
  }
  function canPlace(id, x, y, boxes) {
    const original = boxes.find((b) => b.id === id);
    if (!original || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < LABEL)
      return false;
    const next = { ...original, x, y };
    return boxes.every((other) => other.id === id || !overlaps(next, other));
  }
  function settle(boxes) {
    const result = boxes.map((b) => ({ ...b }));
    for (let pass = 0; pass < result.length + 1; pass++) {
      let changed = false;
      for (let i = 0; i < result.length; i++)
        for (let j = i + 1; j < result.length; j++) {
          if (overlaps(result[i], result[j])) {
            result[j].y = result[i].y + result[i].height + GAP + LABEL;
            changed = true;
          }
        }
      if (!changed) break;
    }
    return result;
  }
  const api = { GAP, LABEL, overlaps, canPlace, settle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else scope.CanvasLayout = api;
})(globalThis);
