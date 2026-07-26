import {
  cloudQueueRender,
  cloudSync,
  getCloudConfig,
  listEvents,
  saveEvents,
  savePreferences,
  type AccountInfo,
} from "./shared/index.js";

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

export type SyncOutcome = {
  synced: number;
  renderQueued: boolean;
};

/** Push unsynced events and automatically render only the newest one. */
export async function runSync(silent: boolean): Promise<SyncOutcome> {
  const cfg = getCloudConfig();
  if (!cfg) {
    if (!silent) console.error("Not linked. Run: blimpr link <api-key>");
    return { synced: 0, renderQueued: false };
  }

  const events = listEvents();
  const pending = events.filter(
    (event) => !event.syncedAt && event.status !== "skipped",
  );
  if (pending.length === 0) {
    if (!silent) console.log("Nothing to sync.");
    return { synced: 0, renderQueued: false };
  }

  try {
    const result = await cloudSync(cfg, pending);
    const now = new Date().toISOString();
    const syncedIds = new Set(
      result.events.filter((event) => !event.skipped).map((event) => event.cli_id),
    );
    const disconnectedIds = new Set(
      result.events
        .filter((event) => event.project_enabled === false)
        .map((event) => event.cli_id),
    );

    for (const event of events) {
      if (syncedIds.has(event.id)) event.syncedAt = now;
      if (disconnectedIds.has(event.id)) event.status = "skipped";
    }
    saveEvents(events);
    pullPreferences(result);

    const newest = pending
      .filter((event) => syncedIds.has(event.id))
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    let renderQueued = false;
    if (newest) {
      try {
        await cloudQueueRender(cfg, newest);
        renderQueued = true;
      } catch (error) {
        if (!silent) {
          console.error(
            `Synced, but cloud render could not start: ${(error as Error).message}`,
          );
        }
      }
    }

    if (!silent) {
      console.log(`Synced ${syncedIds.size} event(s).`);
      if (renderQueued && newest) {
        console.log(
          `Cloud render queued for the newest event (${newest.id}); older backlog items stay manual.`,
        );
      }
      for (const event of result.events.filter((item) => item.skipped)) {
        console.log(`  skipped ${event.cli_id}: ${event.skipped}`);
      }
    }

    return { synced: syncedIds.size, renderQueued };
  } catch (error) {
    if (!silent) console.error(`Sync failed: ${(error as Error).message}`);
    return { synced: 0, renderQueued: false };
  }
}
