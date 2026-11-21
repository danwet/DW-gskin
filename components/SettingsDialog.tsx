"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";

type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter";

type ProviderConfig = {
  apiKeySet: boolean;
  model: string;
  enabled: boolean;
};

type ServerSettings = {
  providers: Record<string, ProviderConfig>;
  defaultProvider: string;
  gmail: { refreshTokenSet: boolean; clientConfigured: boolean };
  calendar: { configured: boolean };
  auth: { secretSet: boolean; url: string | null };
  cronSecret: boolean;
  agentApiKey: boolean;
  mail: { source: "auto" | "fixtures" | "gmail"; fixtureStage: 1 | 2 };
  email: { signature: string };
};

type Category = "profiel" | "agents" | "verbindingen" | "server";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "profiel", label: "Profiel" },
  { id: "agents", label: "Agents" },
  { id: "verbindingen", label: "Verbindingen" },
  { id: "server", label: "Server & agent" },
];

const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: "openai", label: "OpenAI (ChatGPT)" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
];

const PROVIDER_DEFAULTS: Record<string, { model: string; placeholder: string }> = {
  openai: { model: "gpt-4o-mini", placeholder: "sk-…" },
  anthropic: { model: "claude-3-5-sonnet-20241022", placeholder: "sk-ant-…" },
  gemini: { model: "gemini-1.5-pro", placeholder: "AIza…" },
  openrouter: { model: "openai/gpt-4o-mini", placeholder: "sk-or-…" },
};

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, updateSettings } = useApp();
  const [category, setCategory] = useState<Category>("profiel");
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [providerEnabled, setProviderEnabled] = useState(false);
  const [gmailToken, setGmailToken] = useState("");
  const [signature, setSignature] = useState("");
  const [mailSource, setMailSource] = useState<ServerSettings["mail"]["source"]>("auto");
  const [fixtureStage, setFixtureStage] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    setCategory("profiel");
    setNotice(null);
    void load();
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  async function load() {
    try {
      const response = await fetch("/api/settings");
      if (response.status === 401) return;
      if (response.ok) {
        const data = (await response.json()) as ServerSettings;
        setServer(data);
        const firstProvider = Object.keys(data.providers)[0] || "openai";
        setSelectedProvider(firstProvider);
        const provider = data.providers[firstProvider] || { model: "", apiKeySet: false, enabled: false };
        setModel(provider.model);
        setApiKey("");
        setProviderEnabled(provider.enabled);
        setMailSource(data.mail.source);
        setFixtureStage(data.mail.fixtureStage);
        setSignature(data.email.signature);
      }
    } catch {
      setNotice("Instellingen konden niet worden geladen.");
    }
  }

  async function save(patch: Record<string, unknown>, okMessage: string) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("opslaan mislukt");
      const data = (await response.json()) as ServerSettings & { ok: boolean };
      setServer(data);
      const provider = data.providers[selectedProvider] || { model: "", apiKeySet: false, enabled: false };
      setModel(provider.model);
      setApiKey("");
      setProviderEnabled(provider.enabled);
      setMailSource(data.mail.source);
      setFixtureStage(data.mail.fixtureStage);
      if (data.email) setSignature(data.email.signature);
      setNotice(okMessage);
      setApiKey("");
      setGmailToken("");
    } catch {
      setNotice("Opslaan is niet gelukt.");
    } finally {
      setSaving(false);
    }
  }

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Instellingen sluiten"
        className="absolute inset-0 bg-[#12141c]/40"
        onClick={() => setSettingsOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative flex max-h-[min(760px,calc(100vh-32px))] w-full max-w-[860px] flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)] md:flex-row"
      >
        <div className="flex flex-col border-b border-[var(--line)] p-5 md:w-[220px] md:shrink-0 md:border-r md:border-b-0 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">WORKSPACE</p>
              <h2 id="settings-title" className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">
                Instellingen
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="focus-ring grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)]"
              aria-label="Sluiten"
            >
              ×
            </button>
          </div>
          <nav className="mt-5 flex gap-1 overflow-x-auto md:flex-col" aria-label="Instellingencategorieën">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategory(item.id);
                  setNotice(null);
                }}
                aria-current={category === item.id ? "page" : undefined}
                className={`focus-ring shrink-0 rounded-xl px-3 py-2.5 text-left text-[14px] whitespace-nowrap ${
                  category === item.id
                    ? "glass-active font-semibold"
                    : "text-[var(--ink)]/85 hover:bg-[var(--bg)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
          {category === "profiel" ? <ProfileSection settings={settings} updateSettings={updateSettings} /> : null}
          {category === "agents" ? (
            <AgentsSection
              server={server}
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              apiKey={apiKey}
              setApiKey={setApiKey}
              model={model}
              setModel={setModel}
              providerEnabled={providerEnabled}
              setProviderEnabled={setProviderEnabled}
              saving={saving}
              onSaveProvider={() =>
                void save(
                  {
                    providers: {
                      [selectedProvider]: {
                        apiKey,
                        model: model.trim(),
                        enabled: providerEnabled,
                      },
                    },
                  },
                  "Provider-instellingen opgeslagen.",
                )
              }
            />
          ) : null}
          {category === "verbindingen" ? (
            <ConnectionsSection
              server={server}
              gmailToken={gmailToken}
              setGmailToken={setGmailToken}
              signature={signature}
              setSignature={setSignature}
              saving={saving}
              onSaveGmail={() => void save({ gmailRefreshToken: gmailToken }, "Gmail-token opgeslagen (server-side).")}
              onSaveSignature={() => void save({ emailSignature: signature }, "E-mailhandtekening opgeslagen.")}
            />
          ) : null}
          {category === "server" ? (
            <ServerSection
              server={server}
              mailSource={mailSource}
              setMailSource={setMailSource}
              fixtureStage={fixtureStage}
              setFixtureStage={setFixtureStage}
              saving={saving}
              onSave={() => void save({ mailAgentSource: mailSource, fixtureStage }, "Agent-instellingen opgeslagen.")}
            />
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-xl bg-[var(--blue-soft)] px-3 py-2 text-[13px] text-[var(--blue)]">{notice}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
      {hint ? <p className="mt-1 text-[13px] leading-5 text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function ProfileSection({
  settings,
  updateSettings,
}: {
  settings: ReturnType<typeof useApp>["settings"];
  updateSettings: ReturnType<typeof useApp>["updateSettings"];
}) {
  return (
    <section>
      <SectionTitle title="Profiel" hint="Hoe Dashboard jou aanspreekt en hoe het eruitziet." />
      <div className="space-y-5">
        <Field label="How should I call you?">
          <input
            value={settings.displayName}
            onChange={(event) => updateSettings({ displayName: event.target.value })}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weergave">
            <select
              value={settings.theme}
              onChange={(event) => updateSettings({ theme: event.target.value as typeof settings.theme })}
              className={inputClass}
            >
              <option value="system">Systeem</option>
              <option value="light">Licht</option>
              <option value="dark">Donker</option>
            </select>
          </Field>
          <Field label="Temperatuur">
            <select
              value={settings.units}
              onChange={(event) => updateSettings({ units: event.target.value as typeof settings.units })}
              className={inputClass}
            >
              <option value="c">Celsius</option>
              <option value="f">Fahrenheit</option>
            </select>
          </Field>
        </div>
        <Field label="Weerlocatie">
          <select
            value={settings.locationMode}
            onChange={(event) =>
              updateSettings({ locationMode: event.target.value as typeof settings.locationMode })
            }
            className={inputClass}
          >
            <option value="auto">Detecteer waar ik ben</option>
            <option value="city">Gebruik een stad</option>
          </select>
          {settings.locationMode === "city" ? (
            <input
              value={settings.city}
              placeholder="Stadsnaam"
              onChange={(event) => updateSettings({ city: event.target.value })}
              className={`${inputClass} mt-2`}
            />
          ) : null}
        </Field>
      </div>
    </section>
  );
}

function AgentsSection({
  server,
  selectedProvider,
  setSelectedProvider,
  apiKey,
  setApiKey,
  model,
  setModel,
  providerEnabled,
  setProviderEnabled,
  saving,
  onSaveProvider,
}: {
  server: ServerSettings | null;
  selectedProvider: string;
  setSelectedProvider: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  providerEnabled: boolean;
  setProviderEnabled: (v: boolean) => void;
  saving: boolean;
  onSaveProvider: () => void;
}) {
  const provider = server?.providers?.[selectedProvider] || { apiKeySet: false, model: "", enabled: false };
  const defaults = PROVIDER_DEFAULTS[selectedProvider] || { model: "", placeholder: "sk-…" };

  return (
    <section>
      <SectionTitle
        title="Agents"
        hint="Kies een AI-provider en configureer de API-sleutel en model. De sleutels worden alleen op de server opgeslagen."
      />
      <div className="space-y-5">
        <Field label="Provider">
          <select
            value={selectedProvider}
            onChange={(event) => setSelectedProvider(event.target.value)}
            className={inputClass}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="API-sleutel">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={provider.apiKeySet ? "••••••••••••" : defaults.placeholder}
              autoComplete="off"
              className={inputClass}
            />
            <button type="button" onClick={onSaveProvider} disabled={saving} className={primaryClass}>
              Opslaan
            </button>
          </div>
          <Status dot={provider.apiKeySet === true} label={provider.apiKeySet ? "Sleutel aanwezig" : "Nog geen sleutel"} />
        </Field>

        <Field label="Model">
          <div className="flex gap-2">
            <input value={model} onChange={(event) => setModel(event.target.value)} className={inputClass} />
            <button type="button" onClick={onSaveProvider} disabled={saving} className={primaryClass}>
              Opslaan
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--faint)]">Bijv. {defaults.model} of een eigen model-ID.</p>
        </Field>

        <Field label="Actief">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={providerEnabled}
              onChange={(event) => setProviderEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--line)] bg-[var(--bg)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span className="text-[14px] text-[var(--ink)]">{providerEnabled ? "Actief" : "Inactief"}</span>
          </div>
        </Field>
      </div>
    </section>
  );
}

function ConnectionsSection({
  server,
  gmailToken,
  setGmailToken,
  signature,
  setSignature,
  saving,
  onSaveGmail,
  onSaveSignature,
}: {
  server: ServerSettings | null;
  gmailToken: string;
  setGmailToken: (v: string) => void;
  signature: string;
  setSignature: (v: string) => void;
  saving: boolean;
  onSaveGmail: () => void;
  onSaveSignature: () => void;
}) {
  const gmailConnected = server?.gmail.refreshTokenSet === true && server?.gmail.clientConfigured === true;
  return (
    <section>
      <SectionTitle title="Verbindingen" hint="Google Agenda loopt via je Google-login. Gmail op de achtergrond heeft een apart server-token nodig." />
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium">Google Agenda</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">Agenda lezen via je Google-account.</p>
            </div>
            <Status dot={server?.calendar.configured === true} label={server?.calendar.configured ? "Gekoppeld" : "Niet geconfigureerd"} />
          </div>
          {!server?.calendar.configured ? (
            <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
              Zet AUTH_GOOGLE_ID en AUTH_GOOGLE_SECRET in .env.local, log daarna opnieuw in met Google.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--line)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium">Gmail</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">Achtergrondlezen van je inbox.</p>
            </div>
            <Status dot={server?.gmail?.refreshTokenSet === true && server?.gmail?.clientConfigured === true} label={server?.gmail?.refreshTokenSet && server?.gmail?.clientConfigured ? "Gekoppeld" : "Niet gekoppeld"} />
          </div>
          <div className="mt-3">
            <Field label="Gmail refresh token">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={gmailToken}
                  onChange={(event) => setGmailToken(event.target.value)}
                  placeholder={server?.gmail?.refreshTokenSet ? "••••••••••••" : "1//…"}
                  autoComplete="off"
                  className={inputClass}
                />
                <button type="button" onClick={onSaveGmail} disabled={saving} className={primaryClass}>
                  Opslaan
                </button>
              </div>
            </Field>
            <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
              Vereist de scope <span className="font-mono">gmail.readonly</span> en een server-side refresh token. De token blijft op de server.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium">E-mailhandtekening</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">HTML die onder elke verzonden e-mail wordt geplaatst.</p>
            </div>
            <Status dot={signature.trim().length > 0} label={signature.trim() ? "Ingesteld" : "Geen handtekening"} />
          </div>
          <div className="mt-3">
            <Field label="Handtekening (HTML)">
              <textarea
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                rows={5}
                placeholder={'<p>Met vriendelijke groet,<br/>Je naam</p>'}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--blue)]"
              />
            </Field>
            <button type="button" onClick={onSaveSignature} disabled={saving} className={`${primaryClass} mt-3`}>
              Handtekening opslaan
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServerSection({
  server,
  mailSource,
  setMailSource,
  fixtureStage,
  setFixtureStage,
  saving,
  onSave,
}: {
  server: ServerSettings | null;
  mailSource: ServerSettings["mail"]["source"];
  setMailSource: (v: ServerSettings["mail"]["source"]) => void;
  fixtureStage: 1 | 2;
  setFixtureStage: (v: 1 | 2) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <section>
      <SectionTitle title="Server & agent" hint="Status en bron van de achtergrondverwerking." />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mailbron">
            <select
              value={mailSource}
              onChange={(event) => setMailSource(event.target.value as ServerSettings["mail"]["source"])}
              className={inputClass}
            >
              <option value="auto">Automatisch</option>
              <option value="fixtures">Testdata</option>
              <option value="gmail">Gmail</option>
            </select>
          </Field>
          <Field label="Testdata-fase">
            <select value={fixtureStage} onChange={(event) => setFixtureStage(Number(event.target.value) as 1 | 2)} className={inputClass}>
              <option value={1}>1 · factuur zonder herinnering</option>
              <option value={2}>2 · met herinnering</option>
            </select>
          </Field>
        </div>
        <button type="button" onClick={onSave} disabled={saving} className={primaryClass}>
          Agent-instellingen opslaan
        </button>

        <div className="space-y-2 rounded-2xl border border-[var(--line)] px-4 py-3 text-[13px]">
          <Status dot={server?.cronSecret === true} label="CRON_SECRET op de server" />
          <Status dot={server?.agentApiKey === true} label="AGENT_API_KEY op de server" />
          <Status dot={server?.auth.secretSet === true} label="AUTH_SECRET op de server" />
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function Status({ dot, label }: { dot: boolean; label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${dot ? "bg-[var(--green)]" : "bg-[var(--faint)]"}`} />
      {label}
    </span>
  );
}

const inputClass =
  "w-full min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--blue)]";

const primaryClass =
  "shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-60";