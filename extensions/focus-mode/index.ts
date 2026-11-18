import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { registerFocusMode } from "../../src/controller.ts";

export default function focusMode(pi: ExtensionAPI) {
  registerFocusMode(pi, { truncate: truncateToWidth, measure: visibleWidth });
}
