#!/usr/bin/env node
/**
 * blimpr CLI
 *   blimpr install [path]   wire a repo into Blimpr (hook + instructions + MCP)
 *   blimpr capture          queue the latest commit (called by the git hook)
 *   blimpr status           show the content queue
 *   blimpr link <api-key>   connect this machine to your Blimpr account
 *   blimpr sync             push queued events and render the newest one
 *   blimpr project [...]    show, connect, or disconnect the current Git repo
 */
import {
  cloudLink,
  cloudProjectStatus,
  cloudSetProjectEnabled,
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
import { repositoryIdentity } from "./repository.js";
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
    const project = repositoryIdentity(args[0]);
    const cfg = getCloudConfig();
    if (cfg) {
      try {
        const remoteProject = await cloudProjectStatus(cfg, project);
        if (!remoteProject.enabled) {
          if (!quiet) {
            console.log(
              `Blimpr: not captured (${project.name} is disconnected; run ` +
                "`blimpr project connect` to resume)",
            );
          }
          break;
        }
      } catch {
        // Capture locally during a network outage and let a later sync retry.
      }
    }

    const result = captureLatestCommit(project.path);
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
    const project = repositoryIdentity(args[0]);
    const allEvents = listEvents();
    const events = allEvents.filter(
      (event) =>
        event.repoKey === project.key ||
        (!event.repoKey && event.repoName === project.name),
    );
    const prefs = getPreferences();
    const linked = getCloudConfig();
    let projectLabel = "local only";
    if (linked) {
      try {
        const remoteProject = await cloudProjectStatus(linked, project);
        projectLabel = remoteProject.enabled
          ? `active · ${remoteProject.event_count} cloud capture(s)`
          : "disconnected · no new captures";
      } catch {
        projectLabel = "cloud status unavailable";
      }
    }
    console.log(
      `Blimpr project: ${project.name} (${projectLabel})\n` +
        `Account: ${linked ? linked.email ?? "linked" : "not linked"} · ` +
        `plan cap ${prefs.monthlyCap}/mo\n` +
        `Local captures from this project (${events.length}):`,
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
      const project = repositoryIdentity();
      const projectStatus = await cloudProjectStatus(
        { ...base, apiKey, email: info.email ?? undefined },
        project,
      );
      console.log(
        `${project.name} is ${projectStatus.enabled ? "active" : "disconnected"} in Blimpr.`,
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
  case "project": {
    const action = args[0] ?? "status";
    const cfg = getCloudConfig();
    if (!cfg) {
      console.error("Not linked. Run: blimpr link <api-key>");
      process.exitCode = 1;
      break;
    }
    const project = repositoryIdentity(args[1]);
    try {
      if (action === "disconnect" || action === "off") {
        await cloudSetProjectEnabled(cfg, project, false);
        console.log(
          `${project.name} disconnected. New commits and MCP updates from this repo will be ignored.`,
        );
      } else if (
        action === "connect" ||
        action === "reconnect" ||
        action === "on"
      ) {
        await cloudSetProjectEnabled(cfg, project, true);
        console.log(
          `${project.name} connected. New meaningful work from this repo will create videos.`,
        );
      } else if (action === "status") {
        const status = await cloudProjectStatus(cfg, project);
        console.log(
          `${project.name}: ${status.enabled ? "active" : "disconnected"} · ` +
            `${status.event_count} capture(s) · ${status.queued_count} waiting`,
        );
      } else {
        console.error(
          "usage: blimpr project <status|connect|disconnect> [path]",
        );
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`Project command failed: ${(error as Error).message}`);
      process.exitCode = 1;
    }
    break;
  }
  case "mcp": {
    const serverUrl = new URL(`./${"mcp-server.js"}`, import.meta.url);
    await import(serverUrl.href);
    break;
  }
  default: {
    console.log(
      "usage: blimpr <install|capture|status|link|sync|project> [path]",
    );
    process.exitCode = command ? 1 : 0;
  }
}
