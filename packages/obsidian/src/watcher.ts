import chokidar from "chokidar";
import path from "node:path";

import type { WatchEvent, WatcherConfig } from "./types";

type PendingEvent = {
  timer: NodeJS.Timeout;
  event: WatchEvent;
};

export function startVaultWatcher(config: WatcherConfig): () => Promise<void> {
  const pendingByPath = new Map<string, PendingEvent>();

  const usePolling = config.rootPath.includes("/mnt/");
  if (usePolling) {
    console.log(`[Watcher] Path "${config.rootPath}" is on a Windows mount. Forcing Chokidar polling mode.`);
  }

  const watcher = chokidar.watch(config.rootPath, {
    ignored: config.ignoredGlobs ?? [],
    ignoreInitial: true,
    persistent: true,
    usePolling,
    interval: usePolling ? 1000 : undefined,
    binaryInterval: usePolling ? 3000 : undefined,
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
