"use client";

/**
 * Naslag: het macOS-liquid-glass-toolbar, pixel voor pixel overgetrokken van een
 * schermafbeelding (892 × 59). Bedoeld om te vergelijken, niet als app-onderdeel.
 */

const EILAND: React.CSSProperties = {
  background: "linear-gradient(180deg, #fafafa 0%, #f6f6f6 55%, #f4f4f4 100%)",
  border: "1px solid #e7e7e7",
  boxShadow:
    "inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(255,255,255,0.6), 0 1px 1px rgba(0,0,0,0.04), 0 8px 16px -6px rgba(0,0,0,0.10)",
};

export default function GlasPage() {
  return (
    <div className="min-h-[70vh] bg-[#fdfdfd] p-8">
      <p className="mb-6 text-[12px] tracking-[0.08em] text-[#8a8a8e] uppercase">Naslag · macOS toolbar</p>

      <div id="mac-toolbar" className="flex items-center gap-3">
        {/* eiland: stop + info */}
        <div className="flex h-[37px] items-center gap-[10px] rounded-full px-[10px]" style={EILAND}>
          <RondIcoon>
            <Kruisje />
          </RondIcoon>
          <RondIcoon>
            <Info />
          </RondIcoon>
        </div>

        {/* eiland: menu */}
        <div className="flex h-[37px] items-center gap-[6px] rounded-full px-[10px]" style={EILAND}>
          <RondIcoon>
            <Puntjes />
          </RondIcoon>
          <Chevron />
        </div>

        {/* segmentbesturing */}
        <div className="flex h-[37px] items-center rounded-full px-[6px]" style={EILAND}>
          <span
            className="grid h-[27px] place-items-center rounded-full px-[16px] text-[13px] font-semibold text-[#1c1c1e]"
            style={{
              background: "linear-gradient(180deg, #e4e4e4 0%, #e6e6e6 55%, #e9e9e9 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(255,255,255,0.5), 0 0.5px 1px rgba(0,0,0,0.05)",
            }}
          >
            CPU
          </span>
          {["Memory", "Energy", "Disk", "Network"].map((label) => (
            <span
              key={label}
              className="grid h-[27px] place-items-center rounded-full px-[16px] text-[13px] font-medium text-[#1c1c1e]"
              style={
                label === "Disk"
                  ? { background: "linear-gradient(180deg, #eeeeee 0%, #f0f0f0 55%, #f3f3f3 100%)" }
                  : undefined
              }
            >
              {label}
            </span>
          ))}
        </div>

        {/* zoekveld */}
        <div
          className="flex h-[37px] flex-1 items-center gap-[8px] rounded-full px-[14px]"
          style={{
            background: "linear-gradient(180deg, #f4f4f4 0%, #f8f8f8 40%, #f7f7f7 100%)",
            border: "1px solid #ebebeb",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06), inset 0 -1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <Vergrootglas />
          <span className="flex-1 text-[13px] text-[#8a8a8e]">slidepad</span>
          <span className="grid h-[15px] w-[15px] place-items-center rounded-full bg-[#8e8e93] text-white">
            <Kruisje klein />
          </span>
        </div>
      </div>
    </div>
  );
}

function RondIcoon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="grid h-[25px] w-[25px] place-items-center rounded-full text-[#3c3c43]"
      style={{
        background: "linear-gradient(180deg, #fdfdfd 0%, #f5f5f5 100%)",
        border: "1px solid #dddddd",
        boxShadow: "inset 0 1px 0 #ffffff, 0 0.5px 1px rgba(0,0,0,0.05)",
      }}
    >
      {children}
    </span>
  );
}

function Kruisje({ klein = false }: { klein?: boolean }) {
  const maat = klein ? 7 : 9;
  return (
    <svg width={maat} height={maat} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  );
}

function Info() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="5" r="4.2" />
      <path d="M5 4.4v3" />
      <path d="M5 2.8v0.2" />
    </svg>
  );
}

function Puntjes() {
  return (
    <svg width="12" height="4" viewBox="0 0 12 4" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="10" cy="2" r="1" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="#3c3c43" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 1.5 4.5 5 8 1.5" />
    </svg>
  );
}

function Vergrootglas() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#8a8a8e" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <circle cx="6" cy="6" r="4.2" />
      <path d="M9.2 9.2 12.5 12.5" />
    </svg>
  );
}
