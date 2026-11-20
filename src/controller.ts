import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createActivity } from "./activity.ts";
import type { createPreferences } from "./config.ts";
import { renderActivity } from "./display.ts";
import { installRendering } from "./rendering.ts";
import type { RenderRoot } from "./rendering.ts";
import { appendTurnRecord } from "./turn-log.ts";
import type { TurnRecord } from "./turn-log.ts";

type TextTools = { truncate(text: string, width: number): string; measure(text: string): number };
type LogWriter = (record: TurnRecord) => void;
const WIDGET = "focus-mode";

export function registerFocusMode(
  pi: ExtensionAPI,
  textTools: TextTools,
  preferences: ReturnType<typeof createPreferences>,
  writeLog: LogWriter = (record) => {
    appendTurnRecord(record);
  },
) {
  const activity = createActivity();
  let compact = false;
  let available = false;
  let collapsed = false;
  let logged = false;
  let logWarned = false;
  let turnStartedAt: number | undefined;
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
  function expand() {
    collapsed = false;
    logged = false;
  }
  function markTurnStart(force = false) {
    if (force || turnStartedAt === undefined) turnStartedAt = Date.now();
  }
  function setCompact(enabled: boolean, ctx: ExtensionContext) {
    compact = enabled;
    ctx.ui.setWorkingVisible(!compact);
    root?.invalidate();
    update();
  }
  function writeSettledTurn(ctx: ExtensionContext, aborted: boolean) {
    logged = true;
    if (turnStartedAt === undefined) return;
    const snapshot = activity.snapshot();
    const record: TurnRecord = {
      version: 1,
      sessionId: ctx.sessionManager.getSessionId(),
      settledAt: new Date().toISOString(),
      aborted,
      durationMs: Math.round(Math.max(0, Date.now() - turnStartedAt)),
      ...(snapshot.working ? { workingMs: Math.round(Math.max(0, snapshot.working.elapsed ?? 0)) } : {}),
      activities: snapshot.rows.map((row) => ({
        name: row.name,
        state: row.state,
        elapsedMs: Math.round(Math.max(0, row.elapsed ?? 0)),
        calls: row.calls ?? 1,
      })),
      skills: [...snapshot.skills],
    };
    try {
      writeLog(record);
    } catch (error) {
      if (logWarned) return;
      logWarned = true;
      ctx.ui.notify(`Focus mode turn log was not written: ${String(error)}`, "warning");
    }
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
      expand();
      setCompact(!compact, ctx);
      if (ctx.isProjectTrusted()) {
        try {
          preferences.save(ctx.cwd, compact);
        } catch (error) {
          ctx.ui.notify(`Focus mode preference was not saved: ${String(error)}`, "warning");
        }
      }
    },
  });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    context = ctx;
    const settings = preferences.load(ctx.isProjectTrusted() ? ctx.cwd : undefined, (message) => ctx.ui.notify(message, "warning"));
    ctx.ui.setWidget(WIDGET, (tui, theme) => {
      root = tui as unknown as RenderRoot;
      adapter = installRendering(root, () => compact, unsupported, () => settings.alwaysVisibleTools);
      available = adapter.supported;
      return {
        render(width) {
          return compact ? renderActivity(activity.snapshot(), width, root?.terminal?.rows ?? 24, performance.now(), {
            ...textTools,
            fg: (color, text) => theme.fg(color, text),
          }, { collapsed }) : [];
        },
        invalidate() {},
      };
    });
    if (available && settings.enabled) setCompact(true, ctx);
  });
  pi.on("agent_start", () => {
    expand();
    markTurnStart();
    update();
  });
  pi.on("turn_start", () => {
    expand();
    markTurnStart();
    activity.startWorking();
    update();
  });
  pi.on("turn_end", () => {
    activity.finishWorking();
    activity.finishThinking();
    update();
  });
  pi.on("message_start", (event) => {
    if (event.message.role !== "user") return;
    activity.reset();
    expand();
    markTurnStart(true);
    activity.startWorking();
    update();
  });
  pi.on("message_update", (event) => {
    const type = event.assistantMessageEvent.type;
    if (type === "thinking_start" || type === "thinking_delta") activity.startThinking();
    else if (type === "thinking_end" || type === "text_start" || type === "toolcall_start") activity.finishThinking();
    update();
  });
  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") {
      activity.finishWorking();
      activity.finishThinking(event.message.stopReason === "aborted" ? "cancelled" : event.message.stopReason === "error" ? "error" : "done");
    }
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
  pi.on("agent_settled", (event, ctx) => {
    activity.settle(event.aborted);
    if (compact) {
      collapsed = true;
      if (!logged) writeSettledTurn(ctx, event.aborted);
    }
    update();
  });
  for (const event of ["session_tree", "session_compact"] as const) {
    pi.on(event, () => {
      activity.reset();
      expand();
      turnStartedAt = undefined;
      update();
    });
  }
  pi.on("session_shutdown", () => {
    const wasCompact = compact;
    compact = false;
    available = false;
    collapsed = false;
    logged = false;
    logWarned = false;
    turnStartedAt = undefined;
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
