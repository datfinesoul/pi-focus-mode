import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createPreferences } from "../../src/config.ts";
import { registerFocusMode } from "../../src/controller.ts";

export default function focusMode(pi: ExtensionAPI) {
  const preferences = createPreferences(new URL("./config.json", import.meta.url), getAgentDir());
  registerFocusMode(pi, { truncate: truncateToWidth, measure: visibleWidth }, preferences);
}
