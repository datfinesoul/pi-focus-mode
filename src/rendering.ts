// Pi 1.5.2 has no public transcript visibility API. Keep all access to its
// internal component tree in this adapter. Never modify a session message.
type Component = {
  children?: Component[];
  child?: Component;
  constructor?: { name: string };
  render(width: number): string[];
  lastMessage?: { content?: { type: string; [key: string]: unknown }[]; [key: string]: unknown };
  isStreaming?: boolean;
  updateContent?(message: unknown, streaming?: boolean): void;
  toolName?: string;
};
export type RenderRoot = Component & {
  doRender(): void;
  invalidate(): void;
  requestRender(): void;
  getMountedRoots?(): Component[];
  terminal?: { rows: number };
};

export function installRendering(
  root: RenderRoot,
  isCompact: () => boolean,
  unsupported: (reason: string) => void,
  alwaysVisibleTools?: () => readonly string[],
) {
  let disposed = false;
  let failed = false;
  const patched = new Map<Component, { render: Component["render"]; own: boolean }>();
  const originalFrame = root.doRender;
  const ownFrame = Object.hasOwn(root, "doRender");
  function fail(reason: string) {
    if (failed || disposed) return;
    failed = true;
    unsupported(reason);
  }
  if (typeof originalFrame !== "function" || typeof root.invalidate !== "function" || !Array.isArray(root.children)) {
    fail("Pi's terminal rendering interface is not supported.");
    return { supported: false, dispose() {} };
  }
  function restore(node: Component, saved: { render: Component["render"]; own: boolean }) {
    if (saved.own) node.render = saved.render;
    else delete (node as Partial<Component>).render;
  }
  function scan(node: Component, seen: Set<Component>) {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const name = node.constructor?.name;
    if (!patched.has(node) && (name === "ToolExecutionComponent" || name === "AssistantMessageComponent")) {
      if (typeof node.render !== "function" || (name === "AssistantMessageComponent" && typeof node.updateContent !== "function")) {
        fail("Pi's transcript components are not supported.");
        return;
      }
      const original = node.render;
      patched.set(node, { render: original, own: Object.hasOwn(node, "render") });
      node.render = function (width) {
        if (failed || disposed || !isCompact()) return original.call(this, width);
        if (name === "ToolExecutionComponent") {
          // Interactive prompts stay visible so the user keeps a transcript
          // record of the question and the answer.
          if (this.toolName !== undefined && alwaysVisibleTools?.().includes(this.toolName)) {
            return original.call(this, width);
          }
          return [];
        }
        const message = this.lastMessage;
        if (!message) return original.call(this, width);
        if (!Array.isArray(message.content)) {
          fail("Pi's assistant message display is not supported.");
          return original.call(this, width);
        }
        if (!message.content.some((block) => block.type === "thinking")) return original.call(this, width);
        const streaming = this.isStreaming;
        try {
          this.updateContent!({ ...message, content: message.content.filter((block) => block.type !== "thinking") }, streaming);
          return original.call(this, width);
        } finally {
          this.updateContent!(message, streaming);
        }
      };
    }
    for (const child of node.children ?? []) scan(child, seen);
    if (node.child && typeof node.child.render === "function") scan(node.child, seen);
  }
  root.doRender = function () {
    if (!disposed && !failed) {
      const seen = new Set<Component>();
      scan(root, seen);
      for (const mounted of root.getMountedRoots?.() ?? []) scan(mounted, seen);
      // Do not retain components from discarded branches or old streaming rows.
      for (const [node, saved] of patched) {
        if (!seen.has(node)) {
          restore(node, saved);
          patched.delete(node);
        }
      }
    }
    return originalFrame.call(this);
  };
  return {
    supported: true,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (ownFrame) root.doRender = originalFrame;
      else delete (root as Partial<RenderRoot>).doRender;
      for (const [node, saved] of patched) restore(node, saved);
      patched.clear();
      root.invalidate();
      root.requestRender();
    },
  };
}
