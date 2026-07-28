-- Pru Forms — Supabase schema
-- Run this once in your Supabase project (SQL Editor → New query → Run).
-- The app talks to this table with the SERVICE ROLE key from the server only,
-- and enforces its own client/admin permissions, so Row Level Security is left
-- ON with NO public policies (the service role bypasses RLS; anon/authenticated
-- clients get no direct access).

create extension if not exists "pgcrypto";

-- One row per servicing agent (an admin, signed in with their own Google
-- account). Each agent only ever sees sessions tagged with their own id —
-- there is no company-wide/super-admin view by design.
create table if not exists public.agents (
  id         uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email      text not null,
  name       text not null,
  agent_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  form_id      text not null,
  agent_id     uuid references public.agents (id) on delete set null,
  answers      jsonb not null default '{}'::jsonb,
  status       text not null default 'in_progress',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at  timestamptz
);

create index if not exists sessions_status_idx   on public.sessions (status);
create index if not exists sessions_updated_idx  on public.sessions (updated_at desc);
create index if not exists sessions_agent_idx    on public.sessions (agent_id);

-- Migrating an existing deployment? Run just this if the tables above
-- already exist without the agent columns:
--   create table if not exists public.agents ( ... as above ... );
--   alter table public.sessions add column if not exists agent_id uuid references public.agents (id) on delete set null;
--   create index if not exists sessions_agent_idx on public.sessions (agent_id);

-- RLS on, no policies: only the service-role key (used server-side) can read
-- or write. Do NOT add public policies unless you know you want direct client
-- access — the Node server is the only intended writer.
alter table public.sessions enable row level security;
alter table public.agents enable row level security;
