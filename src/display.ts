import type { Activity } from "./activity.ts";

type Color = "accent" | "dim" | "error";
type DisplayTools = {
  fg(color: Color, text: string): string;
  truncate(text: string, width: number): string;
  measure(text: string): number;
};

export function renderActivity(
  snapshot: { rows: Activity[]; skills: string[]; working?: Activity },
  width: number,
  terminalRows: number,
  now: number,
  tools: DisplayTools,
): string[] {
  if (width <= 0) return [];
  const { fg, truncate, measure } = tools;
  const label = fg("accent", "Activity") + fg("dim", "  [compact · Ctrl+I]");
  const remaining = Math.max(0, width - measure(label));
  let header = label + (remaining > 0 ? fg("accent", " " + "─".repeat(remaining - 1)) : "");
  const pinned = snapshot.rows.filter((row) => row.id.startsWith("thinking-"));
  const inactive = (name: string): Activity => ({ id: `placeholder-${name}`, name, started: 0, state: "cancelled", elapsed: 0 });
  if (!pinned.length) pinned.push(inactive("thinking"));
  const others = snapshot.rows.filter((row) => !row.id.startsWith("thinking-"));
  const limit = Math.max(2, Math.floor(terminalRows / 2) - 2);
  const slots = Math.max(0, limit - pinned.length - 1);
  const omitted = pinned.length + others.length > limit ? Math.max(0, others.length - slots) : 0;
  const rows = [...pinned, ...(omitted ? others.slice(others.length - slots) : others)];
  function renderRow(row: Activity) {
    const active = row.state === "active";
    const symbol = active ? "◉" : row.state === "done" ? "✓" : row.state === "error" ? "✗" : "–";
    const color: Color = active ? "accent" : row.state === "error" ? "error" : "dim";
    const duration = row.elapsed ?? Math.max(0, (row.ended ?? now) - row.started);
    const elapsed = `  ${(duration / 1000).toFixed(1)}s`;
    return `  ${fg(color, symbol)} ${row.name}${fg("dim", elapsed)}`;
  }
  const lines = rows.map(renderRow);
  const visible = omitted
    ? [...lines.slice(0, pinned.length), fg("dim", `  … ${omitted} earlier activities`), ...lines.slice(pinned.length)]
    : lines;
  visible.unshift(renderRow(snapshot.working ?? inactive("working")));
  const skillLines = snapshot.skills.length
    ? snapshot.skills.map((name) => `  ${fg("dim", name)}`)
    : [fg("dim", "  None yet")];
  const boundedSkills = skillLines.length > limit
    ? [fg("dim", `  … ${skillLines.length - limit + 1} earlier skills`), ...skillLines.slice(-(limit - 1))]
    : skillLines;
  if (width < 60) {
    return [header, ...visible, fg("accent", "Skills"), ...boundedSkills].map((line) => truncate(line, width));
  }
  const leftWidth = Math.floor((width - 3) / 2);
  const rightWidth = width - leftWidth - 3;
  const skillsColumn = leftWidth + 3;
  const inlineSkills = skillsColumn >= measure(label) + 2 && rightWidth >= 6;
  if (inlineSkills) {
    const gap = skillsColumn - measure(label);
    header = label + fg("accent", " " + "─".repeat(gap - 2) + " " + "Skills"
      + (rightWidth > 6 ? " " + "─".repeat(rightWidth - 7) : ""));
  }
  const rightLines = inlineSkills ? boundedSkills : [fg("accent", "Skills"), ...boundedSkills];
  const body = Array.from({ length: Math.max(visible.length, rightLines.length) }, (_, index) => {
    const left = truncate(visible[index] ?? "", leftWidth);
    const right = truncate(rightLines[index] ?? "", rightWidth);
    return left + " ".repeat(Math.max(0, leftWidth - measure(left)) + 3) + right;
  });
  return [truncate(header, width), ...body];
}
