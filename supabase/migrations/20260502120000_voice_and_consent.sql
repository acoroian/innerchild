-- Phase 2: Voice cloning + append-only consent attestation.
--
-- consent_records is intentionally INSERT-only. Revocation is a NEW row
-- with revoked=true (and prev_hash pointing at the previous row in the
-- chain for the same subject). UPDATE / DELETE are blocked by trigger.
-- Mirrors GCS object-lock retention bucket in production (Phase 7).

-- ── consent_records ─────────────────────────────────────────────────────────

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- Three legal attestation paths (Phase 2 plan).
  attestation_kind text not null check (attestation_kind in ('self', 'estate_executor', 'live_with_consent')),
  attestation_text_version text not null,
  attestation_text_full text not null,
  -- Acknowledgements
  acknowledged_no_distribution boolean not null,
  -- Audit
  ip text,
  user_agent text,
  -- Tamper-evident hash chain. content_hash = sha256(canonical-row-payload),
  -- prev_hash = previous record's content_hash for the same subject (or null
  -- for the first row). Verified offline by export job.
  content_hash text not null,
  prev_hash text,
  -- Revocation: revoke = new row with revoked=true. Original row stays.
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists consent_records_subject_idx
  on public.consent_records (subject_id, created_at);

-- Block UPDATE / DELETE entirely — append-only.
create or replace function public.consent_records_block_modify()
returns trigger language plpgsql as $$
begin
  raise exception 'consent_records is append-only; insert a new row to revoke';
end;
$$;

drop trigger if exists consent_records_no_update on public.consent_records;
create trigger consent_records_no_update
  before update on public.consent_records
  for each row execute function public.consent_records_block_modify();

drop trigger if exists consent_records_no_delete on public.consent_records;
create trigger consent_records_no_delete
  before delete on public.consent_records
  for each row execute function public.consent_records_block_modify();

-- ── subject_voice_samples ────────────────────────────────────────────────────

create table if not exists public.subject_voice_samples (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  consent_record_id uuid not null references public.consent_records(id),
  storage_path text not null,
  content_type text not null check (content_type in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg')),
  byte_size int,
  duration_ms int,
  -- Lifecycle: pending (uploaded, awaiting clone) → cloning → ready | failed.
  -- voice_id mirrored to subjects.voice_id when status flips to ready.
  clone_status text not null default 'pending' check (clone_status in ('pending', 'cloning', 'ready', 'failed')),
  clone_error text,
  voice_id text,
  -- Engine identifier (mock | elevenlabs | cartesia) so the audit trail names
  -- the vendor that actually issued the voice id.
  engine text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subject_voice_samples_subject_idx
  on public.subject_voice_samples (subject_id);

drop trigger if exists subject_voice_samples_touch_updated_at on public.subject_voice_samples;
create trigger subject_voice_samples_touch_updated_at
  before update on public.subject_voice_samples
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.consent_records enable row level security;
alter table public.subject_voice_samples enable row level security;

-- consent_records: owner-only via direct user_id match (faster than parent join).
drop policy if exists "consent_records select own" on public.consent_records;
create policy "consent_records select own"
  on public.consent_records for select
  using (auth.uid() = user_id);

drop policy if exists "consent_records insert own" on public.consent_records;
create policy "consent_records insert own"
  on public.consent_records for insert
  with check (
    auth.uid() = user_id
    and subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- No update/delete policies — the trigger blocks them anyway, but absence of
-- policy is the second line of defense.

-- subject_voice_samples: parent ownership.
drop policy if exists "subject_voice_samples select via parent" on public.subject_voice_samples;
create policy "subject_voice_samples select via parent"
  on public.subject_voice_samples for select
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_voice_samples insert via parent" on public.subject_voice_samples;
create policy "subject_voice_samples insert via parent"
  on public.subject_voice_samples for insert
  with check (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- Status updates are done by the worker via service-role; no end-user update policy.
-- Hard delete via service-role only.

-- ── Storage bucket: subject-voice-samples ───────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subject-voice-samples',
  'subject-voice-samples',
  false,
  50 * 1024 * 1024, -- 50 MB
  array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subject-voice-samples read own" on storage.objects;
create policy "subject-voice-samples read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'subject-voice-samples'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-voice-samples insert own" on storage.objects;
create policy "subject-voice-samples insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'subject-voice-samples'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-voice-samples delete own" on storage.objects;
create policy "subject-voice-samples delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'subject-voice-samples'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
