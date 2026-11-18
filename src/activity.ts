export type ActivityState = "active" | "done" | "error" | "cancelled";
export type Activity = { id: string; name: string; started: number; state: ActivityState; ended?: number; elapsed?: number };

/** Display state only. It never keeps tool arguments, results, or reasoning text. */
export function createActivity(now: () => number = () => performance.now()) {
  const calls = new Map<string, Activity>();
  const names = new Map<string, Activity[]>();
  const skills = new Set<string>();
  const pendingSkills = new Map<string, string>();
  let thinking: Activity | undefined;
  let working: Activity | undefined;
  let serial = 0;

  function add(row: Activity) {
    calls.set(row.id, row);
    const group = names.get(row.name) ?? [];
    group.push(row);
    names.set(row.name, group);
  }
  function finishThinking(state: ActivityState = "done") {
    if (thinking) {
      thinking.state = state;
      thinking.ended = now();
    }
    thinking = undefined;
  }
  function finishWorking() {
    if (!working || working.state !== "active") return;
    working.elapsed = (working.elapsed ?? 0) + Math.max(0, now() - working.started);
    working.state = "done";
  }
  function elapsed(group: Activity[]) {
    let total = 0;
    let end = -Infinity;
    for (const row of group) {
      const stop = row.ended ?? now();
      total += Math.max(0, stop - Math.max(row.started, end));
      end = Math.max(end, stop);
    }
    return total;
  }
  return {
    reset() {
      calls.clear();
      names.clear();
      skills.clear();
      pendingSkills.clear();
      thinking = undefined;
      working = undefined;
    },
    startWorking() {
      if (working?.state === "active") return;
      working = { id: "model-working", name: "working", started: now(), state: "active", elapsed: working?.elapsed ?? 0 };
    },
    finishWorking,
    startThinking() {
      if (thinking) return;
      thinking = { id: `thinking-${++serial}`, name: "thinking", started: now(), state: "active" };
      add(thinking);
    },
    finishThinking,
    startTool(id: string, name: string, args?: unknown) {
      finishThinking();
      finishWorking();
      if (calls.has(id)) return;
      add({ id, name, started: now(), state: "active" });
      const path = (args as { path?: unknown } | undefined)?.path;
      if (name === "read" && typeof path === "string") {
        const match = path.replaceAll("\\", "/").match(/(?:^|\/)([^/]+)\/SKILL\.md$/u);
        if (match) {
          // Skill directory names can be untrusted. Do not retain terminal controls.
          const skill = match[1].replace(/[\p{Cc}\p{Cf}]/gu, "");
          if (skill) pendingSkills.set(id, skill);
        }
      }
    },
    endTool(id: string, isError: boolean) {
      const row = calls.get(id);
      if (row?.state === "active") {
        row.state = isError ? "error" : "done";
        row.ended = now();
      }
      const skill = pendingSkills.get(id);
      if (skill && !isError) skills.add(skill);
      pendingSkills.delete(id);
    },
    settle(aborted: boolean) {
      finishWorking();
      if (working && aborted) working.state = "cancelled";
      finishThinking(aborted ? "cancelled" : "done");
      for (const row of calls.values()) if (row.state === "active") {
        row.state = "cancelled";
        row.ended = now();
      }
      pendingSkills.clear();
    },
    snapshot() {
      return {
        rows: [...names.values()].map((group) => ({
          ...(group.find((row) => row.state === "active") ?? group[group.length - 1]),
          elapsed: elapsed(group),
        })),
        skills: [...skills],
        ...(working ? { working: { ...working, elapsed: (working.elapsed ?? 0) + (working.state === "active" ? Math.max(0, now() - working.started) : 0) } } : {}),
      };
    },
    hasActive() {
      return working?.state === "active" || [...calls.values()].some((row) => row.state === "active");
    },
  };
}
