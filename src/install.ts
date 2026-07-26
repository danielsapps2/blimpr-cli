/**
 * `blimpr install` — one command that wires a repo into Blimpr:
 *   1. git post-commit hook (universal, tool-agnostic baseline)
 *   2. AGENTS.md / CLAUDE.md / .cursor/rules instruction layer
 *   3. MCP server registration in whichever tools are installed
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { detectTools } from "./detect.js";
import {
  AGENTS_MD_SECTION,
  CLAUDE_MD_SECTION,
  CURSOR_RULE,
  LEGACY_MARKER_END,
  LEGACY_MARKER_START,
  MARKER_START,
  MARKER_END,
  captureCommand,
  postCommitHook,
} from "./templates.js";

const MCP_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
type Distribution = "npm" | "github";

function packageSpec(distribution: Distribution): string {
  return distribution === "github"
    ? "github:danielsapps2/blimpr-cli"
    : "blimpr@latest";
}

function upsertSection(filePath: string, section: string, heading: string) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `# ${heading}\n\n${section}`);
    return "created";
  }
  const current = readFileSync(filePath, "utf8");
  const markerPair = current.includes(MARKER_START)
    ? [MARKER_START, MARKER_END]
    : current.includes(LEGACY_MARKER_START)
      ? [LEGACY_MARKER_START, LEGACY_MARKER_END]
      : undefined;
  if (markerPair) {
    const updated = current.replace(
      new RegExp(`${markerPair[0]}[\\s\\S]*?${markerPair[1]}\\n?`),
      section,
    );
    writeFileSync(filePath, updated);
    return "updated";
  }
  writeFileSync(filePath, `${current.trimEnd()}\n\n${section}`);
  return "appended";
}

function installGitHook(
  repoPath: string,
  packageName: string,
  log: (m: string) => void,
) {
  const hooksDir = join(repoPath, ".git", "hooks");
  if (!existsSync(join(repoPath, ".git"))) {
    log("!  not a git repository — skipped git hook (run `git init` first)");
    return;
  }
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, "post-commit");
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    const captureLine = captureCommand(packageName);
    const managedCapture =
      /^(?:node\s+"[^"]*(?:\/packages\/installer\/dist\/cli\.js|\/blimpr-cli\/dist\/cli\.js)"|npx(?:\.cmd)?\s+(?:--yes|-y)\s+(?:blimpr(?:@latest)?|github:danielsapps2\/blimpr-cli))\s+capture --quiet \|\| true\r?$/gm;
    if (managedCapture.test(existing)) {
      const updated = `${existing
        .replace("# AutoShip:", "# Blimpr:")
        .replace(managedCapture, "")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd()}\n${captureLine}\n`;
      writeFileSync(hookPath, updated);
      chmodSync(hookPath, 0o755);
      log("✓  git post-commit hook updated");
      return;
    }
    log(
      "!  a post-commit hook already exists — appending Blimpr capture to it",
    );
    writeFileSync(hookPath, `${existing.trimEnd()}\n${captureLine}\n`);
    chmodSync(hookPath, 0o755);
    return;
  }
  writeFileSync(hookPath, postCommitHook(packageName));
  chmodSync(hookPath, 0o755);
  log("✓  git post-commit hook installed");
}

function registerMcp(
  tool: "claude" | "codex",
  packageName: string,
  log: (m: string) => void,
) {
  const mcpArgs = ["--yes", packageName, "mcp"];
  const options = {
    stdio: "ignore" as const,
    shell: process.platform === "win32",
  };
  try {
    // Refresh the current registration and remove the pre-rename duplicate.
    for (const name of ["autoship", "blimpr"]) {
      try {
        execFileSync(tool, ["mcp", "remove", name], options);
      } catch {
        // Missing registrations are expected on a first install.
      }
    }
    execFileSync(
      tool,
      ["mcp", "add", "blimpr", "--", MCP_COMMAND, ...mcpArgs],
      options,
    );
    log(`✓  MCP server registered with ${tool === "claude" ? "Claude Code" : "Codex CLI"}`);
  } catch {
    log(`!  failed to register MCP with ${tool} — run manually: ${tool} mcp add blimpr -- ${MCP_COMMAND} ${mcpArgs.join(" ")}`);
  }
}

function registerCursorMcp(packageName: string, log: (m: string) => void) {
  const mcpArgs = ["--yes", packageName, "mcp"];
  const cfgPath = join(homedir(), ".cursor", "mcp.json");
  let cfg: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      log("!  ~/.cursor/mcp.json is not valid JSON — skipped Cursor registration");
      return;
    }
  }
  const mcpServers = { ...cfg.mcpServers };
  delete mcpServers.autoship;
  cfg.mcpServers = {
    ...mcpServers,
    blimpr: { command: MCP_COMMAND, args: mcpArgs },
  };
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  log("✓  MCP server added to ~/.cursor/mcp.json");
}

export function install(
  repoPath: string,
  log: (m: string) => void = console.log,
  distribution: Distribution = "npm",
) {
  const tools = detectTools();
  const packageName = packageSpec(distribution);
  log(`Blimpr installer — repo: ${repoPath}`);
  log(
    `detected: Claude Code=${tools.claudeCode} Codex CLI=${tools.codexCli} Cursor=${tools.cursor}`,
  );

  // 1. Universal baseline: works whatever tool made the commit.
  installGitHook(repoPath, packageName, log);

  // 2. Instruction layer.
  const agents = upsertSection(
    join(repoPath, "AGENTS.md"),
    AGENTS_MD_SECTION,
    "Agent instructions",
  );
  log(`✓  AGENTS.md ${agents}`);

  if (tools.claudeCode) {
    const claude = upsertSection(
      join(repoPath, "CLAUDE.md"),
      CLAUDE_MD_SECTION,
      "Project notes for Claude Code",
    );
    log(`✓  CLAUDE.md ${claude}`);
  }

  if (tools.cursor) {
    const rulesDir = join(repoPath, ".cursor", "rules");
    mkdirSync(rulesDir, { recursive: true });
    const legacyRule = join(rulesDir, "autoship.mdc");
    if (existsSync(legacyRule)) unlinkSync(legacyRule);
    writeFileSync(join(rulesDir, "blimpr.mdc"), CURSOR_RULE);
    log("✓  .cursor/rules/blimpr.mdc written");
  }

  // 3. MCP registration per tool.
  if (process.env.BLIMPR_SKIP_MCP_REGISTRATION === "1") {
    log("!  MCP registration skipped by BLIMPR_SKIP_MCP_REGISTRATION");
  } else {
    if (tools.claudeCode) registerMcp("claude", packageName, log);
    if (tools.codexCli) registerMcp("codex", packageName, log);
    if (tools.cursor) registerCursorMcp(packageName, log);
  }

  log("");
  log("Done. Commit something meaningful and Blimpr will queue it.");
  log("Honest note for Cursor users: capture there is commit-level (git hook);");
  log("Claude Code and Codex CLI additionally get richer session context.");
}
