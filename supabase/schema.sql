-- Supabase Database Schema for Gskin Dashboard
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTH (managed by Supabase Auth)
-- ============================================
-- Users table is managed by Supabase Auth
-- We create a profiles table for additional user data

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    sidebar_mode TEXT DEFAULT 'pinned' CHECK (sidebar_mode IN ('pinned', 'floating')),
    theme TEXT DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
    location_mode TEXT DEFAULT 'auto' CHECK (location_mode IN ('auto', 'city')),
    city TEXT,
    units TEXT DEFAULT 'c' CHECK (units IN ('c', 'f')),
    email_signature TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PROVIDER CONFIGURATIONS
-- ============================================

CREATE TABLE public.provider_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL CHECK (provider_id IN ('openai', 'anthropic', 'gemini', 'openrouter')),
    api_key_encrypted TEXT, -- Store encrypted API keys
    model TEXT NOT NULL,
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider_id)
);

ALTER TABLE public.provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own provider configs" ON public.provider_configs
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- MAIL ASSESSMENTS (core email triage data)
-- ============================================

CREATE TABLE public.mail_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Core identification
    conversation_id TEXT NOT NULL,
    source_message_id TEXT NOT NULL,
    thread_id TEXT,
    
    -- Email metadata
    subject TEXT NOT NULL,
    from_name TEXT,
    from_email TEXT,
    snippet TEXT,
    body TEXT,
    body_html TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    gmail_link TEXT,
    
    -- Classification
    classification TEXT NOT NULL CHECK (classification IN ('reply_needed', 'action_needed', 'waiting', 'info', 'unclassified')),
    next_action TEXT,
    priority_reason TEXT,
    deadline DATE,
    
    -- Consequences
    consequence_sender_says TEXT,
    consequence_possible TEXT,
    impact TEXT,
    
    -- Invoice data
    invoice_supplier TEXT,
    invoice_number TEXT,
    invoice_amount NUMERIC(12, 2),
    invoice_currency TEXT DEFAULT 'EUR',
    invoice_iban TEXT,
    invoice_due_date DATE,
    invoice_payment_status TEXT CHECK (invoice_payment_status IN ('unknown', 'open_per_sender', 'paid_confirmed')),
    invoice_payment_advice TEXT,
    invoice_unread_attachment BOOLEAN DEFAULT FALSE,
    
    -- Shipment data
    shipment_supplier TEXT,
    shipment_order_number TEXT,
    shipment_status TEXT,
    shipment_carrier TEXT,
    shipment_delivered_at DATE,
    shipment_location TEXT,
    shipment_international BOOLEAN DEFAULT FALSE,
    
    -- Order confirmation
    order_supplier TEXT,
    order_number TEXT,
    order_status TEXT,
    
    -- Prepared actions
    prepared_action TEXT,
    draft_reply TEXT,
    
    -- Declaration workflow
    declaration TEXT CHECK (declaration IN ('none', 'pending', 'declared')),
    declared_at TIMESTAMPTZ,
    
    -- Save/Archive
    saved_at TIMESTAMPTZ,
    handled_by_user BOOLEAN DEFAULT FALSE,
    handled_at TIMESTAMPTZ,
    needs_attention BOOLEAN DEFAULT FALSE,
    attention_reason TEXT,
    
    -- Snooze
    snoozed_until TIMESTAMPTZ,
    
    -- Sent
    sent_at TIMESTAMPTZ,
    
    -- Thread context
    thread JSONB,
    
    -- Metadata
    source TEXT CHECK (source IN ('mail', 'scan')) DEFAULT 'mail',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, conversation_id)
);

