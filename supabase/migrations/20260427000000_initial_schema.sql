-- aiFamily — initial schema (Phase 0 + Phase 1 stub)
--
-- Sets up:
--   * pgvector extension for RAG (used in Phase 3)
--   * user_profiles 1:1 with auth.users, including the `mode` column that
--     enables the future therapy upgrade path (designed-in, defaulted to
--     'reflective')
--   * Trigger that auto-creates a user_profiles row when a new auth user is
--     inserted, mirroring the aerohub pattern
--   * RLS so users can only see/update their own profile
--
-- Subjects, photos, voice, consent, corpus, letters, affirmations land in
-- subsequent migrations (Phase 1+).

-- ── Extensions ───────────────────────────────────────────────────────────────

create extension if not exists vector with schema extensions;

-- ── user_profiles ────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- Therapy upgrade path: ships defaulted to 'reflective' in V1; flipping to
  -- 'clinical' later enables therapist roles, transcript export, audit logs.
  mode text not null default 'reflective' check (mode in ('reflective', 'clinical')),
  -- Drives crisis-hotline lookup. en-US gets the 988 hotline; additional
  -- locales added without code changes.
  locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.user_profiles.mode is
  'reflective | clinical. Reflective is V1 default; clinical flip enables therapy-mode features.';

-- Auto-create profile on auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'locale', 'en-US')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on row update.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles select own" on public.user_profiles;
create policy "user_profiles select own"
  on public.user_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_profiles update own" on public.user_profiles;
create policy "user_profiles update own"
  on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- INSERTs are done by the trigger via service-role; no end-user insert policy.
-- DELETEs cascade through auth.users deletion; no end-user delete policy.
