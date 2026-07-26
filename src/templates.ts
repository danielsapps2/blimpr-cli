/**
 * Instruction-file fragments the installer writes into a repo.
 * AGENTS.md is the vendor-neutral standard (Codex CLI, Cursor, 20+ tools);
 * CLAUDE.md and .cursor/rules get tool-specific variants.
 */

export const MARKER_START = "<!-- blimpr:start -->";
export const MARKER_END = "<!-- blimpr:end -->";
export const LEGACY_MARKER_START = "<!-- autoship:start -->";
export const LEGACY_MARKER_END = "<!-- autoship:end -->";

export const AGENTS_MD_SECTION = `${MARKER_START}
## Blimpr — build-in-public capture

After completing a meaningful unit of work (a feature, a fix, a milestone),
proactively call the \`log_update\` tool on the \`blimpr\` MCP server with a
one-line summary and a short description of what changed and why it matters.
When the change is visible in the product, capture 1-3 clean after-state
screenshots and include them in \`screenshots\` with a short note describing
what a new viewer should notice.
This queues the work for the founder's content pipeline — do it without being
asked, right after the work is done. Skip trivial changes (typos, formatting,
config churn).
${MARKER_END}
`;

export const CLAUDE_MD_SECTION = `${MARKER_START}
## Blimpr — build-in-public capture

After completing a meaningful unit of work in this repo, call \`log_update\`
on the \`blimpr\` MCP server with:
- \`summary\`: one line, written like a good commit subject
- \`details\`: 2-4 sentences on what changed and why a user would care
- \`kind\`: feature | bugfix | milestone | progress
- \`screenshots\`: for visible product changes, 1-3 local PNG/JPEG/WebP paths
  with captions explaining the proof on screen to someone new to the product

Do this proactively at the end of the work, not when asked. A git post-commit
hook also captures commits automatically, so if you committed the work you may
skip the manual call — prefer \`log_update\` only when the session context adds
meaning a bare commit message lacks (intent, before/after, user impact).
${MARKER_END}
`;

export const CURSOR_RULE = `---
description: Blimpr build-in-public capture
alwaysApply: true
---

After completing a meaningful unit of work, call the \`log_update\` tool on the
\`blimpr\` MCP server with a one-line summary and a short description of what
changed and why it matters. For visible product changes, capture 1-3 clean
after-state screenshots and attach them with captions explaining what a new
viewer should notice. Do this proactively. Skip trivial changes.
`;

/** POSIX sh hook — git for Windows executes hooks through its bundled sh. */
export function captureCommand(packageSpec: string): string {
  return `npx --yes ${packageSpec} capture --quiet || true`;
}

export function postCommitHook(packageSpec: string): string {
  return `#!/bin/sh
# Blimpr: queue this commit for the content pipeline. Never block the commit.
${captureCommand(packageSpec)}
`;
}
