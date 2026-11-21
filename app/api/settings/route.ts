import { sessionUser, unauthorized } from "@/lib/api-auth";
import { loadAgentConfig, saveAgentConfig, type MailSource, type ProviderId } from "@/lib/agent/config";

export const dynamic = "force-dynamic";

async function status() {
  const config = await loadAgentConfig();
  const googleClient = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const providers: Record<string, { apiKeySet: boolean; model: string; enabled: boolean }> = {};
  for (const [id, provider] of Object.entries(config.providers)) {
    providers[id] = {
      apiKeySet: Boolean(provider.apiKey),
      model: provider.model,
      enabled: provider.enabled,
    };
  }
  return {
    providers,
    defaultProvider: config.defaultProvider,
    gmail: {
      refreshTokenSet: Boolean(config.gmailRefreshToken),
      clientConfigured: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    },
    calendar: {
      configured: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    },
    auth: {
      secretSet: Boolean(process.env.AUTH_SECRET),
      url: process.env.AUTH_URL?.trim() || null,
    },
    cronSecret: Boolean(process.env.CRON_SECRET),
    agentApiKey: Boolean(process.env.AGENT_API_KEY),
    mail: {
      source: config.mailAgentSource,
      fixtureStage: config.fixtureStage,
    },
    email: {
      signature: config.emailSignature,
    },
  };
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  return Response.json(await status());
}

export async function PUT(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Parameters<typeof saveAgentConfig>[0] = {};
  
  if (typeof body.gmailRefreshToken === "string") patch.gmailRefreshToken = body.gmailRefreshToken;
  if (body.mailAgentSource === "auto" || body.mailAgentSource === "fixtures" || body.mailAgentSource === "gmail") {
    patch.mailAgentSource = body.mailAgentSource as MailSource;
  }
  if (body.fixtureStage === 1 || body.fixtureStage === 2) patch.fixtureStage = body.fixtureStage;
  if (typeof body.emailSignature === "string") patch.emailSignature = body.emailSignature;
  
  if (typeof body.defaultProvider === "string" && body.defaultProvider in { openai: 0, anthropic: 0, gemini: 0, openrouter: 0 }) {
    patch.defaultProvider = body.defaultProvider as ProviderId;
  }
  
  if (body.providers && typeof body.providers === "object" && !Array.isArray(body.providers)) {
    const providers = body.providers as Record<string, { apiKey?: string; model?: string; enabled?: boolean }>;
    const currentConfig = await loadAgentConfig();
    const nextProviders = { ...currentConfig.providers };
    for (const [providerId, providerConfig] of Object.entries(providers)) {
      if (providerId in { openai: 0, anthropic: 0, gemini: 0, openrouter: 0 }) {
        const currentProvider = currentConfig.providers[providerId as ProviderId] || { apiKey: "", model: "", enabled: false };
        const updates = providerConfig as { apiKey?: string; model?: string; enabled?: boolean };
        nextProviders[providerId as ProviderId] = {
          apiKey: typeof updates.apiKey === "string" ? updates.apiKey : currentProvider.apiKey,
          model: typeof updates.model === "string" && updates.model.trim() ? updates.model.trim() : currentProvider.model,
          enabled: typeof updates.enabled === "boolean" ? updates.enabled : currentProvider.enabled,
        };
      }
    }
    patch.providers = nextProviders;
  }

  await saveAgentConfig(patch);
  return Response.json({ ok: true, ...(await status()) });
}
