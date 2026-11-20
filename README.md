# pi-focus-mode

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Pi](https://pi.dev/) extension for a compact activity view with tool timers and skills. Press Ctrl+I to replace thinking and tool blocks with a compact panel. Press it again to restore the normal display.

## Installation

### Global installation

```sh
pi install git:github.com/datfinesoul/pi-focus-mode
```

Pi records the package in `~/.pi/agent/settings.json`.

### Project installation

```sh
pi install --local git:github.com/datfinesoul/pi-focus-mode
```

Pi records the package in `.pi/settings.json`. Project packages load only after project trust. Run `/reload` or start a new session after installation.

Installation scope does not change which [configuration files](#configuration) the extension reads.

> [!NOTE]
> Pi identifies a package by where it was installed from. Installing pi-focus-mode globally and for a project from the same source is fine: the project installation replaces the global one. Installing it from different locations, such as GitHub globally and a local checkout for a project, loads both copies, and Pi does not reconcile them.

<details>
<summary>Install from a local checkout</summary>

Install globally from your checkout:

```sh
pi install /path/to/pi-focus-mode
```

Install for one project:

```sh
pi install --local /path/to/pi-focus-mode
```

Try the checkout without changing settings:

```sh
cd /path/to/pi-focus-mode
pi --no-extensions --extension ./extensions/focus-mode/index.ts
```

> If you used the temporary prototype, remove `-e /tmp/pi-compact-activity.ts` from your start command. Do not load both copies.

</details>

## Usage

Focus mode starts disabled unless your configuration enables it. Press Ctrl+I to toggle it, including while tools run. In a trusted project, Ctrl+I also saves the new mode for that project. The extension adds no slash command.

```text
Activity  [compact · Ctrl+I] ─────── Skills ─────────────
  ✓ thinking                         acp-ste100
  ◉ read  1.2s
  ✓ write
```

- The panel shows only its header until a turn starts. Working and thinking then appear first. Before an activity begins, its row shows an inactive marker and `0.0s`. Tool names appear once, in first-seen order.
- Each item retains its elapsed timer after completion. The timer resumes when the same activity starts again and excludes inactive gaps. Concurrent calls with the same name count overlapping time once.
- The final state appears after all calls with that name finish. A failed call displays a cross when it represents that row.
- Skills lists unique skill directory names after successful `read` calls for `SKILL.md`. This indicates loading, not proof of later use.
- A new user message clears both lists when Pi starts that message. Tree navigation, compaction, and reload also clear the lists.
- Assistant text stays visible. Focus mode hides thinking, tool blocks, tool images, and the working indicator. Tools in `alwaysVisibleTools` keep their normal transcript display. Normal mode restores the standard display.
- When the agent settles, the panel collapses to its header line and writes one record for the turn to the [session log](#how-it-works). The next user message or a Ctrl+I toggle shows the last turn again.
- The header rule follows the terminal width. Skills shares the header when space permits. Narrow terminals place skills below activity.
- Long lists keep the thinking row visible and display the latest tool rows with an omitted-item count. Earlier items remain in memory until the lists reset.
- A separate working row covers each model response, including the wait before streaming starts. Its timer pauses when the response ends or tool execution starts. The row stays visible after completion and resets to `0.0s` with each new user message.

The extension tracks activity from the time it loads. It does not reconstruct earlier activity from session history.

## Configuration

| Layer | Location | Purpose |
| --- | --- | --- |
| Bundled | `extensions/focus-mode/config.json` | Defaults: `false`, `ask_user_question` |
| Global | `~/.pi/agent/focus-mode.json` | Personal default. Uses `PI_CODING_AGENT_DIR` if set. |
| Project | `<project>/.pi/focus-mode.json` | Override for the current trusted project |

Each field resolves in the same way: a project value overrides the global value, and a global value overrides the bundled default. If a configuration file is invalid, the extension warns, starts in normal mode, and uses the default visibility list.

### Start in focus mode

Add this setting to the global or trusted-project file. Run `/reload` to apply the change.

```json
{
  "enabled": true
}
```

### Keep a tool visible in focus mode

The bundled default keeps `ask_user_question` visible, so interactive questions and answers stay in the transcript. To add another tool, set the complete list in the global or trusted-project file. An empty list hides every tool again. Run `/reload` to apply the change.

```json
{
  "alwaysVisibleTools": ["ask_user_question", "another_tool"]
}
```

### Save or remove a project override

Press Ctrl+I in a trusted project to save the new mode to `.pi/focus-mode.json`. The extension preserves other fields and never writes the global file. If the save fails, the display still changes and Pi shows a warning. In an untrusted project, Ctrl+I changes only the current display.

Remove `enabled` from the project file to use the global or bundled value again. Run `/reload` to apply the change. To keep the preference private, exclude `.pi/focus-mode.json` from Git.

### Field reference

| Field | Type | Meaning |
| --- | --- | --- |
| `enabled` | Boolean | `true` starts in focus mode. `false` starts in normal mode. |
| `alwaysVisibleTools` | Array of tool names | Tools that keep their normal transcript display in focus mode. |

## Keyboard shortcut

| Shortcut | Action |
| --- | --- |
| Ctrl+I | Toggle normal and focus mode |

Some terminals send the same bytes for Ctrl+I and Tab. In those terminals, this shortcut can also capture Tab. A terminal with distinct key reporting is required to preserve Tab behavior. The extension provides no alternate shortcut or slash command.

## How it works

The extension observes message and tool lifecycle events. It retains activity names, call IDs, timestamps, states, and skill directory names for the current user message. It does not retain tool arguments, tool results, or thinking text in its activity state. Tool events can include nested calls.

The thinking row becomes active only when the provider emits reasoning events. Its timer excludes initial response latency and does not measure hidden provider reasoning. The separate working timer accumulates response waiting and streaming time across model turns. It does not measure reasoning. Tool timers start at Pi's execution-start event, which can include preflight and approval waits.

Pi currently has no public API to hide all transcript blocks. This version uses an internal rendering adapter tested with Pi 1.5.2. It suppresses tool rendering, except for tools in `alwaysVisibleTools`, and removes thinking from a temporary display copy. It restores the original component content after each render. It never changes session messages, model context, tool implementations, or execution.

The adapter checks the rendering interfaces it accesses. A detected incompatibility disables focus mode and reports a warning. These checks do not guarantee compatibility with future Pi versions. Other extensions that replace the transcript renderer can conflict with this adapter. RPC, JSON, and print modes do not install the adapter.

The extension collapses the panel at `agent_settled`, the final idle boundary after retries, compaction retries, and queued messages. A new user message, a turn start, tree navigation, or compaction expands the panel again. Ctrl+I also shows the last turn again until the next turn starts.

Focus mode writes one JSONL record for each settled turn to `~/.local/state/pi-focus-mode/<session-id>.jsonl`. When `XDG_STATE_HOME` is set to an absolute path, the file is in `$XDG_STATE_HOME/pi-focus-mode/`. Each record holds the settle time, the turn duration, and the working time. It also holds each activity name with its state, total elapsed time, and call count, plus the loaded skills. The log does not hold tool arguments, tool results, thinking text, or assistant text. The extension writes a record only while focus mode is active. A write failure shows one warning and does not stop the collapse. Files are append-only, and Pi does not remove them when you delete a session.

```json
{"version":1,"sessionId":"…","settledAt":"2026-11-20T21:55:12.345Z","aborted":false,"durationMs":184200,"workingMs":61200,"activities":[{"name":"thinking","state":"done","elapsedMs":12400,"calls":3},{"name":"read","state":"done","elapsedMs":8300,"calls":5}],"skills":["acp-ste100"]}
```

This extension changes appearance only. It is not a security boundary. Normal mode, session files, and model context still contain the original content. The extension does not change Pi settings.

## Development

Use Node.js 22.19 or newer. The extension has no runtime dependencies beyond the Pi host. It requires no build step or dependency installation for unit tests.

```sh
npm test
npm run pack:check
# Or: pnpm test && pnpm run pack:check
```

Set `PI_CODING_AGENT_ENTRY` to your installed Pi `dist/index.js` to include tests against its real rendering components:

```sh
PI_CODING_AGENT_ENTRY=/path/to/pi-coding-agent/dist/index.js npm test
```

Without that variable, the installed-Pi test reports a skip. The other tests use pure runtime logic and mock components.

Before release, test the extension in Pi. Check normal and fullscreen modes, Ctrl+I during execution, parallel tools, cancellation, reload, themes, and terminal resizing. Check that normal mode restores tool output and thinking. Automated component tests do not replace these interactive checks.

Each feature branch that triggers CI gets one version update relative to its base. Keep that version unchanged throughout the branch. Record subsequent user-visible changes under the same matching `## [<version>] - <date>` changelog heading. Do not increment the patch version for each edit, fix, or conversation turn. CI requires the branch version to exceed its base version. Pull requests that change only Markdown skipped by CI are exempt. After merge and successful CI, the Release workflow tags the tested commit `v<version>`. Merges that do not change the version are not tagged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution steps.

## License

[MIT](LICENSE) © Philip Hadviger.
