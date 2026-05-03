-- Phase 3: RAG corpus per Subject.
--
-- subject_corpus_docs: a user-uploaded document attached to a Subject (a
-- journal entry, family story, letter exchange, "About me" note).
-- subject_chunks: embedded chunks of those docs. Top-K is fetched at letter-
-- reply time as Subject context for the LLM.

-- ── subject_corpus_docs ─────────────────────────────────────────────────────

create table if not exists public.subject_corpus_docs (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- Optional: when uploaded as a file. NULL when content was pasted.
  storage_path text,
  -- Display name shown in UI.
  title text not null,
  -- Original mime so the worker knows how to extract text.
  source_kind text not null check (source_kind in ('text', 'markdown', 'pdf', 'pasted')),
  byte_size int,
  -- Extraction lifecycle.
  ingest_status text not null default 'pending' check (ingest_status in ('pending', 'embedding', 'ready', 'failed')),
  ingest_error text,
  chunk_count int not null default 0,
  -- Inline text for source_kind='pasted'. Capped to 200KB to keep rows small;
  -- larger uploads must come as files.
  inline_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subject_corpus_docs_subject_idx on public.subject_corpus_docs (subject_id);

drop trigger if exists subject_corpus_docs_touch_updated_at on public.subject_corpus_docs;
create trigger subject_corpus_docs_touch_updated_at
  before update on public.subject_corpus_docs
  for each row execute function public.touch_updated_at();

-- ── subject_chunks ──────────────────────────────────────────────────────────
--
-- 1536 dims = OpenAI text-embedding-3-small. Mock engine returns 1536-dim
-- vectors as well so the schema is engine-agnostic.

create table if not exists public.subject_chunks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  doc_id uuid not null references public.subject_corpus_docs(id) on delete cascade,
  chunk_index int not null,
  text text not null,
  embedding extensions.vector(1536) not null,
  -- The model identifier so we can detect mismatched embeddings if we ever
  -- swap model versions and need to re-embed.
  embed_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists subject_chunks_subject_idx on public.subject_chunks (subject_id);
create index if not exists subject_chunks_doc_idx on public.subject_chunks (doc_id);

-- ivfflat is fine for V1 scale; switch to hnsw at >1M vectors.
-- Lists tuning: rows / 1000, capped low for now.
create index if not exists subject_chunks_embedding_ivfflat_idx
  on public.subject_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.subject_corpus_docs enable row level security;
alter table public.subject_chunks enable row level security;

drop policy if exists "subject_corpus_docs select via parent" on public.subject_corpus_docs;
create policy "subject_corpus_docs select via parent"
  on public.subject_corpus_docs for select
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_corpus_docs insert via parent" on public.subject_corpus_docs;
create policy "subject_corpus_docs insert via parent"
  on public.subject_corpus_docs for insert
  with check (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

drop policy if exists "subject_corpus_docs delete via parent" on public.subject_corpus_docs;
create policy "subject_corpus_docs delete via parent"
  on public.subject_corpus_docs for delete
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- subject_chunks: RLS-via-parent for SELECT only. INSERT/DELETE are done by
-- the worker with service-role; cascade delete from doc handles teardown.
drop policy if exists "subject_chunks select via parent" on public.subject_chunks;
create policy "subject_chunks select via parent"
  on public.subject_chunks for select
  using (
    subject_id in (
      select id from public.subjects
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- ── Storage bucket: subject-corpus ──────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subject-corpus',
  'subject-corpus',
  false,
  25 * 1024 * 1024, -- 25 MB
  array['text/plain', 'text/markdown', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subject-corpus read own" on storage.objects;
create policy "subject-corpus read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'subject-corpus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-corpus insert own" on storage.objects;
create policy "subject-corpus insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'subject-corpus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject-corpus delete own" on storage.objects;
create policy "subject-corpus delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'subject-corpus'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── retrieve_subject_chunks RPC ─────────────────────────────────────────────
--
-- Plan-CRITICAL #2: pgvector retrieval needs explicit subject_id filter to
-- avoid the planner choosing surprising plans with ivfflat. We expose a
-- SECURITY DEFINER function that takes a query_embedding and a subject_id and
-- returns top-K chunks, but only after asserting that the calling user owns
-- the subject. This adds the ownership round-trip the security review demands.

create or replace function public.retrieve_subject_chunks(
  p_subject_id uuid,
  p_query extensions.vector(1536),
  p_k int default 6
)
returns table (
  chunk_id uuid,
  doc_id uuid,
  text text,
  similarity float
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Ownership assertion. Even though RLS would block cross-user reads on the
  -- chunks table, this explicit guard keeps the SECURITY DEFINER context
  -- honest and lets us add audit logging here later.
  if not exists (
    select 1 from public.subjects s
    where s.id = p_subject_id and s.user_id = auth.uid() and s.deleted_at is null
  ) then
    raise exception 'subject not owned by caller';
  end if;

  return query
    select c.id, c.doc_id, c.text, 1 - (c.embedding <=> p_query) as similarity
    from public.subject_chunks c
    where c.subject_id = p_subject_id
    order by c.embedding <=> p_query
    limit greatest(1, least(p_k, 25));
end;
$$;

revoke all on function public.retrieve_subject_chunks(uuid, extensions.vector, int) from public;
grant execute on function public.retrieve_subject_chunks(uuid, extensions.vector, int) to authenticated;
