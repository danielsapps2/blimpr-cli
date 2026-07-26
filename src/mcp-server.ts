#!/usr/bin/env node
/**
 * Blimpr MCP server (Phase 1, local stdio).
 *
 * Exposes exactly 5 tools — kept deliberately lean because Cursor enforces a
 * ~40-tool cap across ALL of a user's connected MCP servers combined.
 * The remote-hosted, subscription-gated version keeps this same tool surface.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { basename } from "node:path";
import {
  addEvent,
  getEvent,
  getPreferences,
  importScreenshots,
  latestQueued,
  listEvents,
  savePreferences,
} from "./shared/index.js";
import { runSync } from "./sync.js";

const server = new McpServer({ name: "blimpr", version: "0.1.0" });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

server.registerTool(
  "log_update",
  {
    title: "Log a shipped update",
    description:
      "Capture a completed unit of work for the founder's content pipeline. " +
      "Call this proactively after finishing a meaningful feature, fix, or milestone — " +
      "include the intent and user impact, not just what files changed. " +
      "For visible changes, attach clean after-state screenshots as visual proof.",
    inputSchema: {
      summary: z.string().describe("One line, written like a good commit subject"),
      details: z
        .string()
        .optional()
        .describe("2-4 sentences: what changed, why it matters to a user, any before/after"),
      kind: z
        .enum(["feature", "bugfix", "milestone", "progress"])
        .default("progress"),
      repoPath: z
        .string()
        .optional()
        .describe("Absolute path of the repo (defaults to cwd)"),
      files: z.array(z.string()).optional(),
      screenshots: z
        .array(
          z.object({
            path: z
              .string()
              .describe("Local PNG, JPEG, or WebP path; relative paths resolve from repoPath"),
            caption: z
              .string()
              .optional()
              .describe("What a cold viewer should notice in this screenshot"),
          }),
        )
        .max(4)
        .optional()
        .describe(
          "Product screenshots to use as visual proof in the reel. Capture after-state UI whenever the update is visible.",
        ),
    },
  },
  async ({ summary, details, kind, repoPath, files, screenshots }) => {
    const repo = repoPath ?? process.cwd();
    const importedScreenshots = screenshots
      ? importScreenshots(screenshots, repo)
      : undefined;
    const event = addEvent({
      source: "mcp",
      repoPath: repo,
      repoName: basename(repo),
      summary,
      details,
      files,
      screenshots: importedScreenshots,
      kind,
    });
    const sync = await runSync(true);
    return text(
      `Queued update ${event.id} ("${summary}"). It will become a short vertical video; ` +
        (sync.renderQueued
          ? `the cloud render has started and the founder reviews before anything is posted.`
          : `it will sync automatically when this repo next connects, and the founder reviews before anything is posted.`) +
        (importedScreenshots?.length
          ? ` Attached ${importedScreenshots.length} screenshot(s) as visual proof.`
          : ""),
    );
  },
);

server.registerTool(
  "set_content_preferences",
  {
    title: "Set content preferences",
    description:
      "One-time setup for the founder's content pipeline: product context, audience, tone, CTA, platforms, cadence cap, and review mode.",
    inputSchema: {
      tone: z.string().optional().describe("Voice hint for scripts, e.g. 'dry, technical'"),
      platforms: z.array(z.enum(["x", "linkedin"])).optional(),
      monthlyCap: z.number().int().min(1).max(100).optional(),
      autoPost: z
        .boolean()
        .optional()
        .describe("false = review-before-post (recommended default)"),
      productName: z.string().optional(),
      productDescription: z
        .string()
        .optional()
        .describe("One sentence explaining the product and user benefit to a stranger"),
      targetAudience: z
        .string()
        .optional()
        .describe("Who the product is for, in plain language"),
      callToAction: z
        .string()
        .optional()
        .describe("Preferred soft CTA, e.g. 'Follow the build' or 'Try it free'"),
      handle: z.string().optional().describe("X handle for the video outro"),
    },
  },
  async (prefs) => {
    const merged = savePreferences(
      Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined)),
    );
    return text(`Preferences saved:\n${JSON.stringify(merged, null, 2)}`);
  },
);

server.registerTool(
  "preview_reel",
  {
    title: "Preview a queued reel",
    description:
      "Show a queued update and how to generate its video. Use before approving anything for posting.",
    inputSchema: {
      eventId: z
        .string()
        .optional()
        .describe("Event to preview; defaults to the latest queued event"),
    },
  },
  async ({ eventId }) => {
    const event = eventId ? getEvent(eventId) : latestQueued();
    if (!event) return text("No queued events. Ship something first.");
    const lines = [
      `Event ${event.id} [${event.status}] — ${event.kind}`,
      `repo: ${event.repoName}`,
      `summary: ${event.summary}`,
      event.details ? `details: ${event.details}` : null,
      event.screenshots?.length
        ? `screenshots: ${event.screenshots
            .map((shot) => `${shot.id} (${shot.caption ?? shot.originalName})`)
            .join(", ")}`
        : "screenshots: none",
      event.syncedAt
        ? "video: hosted render queued or waiting in the dashboard backlog"
        : "video: syncs and renders automatically when the linked CLI is available",
    ].filter(Boolean);
    return text(lines.join("\n"));
  },
);

server.registerTool(
  "get_content_report",
  {
    title: "Content report",
    description:
      "What has been captured, scripted, rendered, and posted — the consistency-habit scoreboard.",
    inputSchema: {},
  },
  async () => {
    const events = listEvents();
    const byStatus = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    }, {});
    const prefs = getPreferences();
    const recent = events
      .slice(-10)
      .map((e) => `  ${e.capturedAt.slice(0, 10)}  ${e.status.padEnd(8)} ${e.summary}`)
      .join("\n");
    return text(
      `Blimpr report — ${events.length} events total\n` +
        `by status: ${JSON.stringify(byStatus)}\n` +
        `monthly cap: ${prefs.monthlyCap} | platforms: ${prefs.platforms.join(", ")} | ` +
        `mode: ${prefs.autoPost ? "auto-post" : "review-before-post"}\n` +
        `recent:\n${recent || "  (none)"}`,
    );
  },
);

server.registerTool(
  "generate_launch_kit",
  {
    title: "Generate a launch kit",
    description:
      "Bigger-format version of the pipeline for major moments: a new product, a big feature, Product Hunt day. " +
      "Queues a launch-type event that renders with the launch template.",
    inputSchema: {
      title: z.string().describe("What is launching"),
      description: z.string().describe("What it does and who it's for"),
      repoPath: z.string().optional(),
    },
  },
  async ({ title, description, repoPath }) => {
    const repo = repoPath ?? process.cwd();
    const event = addEvent({
      source: "launch-kit",
      repoPath: repo,
      repoName: basename(repo),
      summary: title,
      details: description,
      kind: "launch",
    });
    const sync = await runSync(true);
    return text(
      `Launch kit queued as event ${event.id}. ${
        sync.renderQueued
          ? "The cloud render has started."
          : "It will sync and render automatically when the linked CLI is available."
      }`,
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
