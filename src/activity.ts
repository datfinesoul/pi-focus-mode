export type ActivityState = "active" | "done" | "error" | "cancelled";
export type Activity = { id: string; name: string; started: number; state: ActivityState };

/** Display state only. It never keeps tool arguments, results, or reasoning text. */
export function createActivity(now: () => number = () => performance.now()) {
  const calls = new Map<string, Activity>();
  const names = new Map<string, Activity[]>();
  const skills = new Set<string>();
  const pendingSkills = new Map<string, string>();
  let thinking: Activity | undefined;
  let serial = 0;

  function add(row: Activity) {
    calls.set(row.id, row);
    const group = names.get(row.name) ?? [];
    group.push(row);
    names.set(row.name, group);
  }
  function finishThinking(state: ActivityState = "done") {
    if (thinking) thinking.state = state;
    thinking = undefined;
  }
  return {
    reset() {
      calls.clear();
      names.clear();
      skills.clear();
      pendingSkills.clear();
      thinking = undefined;
    },
    startThinking() {
      if (thinking) return;
      thinking = { id: `thinking-${++serial}`, name: "thinking", started: now(), state: "active" };
      add(thinking);
    },
    finishThinking,
    startTool(id: string, name: string, args?: unknown) {
      finishThinking();
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
      if (row) row.state = isError ? "error" : "done";
      const skill = pendingSkills.get(id);
      if (skill && !isError) skills.add(skill);
      pendingSkills.delete(id);
    },
    settle(aborted: boolean) {
      finishThinking(aborted ? "cancelled" : "done");
      for (const row of calls.values()) if (row.state === "active") row.state = "cancelled";
      pendingSkills.clear();
    },
    snapshot() {
      return {
        rows: [...names.values()].map((group) => ({
          ...(group.find((row) => row.state === "active") ?? group[group.length - 1]),
        })),
        skills: [...skills],
      };
    },
    hasActive() {
      return [...calls.values()].some((row) => row.state === "active");
    },
  };
}
