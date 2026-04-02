create extension if not exists pgcrypto;

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_lower_idx
  on public.waitlist ((lower(email)));

alter table public.waitlist enable row level security;

drop policy if exists "public waitlist insert" on public.waitlist;

comment on table public.waitlist is
  'Public landing page waitlist. Inserts should go through the waitlist-signup edge function.';
