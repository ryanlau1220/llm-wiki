import chokidar from "chokidar";
import path from "node:path";
import fs from "node:fs";

import type { WatchEvent, WatcherConfig } from "./types";

type PendingEvent = {
  timer: NodeJS.Timeout;
  event: WatchEvent;
};

function detectWSL(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    const version = fs.readFileSync("/proc/version", "utf8");
    return version.toLowerCase().includes("microsoft") || version.toLowerCase().includes("wsl");
  } catch {
    return false;
  }
}

export function startVaultWatcher(config: WatcherConfig): () => Promise<void> {
  const pendingByPath = new Map<string, PendingEvent>();

  const usePolling = detectWSL() && config.rootPath.includes("/mnt/");
  if (usePolling) {
    console.log(`[Watcher] Virtualized filesystem mount detected on "${config.rootPath}". Enabling optimized polling sync.`);
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
