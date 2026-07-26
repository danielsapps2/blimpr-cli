#!/usr/bin/env node
/**
 * blimpr CLI
 *   blimpr install [path]   wire a repo into Blimpr (hook + instructions + MCP)
 *   blimpr capture          queue the latest commit (called by the git hook)
 *   blimpr status           show the content queue
 *   blimpr link <api-key>   connect this machine to your Blimpr account
 *   blimpr sync             push queued events and render the newest one
 */
import {
  cloudLink,
  defaultCloud,
  getCloudConfig,
  getPreferences,
  listEvents,
  saveCloudConfig,
  savePreferences,
  type AccountInfo,
} from "./shared/index.js";
import { install } from "./install.js";
import { captureLatestCommit } from "./capture.js";
import { resolveProjectPath } from "./project.js";
import { runSync } from "./sync.js";

const [, , command, ...rest] = process.argv;
const quiet = rest.includes("--quiet");
const args = rest.filter((argument) => !argument.startsWith("--"));

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

switch (command) {
  case "install": {
    install(
      resolveProjectPath(args[0]),
      console.log,
      rest.includes("--github") ? "github" : "npm",
    );
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
    for (const event of events.slice(-15)) {
      console.log(
        `  ${event.id}  ${event.status.padEnd(8)} ${event.kind.padEnd(9)} ` +
          `${event.syncedAt ? "☁ " : "  "}${event.repoName}: ${event.summary}`,
      );
    }
    if (events.length === 0) {
      console.log("  (empty — commit something meaningful)");
    }
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
    } catch (error) {
      console.error(`Link failed: ${(error as Error).message}`);
      process.exit(1);
    }
    break;
  }
  case "sync": {
    await runSync(false);
    break;
  }
  case "mcp": {
    const serverUrl = new URL(`./${"mcp-server.js"}`, import.meta.url);
    await import(serverUrl.href);
    break;
  }
  default: {
    console.log("usage: blimpr <install|capture|status|link|sync> [path]");
    process.exitCode = command ? 1 : 0;
  }
}
