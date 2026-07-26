/**
 * `blimpr capture` — invoked by the git post-commit hook (and manually).
 * Reads the latest commit and queues a ShipEvent if it looks meaningful.
 * This is the layer that works identically across Claude Code, Cursor,
 * Codex CLI, and plain terminal commits.
 */
import { execFileSync } from "node:child_process";
import { addEvent, ShipEvent } from "./shared/index.js";
import { repositoryIdentity } from "./repository.js";

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
  }).trim();
}

/** Commits that shouldn't become content. */
const SKIP_PATTERNS = [
  /^wip\b/i,
  /^fixup!/,
  /^squash!/,
  /^merge /i,
  /^chore\(release\)/i,
  /^bump /i,
];

export function classifyKind(subject: string): ShipEvent["kind"] {
  if (/\b(fix|bug|patch|hotfix)\b/i.test(subject)) return "bugfix";
  if (/\b(launch|release|ship|v\d+\.\d+)\b/i.test(subject)) return "milestone";
  if (/\b(add|feat|implement|build|create|support)\b/i.test(subject))
    return "feature";
  return "progress";
}

export interface CaptureResult {
  captured: boolean;
  reason?: string;
  eventId?: string;
}

export function captureLatestCommit(repoPath: string): CaptureResult {
  const repository = repositoryIdentity(repoPath);
  repoPath = repository.path;
  let subject: string;
  let body: string;
  let hash: string;
  try {
    hash = git(repoPath, ["log", "-1", "--pretty=%H"]);
    subject = git(repoPath, ["log", "-1", "--pretty=%s"]);
    body = git(repoPath, ["log", "-1", "--pretty=%b"]);
  } catch {
    return { captured: false, reason: "not a git repository or no commits" };
  }

  if (SKIP_PATTERNS.some((p) => p.test(subject))) {
    return { captured: false, reason: `skipped by pattern: "${subject}"` };
  }

  const files = git(repoPath, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "HEAD",
  ])
    .split("\n")
    .filter(Boolean);

  // shortstat line looks like: " 3 files changed, 120 insertions(+), 8 deletions(-)"
  const shortstat = git(repoPath, ["show", "--shortstat", "--format=", "HEAD"]);
  const stats = {
    filesChanged: Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? files.length),
    insertions: Number(/(\d+) insertions?/.exec(shortstat)?.[1] ?? 0),
    deletions: Number(/(\d+) deletions?/.exec(shortstat)?.[1] ?? 0),
  };

  // Tiny commits are rarely worth a reel; keep the queue high-signal.
  if (stats.insertions + stats.deletions < 5 && files.length < 2) {
    return { captured: false, reason: "commit too small to be content" };
  }

  const event = addEvent({
    source: "git-hook",
    repoPath,
    repoName: repository.name,
    repoKey: repository.key,
    commitHash: hash,
    summary: subject,
    details: body || undefined,
    files,
    stats,
    kind: classifyKind(subject),
  });

  return { captured: true, eventId: event.id };
}