-- Indexes for common queries
CREATE INDEX idx_mail_assessments_user_id ON public.mail_assessments(user_id);
CREATE INDEX idx_mail_assessments_classification ON public.mail_assessments(classification);
CREATE INDEX idx_mail_assessments_deadline ON public.mail_assessments(deadline);
CREATE INDEX idx_mail_assessments_saved_at ON public.mail_assessments(saved_at);
CREATE INDEX idx_mail_assessments_handled ON public.mail_assessments(handled_by_user);
CREATE INDEX idx_mail_assessments_invoice ON public.mail_assessments(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX idx_mail_assessments_shipment ON public.mail_assessments(shipment_order_number) WHERE shipment_order_number IS NOT NULL;
CREATE INDEX idx_mail_assessments_declaration ON public.mail_assessments(declaration) WHERE declaration IS NOT NULL;
CREATE INDEX idx_mail_assessments_saved ON public.mail_assessments(saved_at) WHERE saved_at IS NOT NULL;

ALTER TABLE public.mail_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mail assessments" ON public.mail_assessments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own mail assessments" ON public.mail_assessments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mail assessments" ON public.mail_assessments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mail assessments" ON public.mail_assessments
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SAVED EMAILS (Bewaren)
-- ============================================

CREATE TABLE public.saved_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mail_assessment_id UUID REFERENCES public.mail_assessments(id) ON DELETE SET NULL,
    
    -- Original email data
    subject TEXT NOT NULL,
    from_name TEXT,
    from_email TEXT,
    body TEXT,
    body_html TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    gmail_link TEXT,
    
    -- Invoice data if applicable
    invoice_supplier TEXT,
    invoice_number TEXT,
    invoice_amount NUMERIC(12, 2),
    invoice_currency TEXT DEFAULT 'EUR',
    invoice_iban TEXT,
    invoice_due_date DATE,
    invoice_payment_status TEXT,
    
    -- Shipment data
    shipment_supplier TEXT,
    shipment_order_number TEXT,
    shipment_status TEXT,
    shipment_carrier TEXT,
    shipment_delivered_at DATE,
    
    -- Classification at time of save
    classification TEXT,
    next_action TEXT,
    priority_reason TEXT,
    deadline DATE,
    consequence_sender_says TEXT,
    consequence_possible TEXT,
    impact TEXT,
    
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, mail_assessment_id)
);

CREATE INDEX idx_saved_emails_user_id ON public.saved_emails(user_id);
CREATE INDEX idx_saved_emails_saved_at ON public.saved_emails(saved_at);

ALTER TABLE public.saved_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved emails" ON public.saved_emails
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved emails" ON public.saved_emails
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved emails" ON public.saved_emails
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- DECLARATIONS (Declareren)
-- ============================================

CREATE TABLE public.declarations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mail_assessment_id UUID REFERENCES public.mail_assessments(id) ON DELETE CASCADE,
    
    invoice_supplier TEXT,
    invoice_number TEXT,
    invoice_amount NUMERIC(12, 2),
    invoice_currency TEXT DEFAULT 'EUR',
    invoice_iban TEXT,
    invoice_due_date DATE,
    
    status TEXT NOT NULL CHECK (status IN ('pending', 'declared', 'archived')) DEFAULT 'pending',
    declared_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(mail_assessment_id)
);

CREATE INDEX idx_declarations_user_id ON public.declarations(user_id);
CREATE INDEX idx_declarations_status ON public.declarations(status);

ALTER TABLE public.declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own declarations" ON public.declarations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own declarations" ON public.declarations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own declarations" ON public.declarations
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- SCANNED INVOICES
-- ============================================

CREATE TABLE public.scanned_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    scan_id UUID NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT,
    file_path TEXT NOT NULL,
    
    supplier TEXT,
    invoice_number TEXT,
    invoice_date DATE,
    due_date DATE,
    amount NUMERIC(12, 2),
    currency TEXT DEFAULT 'EUR',
    iban TEXT,
    reference TEXT,
    payment_status TEXT CHECK (payment_status IN ('unknown', 'open_per_sender', 'paid_confirmed')) DEFAULT 'unknown',
    payment_advice TEXT,
    
    extracted_data JSONB,
    raw_text TEXT,
    
    mail_assessment_id UUID REFERENCES public.mail_assessments(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scanned_invoices_user_id ON public.scanned_invoices(user_id);
CREATE INDEX idx_scanned_invoices_scan_id ON public.scanned_invoices(scan_id);

ALTER TABLE public.scanned_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scanned invoices" ON public.scanned_invoices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scanned invoices" ON public.scanned_invoices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scanned invoices" ON public.scanned_invoices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scanned invoices" ON public.scanned_invoices
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SHIPMENTS / ORDERS
-- ============================================

CREATE TABLE public.shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mail_assessment_id UUID REFERENCES public.mail_assessments(id) ON DELETE SET NULL,
    
    supplier TEXT NOT NULL,
    order_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Order bevestigd' CHECK (status IN ('Order bevestigd', 'Verzonden', 'Onderweg', 'Geleverd')),
    carrier TEXT,
    delivered_at DATE,
    expected_delivery DATE,
    location TEXT,
    international BOOLEAN DEFAULT FALSE,
    location_details TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, order_number)
);

