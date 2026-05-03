-- Phase 4: Letters and the talking-head reply pipeline.
--
-- A letter is the user's message to a Subject. The reply pipeline runs
-- crisis classification + RAG retrieval, generates a script via the LLM,
-- synthesizes audio, then renders a lip-synced video. Each stage persists
-- intermediate state for mid-job idempotency: a worker restart after voice
-- synth doesn't re-charge the voice vendor.

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- The user's letter text. Capped to 12K chars to keep the LLM context sane.
  body text not null check (char_length(body) > 0 and char_length(body) <= 12000),
  -- Reply state machine.
  reply_status text not null default 'queued' check (
    reply_status in ('queued', 'classifying', 'retrieving', 'scripting', 'synthesizing', 'rendering', 'ready', 'failed')
  ),
  reply_error text,
  -- Mid-job idempotency: each stage persists its output so retries skip work.
  reply_script text,
  reply_audio_path text,
  reply_video_path text,
  reply_video_duration_ms int,
  -- Crisis classification result (Phase 4 stub, hardened in Phase 5).
  crisis_flag text not null default 'none' check (crisis_flag in ('none', 'borderline', 'flagged')),
  crisis_rationale text,
  -- Provider job id for the avatar render — used by the polling loop.
  avatar_provider_job_id text,
  -- Engine identifiers for the audit trail.
  llm_engine text,
  voice_engine text,
  avatar_engine text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz
);

create index if not exists letters_subject_idx on public.letters (subject_id, created_at desc);
create index if not exists letters_status_idx on public.letters (reply_status) where reply_status != 'ready';

drop trigger if exists letters_touch_updated_at on public.letters;
create trigger letters_touch_updated_at
  before update on public.letters
  for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.letters enable row level security;

drop policy if exists "letters select own" on public.letters;
create policy "letters select own"
  on public.letters for select
  using (auth.uid() = user_id);

drop policy if exists "letters insert own" on public.letters;
create policy "letters insert own"
  on public.letters for insert
  with check (
    auth.uid() = user_id
    and subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- No end-user UPDATE/DELETE policy: status transitions are worker-only via
-- service-role; deletion is hard-delete via service-role (Phase 7 GDPR work).

-- ── Storage: letter-replies-audio + letter-replies-video ────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('letter-replies-audio', 'letter-replies-audio', false, 25 * 1024 * 1024, array['audio/mpeg', 'audio/mp4', 'audio/wav']),
  ('letter-replies-video', 'letter-replies-video', false, 100 * 1024 * 1024, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "letter-replies-audio read own" on storage.objects;
create policy "letter-replies-audio read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'letter-replies-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "letter-replies-video read own" on storage.objects;
create policy "letter-replies-video read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'letter-replies-video'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Writes are service-role only — the worker uploads on the user's behalf.
-- No insert policies for authenticated users.
