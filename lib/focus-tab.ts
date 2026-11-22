export type FocusTab = "urgent" | "later" | "info" | "declare";

/**
 * A notification can ask the Focus page to switch tabs. A tiny store keeps the
 * bell in the shell decoupled from the grid that owns the tab state.
 */
const listeners = new Set<(tab: FocusTab) => void>();

export function setFocusTab(tab: FocusTab): void {
  for (const listener of listeners) listener(tab);
}

export function subscribeFocusTab(listener: (tab: FocusTab) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
