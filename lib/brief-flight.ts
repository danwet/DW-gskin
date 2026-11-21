export type BriefRequest = {
  timeZone: string;
  refresh: boolean;
};

export type BriefFetchResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type Slot = {
  flight: Promise<BriefFetchResult> | null;
};

const PAGE_FLIGHT = "__dwDashboardBriefPageFlight";

function slot(): Slot {
  const g = globalThis as typeof globalThis & { [PAGE_FLIGHT]?: Slot };
  if (!g[PAGE_FLIGHT]) g[PAGE_FLIGHT] = { flight: null };
  return g[PAGE_FLIGHT];
}

export function briefInFlight(): boolean {
  return slot().flight !== null;
}

export function resetBriefFlightForTests(): void {
  slot().flight = null;
}

export type HeldBrief = {
  owned: boolean;
  promise: Promise<BriefFetchResult>;
  start: () => void;
  cancel: () => void;
};

export function holdBrief(input: BriefRequest, fetchImpl: FetchLike = fetch): HeldBrief {
  const current = slot();
  if (current.flight) {
    return {
      owned: false,
      promise: current.flight,
      start() {},
      cancel() {},
    };
  }

  let started = false;
  let release: () => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  const promise = gate.then(() => performFetch(input, fetchImpl)).finally(() => {
    if (current.flight === promise) current.flight = null;
  });
  void promise.catch(() => {});
  current.flight = promise;

  return {
    owned: true,
    promise,
    start() {
      if (started) return;
      started = true;
      release();
    },
    cancel() {
      if (started) return;
      started = true;
      fail(new Error("brief-cancelled"));
    },
  };
}

async function performFetch(input: BriefRequest, fetchImpl: FetchLike): Promise<BriefFetchResult> {
  const params = new URLSearchParams({ timeZone: input.timeZone });
  if (input.refresh) params.set("refresh", "1");
  const response = await fetchImpl(`/api/brief?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return { ok: false, status: response.status, data: null };
  try {
    const data = (await response.json()) as unknown;
    return { ok: true, status: response.status, data };
  } catch {
    return { ok: false, status: response.status, data: null };
  }
}
