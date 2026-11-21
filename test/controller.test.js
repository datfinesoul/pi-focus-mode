import assert from "node:assert/strict";
import test from "node:test";
import { registerFocusMode } from "../src/controller.ts";

function harness(mode = "tui", { trusted = true, enabled = false, tools = ["ask_user_question"], failSave = false, failLog = false } = {}) {
  const loads = [], saves = [], log = [];
  const events = new Map();
  let shortcut, widget, working = true;
  const warnings = [];
  const root = {
    children: [], terminal: { rows: 40 },
    render() { return []; }, doRender() {}, invalidate() {}, requestRender() {},
  };
  const ctx = { mode, cwd: "/project", isProjectTrusted: () => trusted, sessionManager: { getSessionId: () => "session-1" }, ui: {
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
    load(cwd) { loads.push(cwd); return { enabled, alwaysVisibleTools: tools }; },
    save(cwd, value) {
      saves.push([cwd, value]);
      if (failSave) throw new Error("read-only");
    },
  }, (record) => {
    if (failLog) throw new Error("read-only");
    log.push(record);
  });
  return { events, ctx, root, warnings, loads, saves, log, toggle: () => shortcut(ctx), widget: () => widget, working: () => working };
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
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  h.events.get("session_tree")();
  // A reset leaves no activity, so only the header remains.
  assert.equal(h.widget().render(100).length, 1);
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
  h.events.get("agent_settled")({ aborted: true }, h.ctx);
  // The panel collapses to its header until the next turn starts.
  assert.equal(h.widget().render(100).length, 1);
  assert(!view().includes("◉"));
  h.events.get("turn_start")({});
  assert(view().includes("✓ thinking"));
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
  assert.equal(h.widget().render(100).length, 1);
  h.events.get("turn_start")({});
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

class ToolExecutionComponent {
  constructor(toolName) { this.toolName = toolName; }
  render() { return ["original tool display"]; }
}

test("shows configured tools in compact mode and hides others", async () => {
  const h = harness("tui", { tools: ["custom_tool"] });
  const question = new ToolExecutionComponent("custom_tool");
  const tool = new ToolExecutionComponent("read");
  const anonymous = new ToolExecutionComponent();
  h.root.children.push(question, tool, anonymous);
  h.events.get("session_start")({}, h.ctx);
  h.root.doRender();
  assert.deepEqual(question.render(80), ["original tool display"]);
  assert.deepEqual(tool.render(80), ["original tool display"]);
  await h.toggle();
  h.root.doRender();
  assert.deepEqual(question.render(80), ["original tool display"]);
  assert.deepEqual(tool.render(80), []);
  assert.deepEqual(anonymous.render(80), []);
  h.events.get("session_shutdown")();
});

test("collapses at settle and writes one log record per turn", async () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({}, h.ctx);
  const view = () => h.widget().render(100);
  h.events.get("turn_start")({});
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("tool_execution_start")({ toolCallId: "a", toolName: "read", args: { path: "/skills/example/SKILL.md" } });
  h.events.get("tool_execution_end")({ toolCallId: "a", isError: false });
  h.events.get("message_end")({ message: { role: "assistant" } });
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(view().length, 1);
  assert(view()[0].includes("Activity"));
  assert.equal(h.log.length, 1);
  const record = h.log[0];
  assert.equal(record.version, 1);
  assert.equal(record.sessionId, "session-1");
  assert.equal(record.aborted, false);
  assert.equal(typeof record.durationMs, "number");
  assert.equal(typeof record.workingMs, "number");
  assert(record.activities.some((row) => row.name === "read" && row.calls === 1 && row.elapsedMs >= 0));
  assert.deepEqual(record.skills, ["example"]);
  // A repeated settle signal must not write the same turn twice.
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.log.length, 1);
  h.events.get("message_start")({ message: { role: "user" } });
  assert(view().length > 1);
  h.events.get("agent_settled")({ aborted: true }, h.ctx);
  assert.equal(h.log.length, 2);
  assert.equal(h.log[1].aborted, true);
  assert.deepEqual(record.skills, ["example"]);
  h.events.get("session_shutdown")();
});

test("collapses while an extension prompt waits for the user", async () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("tool_execution_start")({ toolCallId: "q", toolName: "ask_user_question" });
  const view = () => h.widget().render(100);
  assert(view().length > 1);
  h.events.get("ui_prompt_start")({ kind: "custom" });
  assert.equal(view().length, 1);
  assert(view()[0].includes("Activity"));
  // Ctrl+I toggles focus mode but must not expand the panel during the prompt.
  await h.toggle();
  assert.deepEqual(view(), []);
  await h.toggle();
  assert.equal(view().length, 1);
  h.events.get("ui_prompt_end")({ kind: "custom" });
  assert(view().length > 1);
  h.events.get("session_shutdown")();
});

test("clears an open prompt state at shutdown", () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("ui_prompt_start")({ kind: "select" });
  assert.equal(h.widget().render(100).length, 1);
  h.events.get("session_shutdown")();
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  assert(h.widget().render(100).length > 1);
  h.events.get("session_shutdown")();
});

test("writes no log when focus mode is off", () => {
  const h = harness();
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.deepEqual(h.log, []);
  assert.deepEqual(h.widget().render(100), []);
  h.events.get("session_shutdown")();
});

test("keeps the collapse when the log fails and warns once", () => {
  const h = harness("tui", { enabled: true, failLog: true });
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.widget().render(100).length, 1);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.warnings.filter((message) => message.includes("turn log")).length, 1);
  h.events.get("session_shutdown")();
});

test("shows the last stats again when focus mode is toggled", async () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({}, h.ctx);
  h.events.get("message_start")({ message: { role: "user" } });
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.widget().render(100).length, 1);
  await h.toggle();
  await h.toggle();
  assert(h.widget().render(100).length > 1);
  assert.equal(h.log.length, 1);
  h.events.get("session_shutdown")();
});

test("shows only the header until activity begins", () => {
  const h = harness("tui", { enabled: true });
  h.events.get("session_start")({ reason: "reload" }, h.ctx);
  assert.equal(h.widget().render(100).length, 1);
  h.events.get("message_start")({ message: { role: "user" } });
  assert(h.widget().render(100).length > 1);
  h.events.get("agent_settled")({ aborted: false }, h.ctx);
  assert.equal(h.widget().render(100).length, 1);
  h.events.get("session_shutdown")();
});
