import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreferences, DEFAULT_ALWAYS_VISIBLE_TOOLS } from "../src/config.ts";

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), "focus-mode-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const cwd = join(base, "project");
  const agentDir = join(base, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  const bundled = new URL("../extensions/focus-mode/config.json", import.meta.url);
  return { cwd, agentDir, bundled, project: join(cwd, ".pi", "focus-mode.json"), global: join(agentDir, "focus-mode.json"), preferences: createPreferences(bundled, agentDir) };
}

const noWarning = (message) => assert.fail(message);

test("merges defaults and saves only the project preference for the next load", (t) => {
  const f = fixture(t);
  assert.equal(f.preferences.load(f.cwd, noWarning).enabled, false);
  writeFileSync(f.global, '{"enabled":true}');
  assert.equal(f.preferences.load(f.cwd, noWarning).enabled, true);
  f.preferences.save(f.cwd, false);
  assert.equal(createPreferences(f.bundled, f.agentDir).load(f.cwd, noWarning).enabled, false);
  assert.equal(f.preferences.load(undefined, noWarning).enabled, true);
  writeFileSync(f.project, '{"enabled":false,"other":42}');
  f.preferences.save(f.cwd, true);
  assert.deepEqual(JSON.parse(readFileSync(f.project, "utf8")), { enabled: true, other: 42 });
  assert.equal(readFileSync(f.global, "utf8"), '{"enabled":true}');
});

test("warns and starts normal on invalid config without overwriting it", (t) => {
  const f = fixture(t);
  writeFileSync(f.global, '{"enabled":true}');
  f.preferences.save(f.cwd, true);
  for (const invalid of ['{"enabled":"yes"}', "[]", "{"]) {
    writeFileSync(f.project, invalid);
    const warnings = [];
    const settings = f.preferences.load(f.cwd, (warning) => warnings.push(warning));
    assert.equal(settings.enabled, false);
    assert.deepEqual(settings.alwaysVisibleTools, DEFAULT_ALWAYS_VISIBLE_TOOLS);
    assert.equal(warnings.length, 1);
    assert(warnings[0].includes(f.project));
    assert.throws(() => f.preferences.save(f.cwd, false));
    assert.equal(readFileSync(f.project, "utf8"), invalid);
  }
});

test("never saves through a project path that points to global config", (t) => {
  const f = fixture(t);
  writeFileSync(f.global, '{"enabled":true}');
  const dir = join(f.cwd, ".pi");
  symlinkSync(f.agentDir, dir, "dir");
  assert.throws(() => f.preferences.save(f.cwd, false));
  rmSync(dir);
  mkdirSync(dir);
  symlinkSync(f.global, f.project);
  assert.throws(() => f.preferences.save(f.cwd, false));
  assert.throws(() => createPreferences(f.bundled, dir).save(f.cwd, false));
  assert.equal(readFileSync(f.global, "utf8"), '{"enabled":true}');
});

test("resolves always-visible tools across layers and validates them", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.cwd, ".pi"), { recursive: true });
  assert.deepEqual(f.preferences.load(f.cwd, noWarning).alwaysVisibleTools, DEFAULT_ALWAYS_VISIBLE_TOOLS);
  writeFileSync(f.global, '{"alwaysVisibleTools":["read", " read ", "read"]}');
  assert.deepEqual(f.preferences.load(f.cwd, noWarning).alwaysVisibleTools, ["read"]);
  writeFileSync(f.project, '{"enabled":true,"alwaysVisibleTools":[]}');
  assert.deepEqual(f.preferences.load(f.cwd, noWarning).alwaysVisibleTools, []);
  writeFileSync(f.project, '{"alwaysVisibleTools":["ask_user_question"]}');
  assert.deepEqual(f.preferences.load(undefined, noWarning).alwaysVisibleTools, ["read"]);
  for (const invalid of ['{"alwaysVisibleTools":"read"}', '{"alwaysVisibleTools":[1]}', '{"alwaysVisibleTools":[""]}']) {
    writeFileSync(f.global, invalid);
    const warnings = [];
    const settings = f.preferences.load(f.cwd, (warning) => warnings.push(warning));
    assert.deepEqual(settings.alwaysVisibleTools, DEFAULT_ALWAYS_VISIBLE_TOOLS);
    assert.equal(settings.enabled, false);
    assert.equal(warnings.length, 1);
  }
});
