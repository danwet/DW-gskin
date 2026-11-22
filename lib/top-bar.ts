import type { MailAssessment } from "./agent/types";

/**
 * The notification/sync/weather cluster needs inbox data, but lives in the
 * shell so it sits in the same spot on every page. The page that owns the
 * inbox publishes this.
 */
export type TopBarState = {
  missedItems: MailAssessment[];
  /** Mail that arrived since you last looked, minus what you already opened. */
  newItems: MailAssessment[];
  onOpenNewItem: (item: MailAssessment) => void;
  onMarkAllNewRead: () => void;
  undoable: boolean;
  undo: () => Promise<void>;
  lastSyncAt?: string | null;
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
};
