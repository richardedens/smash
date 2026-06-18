// A tiny dirty-notification hub. Kernel state modules (filesystem, users,
// aliases) call markDirty() on every mutation; the session module registers a
// listener that debounces an encrypted save. Kept dependency-free to avoid
// import cycles. markDirty() is a no-op until a listener is registered, so
// changes made before persistence is initialized (e.g. /bin population) don't
// trigger a save.

let dirtyListener: (() => void) | null = null;

export function setDirtyListener(fn: () => void): void {
  dirtyListener = fn;
}

export function markDirty(): void {
  dirtyListener?.();
}