CREATE INDEX idx_shipments_user_id ON public.shipments(user_id);
CREATE INDEX idx_shipments_status ON public.shipments(status);
CREATE INDEX idx_shipments_order_number ON public.shipments(order_number);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipments" ON public.shipments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shipments" ON public.shipments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shipments" ON public.shipments
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- SETTINGS
-- ============================================

CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Mail agent
    mail_agent_source TEXT DEFAULT 'auto' CHECK (mail_agent_source IN ('auto', 'fixtures', 'gmail')),
    fixture_stage INT DEFAULT 1 CHECK (fixture_stage IN (1, 2)),
    
    -- Gmail
    gmail_refresh_token TEXT,
    
    -- Email signature
    email_signature TEXT,
    
    -- UI preferences (synced from profiles but can override)
    sidebar_mode TEXT DEFAULT 'pinned' CHECK (sidebar_mode IN ('pinned', 'floating')),
    theme TEXT DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
    
    -- Weather
    location_mode TEXT DEFAULT 'auto' CHECK (location_mode IN ('auto', 'city')),
    city TEXT,
    units TEXT DEFAULT 'c' CHECK (units IN ('c', 'f')),
    
    -- Cron
    cron_secret TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    type TEXT NOT NULL CHECK (type IN ('missed_email', 'shipment_update', 'invoice_due', 'declaration_needed')),
    title TEXT NOT NULL,
    message TEXT,
    related_id UUID, -- mail_assessment_id, shipment_id, etc.
    related_type TEXT CHECK (related_type IN ('mail_assessment', 'shipment', 'declaration', 'scanned_invoice')),
    
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- CRON JOB LOGS
-- ============================================

CREATE TABLE public.cron_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    source TEXT CHECK (source IN ('gmail', 'fixtures')),
    model TEXT,
    conversations_processed INT DEFAULT 0,
    messages_seen INT DEFAULT 0,
    archived_count INT DEFAULT 0,
    error TEXT,
    
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    metadata JSONB
);

CREATE INDEX idx_cron_logs_user_id ON public.cron_logs(user_id);
CREATE INDEX idx_cron_logs_started_at ON public.cron_logs(started_at);

ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cron logs" ON public.cron_logs
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- STORAGE BUCKETS (for scanned invoices)
-- ============================================

-- Run in Supabase Dashboard > Storage > Create bucket:
-- Name: scanned-invoices
-- Public: false
-- File size limit: 15MB
-- Allowed MIME types: application/pdf, image/jpeg, image/png

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get user's active provider
CREATE OR REPLACE FUNCTION public.get_active_provider(user_id UUID)
RETURNS TABLE (
    provider_id TEXT,
    api_key TEXT,
    model TEXT,
    enabled BOOLEAN
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT provider_id, api_key_encrypted, model, enabled
    FROM provider_configs
    WHERE user_id = get_active_provider.user_id AND enabled = true;
$$;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_configs_updated_at BEFORE UPDATE ON public.provider_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mail_assessments_updated_at BEFORE UPDATE ON public.mail_assessments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_saved_emails_updated_at BEFORE UPDATE ON public.saved_emails
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_declarations_updated_at BEFORE UPDATE ON public.declarations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scanned_invoices_updated_at BEFORE UPDATE ON public.scanned_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- REALTIME PUBLICATIONS (optional, for live updates)
-- ============================================

-- Enable realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_assessments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.declarations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;