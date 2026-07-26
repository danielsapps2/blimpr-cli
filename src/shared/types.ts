/**
 * Core domain types shared by the installer and MCP server.
 */

/** A captured unit of shipped work — the raw material for a hosted reel. */
export interface ShipEvent {
  id: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
  /** Where the event came from. */
  source: "git-hook" | "mcp" | "manual" | "launch-kit";
  /** Absolute path of the repo the work happened in. */
  repoPath: string;
  /** Repo directory name, used as the project label in reels. */
  repoName: string;
  /** Commit hash when captured from git. */
  commitHash?: string;
  /** One-line summary (commit subject or agent-provided summary). */
  summary: string;
  /** Longer description: commit body, diff summary, or agent session notes. */
  details?: string;
  /** Files touched. */
  files?: string[];
  /** Product screenshots copied into Blimpr's local asset store. */
  screenshots?: ScreenshotAsset[];
  /** Insertions/deletions when known. */
  stats?: { insertions: number; deletions: number; filesChanged: number };
  /** What kind of moment this is — drives template selection. */
  kind: "feature" | "bugfix" | "milestone" | "progress" | "launch";
  /** Pipeline state. */
  status: "queued" | "scripted" | "rendered" | "approved" | "posted" | "skipped";
  /** When this event was last pushed to the cloud backend. */
  syncedAt?: string;
}

/** A stable local copy of a screenshot supplied by the coding agent. */
export interface ScreenshotAsset {
  id: string;
  /** Absolute path inside ~/.blimpr/assets. Uploaded only for the selected hosted render. */
  path: string;
  /** Original filename, retained for debugging and previews. */
  originalName: string;
  /** What the viewer should notice in the screenshot. */
  caption?: string;
}

/** Input accepted from an MCP call before the file is copied into Blimpr. */
export interface ScreenshotInput {
  /** Absolute path, or a path relative to the event repository. */
  path: string;
  /** Short description of the visible proof or product moment. */
  caption?: string;
}

/** One-time founder setup, saved locally and synchronized from the account. */
export interface ContentPreferences {
  /** Voice/tone hint fed to the hosted script writer. */
  tone: string;
  /** Platforms to target. */
  platforms: ("x" | "linkedin")[];
  /** Max auto-generated videos per month. */
  monthlyCap: number;
  /** Review-before-post (default, recommended) vs full auto-post. */
  autoPost: boolean;
  /** Product/project name to feature in outros, if any. */
  productName?: string;
  /** One-sentence cold-audience explanation of the product and its benefit. */
  productDescription?: string;
  /** Who the product is for, in plain language. */
  targetAudience?: string;
  /** Preferred low-friction closing action. */
  callToAction?: string;
  /** X/Twitter handle for the outro bug. */
  handle?: string;
}

export const DEFAULT_PREFERENCES: ContentPreferences = {
  tone: "direct, technical, a little dry-humored; no hype words",
  platforms: ["x"],
  monthlyCap: 8,
  autoPost: false,
};
