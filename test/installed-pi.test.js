import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installRendering } from "../src/rendering.ts";

const entry = process.env.PI_CODING_AGENT_ENTRY;
test("installed Pi loader registers only Ctrl+I and lifecycle handlers", {
  skip: entry ? false : "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async () => {
  const { loadExtensions } = await import(pathToFileURL(join(dirname(entry), "core/extensions/loader.js")).href);
  const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
  const extensionPath = join(moduleRoot, "extensions/focus-mode/index.ts");
  const result = await loadExtensions([extensionPath], moduleRoot);
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const extension = result.extensions[0];
  assert.deepEqual([...extension.shortcuts.keys()], ["ctrl+i"]);
  assert.equal(extension.commands.size, 0);
  assert.equal(extension.tools.size, 0);
  assert(extension.handlers.has("session_shutdown"));
  assert(extension.handlers.has("ui_prompt_start"));
  assert(extension.handlers.has("ui_prompt_end"));
});
test("installed Pi components hide and restore without changing messages", {
  skip: entry ? false : "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async () => {
  const dist = dirname(entry);
  const load = (file) => import(pathToFileURL(join(dist, file)).href);
  const { initTheme } = await load("modes/interactive/theme/theme.js");
  initTheme();
  const { AssistantMessageComponent } = await load("modes/interactive/components/assistant-message.js");
  const { ToolExecutionComponent } = await load("modes/interactive/components/tool-execution.js");
  const message = { role: "assistant", content: [{ type: "thinking", thinking: "reasoning" }, { type: "text", text: "answer" }] };
  const assistant = new AssistantMessageComponent(message, false);
  const root = {
    children: [],
    render(width) { return this.children.flatMap((child) => child.render(width)); },
    doRender() { return this.render(100); },
    requestRender() {}, invalidate() {},
  };
  const tool = new ToolExecutionComponent("read", "a", { path: "/tmp/example" }, {}, undefined, root, "/tmp");
  root.children.push(assistant, tool);
  const normal = root.doRender();
  let compact = true;
  const adapter = installRendering(root, () => compact, assert.fail);
  const focused = root.doRender().join("\n");
  assert(focused.includes("answer"));
  assert(!focused.includes("reasoning"));
  assert(!focused.includes("/tmp/example"));
  assert.equal(assistant.lastMessage, message);
  compact = false;
  assert.deepEqual(root.doRender(), normal);
  adapter.dispose();
  assert.deepEqual(root.doRender(), normal);
});
