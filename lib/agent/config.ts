import "server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { supabaseAvailable, supabaseReadJson, supabaseWriteJson } from "../supabase/kv";

export type MailSource = "auto" | "fixtures" | "gmail";

export const DEFAULT_MODEL = "gpt-4o-mini";

export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter";

export type ProviderConfig = {
  apiKey: string;
  model: string;
  enabled: boolean;
};

export type AgentConfig = {
  providers: Record<ProviderId, ProviderConfig>;
  defaultProvider: ProviderId;
  gmailRefreshToken: string;
  mailAgentSource: MailSource;
  fixtureStage: 1 | 2;
  emailSignature: string;
};

function filePath() {
  return path.join(process.cwd(), "data", "settings", "agent.json");
}

async function readFileConfig(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(filePath(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeFileConfig(config: AgentConfig): Promise<void> {
  try {
    const folder = path.dirname(filePath());
    await mkdir(folder, { recursive: true });
    const tmp = `${filePath()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
    await rename(tmp, filePath());
  } catch {
    // Read-only filesystems (e.g. Vercel without Supabase) should not crash the request.
  }
}

/** Reads the persisted config from Supabase when available, else from the local file. */
async function readPersistedConfig(): Promise<Record<string, unknown>> {
  if (supabaseAvailable()) {
    const doc = await supabaseReadJson("dw_agent_settings", "id", "singleton");
    if (doc.ok && doc.value && typeof doc.value === "object" && !Array.isArray(doc.value)) {
      return doc.value as Record<string, unknown>;
    }
    return {};
  }
  return readFileConfig();
}

/** Persists the full config to Supabase when available, else to the local file. */
async function persistConfig(config: AgentConfig): Promise<void> {
  if (supabaseAvailable()) {
    await supabaseWriteJson("dw_agent_settings", "id", "singleton", config);
    return;
  }
  await writeFileConfig(config);
}

function pickSource(value: unknown): MailSource {
  return value === "fixtures" || value === "gmail" ? value : "auto";
}

function getProviderConfig(file: Record<string, unknown>, providerId: ProviderId): { apiKey: string; model: string; enabled: boolean } {
  const providers = (file.providers as Record<string, unknown>) || {};
  const provider = (providers[providerId] as Record<string, unknown>) || {};

  // Backward compat: also check top-level openaiApiKey/openaiModel
  const legacyApiKey = file.openaiApiKey as string;
  const legacyModel = file.openaiModel as string;

  return {
    apiKey: (provider.apiKey as string) || (providerId === "openai" ? legacyApiKey : "") || "",
    model: (provider.model as string) || legacyModel || "",
    enabled: (provider.enabled as boolean) ?? false,
  };
}

const DEFAULT_PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: { apiKey: "", model: "gpt-4o-mini", enabled: false },
  anthropic: { apiKey: "", model: "claude-3-5-sonnet-20241022", enabled: false },
  gemini: { apiKey: "", model: "gemini-1.5-pro", enabled: false },
  openrouter: { apiKey: "", model: "openai/gpt-4o-mini", enabled: false },
};

export async function loadAgentConfig(): Promise<AgentConfig> {
  const file = await readPersistedConfig();
  
  // Type-safe access to providers
  const providers = (file.providers as Record<ProviderId, { apiKey?: string; model?: string; enabled?: boolean }>) || {};
  
  const openaiConfig = providers.openai || { apiKey: file.openaiApiKey as string, model: file.openaiModel as string, enabled: false };
  const anthropicConfig = providers.anthropic || {};
  const geminiConfig = providers.gemini || {};
  const openrouterConfig = providers.openrouter || {};
  
  return {
    providers: {
      openai: {
        apiKey: (openaiConfig.apiKey || process.env.OPENAI_API_KEY) ?? "",
        model: (openaiConfig.model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini") as string,
        enabled: openaiConfig.enabled ?? Boolean(process.env.OPENAI_API_KEY),
      },
      anthropic: {
        apiKey: ((anthropicConfig.apiKey as string) || process.env.ANTHROPIC_API_KEY) ?? "",
        model: (anthropicConfig.model as string)?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022",
        enabled: anthropicConfig.enabled ?? Boolean(process.env.ANTHROPIC_API_KEY),
      },
      gemini: {
        apiKey: ((geminiConfig.apiKey as string) || process.env.GEMINI_API_KEY) ?? "",
        model: (geminiConfig.model as string)?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-1.5-pro",
        enabled: geminiConfig.enabled ?? Boolean(process.env.GEMINI_API_KEY),
      },
      openrouter: {
        apiKey: ((openrouterConfig.apiKey as string) || process.env.OPENROUTER_API_KEY) ?? "",
        model: (openrouterConfig.model as string)?.trim() || process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini",
        enabled: openrouterConfig.enabled ?? Boolean(process.env.OPENROUTER_API_KEY),
      },
    },
    defaultProvider: (typeof file.defaultProvider === "string" && file.defaultProvider in { openai: 0, anthropic: 0, gemini: 0, openrouter: 0 }
      ? file.defaultProvider
      : "openai") as ProviderId,
    gmailRefreshToken:
      typeof file.gmailRefreshToken === "string" && file.gmailRefreshToken
        ? file.gmailRefreshToken
        : process.env.GMAIL_REFRESH_TOKEN ?? "",
    mailAgentSource: pickSource(file.mailAgentSource ?? process.env.MAIL_AGENT_SOURCE),
    fixtureStage: file.fixtureStage === 2 || process.env.MAIL_AGENT_FIXTURE_STAGE === "2" ? 2 : 1,
    emailSignature: typeof file.emailSignature === "string" ? file.emailSignature : "",
  };
}

export async function saveAgentConfig(patch: Partial<AgentConfig>): Promise<AgentConfig> {
  const current = await loadAgentConfig();
  const next: AgentConfig = { ...current, ...patch };
  await persistConfig(next);
  return next;
}