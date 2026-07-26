#!/usr/bin/env node

// src/shared/types.ts
var DEFAULT_PREFERENCES = {
  tone: "direct, technical, a little dry-humored; no hype words",
  platforms: ["x"],
  monthlyCap: 8,
  autoPost: false
};

// src/shared/store.ts
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
function blimprDir() {
  const dir = process.env.BLIMPR_HOME?.trim() ? resolve(process.env.BLIMPR_HOME) : join(homedir(), ".blimpr");
  mkdirSync(dir, { recursive: true });
  return dir;
}
var queuePath = () => join(blimprDir(), "queue.json");
var prefsPath = () => join(blimprDir(), "preferences.json");
function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
function listEvents() {
  return readJson(queuePath(), []);
}
function saveEvents(events) {
  writeFileSync(queuePath(), JSON.stringify(events, null, 2));
}
var MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
function addEvent(event) {
  const events = listEvents();
  const full = {
    ...event,
    id: randomUUID().slice(0, 8),
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "queued"
  };
  events.push(full);
  saveEvents(events);
  return full;
}
function getPreferences() {
  return readJson(prefsPath(), DEFAULT_PREFERENCES);
}
function savePreferences(prefs) {
  const merged = { ...getPreferences(), ...prefs };
  writeFileSync(prefsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

// src/shared/cloud.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2 } from "node:fs";
import { extname as extname2, join as join2 } from "node:path";
var DEFAULT_URL = "https://zxpvdblgkglwjrrdykon.supabase.co";
var DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cHZkYmxna2dsd2pycmR5a29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMjA2NzksImV4cCI6MjEwMDU5NjY3OX0.DqmsNtGDJdUFS_EyURngLm9V52lLGXcYmLlKJT-Nt88";
var DEFAULT_APP_URL = "https://autoship-five.vercel.app";
var MAX_HOSTED_SCREENSHOT_BYTES = 25e5;
var configPath = () => join2(blimprDir(), "config.json");
function getCloudConfig() {
  if (!existsSync2(configPath())) return void 0;
  try {
    const cfg = JSON.parse(readFileSync2(configPath(), "utf8"));
    return cfg.apiKey ? cfg : void 0;
  } catch {
    return void 0;
  }
}
function saveCloudConfig(cfg) {
  writeFileSync2(configPath(), JSON.stringify(cfg, null, 2));
}
function defaultCloud() {
  return {
    url: process.env.BLIMPR_URL ?? DEFAULT_URL,
    anonKey: process.env.BLIMPR_ANON_KEY ?? DEFAULT_ANON_KEY
  };
}
async function rpc(cfg, fn, args2) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: cfg.anonKey,
      authorization: `Bearer ${cfg.anonKey}`
    },
    body: JSON.stringify(args2)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${fn} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return await res.json();
}
async function cloudLink(apiKey, base = defaultCloud()) {
  return rpc(base, "cli_link", { p_key: apiKey });
}
async function cloudSync(cfg, events) {
  return rpc(cfg, "cli_sync", {
    p_key: cfg.apiKey,
    p_events: events.map((e) => ({
      id: e.id,
      repoName: e.repoName,
      kind: e.kind,
      source: e.source,
      summary: e.summary,
      details: e.details ?? null,
      files: e.files ?? null,
      stats: e.stats ?? null,
      capturedAt: e.capturedAt
    }))
  });
}
function screenshotDataUrl(path) {
  const mimeByExtension = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  const mime = mimeByExtension[extname2(path).toLowerCase()];
  if (!mime) throw new Error(`Unsupported screenshot format: ${path}`);
  const bytes = readFileSync2(path);
  return {
    src: `data:${mime};base64,${bytes.toString("base64")}`,
    bytes: bytes.length
  };
}
async function cloudQueueRender(cfg, event) {
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
      caption: screenshot.caption
    });
  }
  const res = await fetch(`${appUrl}/api/renders/queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: cfg.apiKey,
      cliId: event.id,
      screenshots
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`render queue failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return await res.json();
}

