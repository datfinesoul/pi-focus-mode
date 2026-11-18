import type { Activity } from "./activity.ts";

type Color = "accent" | "dim" | "error";
type DisplayTools = {
  fg(color: Color, text: string): string;
  truncate(text: string, width: number): string;
  measure(text: string): number;
};

export function renderActivity(
  snapshot: { rows: Activity[]; skills: string[] },
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
  const lines = snapshot.rows.length ? snapshot.rows.map((row) => {
    const active = row.state === "active";
    const symbol = active ? "◉" : row.state === "done" ? "✓" : row.state === "error" ? "✗" : "–";
    const color: Color = active ? "accent" : row.state === "error" ? "error" : "dim";
    const elapsed = active ? `  ${(Math.max(0, now - row.started) / 1000).toFixed(1)}s` : "";
    return `  ${fg(color, symbol)} ${row.name}${fg("dim", elapsed)}`;
  }) : [fg("dim", "  No activity yet.")];
  const limit = Math.max(2, Math.floor(terminalRows / 2) - 2);
  const visible = lines.length > limit
    ? [fg("dim", `  … ${lines.length - limit + 1} earlier activities`), ...lines.slice(-(limit - 1))]
    : lines;
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
