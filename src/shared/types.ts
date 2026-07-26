/**
 * Core domain types shared by the installer, MCP server, and video pipeline.
 */

/** A captured unit of shipped work — the raw material for a reel. */
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
  /** Path to the rendered video, once it exists. */
  videoPath?: string;
  /** When this event was last pushed to the cloud backend. */
  syncedAt?: string;
  /** Cloud storage path of the uploaded video. */
  cloudPath?: string;
  /** The generated script, once it exists. */
  script?: ReelScript;
}

/** A short-form vertical video script. Hook-first structure is mandatory. */
export interface ReelScript {
  /**
   * The first 3 seconds. Tension, surprise, or before/after — never a greeting,
   * never a logo, never "I added X".
   */
  hook: string;
  /** 2-5 short beats that tell the story. Each renders as one scene. */
  beats: ReelBeat[];
  /** Closing line — what this means / what's next. */
  outro: string;
  /** Suggested post caption (for X/LinkedIn), including hashtags if useful. */
  caption: string;
  /** Full narration text for TTS (concatenation of hook/beats/outro, spoken register). */
  narration: string;
}

export interface ReelBeat {
  /** On-screen text for this scene. Short — max ~12 words. */
  text: string;
  /** Optional terminal-style lines rendered beneath the text (code, diff, command). */
  terminalLines?: string[];
  /** Screenshot to show as visual proof during this beat. */
  screenshotId?: string;
}

/** A stable local copy of a screenshot supplied by the coding agent. */
export interface ScreenshotAsset {
  id: string;
  /** Absolute path inside ~/.blimpr/assets. Never sent to the cloud. */
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

/** One-time founder setup, saved locally (later: server-side per account). */
export interface ContentPreferences {
  /** Voice/tone hint fed to the script writer. */
  tone: string;
  /** Platforms to target. Phase 1: x, linkedin. */
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
  /** Preferred low-friction closing action, e.g. "Follow the build". */
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
