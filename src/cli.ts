#!/usr/bin/env node
/**
 * blimpr CLI
 *   blimpr install [path]   wire a repo into Blimpr (hook + instructions + MCP)
 *   blimpr capture          queue the latest commit (called by the git hook)
 *   blimpr status           show the content queue
 *   blimpr link <api-key>   connect this machine to your Blimpr account
 *   blimpr sync             push queued events to your account
 */
import {
  listEvents,
  getPreferences,
  savePreferences,
  saveEvents,
  cloudLink,
  cloudSync,
  defaultCloud,
  getCloudConfig,
  saveCloudConfig,
  type AccountInfo,
} from "./shared/index.js";
import { install } from "./install.js";
import { captureLatestCommit } from "./capture.js";
import { resolveProjectPath } from "./project.js";

const [, , command, ...rest] = process.argv;
const quiet = rest.includes("--quiet");
const args = rest.filter((a) => !a.startsWith("--"));

function pullPreferences(info: AccountInfo) {
  savePreferences({
    tone: info.tone,
    platforms: info.platforms as ("x" | "linkedin")[],
    autoPost: info.auto_post,
    productName: info.product_name ?? undefined,
    handle: info.handle ?? undefined,
    monthlyCap: info.monthly_cap,
  });
}

/** Push unsynced events; used by `sync` and automatically after `capture`. */
async function runSync(silent: boolean): Promise<void> {
  const cfg = getCloudConfig();
  if (!cfg) {
    if (!silent) console.error("Not linked. Run: blimpr link <api-key>");
    return;
  }
  const events = listEvents();
  const pending = events.filter((e) => !e.syncedAt && e.status !== "skipped");
  if (pending.length === 0) {
    if (!silent) console.log("Nothing to sync.");
    return;
  }
  try {
    const result = await cloudSync(cfg, pending);
    const now = new Date().toISOString();
    const skippedIds = new Set(
      result.events.filter((r) => r.skipped).map((r) => r.cli_id),
    );
    for (const e of events) {
      if (pending.some((p) => p.id === e.id) && !skippedIds.has(e.id)) {
        e.syncedAt = now;
      }
    }
    saveEvents(events);
    // Preferences may have changed in the dashboard — pull them down.
    pullPreferences(result);
    if (!silent) {
      const synced = result.events.filter((r) => !r.skipped).length;
      console.log(`Synced ${synced} event(s).`);
      for (const r of result.events.filter((r) => r.skipped)) {
        console.log(`  skipped ${r.cli_id}: ${r.skipped}`);
      }
    }
  } catch (err) {
    if (!silent) console.error(`Sync failed: ${(err as Error).message}`);
  }
}

switch (command) {
  case "install": {
    install(resolveProjectPath(args[0]));
    break;
  }
  case "capture": {
    const result = captureLatestCommit(resolveProjectPath(args[0]));
    if (!quiet) {
      if (result.captured) {
        console.log(`Blimpr: queued event ${result.eventId}`);
      } else {
        console.log(`Blimpr: not captured (${result.reason})`);
      }
    }
    // Hook path: push to the account immediately so the dashboard stays live.
    if (result.captured) await runSync(true);
    break;
  }
  case "status": {
    const events = listEvents();
    const prefs = getPreferences();
    const linked = getCloudConfig();
    console.log(
      `Blimpr queue (${events.length} events, cap ${prefs.monthlyCap}/mo, ` +
        `${linked ? `linked: ${linked.email ?? "yes"}` : "not linked"}):`,
    );
    for (const e of events.slice(-15)) {
      console.log(
        `  ${e.id}  ${e.status.padEnd(8)} ${e.kind.padEnd(9)} ` +
          `${e.syncedAt ? "☁ " : "  "}${e.repoName}: ${e.summary}`,
      );
    }
    if (events.length === 0) console.log("  (empty — commit something meaningful)");
    break;
  }
  case "link": {
    const apiKey = args[0];
    if (!apiKey?.startsWith("ask_")) {
      console.error(
        "usage: blimpr link <api-key>   (create one in the dashboard → Settings)",
      );
      process.exit(1);
    }
    try {
      const info = await cloudLink(apiKey);
      const base = defaultCloud();
      saveCloudConfig({ ...base, apiKey, email: info.email ?? undefined });
      pullPreferences(info);
      console.log(
        `Linked to ${info.email ?? "your account"} (${info.tier} tier, ${info.monthly_cap} videos/mo).`,
      );
      await runSync(false);
    } catch (err) {
      console.error(`Link failed: ${(err as Error).message}`);
      process.exit(1);
    }
    break;
  }
  case "sync": {
    await runSync(false);
    break;
  }
  case "mcp": {
    // The bundled server is a sibling output file in the published package.
    // Using a non-literal URL keeps esbuild from folding it into the CLI.
    const serverUrl = new URL(`./${"mcp-server.js"}`, import.meta.url);
    await import(serverUrl.href);
    break;
  }
  default: {
    console.log("usage: blimpr <install|capture|status|link|sync> [path]");
    process.exitCode = command ? 1 : 0;
  }
}
