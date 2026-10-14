-- Run once in the Supabase SQL Editor. No existing memo tables are changed.
create table if not exists public.demo_device_approvals (
  id uuid primary key,
  owner_user_id uuid not null unique,
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('pending', 'approved', 'revoked')),
  created_at timestamptz not null default now(),
  approved_by uuid
);
alter table public.demo_device_approvals enable row level security;
revoke all on table public.demo_device_approvals from anon, authenticated;
grant select, insert, update on table public.demo_device_approvals to service_role;
