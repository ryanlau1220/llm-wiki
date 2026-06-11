import type { WatcherHandle } from "./watcher";

let activeWatcher: WatcherHandle | null = null;

export function setWatcher(watcher: WatcherHandle): void {
  activeWatcher = watcher;
}

export function getWatcher(): WatcherHandle | null {
  return activeWatcher;
}
