/**
 * Cloud client for the hosted Blimpr backend (Supabase).
 * The CLI authenticates with a per-user API key; the publishable anon key is
 * safe to embed (all access is gated by RLS + security-definer RPCs).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { blimprDir } from "./store.js";
import type { ShipEvent } from "./types.js";

/** Hosted instance defaults — overridable via config or env for self-hosters. */
const DEFAULT_URL = "https://zxpvdblgkglwjrrdykon.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cHZkYmxna2dsd2pycmR5a29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMjA2NzksImV4cCI6MjEwMDU5NjY3OX0.DqmsNtGDJdUFS_EyURngLm9V52lLGXcYmLlKJT-Nt88";
const DEFAULT_APP_URL = "https://autoship-five.vercel.app";
const MAX_HOSTED_SCREENSHOT_BYTES = 2_500_000;

export interface CloudConfig {
  url: string;
  anonKey: string;
  apiKey: string;
  email?: string;
}

const configPath = () => join(blimprDir(), "config.json");

export function getCloudConfig(): CloudConfig | undefined {
  if (!existsSync(configPath())) return undefined;
  try {
    const cfg = JSON.parse(readFileSync(configPath(), "utf8")) as CloudConfig;
    return cfg.apiKey ? cfg : undefined;
  } catch {
    return undefined;
  }
}

export function saveCloudConfig(cfg: CloudConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

export function defaultCloud(): Pick<CloudConfig, "url" | "anonKey"> {
  return {
    url: process.env.BLIMPR_URL ?? DEFAULT_URL,
    anonKey: process.env.BLIMPR_ANON_KEY ?? DEFAULT_ANON_KEY,
  };
}

async function rpc<T>(
  cfg: Pick<CloudConfig, "url" | "anonKey">,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: cfg.anonKey,
      authorization: `Bearer ${cfg.anonKey}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${fn} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface AccountInfo {
  email: string | null;
  product_name: string | null;
  handle: string | null;
  tone: string;
  platforms: string[];
  auto_post: boolean;
  tier: string;
  status: string;
  monthly_cap: number;
}

export async function cloudLink(
  apiKey: string,
  base = defaultCloud(),
): Promise<AccountInfo> {
  return rpc<AccountInfo>(base, "cli_link", { p_key: apiKey });
}

export interface SyncResult extends AccountInfo {
  events: {
    cli_id: string;
    id?: string;
    status?: string;
    skipped?: string;
    project_enabled?: boolean;
  }[];
}

export type CloudProject = {
  repo_id: string;
  repo_key: string;
  repo_name: string;
  enabled: boolean;
  event_count: number;
  queued_count: number;
  last_event_at: string | null;
};

export async function cloudProjectStatus(
  cfg: CloudConfig,
  project: { key: string; name: string },
): Promise<CloudProject> {
  return rpc<CloudProject>(cfg, "cli_project_status", {
    p_key: cfg.apiKey,
    p_repo_key: project.key,
    p_repo_name: project.name,
  });
}

export async function cloudSetProjectEnabled(
  cfg: CloudConfig,
  project: { key: string; name: string },
  enabled: boolean,
): Promise<CloudProject> {
  return rpc<CloudProject>(cfg, "cli_set_project_enabled", {
    p_key: cfg.apiKey,
    p_repo_key: project.key,
    p_repo_name: project.name,
    p_enabled: enabled,
  });
}

export async function cloudSync(
  cfg: CloudConfig,
  events: ShipEvent[],
): Promise<SyncResult> {
  return rpc<SyncResult>(cfg, "cli_sync", {
    p_key: cfg.apiKey,
    p_events: events.map((e) => ({
      id: e.id,
      repoName: e.repoName,
      repoKey: e.repoKey,
      kind: e.kind,
      source: e.source,
      summary: e.summary,
      details: e.details ?? null,
      files: e.files ?? null,
      stats: e.stats ?? null,
      capturedAt: e.capturedAt,
    })),
  });
}

function screenshotDataUrl(path: string): { src: string; bytes: number } {
  const mimeByExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const mime = mimeByExtension[extname(path).toLowerCase()];
  if (!mime) throw new Error(`Unsupported screenshot format: ${path}`);
  const bytes = readFileSync(path);
  return {
    src: `data:${mime};base64,${bytes.toString("base64")}`,
    bytes: bytes.length,
  };
}

export async function cloudQueueRender(
  cfg: CloudConfig,
  event: ShipEvent,
): Promise<{ jobId: string; status: string }> {
  const appUrl = (process.env.BLIMPR_APP_URL ?? DEFAULT_APP_URL).replace(/\/$/, "");
  let screenshotBytes = 0;
  const screenshots = [];
  for (const screenshot of event.screenshots ?? []) {
    if (screenshots.length === 3) break;
    const encoded = screenshotDataUrl(screenshot.path);
    if (screenshotBytes + encoded.bytes > MAX_HOSTED_SCREENSHOT_BYTES) continue;
    screenshotBytes += encoded.bytes;
    screenshots.push({
      id: screenshot.id,
      src: encoded.src,
      caption: screenshot.caption,
    });
  }

  const res = await fetch(`${appUrl}/api/renders/queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: cfg.apiKey,
      cliId: event.id,
      screenshots,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`render queue failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as { jobId: string; status: string };
}
