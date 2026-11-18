# Security Policy

## Supported versions

Security updates are provided for the latest released version on a best-effort basis.

## Reporting a vulnerability

Please do not report vulnerabilities in a public issue. Use GitHub's private vulnerability reporting feature on the repository's **Security** tab. If private reporting is unavailable, contact the maintainer through the contact method listed on the GitHub profile at <https://github.com/datfinesoul>.

Include a description of the issue, affected versions, reproduction steps, potential impact, and any suggested remediation. You should receive an acknowledgment within seven days. Please allow a reasonable amount of time for investigation and remediation before public disclosure.

## Security model

Pi extensions execute with the same operating-system permissions as Pi. Review extension source before installation and protect the package files from untrusted modification. The extension observes tool and message events to display activity names, timers, states, and skill directory names. Its internal rendering adapter temporarily changes component display content, but not stored messages or model context. Focus mode hides tool results and images from the transcript display. Toggle normal mode to inspect them. Hidden content remains in session files and model context. The extension reads no configuration files and has no project-trust-sensitive state. This extension changes appearance only. It is not a sandbox, authorization control, redaction tool, or security boundary.
