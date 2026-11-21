-- ============================================================
-- Gskin Dashboard — NextAuth + Supabase as database
-- Run this in the Supabase SQL Editor (in addition to / instead of
-- the earlier auth.users-based schema).
--
-- Design: login stays NextAuth (Google OAuth). The app talks to
-- Supabase server-side ONLY via the service-role key, keyed by the
-- NextAuth user id (Google "sub", a long string — NOT a UUID).
-- RLS is intentionally left off because only the service-role key
-- (which bypasses RLS) is used; the anon key is never exposed to
-- these tables.
-- ============================================================

-- ------------------------------------------------------------
-- Agent state: the classified demo/fixture assessments + run meta.
-- Single row ("singleton") because this is a single-user dashboard.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_agent_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  data JSONB NOT NULL DEFAULT '{"assessments":{},"meta":{}}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- User workspace state: checked/snoozes/approved/draftEdits,
-- legacy messages + invoices, brief run history.
-- Keyed by the NextAuth Google sub (user_id TEXT).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_user_state (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Agent settings/config: providers, defaultProvider, Gmail token,
-- mail source, fixture stage, email signature.
-- Single row ("singleton").
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_agent_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes (user_state already has a PK on user_id).
CREATE INDEX IF NOT EXISTS idx_dw_agent_state_updated ON public.dw_agent_state (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dw_user_state_updated ON public.dw_user_state (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dw_agent_settings_updated ON public.dw_agent_settings (updated_at DESC);