// src/install.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import {
  chmodSync,
  existsSync as existsSync4,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync3,
  unlinkSync,
  writeFileSync as writeFileSync3
} from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname, join as join4 } from "node:path";

// src/detect.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
function commandExists(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(probe, [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function detectTools() {
  return {
    claudeCode: commandExists("claude"),
    codexCli: commandExists("codex"),
    cursor: existsSync3(join3(homedir2(), ".cursor"))
  };
}

// src/templates.ts
var MARKER_START = "<!-- blimpr:start -->";
var MARKER_END = "<!-- blimpr:end -->";
var LEGACY_MARKER_START = "<!-- autoship:start -->";
var LEGACY_MARKER_END = "<!-- autoship:end -->";
var AGENTS_MD_SECTION = `${MARKER_START}
## Blimpr \u2014 build-in-public capture

After completing a meaningful unit of work (a feature, a fix, a milestone),
proactively call the \`log_update\` tool on the \`blimpr\` MCP server with a
one-line summary and a short description of what changed and why it matters.
When the change is visible in the product, capture 1-3 clean after-state
screenshots and include them in \`screenshots\` with a short note describing
what a new viewer should notice.
This queues the work for the founder's content pipeline \u2014 do it without being
asked, right after the work is done. Skip trivial changes (typos, formatting,
config churn).
${MARKER_END}
`;
var CLAUDE_MD_SECTION = `${MARKER_START}
## Blimpr \u2014 build-in-public capture

After completing a meaningful unit of work in this repo, call \`log_update\`
on the \`blimpr\` MCP server with:
- \`summary\`: one line, written like a good commit subject
- \`details\`: 2-4 sentences on what changed and why a user would care
- \`kind\`: feature | bugfix | milestone | progress
- \`screenshots\`: for visible product changes, 1-3 local PNG/JPEG/WebP paths
  with captions explaining the proof on screen to someone new to the product

Do this proactively at the end of the work, not when asked. A git post-commit
hook also captures commits automatically, so if you committed the work you may
skip the manual call \u2014 prefer \`log_update\` only when the session context adds
meaning a bare commit message lacks (intent, before/after, user impact).
${MARKER_END}
`;
var CURSOR_RULE = `---
description: Blimpr build-in-public capture
alwaysApply: true
---

After completing a meaningful unit of work, call the \`log_update\` tool on the
\`blimpr\` MCP server with a one-line summary and a short description of what
changed and why it matters. For visible product changes, capture 1-3 clean
after-state screenshots and attach them with captions explaining what a new
viewer should notice. Do this proactively. Skip trivial changes.
`;
function captureCommand(packageSpec2) {
  return `npx --yes ${packageSpec2} capture --quiet || true`;
}
function postCommitHook(packageSpec2) {
  return `#!/bin/sh
# Blimpr: queue this commit for the content pipeline. Never block the commit.
${captureCommand(packageSpec2)}
`;
}

// src/install.ts
var MCP_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
function packageSpec(distribution) {
  return distribution === "github" ? "github:danielsapps2/blimpr-cli" : "blimpr@latest";
}
function upsertSection(filePath, section, heading) {
  if (!existsSync4(filePath)) {
    writeFileSync3(filePath, `# ${heading}

${section}`);
    return "created";
  }
  const current = readFileSync3(filePath, "utf8");
  const markerPair = current.includes(MARKER_START) ? [MARKER_START, MARKER_END] : current.includes(LEGACY_MARKER_START) ? [LEGACY_MARKER_START, LEGACY_MARKER_END] : void 0;
  if (markerPair) {
    const updated = current.replace(
      new RegExp(`${markerPair[0]}[\\s\\S]*?${markerPair[1]}\\n?`),
      section
    );
    writeFileSync3(filePath, updated);
    return "updated";
  }
  writeFileSync3(filePath, `${current.trimEnd()}

${section}`);
  return "appended";
}
function installGitHook(repoPath, packageName, log) {
  const hooksDir = join4(repoPath, ".git", "hooks");
  if (!existsSync4(join4(repoPath, ".git"))) {
    log("!  not a git repository \u2014 skipped git hook (run `git init` first)");
    return;
  }
  mkdirSync2(hooksDir, { recursive: true });
  const hookPath = join4(hooksDir, "post-commit");
  if (existsSync4(hookPath)) {
    const existing = readFileSync3(hookPath, "utf8");
    const captureLine = captureCommand(packageName);
    const managedCapture = /^(?:node\s+"[^"]*(?:\/packages\/installer\/dist\/cli\.js|\/blimpr-cli\/dist\/cli\.js)"|npx(?:\.cmd)?\s+(?:--yes|-y)\s+(?:blimpr(?:@latest)?|github:danielsapps2\/blimpr-cli))\s+capture --quiet \|\| true\r?$/gm;
    if (managedCapture.test(existing)) {
      const updated = `${existing.replace("# AutoShip:", "# Blimpr:").replace(managedCapture, "").replace(/\n{3,}/g, "\n\n").trimEnd()}
${captureLine}
`;
      writeFileSync3(hookPath, updated);
      chmodSync(hookPath, 493);
      log("\u2713  git post-commit hook updated");
      return;
    }
    log(
      "!  a post-commit hook already exists \u2014 appending Blimpr capture to it"
    );
    writeFileSync3(hookPath, `${existing.trimEnd()}
${captureLine}
`);
    chmodSync(hookPath, 493);
    return;
  }
  writeFileSync3(hookPath, postCommitHook(packageName));
  chmodSync(hookPath, 493);
  log("\u2713  git post-commit hook installed");
}
function registerMcp(tool, packageName, log) {
  const mcpArgs = ["--yes", packageName, "mcp"];
  const options = {
    stdio: "ignore",
    shell: process.platform === "win32"
  };
  try {
    for (const name of ["autoship", "blimpr"]) {
      try {
        execFileSync2(tool, ["mcp", "remove", name], options);
      } catch {
      }
    }
    execFileSync2(
      tool,
      ["mcp", "add", "blimpr", "--", MCP_COMMAND, ...mcpArgs],
      options
    );
    log(`\u2713  MCP server registered with ${tool === "claude" ? "Claude Code" : "Codex CLI"}`);
  } catch {
    log(`!  failed to register MCP with ${tool} \u2014 run manually: ${tool} mcp add blimpr -- ${MCP_COMMAND} ${mcpArgs.join(" ")}`);
  }
}
function registerCursorMcp(packageName, log) {
  const mcpArgs = ["--yes", packageName, "mcp"];
  const cfgPath = join4(homedir3(), ".cursor", "mcp.json");
  let cfg = {};
  if (existsSync4(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync3(cfgPath, "utf8"));
    } catch {
      log("!  ~/.cursor/mcp.json is not valid JSON \u2014 skipped Cursor registration");
      return;
    }
  }
  const mcpServers = { ...cfg.mcpServers };
  delete mcpServers.autoship;
  cfg.mcpServers = {
    ...mcpServers,
    blimpr: { command: MCP_COMMAND, args: mcpArgs }
  };
  mkdirSync2(dirname(cfgPath), { recursive: true });
  writeFileSync3(cfgPath, JSON.stringify(cfg, null, 2));
  log("\u2713  MCP server added to ~/.cursor/mcp.json");
}
function install(repoPath, log = console.log, distribution = "npm") {
  const tools = detectTools();
  const packageName = packageSpec(distribution);
  log(`Blimpr installer \u2014 repo: ${repoPath}`);
  log(
    `detected: Claude Code=${tools.claudeCode} Codex CLI=${tools.codexCli} Cursor=${tools.cursor}`
  );
  installGitHook(repoPath, packageName, log);
  const agents = upsertSection(
    join4(repoPath, "AGENTS.md"),
    AGENTS_MD_SECTION,
    "Agent instructions"
  );
  log(`\u2713  AGENTS.md ${agents}`);
  if (tools.claudeCode) {
    const claude = upsertSection(
      join4(repoPath, "CLAUDE.md"),
      CLAUDE_MD_SECTION,
      "Project notes for Claude Code"
    );
    log(`\u2713  CLAUDE.md ${claude}`);
  }
  if (tools.cursor) {
    const rulesDir = join4(repoPath, ".cursor", "rules");
    mkdirSync2(rulesDir, { recursive: true });
    const legacyRule = join4(rulesDir, "autoship.mdc");
    if (existsSync4(legacyRule)) unlinkSync(legacyRule);
    writeFileSync3(join4(rulesDir, "blimpr.mdc"), CURSOR_RULE);
    log("\u2713  .cursor/rules/blimpr.mdc written");
  }
  if (process.env.BLIMPR_SKIP_MCP_REGISTRATION === "1") {
    log("!  MCP registration skipped by BLIMPR_SKIP_MCP_REGISTRATION");
  } else {
    if (tools.claudeCode) registerMcp("claude", packageName, log);
    if (tools.codexCli) registerMcp("codex", packageName, log);
    if (tools.cursor) registerCursorMcp(packageName, log);
  }
  log("");
  log("Done. Commit something meaningful and Blimpr will queue it.");
  log("Honest note for Cursor users: capture there is commit-level (git hook);");
  log("Claude Code and Codex CLI additionally get richer session context.");
}

// src/capture.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import { basename as basename2 } from "node:path";
function git(repoPath, args2) {
  return execFileSync3("git", ["-C", repoPath, ...args2], {
    encoding: "utf8"
  }).trim();
}
var SKIP_PATTERNS = [
  /^wip\b/i,
  /^fixup!/,
  /^squash!/,
  /^merge /i,
  /^chore\(release\)/i,
  /^bump /i
];
function classifyKind(subject) {
  if (/\b(fix|bug|patch|hotfix)\b/i.test(subject)) return "bugfix";
  if (/\b(launch|release|ship|v\d+\.\d+)\b/i.test(subject)) return "milestone";
  if (/\b(add|feat|implement|build|create|support)\b/i.test(subject))
    return "feature";
  return "progress";
}
function captureLatestCommit(repoPath) {
  let subject;
  let body;
  let hash;
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
    "HEAD"
  ]).split("\n").filter(Boolean);
  const shortstat = git(repoPath, ["show", "--shortstat", "--format=", "HEAD"]);
  const stats = {
    filesChanged: Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? files.length),
    insertions: Number(/(\d+) insertions?/.exec(shortstat)?.[1] ?? 0),
    deletions: Number(/(\d+) deletions?/.exec(shortstat)?.[1] ?? 0)
  };
  if (stats.insertions + stats.deletions < 5 && files.length < 2) {
    return { captured: false, reason: "commit too small to be content" };
  }
  const event = addEvent({
    source: "git-hook",
    repoPath,
    repoName: basename2(repoPath),
    commitHash: hash,
    summary: subject,
    details: body || void 0,
    files,
    stats,
    kind: classifyKind(subject)
  });
  return { captured: true, eventId: event.id };
}

