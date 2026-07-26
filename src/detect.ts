/**
 * Detect which CLI coding tools exist on this machine.
 * Claude Code and Codex CLI are detected by executable presence; Cursor by
 * its config directory (it's a GUI app, not a CLI on PATH).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DetectedTools {
  claudeCode: boolean;
  codexCli: boolean;
  cursor: boolean;
}

function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(probe, [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectTools(): DetectedTools {
  return {
    claudeCode: commandExists("claude"),
    codexCli: commandExists("codex"),
    cursor: existsSync(join(homedir(), ".cursor")),
  };
}
