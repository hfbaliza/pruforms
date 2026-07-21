-- Pru Forms — Supabase schema
-- Run this once in your Supabase project (SQL Editor → New query → Run).
-- The app talks to this table with the SERVICE ROLE key from the server only,
-- and enforces its own client/admin permissions, so Row Level Security is left
-- ON with NO public policies (the service role bypasses RLS; anon/authenticated
-- clients get no direct access).

create extension if not exists "pgcrypto";

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  form_id      text not null,
  answers      jsonb not null default '{}'::jsonb,
  status       text not null default 'in_progress',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at  timestamptz
);

create index if not exists sessions_status_idx  on public.sessions (status);
create index if not exists sessions_updated_idx on public.sessions (updated_at desc);

-- RLS on, no policies: only the service-role key (used server-side) can read
-- or write. Do NOT add public policies unless you know you want direct client
-- access — the Node server is the only intended writer.
alter table public.sessions enable row level security;
