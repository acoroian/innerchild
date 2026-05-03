-- Phase 1: Subjects + subject photos + Storage bucket.
--
-- A "subject" is the person the user is writing to — typically a younger
-- self ("inner child") or an ancestor (grandparent, parent). Each subject
-- gets photos uploaded by its owner. Voice samples, corpus docs, letters
-- come in later migrations.

-- ── subjects ─────────────────────────────────────────────────────────────────

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('inner_child', 'ancestor', 'other')),
  display_name text not null,
  -- The age the subject is depicted as (e.g. inner-child age 7, grandparent age 65).
  -- Optional; null means unspecified.
  age_at_subject int check (age_at_subject is null or (age_at_subject >= 0 and age_at_subject <= 130)),
  -- About form. Free-form fields fed to the reply LLM as Subject context.
  -- Schema kept narrow now; extended in Phase 4 if the LLM needs more.
  relationship text,
  tone text check (tone is null or tone in ('playful', 'wise', 'gentle', 'formal', 'mixed')),
  key_memories text[] not null default '{}',
  things_to_avoid text,
  -- Set in Phase 2 when the voice clone completes.
  voice_id text,
  -- Set when the avatar enrollment completes (Phase 4).
  avatar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists subjects_user_id_idx on public.subjects (user_id) where deleted_at is null;

drop trigger if exists subjects_touch_updated_at on public.subjects;
create trigger subjects_touch_updated_at
  before update on public.subjects
  for each row execute function public.touch_updated_at();

-- ── subject_photos ───────────────────────────────────────────────────────────

create table if not exists public.subject_photos (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- Path within the `subject-photos` Storage bucket. Layout:
  --   {user_id}/{subject_id}/{photo_id}.{ext}
  -- The user_id prefix lets Storage RLS policies reuse auth.uid() cheaply.
  storage_path text not null,
  -- The MIME type the client claimed at upload time.
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  -- True for the photo used as the avatar source. Exactly one per subject.
  is_primary boolean not null default false,
  byte_size int,
  created_at timestamptz not null default now()
);

create unique index if not exists subject_photos_one_primary_per_subject
  on public.subject_photos (subject_id) where is_primary;

create index if not exists subject_photos_subject_id_idx on public.subject_photos (subject_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.subjects enable row level security;
alter table public.subject_photos enable row level security;

-- subjects: owner-only.
drop policy if exists "subjects select own" on public.subjects;
create policy "subjects select own"
  on public.subjects for select
  using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "subjects insert own" on public.subjects;
create policy "subjects insert own"
  on public.subjects for insert
  with check (auth.uid() = user_id);

drop policy if exists "subjects update own" on public.subjects;
create policy "subjects update own"
  on public.subjects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Soft delete only; no end-user delete policy. Hard delete via service role.

-- subject_photos: parent ownership.
drop policy if exists "subject_photos select via parent" on public.subject_photos;
create policy "subject_photos select via parent"
  on public.subject_photos for select
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_photos insert via parent" on public.subject_photos;
create policy "subject_photos insert via parent"
  on public.subject_photos for insert
  with check (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_photos update via parent" on public.subject_photos;
create policy "subject_photos update via parent"
  on public.subject_photos for update
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_photos delete via parent" on public.subject_photos;
create policy "subject_photos delete via parent"
  on public.subject_photos for delete
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- ── Storage bucket: subject-photos ───────────────────────────────────────────
--
-- Private bucket. Reads via signed URLs only (1h TTL). Writes via signed
-- upload URLs issued by the API after authorization.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subject-photos',
  'subject-photos',
  false,
  10 * 1024 * 1024, -- 10 MB
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: users can read/write only objects under their own user_id prefix.
-- Path layout (enforced by API): {user_id}/{subject_id}/{photo_id}.{ext}

drop policy if exists "subject-photos read own" on storage.objects;
create policy "subject-photos read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'subject-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-photos insert own" on storage.objects;
create policy "subject-photos insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'subject-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-photos delete own" on storage.objects;
create policy "subject-photos delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'subject-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