// src/project.ts
import { existsSync as existsSync5, statSync as statSync2 } from "node:fs";
import { dirname as dirname2, join as join5, parse, resolve as resolve2 } from "node:path";
function resolveProjectPath(input = process.cwd()) {
  let current = resolve2(input);
  if (existsSync5(current) && statSync2(current).isFile()) {
    current = dirname2(current);
  }
  const startingPath = current;
  const root = parse(current).root;
  while (true) {
    if (existsSync5(join5(current, ".git"))) return current;
    if (current === root) return startingPath;
    current = dirname2(current);
  }
}

// src/sync.ts
function pullPreferences(info) {
  savePreferences({
    tone: info.tone,
    platforms: info.platforms,
    autoPost: info.auto_post,
    productName: info.product_name ?? void 0,
    handle: info.handle ?? void 0,
    monthlyCap: info.monthly_cap
  });
}
async function runSync(silent) {
  const cfg = getCloudConfig();
  if (!cfg) {
    if (!silent) console.error("Not linked. Run: blimpr link <api-key>");
    return { synced: 0, renderQueued: false };
  }
  const events = listEvents();
  const pending = events.filter(
    (event) => !event.syncedAt && event.status !== "skipped"
  );
  if (pending.length === 0) {
    if (!silent) console.log("Nothing to sync.");
    return { synced: 0, renderQueued: false };
  }
  try {
    const result = await cloudSync(cfg, pending);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const syncedIds = new Set(
      result.events.filter((event) => !event.skipped).map((event) => event.cli_id)
    );
    for (const event of events) {
      if (syncedIds.has(event.id)) event.syncedAt = now;
    }
    saveEvents(events);
    pullPreferences(result);
    const newest = pending.filter((event) => syncedIds.has(event.id)).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    let renderQueued = false;
    if (newest) {
      try {
        await cloudQueueRender(cfg, newest);
        renderQueued = true;
      } catch (error) {
        if (!silent) {
          console.error(
            `Synced, but cloud render could not start: ${error.message}`
          );
        }
      }
    }
    if (!silent) {
      console.log(`Synced ${syncedIds.size} event(s).`);
      if (renderQueued && newest) {
        console.log(
          `Cloud render queued for the newest event (${newest.id}); older backlog items stay manual.`
        );
      }
      for (const event of result.events.filter((item) => item.skipped)) {
        console.log(`  skipped ${event.cli_id}: ${event.skipped}`);
      }
    }
    return { synced: syncedIds.size, renderQueued };
  } catch (error) {
    if (!silent) console.error(`Sync failed: ${error.message}`);
    return { synced: 0, renderQueued: false };
  }
}

