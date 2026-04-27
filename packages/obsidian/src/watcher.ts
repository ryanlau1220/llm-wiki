import chokidar from "chokidar";
import path from "node:path";

import type { WatchEvent, WatcherConfig } from "./types";

type PendingEvent = {
  timer: NodeJS.Timeout;
  event: WatchEvent;
};

export function startVaultWatcher(config: WatcherConfig): () => Promise<void> {
  const pendingByPath = new Map<string, PendingEvent>();

  const watcher = chokidar.watch(config.rootPath, {
    ignored: ["**/ai-generated/**", ...(config.ignoredGlobs ?? [])],
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: config.debounceMs,
      pollInterval: 100
    }
  });

  const schedule = (event: WatchEvent): void => {
    const current = pendingByPath.get(event.path);
    if (current) {
      clearTimeout(current.timer);
    }

    const timer = setTimeout(async () => {
      pendingByPath.delete(event.path);
      await config.onEvent(event);
    }, config.debounceMs);

    pendingByPath.set(event.path, { timer, event });
  };

  const toEvent = (type: WatchEvent["event"], filePath: string): WatchEvent => ({
    event: type,
    path: path.normalize(filePath),
    at: Date.now()
  });

  watcher.on("add", (filePath) => schedule(toEvent("add", filePath)));
  watcher.on("change", (filePath) => schedule(toEvent("change", filePath)));
  watcher.on("unlink", (filePath) => schedule(toEvent("unlink", filePath)));

  return async () => {
    for (const pending of pendingByPath.values()) {
      clearTimeout(pending.timer);
    }
    pendingByPath.clear();
    await watcher.close();
  };
}
