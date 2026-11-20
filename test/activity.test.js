import assert from "node:assert/strict";
import test from "node:test";
import { createActivity } from "../src/activity.ts";

test("deduplicates names and keeps the earliest running timer", () => {
  let now = 100;
  const activity = createActivity(() => now);
  activity.startTool("a", "write");
  now = 300;
  activity.startTool("b", "write");
  activity.startTool("c", "read");
  assert.deepEqual(activity.snapshot().rows.map((row) => row.name), ["write", "read"]);
  assert.equal(activity.snapshot().rows[0].started, 100);
  activity.endTool("b", false);
  assert.equal(activity.snapshot().rows[0].state, "active");
  activity.endTool("a", false);
  assert.equal(activity.snapshot().rows[0].state, "done");
});

test("tracks reasoning, errors, aborts, and reset without retaining content", () => {
  const activity = createActivity(() => 10);
  activity.startThinking();
  activity.startThinking();
  assert.equal(activity.snapshot().rows.length, 1);
  activity.startTool("a", "bash", { command: "SECRET" });
  assert.equal(activity.snapshot().rows[0].state, "done");
  activity.endTool("a", true);
  assert.equal(activity.snapshot().rows[1].state, "error");
  activity.startThinking();
  activity.startTool("b", "read");
  activity.settle(true);
  assert.equal(activity.hasActive(), false);
  assert.equal(activity.snapshot().rows[2].state, "cancelled");
  assert(!JSON.stringify(activity.snapshot()).includes("SECRET"));
  activity.reset();
  assert.deepEqual(activity.snapshot(), { rows: [], skills: [] });
});

test("lists unique skills only after successful skill-file reads", () => {
  const activity = createActivity();
  activity.startTool("a", "read", { path: "/project/.pi/skills/example/SKILL.md" });
  assert.deepEqual(activity.snapshot().skills, []);
  activity.endTool("a", false);
  activity.startTool("b", "read", { path: "C:\\skills\\example\\SKILL.md" });
  activity.endTool("b", false);
  activity.startTool("c", "read", { path: "/skills/failed/SKILL.md" });
  activity.endTool("c", true);
  activity.startTool("d", "bash", { path: "/skills/not-read/SKILL.md" });
  activity.endTool("d", false);
  activity.startTool("e", "read", { path: "/project/README.md" });
  activity.endTool("e", false);
  assert.deepEqual(activity.snapshot().skills, ["example"]);
  activity.reset();
  activity.endTool("a", false);
  assert.deepEqual(activity.snapshot().skills, []);
});

test("reset and settle discard pending skill loads", () => {
  const activity = createActivity();
  activity.startTool("a", "read", { path: "/skills/late/SKILL.md" });
  activity.settle(true);
  activity.endTool("a", false);
  assert.deepEqual(activity.snapshot().skills, []);
});

test("removes terminal control characters from skill names", () => {
  const activity = createActivity();
  activity.startTool("a", "read", { path: "/skills/name\u001b\n/SKILL.md" });
  activity.endTool("a", false);
  assert.deepEqual(activity.snapshot().skills, ["name"]);
});

test("counts calls behind each displayed name for the turn log", () => {
  const activity = createActivity(() => 10);
  for (const id of ["a", "b", "c"]) {
    activity.startTool(id, "read");
    activity.endTool(id, false);
  }
  activity.startThinking();
  activity.finishThinking();
  activity.startThinking();
  activity.finishThinking();
  const rows = activity.snapshot().rows;
  assert.equal(rows.find((row) => row.name === "read").calls, 3);
  assert.equal(rows.find((row) => row.name === "thinking").calls, 2);
});
