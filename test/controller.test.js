import assert from "node:assert/strict";
import test from "node:test";
import { registerFocusMode } from "../src/controller.ts";

function harness(mode = "tui", { trusted = true, enabled = false, failSave = false } = {}) {
  const loads = [], saves = [];
  const events = new Map();
  let shortcut, widget, working = true;
  const warnings = [];
  const root = {
    children: [], terminal: { rows: 40 },
    render() { return []; }, doRender() {}, invalidate() {}, requestRender() {},
  };
  const ctx = { mode, cwd: "/project", isProjectTrusted: () => trusted, ui: {
    setWidget(_key, factory) { widget = factory?.(root, { fg: (_color, text) => text }); },
    setWorkingVisible(value) { working = value; },
    notify(message) { warnings.push(message); },
  } };
  registerFocusMode({
    on(name, handler) { events.set(name, handler); },
    registerShortcut(key, options) { assert.equal(key, "ctrl+i"); shortcut = options.handler; },
    registerCommand() { assert.fail("No slash commands"); },
  }, {
    measure: (text) => [...text].length,
    truncate: (text, width) => [...text].slice(0, width).join(""),
  }, {
    load(cwd) { loads.push(cwd); return enabled; },
    save(cwd, value) {
      saves.push([cwd, value]);
      if (failSave) throw new Error("read-only");
    },
  });
  return { events, ctx, root, warnings, loads, saves, toggle: () => shortcut(ctx), widget: () => widget, working: () => working };
}

test("starts normal, updates while hidden, toggles, resets, and shuts down", async () => {
  const h = harness();
  const frame = h.root.doRender;
  h.events.get("session_start")({}, h.ctx);
  assert.deepEqual(h.widget().render(100), []);
  h.events.get("tool_execution_start")({ toolCallId: "a", toolName: "read", args: { path: "/skills/example/SKILL.md" } });
  h.events.get("tool_execution_end")({ toolCallId: "a", isError: false });
  await h.toggle();
  assert.equal(h.working(), false);
  assert(h.widget().render(100).join("\n").includes("example"));
  h.events.get("message_start")({ message: { role: "user" } });
  assert(!h.widget().render(100).join("\n").includes("example"));
  h.events.get("message_update")({ assistantMessageEvent: { type: "thinking_start" } });
  assert(h.widget().render(100).join("\n").includes("◉ thinking"));
  h.events.get("message_end")({ message: { role: "assistant" } });
  assert(h.widget().render(100).join("\n").includes("✓ thinking"));
  h.events.get("agent_settled")({ aborted: false });
  h.events.get("session_tree")();
  assert(h.widget().render(100).join("\n").includes("– thinking  0.0s"));
  assert(h.widget().render(100).join("\n").includes("– working  0.0s"));
  h.events.get("session_shutdown")();
  assert.equal(h.working(), true);
  assert.equal(h.widget(), undefined);
  assert.equal(h.root.doRender, frame);
});

test("tracks response waiting without reasoning, across tools and cancellation", async () => {
  const h = harness();
  h.events.get("session_start")({}, h.ctx);
  await h.toggle();
  const view = () => h.widget().render(100).join("\n");
  h.events.get("turn_start")({});
  h.events.get("message_start")({ message: { role: "user" } });
  assert(view().includes("◉ working"));
  assert(view().includes("– thinking  0.0s"));
  h.events.get("message_update")({ assistantMessageEvent: { type: "text_start" } });
  assert(view().includes("◉ working"));
  h.events.get("message_end")({ message: { role: "assistant" } });
  assert(view().includes("✓ working"));
  h.events.get("turn_start")({});
  h.events.get("message_update")({ assistantMessageEvent: { type: "thinking_start" } });
  h.events.get("tool_execution_start")({ toolCallId: "a", toolName: "read" });
  assert(view().includes("✓ working"));
  assert(view().includes("✓ thinking"));
  h.events.get("tool_execution_end")({ toolCallId: "a", isError: false });
  h.events.get("turn_start")({});
  assert(view().includes("◉ working"));
  h.events.get("agent_settled")({ aborted: true });
  assert(!view().includes("◉"));
  assert(view().includes("✓ thinking"));
  h.events.get("turn_start")({});
  h.events.get("turn_end")({});
  assert(view().includes("✓ working"));
  h.events.get("session_shutdown")();
});

test("never changes rendering in RPC and print modes", async () => {
  for (const mode of ["rpc", "print", "json"]) {
    const h = harness(mode);
    const frame = h.root.doRender;
    h.events.get("session_start")({}, h.ctx);
    await h.toggle();
    h.events.get("session_shutdown")();
    assert.equal(h.root.doRender, frame);
    assert.equal(h.widget(), undefined);
    assert.equal(h.working(), true);
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.saves, []);
  }
});

test("reports unsupported rendering without hiding working status", async () => {
  const h = harness("tui", { enabled: true });
  h.root.doRender = undefined;
  h.events.get("session_start")({}, h.ctx);
  await h.toggle();
  assert.equal(h.working(), true);
  assert(h.warnings.some((message) => message.includes("unavailable")));
  assert.deepEqual(h.saves, []);
  h.events.get("session_shutdown")();
});

test("applies the startup preference and saves explicit toggles only", async () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({ reason: "reload" }, h.ctx);
  assert.deepEqual(h.loads, ["/project"]);
  assert.equal(h.working(), false);
  assert(h.widget().render(100).join("\n").includes("thinking"));
  assert.deepEqual(h.saves, []);
  await h.toggle();
  assert.equal(h.working(), true);
  assert.deepEqual(h.saves, [["/project", false]]);
  h.events.get("session_shutdown")();
});

test("uses no project config in an untrusted project", async () => {
  const h = harness("tui", { trusted: false });
  h.events.get("session_start")({}, h.ctx);
  await h.toggle();
  assert.equal(h.working(), false);
  assert.deepEqual(h.loads, [undefined]);
  assert.deepEqual(h.saves, []);
  h.events.get("session_shutdown")();
});

test("keeps the display toggle when saving fails", async () => {
  const h = harness("tui", { failSave: true });
  h.events.get("session_start")({}, h.ctx);
  await h.toggle();
  assert.equal(h.working(), false);
  assert(h.warnings.some((message) => message.includes("was not saved")));
  h.events.get("session_shutdown")();
});
