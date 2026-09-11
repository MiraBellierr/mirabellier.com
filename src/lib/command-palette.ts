// Tiny pub-sub so any component (e.g. a nav button) can open the command
// palette without threading a Context through the whole app.
const listeners = new Set<() => void>();

export function openCommandPalette() {
  listeners.forEach((fn) => fn());
}

export function onOpenCommandPalette(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
