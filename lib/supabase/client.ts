import { createClient } from '@supabase/supabase-js';

// Supabase client for server-side operations
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Supabase client for client-side operations (uses anon key)
export function createClientSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

// Middleware client for auth
export function createMiddlewareSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client that will fail gracefully
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => ({
        select: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        insert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        update: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        delete: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        upsert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        eq: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        single: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        order: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        limit: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        range: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        gte: () => ({ data: null, error: { message: 'Supabase not configured' } }),
        lte: () => ({ data: null, error: { message: 'Supabase not configured' } }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
          download: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    } as any;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

// Types for our database tables
export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  sidebar_mode: 'pinned' | 'floating';
  theme: 'system' | 'light' | 'dark';
  location_mode: 'auto' | 'city';
  city: string | null;
  units: 'c' | 'f';
  email_signature: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderConfig = {
  id: string;
  user_id: string;
  provider_id: 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  api_key_encrypted: string | null;
  model: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type MailAssessment = {
  id: string;
  user_id: string;
  conversation_id: string;
  source_message_id: string;
  thread_id: string | null;
  subject: string;
  from_name: string | null;
  from_email: string;
  snippet: string;
  body: string | null;
  body_html: string | null;
  received_at: string;
  gmail_link: string | null;
  classification: 'reply_needed' | 'action_needed' | 'waiting' | 'info' | 'unclassified';
  next_action: string | null;
  priority_reason: string | null;
  deadline: string | null;
  consequence_sender_says: string | null;
  consequence_possible: string | null;
  impact: string | null;
  invoice_supplier: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_currency: string | null;
  invoice_iban: string | null;
  invoice_due_date: string | null;
  invoice_payment_status: 'unknown' | 'open_per_sender' | 'paid_confirmed' | null;
  invoice_payment_advice: string | null;
  invoice_unread_attachment: boolean;
  shipment_supplier: string | null;
  shipment_order_number: string | null;
  shipment_status: string | null;
  shipment_carrier: string | null;
  shipment_delivered_at: string | null;
  shipment_location: string | null;
  shipment_international: boolean;
  order_supplier: string | null;
  order_number: string | null;
  order_status: string | null;
  prepared_action: string | null;
  draft_reply: string | null;
  declaration: 'none' | 'pending' | 'declared' | null;
  declared_at: string | null;
  saved_at: string | null;
  handled_by_user: boolean;
  handled_at: string | null;
  needs_attention: boolean;
  attention_reason: string | null;
  snoozed_until: string | null;
  sent_at: string | null;
  thread: any | null;
  source: 'mail' | 'scan';
  created_at: string;
  updated_at: string;
};

export type SavedEmail = {
  id: string;
  user_id: string;
  mail_assessment_id: string | null;
  subject: string;
  from_name: string | null;
  from_email: string;
  body: string | null;
  body_html: string | null;
  received_at: string;
  gmail_link: string | null;
  invoice_supplier: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_currency: string | null;
  invoice_iban: string | null;
  invoice_due_date: string | null;
  invoice_payment_status: string | null;
  shipment_supplier: string | null;
  shipment_order_number: string | null;
  shipment_status: string | null;
  shipment_carrier: string | null;
  shipment_delivered_at: string | null;
  classification: string | null;
  next_action: string | null;
  priority_reason: string | null;
  deadline: string | null;
  consequence_sender_says: string | null;
  consequence_possible: string | null;
  impact: string | null;
  saved_at: string;
};

export type Declaration = {
  id: string;
  user_id: string;
  mail_assessment_id: string | null;
  invoice_supplier: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_currency: string | null;
  invoice_iban: string | null;
  invoice_due_date: string | null;
  status: 'pending' | 'declared' | 'archived';
  declared_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScannedInvoice = {
  id: string;
  user_id: string;
  scan_id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  file_path: string;
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string;
  iban: string | null;
  reference: string | null;
  payment_status: 'unknown' | 'open_per_sender' | 'paid_confirmed';
  payment_advice: string | null;
  extracted_data: any | null;
  raw_text: string | null;
  mail_assessment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Shipment = {
  id: string;
  user_id: string;
  mail_assessment_id: string | null;
  supplier: string;
  order_number: string;
  status: 'Order bevestigd' | 'Verzonden' | 'Onderweg' | 'Geleverd';
  carrier: string | null;
  delivered_at: string | null;
  expected_delivery: string | null;
  location: string | null;
  international: boolean;
  location_details: string | null;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  mail_agent_source: 'auto' | 'fixtures' | 'gmail';
  fixture_stage: 1 | 2;
  gmail_refresh_token: string | null;
  email_signature: string;
  sidebar_mode: 'pinned' | 'floating';
  theme: 'system' | 'light' | 'dark';
  location_mode: 'auto' | 'city';
  city: string | null;
  units: 'c' | 'f';
  cron_secret: string | null;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: 'missed_email' | 'shipment_update' | 'invoice_due' | 'declaration_needed';
  title: string;
  message: string | null;
  related_id: string | null;
  related_type: 'mail_assessment' | 'shipment' | 'declaration' | 'scanned_invoice' | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
};

export type CronLog = {
  id: string;
  user_id: string | null;
  status: 'success' | 'failed' | 'partial';
  source: 'gmail' | 'fixtures';
  model: string | null;
  conversations_processed: number;
  messages_seen: number;
  archived_count: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  metadata: any;
};

// Helper functions for common queries
export async function getUserProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

export async function getUserProviderConfigs(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('provider_configs')
    .select('*')
    .eq('user_id', userId);
  
  if (error) throw error;
  return data;
}

export async function getUserMailAssessments(supabase: any, userId: string, options?: {
  classification?: string;
  handled?: boolean;
  limit?: number;
  offset?: number;
}) {
  let query = supabase
    .from('mail_assessments')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false });
  
  if (options?.classification) {
    query = query.eq('classification', options.classification);
  }
  if (options?.handled !== undefined) {
    query = query.eq('handled_by_user', options.handled);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUserSavedEmails(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('saved_emails')
    .select('*')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getUserDeclarations(supabase: any, userId: string, status?: string) {
  let query = supabase
    .from('declarations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUserShipments(supabase: any, userId: string, status?: string) {
  let query = supabase
    .from('shipments')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUserSettings(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
  return data;
}

export async function upsertUserSettings(supabase: any, userId: string, settings: Partial<{
  mail_agent_source: string;
  fixture_stage: number;
  gmail_refresh_token: string;
  email_signature: string;
  sidebar_mode: string;
  theme: string;
  location_mode: string;
  city: string;
  units: string;
  cron_secret: string;
}>) {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...settings })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function createNotification(supabase: any, userId: string, notification: {
  type: 'missed_email' | 'shipment_update' | 'invoice_due' | 'declaration_needed';
  title: string;
  message?: string;
  related_id?: string;
  related_type?: 'mail_assessment' | 'shipment' | 'declaration' | 'scanned_invoice';
}) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      ...notification,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function markNotificationRead(supabase: any, notificationId: string, userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getUserNotifications(supabase: any, userId: string, unreadOnly = false) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (unreadOnly) {
    query = query.eq('read', false);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function logCronRun(supabase: any, log: {
  user_id?: string;
  status: 'success' | 'failed' | 'partial';
  source: 'gmail' | 'fixtures';
  model: string | null;
  conversations_processed: number;
  messages_seen: number;
  archived_count: number;
  error?: string;
  metadata?: any;
}) {
  const { data, error } = await supabase
    .from('cron_logs')
    .insert({
      ...log,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}