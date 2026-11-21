-- ============================================================
-- Gskin — read-only Gmail connection, action proposals and decisions
-- Run in the Supabase SQL Editor (in addition to migrate-nextauth.sql).
--
-- Phase rule: Gmail is read-only. Proposals can be approved, but an
-- approval only stores a decision — nothing is ever executed.
-- ============================================================

-- ------------------------------------------------------------
-- One read-only Gmail connection per dashboard user.
-- The refresh token is stored encrypted (AES-256-GCM) and only
-- ever read server-side.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_gmail_connections (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Action proposals prepared by the background run.
-- version increments whenever the proposed action changes, so a
-- new version never inherits an earlier approval.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  gmail_email TEXT,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('archive', 'trash', 'reply', 'unsubscribe')),
  target TEXT NOT NULL CHECK (target IN ('message', 'thread')),
  reason TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_dw_action_proposals_user ON public.dw_action_proposals (user_id);

-- ------------------------------------------------------------
-- Decisions. One decision per proposal version, enforced by the
-- unique constraint so retries and double clicks are idempotent.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_action_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.dw_action_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_dw_action_decisions_user ON public.dw_action_decisions (user_id);

-- ------------------------------------------------------------
-- Messages fetched from the read-only Gmail inbox.
-- One row per Gmail message; the card list and the triage both
-- read from here, so the import is resumable and never duplicates.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_gmail_messages (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triaged_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_dw_gmail_messages_user_date
  ON public.dw_gmail_messages (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_dw_gmail_messages_thread
  ON public.dw_gmail_messages (user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_dw_gmail_messages_untriaged
  ON public.dw_gmail_messages (user_id, received_at DESC) WHERE triaged_at IS NULL;

-- ------------------------------------------------------------
-- Import/triage progress. Survives interruptions and model limits:
-- the page token and counters live here, so a run resumes where it
-- stopped instead of starting over.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dw_gmail_imports (
  user_id TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle', 'importing', 'triaging', 'done', 'error')),
  page_token TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  total_estimate INTEGER,
  imported_threads INTEGER NOT NULL DEFAULT 0,
  triaged_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
