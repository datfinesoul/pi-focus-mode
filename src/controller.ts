import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createActivity } from "./activity.ts";
import { renderActivity } from "./display.ts";
import { installRendering } from "./rendering.ts";
import type { RenderRoot } from "./rendering.ts";

type TextTools = { truncate(text: string, width: number): string; measure(text: string): number };
const WIDGET = "focus-mode";

export function registerFocusMode(pi: ExtensionAPI, textTools: TextTools) {
  const activity = createActivity();
  let compact = false;
  let available = false;
  let context: ExtensionContext | undefined;
  let root: RenderRoot | undefined;
  let adapter: ReturnType<typeof installRendering> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function update() {
    const needed = compact && activity.hasActive();
    if (needed && !timer) {
      timer = setInterval(() => root?.requestRender(), 100);
      timer.unref?.();
    } else if (!needed && timer) {
      clearInterval(timer);
      timer = undefined;
    }
    root?.requestRender();
  }
  function unsupported(reason: string) {
    available = false;
    const wasCompact = compact;
    compact = false;
    if (wasCompact) context?.ui.setWorkingVisible(true);
    update();
    // Defer notifications until the current render frame completes.
    queueMicrotask(() => context?.ui.notify(`Focus mode unavailable: ${reason} Normal display remains enabled.`, "warning"));
  }
  pi.registerShortcut("ctrl+i", {
    description: "Toggle focus mode",
    handler: async (ctx) => {
      if (ctx.mode !== "tui") return;
      if (!available) {
        ctx.ui.notify("Focus mode is unavailable with this Pi rendering interface.", "warning");
        return;
      }
      compact = !compact;
      ctx.ui.setWorkingVisible(!compact);
      root?.invalidate();
      update();
    },
  });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    ctx.ui.setWidget(WIDGET, (tui, theme) => {
      root = tui as unknown as RenderRoot;
      adapter = installRendering(root, () => compact, unsupported);
      available = adapter.supported;
      return {
        render(width) {
          return compact ? renderActivity(activity.snapshot(), width, root?.terminal?.rows ?? 24, performance.now(), {
            ...textTools,
            fg: (color, text) => theme.fg(color, text),
          }) : [];
        },
        invalidate() {},
      };
    });
  });
  pi.on("message_start", (event) => {
    if (event.message.role !== "user") return;
    activity.reset();
    update();
  });
  pi.on("message_update", (event) => {
    const type = event.assistantMessageEvent.type;
    if (type === "thinking_start" || type === "thinking_delta") activity.startThinking();
    else if (type === "thinking_end" || type === "text_start" || type === "toolcall_start") activity.finishThinking();
    update();
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") activity.finishThinking();
    update();
  });
  pi.on("tool_execution_start", (event) => {
    activity.startTool(event.toolCallId, event.toolName, event.args);
    update();
  });
  pi.on("tool_execution_end", (event) => {
    activity.endTool(event.toolCallId, event.isError);
    update();
  });
  pi.on("agent_settled", (event) => {
    activity.settle(event.aborted);
    update();
  });
  for (const event of ["session_tree", "session_compact"] as const) {
    pi.on(event, () => {
      activity.reset();
      update();
    });
  }
  pi.on("session_shutdown", () => {
    const wasCompact = compact;
    compact = false;
    available = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    adapter?.dispose();
    adapter = undefined;
    if (context) {
      context.ui.setWidget(WIDGET, undefined);
      if (wasCompact) context.ui.setWorkingVisible(true);
    }
    root = undefined;
    context = undefined;
    activity.reset();
  });
}
