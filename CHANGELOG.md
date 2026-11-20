# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-20

### Added

- Collapse the panel to its header line when the agent settles or when there is no activity to show. The next user message or a Ctrl+I toggle shows the last turn again.
- Write one JSONL record for each settled turn to a session log under the XDG state directory.

## [0.3.0] - 2026-11-20

### Added

- `alwaysVisibleTools` configuration keeps chosen tools visible in focus mode. The bundled default keeps `ask_user_question` visible.

### Fixed

- `ask_user_question` no longer disappears from the transcript in focus mode, so the question and the answer stay visible.

## [0.2.0] - 2026-11-19

### Added

- Configure the startup mode globally or per trusted project. Ctrl+I saves the mode for the current trusted project only.

## [0.1.1] - 2026-11-18

### Fixed

- Show a separate working indicator during model responses, even without reasoning events.
- Always show working and thinking rows, with inactive `0.0s` timers before activity starts. Keep both rows visible when the activity list exceeds the panel height.
- Retain and resume working, thinking, and tool timers within each user turn. Exclude inactive gaps and count overlapping calls once.

## [0.1.0] - 2026-11-18

### Added

- Ctrl+I toggle between normal and focus mode, with no slash command.
- Compact activity panel with unique activity names and active timers.
- Skills column for unique names from successful skill-file reads.
- Accent header rule that follows terminal resizing, with a narrow-terminal layout.
- Internal rendering adapter with compatibility checks and shutdown cleanup.
- Unit tests and optional tests against installed Pi rendering components.
