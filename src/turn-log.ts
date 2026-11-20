import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { ActivityState } from "./activity.ts";

export type TurnRecord = {
  version: 1;
  sessionId: string;
  settledAt: string;
  aborted: boolean;
  durationMs: number;
  workingMs?: number;
  activities: { name: string; state: ActivityState; elapsedMs: number; calls: number }[];
  skills: string[];
};

// Pi validates session IDs, but a log path is a write target. Accept only the
// same shape so a custom ID cannot escape the state directory.
const SAFE_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** Runtime state, not user configuration. Follow XDG when it names an absolute directory. */
export function stateDirectory(home: string, env: NodeJS.ProcessEnv = process.env) {
  const data = env.XDG_STATE_HOME;
  const base = typeof data === "string" && isAbsolute(data) ? data : join(home, ".local", "state");
  return join(base, "pi-focus-mode");
}

export function appendTurnRecord(
  record: TurnRecord,
  options: { home?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  if (!SAFE_SESSION_ID.test(record.sessionId)) throw new Error("Session ID is not usable as a log file name.");
  const directory = stateDirectory(options.home ?? homedir(), options.env);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${record.sessionId}.jsonl`);
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return path;
}
