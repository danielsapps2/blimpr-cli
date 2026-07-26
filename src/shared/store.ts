/**
 * Local JSON store under ~/.blimpr — the MVP persistence layer.
 * The remote-hosted MCP server replaces this with Supabase later; the
 * interface is deliberately small so that swap stays contained.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ShipEvent,
  ContentPreferences,
  DEFAULT_PREFERENCES,
  ScreenshotAsset,
  ScreenshotInput,
} from "./types.js";

export function blimprDir(): string {
  const dir = process.env.BLIMPR_HOME?.trim()
    ? resolve(process.env.BLIMPR_HOME)
    : join(homedir(), ".blimpr");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const queuePath = () => join(blimprDir(), "queue.json");
const prefsPath = () => join(blimprDir(), "preferences.json");

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function listEvents(): ShipEvent[] {
  return readJson<ShipEvent[]>(queuePath(), []);
}

export function saveEvents(events: ShipEvent[]): void {
  writeFileSync(queuePath(), JSON.stringify(events, null, 2));
}

const SCREENSHOT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
const MAX_SCREENSHOTS = 4;

/**
 * Copy agent-provided screenshots into ~/.blimpr so browser temp files and
 * workspace cleanup cannot break a later render.
 */
export function importScreenshots(
  inputs: ScreenshotInput[],
  basePath: string,
): ScreenshotAsset[] {
  if (inputs.length > MAX_SCREENSHOTS) {
    throw new Error(`A reel can include at most ${MAX_SCREENSHOTS} screenshots.`);
  }

  const files = inputs.map((input) => {
    const sourcePath = isAbsolute(input.path)
      ? resolve(input.path)
      : resolve(basePath, input.path);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new Error(`Screenshot not found: ${input.path}`);
    }
    const extension = extname(sourcePath).toLowerCase();
    if (!SCREENSHOT_EXTENSIONS.has(extension)) {
      throw new Error(
        `Unsupported screenshot format "${extension || "(none)"}". Use PNG, JPEG, or WebP.`,
      );
    }
    const size = statSync(sourcePath).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      throw new Error(`Screenshot is larger than 12 MB: ${input.path}`);
    }
    return { input, sourcePath, extension };
  });

  if (files.length === 0) return [];

  const groupId = randomUUID().slice(0, 8);
  const assetDir = join(blimprDir(), "assets", groupId);
  mkdirSync(assetDir, { recursive: true });

  return files.map(({ input, sourcePath, extension }, index) => {
    const id = `${groupId}-${index + 1}`;
    const storedPath = join(assetDir, `${index + 1}${extension}`);
    copyFileSync(sourcePath, storedPath);
    return {
      id,
      path: storedPath,
      originalName: basename(sourcePath),
      caption: input.caption?.trim() || undefined,
    };
  });
}

export function addEvent(
  event: Omit<ShipEvent, "id" | "capturedAt" | "status">,
): ShipEvent {
  const events = listEvents();
  const full: ShipEvent = {
    ...event,
    id: randomUUID().slice(0, 8),
    capturedAt: new Date().toISOString(),
    status: "queued",
  };
  events.push(full);
  saveEvents(events);
  return full;
}

export function updateEvent(
  id: string,
  patch: Partial<ShipEvent>,
): ShipEvent | undefined {
  const events = listEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return undefined;
  events[idx] = { ...events[idx], ...patch };
  saveEvents(events);
  return events[idx];
}

export function getEvent(id: string): ShipEvent | undefined {
  return listEvents().find((e) => e.id === id);
}

/** Latest event still waiting for content generation. */
export function latestQueued(): ShipEvent | undefined {
  return listEvents()
    .filter((e) => e.status === "queued")
    .at(-1);
}

export function getPreferences(): ContentPreferences {
  return readJson<ContentPreferences>(prefsPath(), DEFAULT_PREFERENCES);
}

export function savePreferences(prefs: Partial<ContentPreferences>): ContentPreferences {
  const merged = { ...getPreferences(), ...prefs };
  writeFileSync(prefsPath(), JSON.stringify(merged, null, 2));
  return merged;
}
