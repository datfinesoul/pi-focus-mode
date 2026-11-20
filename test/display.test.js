import assert from "node:assert/strict";
import test from "node:test";
import { renderActivity } from "../src/display.ts";

const plain = {
  fg: (_color, text) => text,
  measure: (text) => [...text].length,
  truncate: (text, width) => [...text].slice(0, width).join(""),
};
const snapshot = {
  rows: [{ id: "a", name: "write", started: 100, state: "active" }],
  skills: ["example-skill"],
};

test("resizes the header and moves Skills inline only when it fits", () => {
  for (const width of [1, 12, 28, 40, 59, 60, 61, 80, 100, 160]) {
    const lines = renderActivity(snapshot, width, 40, 1500, plain);
    assert.equal(plain.measure(lines[0]), width);
    assert(lines.every((line) => plain.measure(line) <= width));
    if (width >= 60) assert(lines[0].includes("Skills"));
    if (width < 60 && width >= 6) assert(lines.slice(1).some((line) => line === "Skills"));
  }
  assert.deepEqual(renderActivity(snapshot, 0, 40, 1500, plain), []);
});

test("collapses to the header line only", () => {
  for (const width of [1, 12, 28, 40, 59, 60, 61, 80, 100, 160]) {
    const lines = renderActivity(snapshot, width, 40, 1500, plain, { collapsed: true });
    assert.equal(lines.length, 1);
    assert.equal(plain.measure(lines[0]), width);
    if (width >= 8) assert(lines[0].includes("Activity"));
    assert(!lines[0].includes("Skills"));
    assert(!lines[0].includes("write"));
  }
  assert.deepEqual(renderActivity(snapshot, 0, 40, 1500, plain, { collapsed: true }), []);
});

test("retains completed timers and uses accent for the rule", () => {
  const styles = [];
  const lines = renderActivity(snapshot, 100, 40, 1500, {
    ...plain,
    fg(color, text) { styles.push([color, text]); return text; },
  });
  assert(lines.join("\n").includes("◉ write  1.4s"));
  assert(styles.filter(([, text]) => text.includes("─")).every(([color]) => color === "accent"));
  const done = renderActivity({ ...snapshot, rows: [{ ...snapshot.rows[0], state: "done" }] }, 100, 40, 1500, plain);
  assert(done.join("\n").includes("✓ write  1.4s"));
});

test("keeps thinking and response waiting visible in crowded panels", () => {
  const thinking = { id: "thinking-1", name: "thinking", started: 0, state: "done" };
  const rows = [thinking, ...Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `tool-${i}`, started: 0, state: "done" }))];
  for (const width of [40, 100]) {
    for (const height of [8, 12, 24]) {
      const view = renderActivity({ rows, skills: [], working: { id: "model-working", name: "working", started: 0, state: "active" } }, width, height, 1500, plain).join("\n");
      assert(view.includes("✓ thinking"));
      assert(view.includes("◉ working  1.5s"));
      assert(view.includes("earlier activities"));
      if (height >= 12) assert(view.includes("tool-19"));
    }
  }
});

test("has short empty labels and bounds long lists", () => {
  const empty = renderActivity({ rows: [], skills: [] }, 100, 40, 0, plain).join("\n");
  assert(empty.includes("– working  0.0s"));
  assert(empty.includes("– thinking  0.0s"));
  assert(empty.includes("None yet"));
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `tool-${i}`, started: 0, state: "done" }));
  const skills = Array.from({ length: 20 }, (_, i) => `skill-${i}`);
  const lines = renderActivity({ rows, skills }, 100, 12, 0, plain);
  assert.equal(lines.length, 6);
  assert(lines.join("\n").includes("18 earlier activities"));
  assert(lines.join("\n").includes("17 earlier skills"));
});
