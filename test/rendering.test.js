import assert from "node:assert/strict";
import test from "node:test";
import { installRendering } from "../src/rendering.ts";

class ToolExecutionComponent {
  render() { return ["original tool and image"]; }
}
class AssistantMessageComponent {
  constructor(message) { this.lastMessage = message; this.isStreaming = true; }
  updateContent(message, streaming) { this.lastMessage = message; this.isStreaming = streaming; }
  render() { return this.lastMessage.content.map((block) => block.text ?? block.thinking); }
}
function makeRoot(children) {
  return {
    children,
    render(width) { return this.children.flatMap((child) => child.render(width)); },
    doRender() { return this.render(80); },
    invalidate() {},
    requestRender() {},
  };
}

test("hides blocks only in focus mode and restores methods and message identity", () => {
  let compact = false;
  const message = { content: [{ type: "thinking", thinking: "reasoning" }, { type: "text", text: "answer" }] };
  const assistant = new AssistantMessageComponent(message);
  const tool = new ToolExecutionComponent();
  const root = makeRoot([assistant, tool]);
  const frame = root.doRender;
  const original = root.doRender();
  const adapter = installRendering(root, () => compact, assert.fail);
  assert.deepEqual(root.doRender(), original);
  compact = true;
  assert.deepEqual(root.doRender(), ["answer"]);
  assert.equal(assistant.lastMessage, message);
  assert.equal(assistant.isStreaming, true);
  compact = false;
  assert.deepEqual(root.doRender(), original);
  adapter.dispose();
  adapter.dispose();
  assert.equal(root.doRender, frame);
  assert(!Object.hasOwn(tool, "render"));
  assert(!Object.hasOwn(assistant, "render"));
});

test("finds fullscreen child documents and restores detached components", () => {
  const tool = new ToolExecutionComponent();
  const root = makeRoot([]);
  root.getMountedRoots = () => [{ child: tool, render() { return []; } }];
  const adapter = installRendering(root, () => true, assert.fail);
  root.doRender();
  assert.deepEqual(tool.render(), []);
  root.getMountedRoots = () => [];
  root.doRender();
  assert.deepEqual(tool.render(), ["original tool and image"]);
  adapter.dispose();
});

test("returns normal display for incompatible interfaces", () => {
  const warnings = [];
  assert.equal(installRendering({}, () => true, (reason) => warnings.push(reason)).supported, false);
  const root = makeRoot([]);
  const assistant = new AssistantMessageComponent({ content: [] });
  assistant.updateContent = undefined;
  root.children.push(assistant);
  const adapter = installRendering(root, () => true, (reason) => warnings.push(reason));
  assert.deepEqual(root.doRender(), []);
  assert.equal(warnings.length, 2);
  adapter.dispose();
});

test("restores the original message even when rendering throws", () => {
  const message = { content: [{ type: "thinking", thinking: "reasoning" }, { type: "text", text: "answer" }] };
  const assistant = new AssistantMessageComponent(message);
  assistant.render = () => { throw new Error("render failure"); };
  const root = makeRoot([assistant]);
  const adapter = installRendering(root, () => true, assert.fail);
  assert.throws(() => root.doRender(), /render failure/);
  assert.equal(assistant.lastMessage, message);
  adapter.dispose();
});
