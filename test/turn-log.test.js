import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendTurnRecord, stateDirectory } from "../src/turn-log.ts";

const record = (sessionId = "session-1") => ({
  version: 1,
  sessionId,
  settledAt: "2026-11-20T21:55:12.345Z",
  aborted: false,
  durationMs: 1200,
  workingMs: 900,
  activities: [{ name: "read", state: "done", elapsedMs: 400, calls: 2 }],
  skills: ["example"],
});

test("uses XDG_STATE_HOME only when it is absolute", () => {
  assert.equal(stateDirectory("/home/user", { XDG_STATE_HOME: "/state" }), "/state/pi-focus-mode");
  assert.equal(stateDirectory("/home/user", { XDG_STATE_HOME: "relative" }), "/home/user/.local/state/pi-focus-mode");
  assert.equal(stateDirectory("/home/user", {}), "/home/user/.local/state/pi-focus-mode");
});

test("appends one JSON line per turn and keeps the files private", (t) => {
  const home = mkdtempSync(join(tmpdir(), "focus-mode-log-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const path = appendTurnRecord(record(), { home, env: {} });
  appendTurnRecord({ ...record(), aborted: true }, { home, env: {} });
  assert.equal(path, join(home, ".local", "state", "pi-focus-mode", "session-1.jsonl"));
  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), record());
  assert.equal(JSON.parse(lines[1]).aborted, true);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(home, ".local", "state", "pi-focus-mode")).mode & 0o777, 0o700);
});

test("rejects session IDs that could escape the state directory", () => {
  for (const id of ["../escape", "a/b", "", ".hidden", "ends.", "a b"]) {
    assert.throws(() => appendTurnRecord(record(id), { home: tmpdir(), env: {} }));
  }
});
