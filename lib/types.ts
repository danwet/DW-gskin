import type { InvoiceData } from "./epc";

export type RawMessage = {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body?: string;
  receivedAt: string;
  attachmentUrl?: string;
  attachmentName?: string;
};

export type CalendarEvent = {
  id: string;
  hour: number;
  minute: number;
  title: string;
  detail: string;
  tone: "blue" | "green" | "orange" | "purple";
  color?: string;
  localHold?: boolean;
};

export type DraftReply = {
  id: string;
  messageId: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  deadline: string;
  draft: string;
};

export type QuietEmail = {
  id: string;
  from: string;
  subject: string;
  reason: string;
  when: string;
};

export type ProactiveAction = {
  id: string;
  title: string;
  detail: string;
  status: "Done" | "Ready";
  messageId?: string;
  localHold?: boolean;
};

export type OpenLoop = {
  id: string;
  title: string;
  detail: string;
  doneByAgent: boolean;
  messageId?: string;
  draftId?: string;
  payment?: InvoiceData;
  mail?: {
    from: string;
    fromEmail: string;
    subject: string;
    snippet: string;
  };
  hold?: {
    title: string;
    when: string;
    detail: string;
  };
};

export type Upcoming = {
  id: string;
  when: string;
  title: string;
  detail: string;
  localHold?: boolean;
};

export type Brief = {
  source: "sample" | "user";
  messageCount: number;
  insight: { title: string; detail: string };
  events: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  upcoming: Upcoming[];
  drafts: DraftReply[];
  quiet: QuietEmail[];
  actions: ProactiveAction[];
  loops: OpenLoop[];
};

export type ThemeChoice = "system" | "light" | "dark";
export type UnitChoice = "c" | "f";
export type SidebarMode = "pinned" | "floating";
export type Settings = {
  displayName: string;
  theme: ThemeChoice;
  units: UnitChoice;
  locationMode: "auto" | "city";
  city: string;
  sidebarMode: SidebarMode;
};

export type WeatherNow = {
  temperature: number;
  unit: "C" | "F";
  condition: string;
  city: string | null;
  source: "gps" | "ip" | "city" | "vercel";
};

export type BriefRun = {
  at: string;
  messageCount: number;
  drafts: number;
  quiet: number;
  actions: number;
  upcoming: number;
};

export type UserWorkspace = {
  checked: string[];
  checkedAt: Record<string, number>;
  snoozes: Record<string, string>;
  snoozedAt: Record<string, number>;
  approved: string[];
  draftEdits: Record<string, string>;
  messages: RawMessage[];
  invoices: InvoiceData[];
  lastRun: string | null;
  runs: BriefRun[];
  migrated: boolean;
};

export type ConnectionStatus = {
  cronSecret: boolean;
  agentApiKey: boolean;
};