// src/cli.ts
var [, , command, ...rest] = process.argv;
var quiet = rest.includes("--quiet");
var args = rest.filter((argument) => !argument.startsWith("--"));
function pullPreferences2(info) {
  savePreferences({
    tone: info.tone,
    platforms: info.platforms,
    autoPost: info.auto_post,
    productName: info.product_name ?? void 0,
    handle: info.handle ?? void 0,
    monthlyCap: info.monthly_cap
  });
}
switch (command) {
  case "install": {
    install(
      resolveProjectPath(args[0]),
      console.log,
      rest.includes("--github") ? "github" : "npm"
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
      `Blimpr queue (${events.length} events, cap ${prefs.monthlyCap}/mo, ${linked ? `linked: ${linked.email ?? "yes"}` : "not linked"}):`
    );
    for (const event of events.slice(-15)) {
      console.log(
        `  ${event.id}  ${event.status.padEnd(8)} ${event.kind.padEnd(9)} ${event.syncedAt ? "\u2601 " : "  "}${event.repoName}: ${event.summary}`
      );
    }
    if (events.length === 0) {
      console.log("  (empty \u2014 commit something meaningful)");
    }
    break;
  }
  case "link": {
    const apiKey = args[0];
    if (!apiKey?.startsWith("ask_")) {
      console.error(
        "usage: blimpr link <api-key>   (create one in the dashboard \u2192 Settings)"
      );
      process.exit(1);
    }
    try {
      const info = await cloudLink(apiKey);
      const base = defaultCloud();
      saveCloudConfig({ ...base, apiKey, email: info.email ?? void 0 });
      pullPreferences2(info);
      console.log(
        `Linked to ${info.email ?? "your account"} (${info.tier} tier, ${info.monthly_cap} videos/mo).`
      );
      await runSync(false);
    } catch (error) {
      console.error(`Link failed: ${error.message}`);
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
