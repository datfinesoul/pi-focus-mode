import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const FILE = "focus-mode.json";
export const DEFAULT_ALWAYS_VISIBLE_TOOLS: readonly string[] = ["ask_user_question"];
type Location = string | URL;
export type FocusModeSettings = { enabled: boolean; alwaysVisibleTools: readonly string[] };

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function readConfig(path: Location): Record<string, unknown> | undefined {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  if (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean") {
    throw new Error('Expected "enabled" to be a boolean.');
  }
  if (Object.hasOwn(value, "alwaysVisibleTools")) {
    const tools = value.alwaysVisibleTools;
    if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== "string" || tool.trim() === "")) {
      throw new Error('Expected "alwaysVisibleTools" to be an array of tool names.');
    }
    value.alwaysVisibleTools = [...new Set(tools.map((tool) => (tool as string).trim()))];
  }
  return value;
}

export function createPreferences(bundled: Location, agentDir: string) {
  function projectPath(cwd: string) {
    return join(cwd, ".pi", FILE);
  }
  return {
    load(cwd: string | undefined, warn: (message: string) => void): FocusModeSettings {
      let enabled = false;
      let alwaysVisibleTools: readonly string[] = DEFAULT_ALWAYS_VISIBLE_TOOLS;
      for (const path of [bundled, join(agentDir, FILE), ...(cwd ? [projectPath(cwd)] : [])]) {
        try {
          const config = readConfig(path);
          if (config?.enabled !== undefined) enabled = config.enabled === true;
          if (config?.alwaysVisibleTools !== undefined) alwaysVisibleTools = config.alwaysVisibleTools as readonly string[];
        } catch (error) {
          warn(`Cannot load focus mode config (${path}): ${String(error)} Normal display remains enabled.`);
          return { enabled: false, alwaysVisibleTools: DEFAULT_ALWAYS_VISIBLE_TOOLS };
        }
      }
      return { enabled, alwaysVisibleTools };
    },
    save(cwd: string, enabled: boolean) {
      const path = projectPath(cwd);
      const dir = dirname(path);
      mkdirSync(dir, { recursive: true });
      if (!lstatSync(dir).isDirectory()) throw new Error("Project .pi must be a regular directory.");
      try {
        if (relative(realpathSync(agentDir), realpathSync(dir)) === "") {
          throw new Error("Project and global config directories are the same.");
        }
      } catch (error) {
        if (!missing(error)) throw error;
      }
      try {
        if (!lstatSync(path).isFile()) throw new Error("Project config must be a regular file.");
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const config = readConfig(path);
      const temp = mkdtempSync(join(dir, ".focus-mode-"));
      try {
        const draft = join(temp, FILE);
        writeFileSync(draft, `${JSON.stringify({ ...config, enabled }, null, 2)}\n`, { mode: 0o600 });
        renameSync(draft, path);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  };
}
