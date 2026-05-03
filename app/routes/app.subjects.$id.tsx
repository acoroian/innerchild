import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

import { requireUser } from "~/lib/auth.server";
import {
  isAllowedPhotoMime,
  languageLabel,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  SIGNED_URL_TTL_SECONDS,
  type SubjectPhoto,
} from "~/lib/subjects";
import {
  getSubject,
  listSubjectPhotos,
  softDeleteSubject,
} from "~/lib/subjects.server";
import {
  ATTESTATION_KINDS,
  ATTESTATION_LABELS,
  ATTESTATION_TEXT,
  isAllowedVoiceMime,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MIN_DURATION_MS,
  type AttestationKind,
  type SubjectVoiceSample,
} from "~/lib/voice";
import { getLatestVoiceSample } from "~/lib/voice.server";
import {
  CORPUS_INLINE_MAX_CHARS,
  isAllowedCorpusMime,
  type CorpusIngestStatus,
  type SubjectCorpusDoc,
} from "~/lib/corpus";
import type { Letter } from "~/lib/letters";

export const meta: MetaFunction = () => [{ title: "Subject — mosaicrise" }];

interface PhotoView extends SubjectPhoto {
  signed_url: string | null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/app", { headers: responseHeaders });

  const subject = await getSubject(supabase, id);
  if (!subject) throw redirect("/app", { headers: responseHeaders });

  const [photos, voiceSample, corpusDocsResp, lettersResp] = await Promise.all([
    listSubjectPhotos(supabase, id),
    getLatestVoiceSample(supabase, id),
    supabase
      .from("subject_corpus_docs")
      .select("*")
      .eq("subject_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("letters")
      .select("id, body, reply_status, created_at, ready_at")
      .eq("subject_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const corpusDocs = (corpusDocsResp.data ?? []) as SubjectCorpusDoc[];
  const letters = (lettersResp.data ?? []) as Pick<Letter, "id" | "body" | "reply_status" | "created_at" | "ready_at">[];
  const photoViews: PhotoView[] = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(p.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...p, signed_url: data?.signedUrl ?? null };
    }),
  );

  return json(
    { subject, photos: photoViews, voiceSample, corpusDocs, letters },
    { headers: responseHeaders },
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { supabase, responseHeaders } = await requireUser(request);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400, headers: responseHeaders });
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "delete") {
    await softDeleteSubject(supabase, id);
    throw redirect("/app", { headers: responseHeaders });
  }
  return json({ error: "Unknown intent" }, { status: 400, headers: responseHeaders });
}

const KIND_LABEL = {
  inner_child: "Inner child",
  ancestor: "Ancestor",
  other: "Someone else",
} as const;

export default function SubjectDetail() {
  const { subject, photos, voiceSample, corpusDocs, letters } = useLoaderData<typeof loader>();
  const canWrite = !!subject.voice_id && photos.some((p) => p.is_primary);

  return (
    <div>
      <Link to="/app" className="text-sm text-dusk-500 hover:text-dusk-900">
        ← Back to subjects
      </Link>

      <header className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-dusk-500">
            {KIND_LABEL[subject.kind as keyof typeof KIND_LABEL]}
          </p>
          <h1 className="mt-1 font-serif text-3xl text-dusk-900 sm:text-4xl">{subject.display_name}</h1>
          {subject.relationship ? (
            <p className="mt-1 text-sm text-dusk-500">{subject.relationship}</p>
          ) : null}
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <button
            type="submit"
            className="text-sm text-dusk-500 hover:text-red-700"
            onClick={(e) => {
              if (!window.confirm("Delete this subject? This is reversible (soft delete).")) {
                e.preventDefault();
              }
            }}
          >
            Delete
          </button>
        </Form>
      </header>

      {canWrite ? (
        <div className="mt-8 rounded-lg border border-sage-500/30 bg-sage-400/10 p-5">
          <p className="font-serif text-lg text-dusk-900">Ready to write.</p>
          <p className="mt-1 text-sm text-dusk-700">
            {subject.display_name} can write back as a short video reply.
          </p>
          <Link
            to={`/app/subjects/${subject.id}/write`}
            className="mt-3 inline-flex items-center justify-center rounded-md bg-dusk-700 px-5 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900"
          >
            Write a letter
          </Link>
        </div>
      ) : null}

      {letters.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-serif text-xl text-dusk-900">Letters</h2>
          <ul className="mt-3 divide-y divide-dusk-700/10 rounded-md border border-dusk-700/15 bg-white">
            {letters.map((l) => (
              <li key={l.id}>
                <Link
                  to={`/app/letters/${l.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-sand-50"
                >
                  <span className="line-clamp-1 text-sm text-dusk-900">
                    {l.body.slice(0, 90)}
                    {l.body.length > 90 ? "…" : ""}
                  </span>
                  <span className="shrink-0 text-xs text-dusk-500">
                    {l.reply_status === "ready" ? "Reply ready" : l.reply_status === "failed" ? "Failed" : "In progress…"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-xl text-dusk-900">Photos</h2>
        <p className="mt-1 text-sm text-dusk-500">
          The first one you mark as primary becomes the avatar source.
        </p>
        <PhotoGallery subjectId={subject.id} photos={photos} />
        <PhotoUploader subjectId={subject.id} hasAny={photos.length > 0} />
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-xl text-dusk-900">Voice</h2>
        <p className="mt-1 text-sm text-dusk-500">
          Upload a 10-second-or-longer sample. We&apos;ll clone the voice for replies.
        </p>
        <VoicePanel subjectId={subject.id} voiceId={subject.voice_id} sample={voiceSample} />
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-xl text-dusk-900">Journals & stories</h2>
        <p className="mt-1 text-sm text-dusk-500">
          Upload or paste documents the reply can draw on — letters, journals, family stories.
        </p>
        <CorpusPanel subjectId={subject.id} docs={corpusDocs} />
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-xl text-dusk-900">About</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
          <Field label="Language" value={languageLabel(subject.language)} />
          <Field label="Tone" value={subject.tone ?? "—"} />
          <Field label="Age" value={subject.age_at_subject != null ? String(subject.age_at_subject) : "—"} />
          <Field
            label="Key memories"
            value={subject.key_memories.length === 0 ? "—" : subject.key_memories.join(" · ")}
          />
          <Field label="Things to avoid" value={subject.things_to_avoid ?? "—"} />
        </dl>
      </section>

    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-dusk-700/10 py-2">
      <dt className="text-dusk-500">{label}</dt>
      <dd className="text-right text-dusk-900">{value}</dd>
    </div>
  );
}

function PhotoGallery({ subjectId: _subjectId, photos }: { subjectId: string; photos: PhotoView[] }) {
  if (photos.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-dusk-700/20 p-8 text-center text-sm text-dusk-500">
        No photos yet.
      </div>
    );
  }
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="relative">
          {p.signed_url ? (
            <img src={p.signed_url} alt="" className="aspect-square w-full rounded-md object-cover" />
          ) : (
            <div className="aspect-square w-full rounded-md bg-sand-200" />
          )}
          {p.is_primary ? (
            <span className="absolute left-2 top-2 rounded bg-dusk-900/80 px-2 py-0.5 text-xs text-sand-50">
              Primary
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PhotoUploader({ subjectId, hasAny }: { subjectId: string; hasAny: boolean }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [isPrimary, setIsPrimary] = useState(!hasAny);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const revalidator = useRevalidator();
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a photo first.");
      return;
    }
    if (!isAllowedPhotoMime(file.type)) {
      setError("Photo must be JPEG, PNG, HEIC, or WebP.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Photo is over 10 MB.");
      return;
    }

    setStatus("uploading");
    try {
      const urlRes = await fetch(`/api/subjects/${subjectId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "upload-url", content_type: file.type }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start upload.");
      }
      const { upload_url, storage_path, photo_id } = (await urlRes.json()) as {
        upload_url: string;
        storage_path: string;
        photo_id: string;
      };

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status}).`);
      }

      const confirmRes = await fetch(`/api/subjects/${subjectId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "confirm",
          photo_id,
          storage_path,
          content_type: file.type,
          byte_size: file.size,
          is_primary: isPrimary,
        }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save photo.");
      }
      if (fileRef.current) fileRef.current.value = "";
      setStatus("idle");
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-md border border-dusk-700/15 bg-white p-4">
      <label className="block text-sm">
        <span className="text-dusk-700">Add a photo</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/webp"
          className="mt-1 block w-full text-sm text-dusk-900"
        />
        <span className="mt-1 block text-xs text-dusk-500">JPEG, PNG, HEIC, or WebP. Up to 10 MB.</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-dusk-700">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="text-sage-500 focus:ring-sage-500"
        />
        Use as primary photo
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={status === "uploading"}
          className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-4 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 disabled:cursor-wait disabled:opacity-70"
        >
          {status === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

function VoicePanel({
  subjectId,
  voiceId,
  sample,
}: {
  subjectId: string;
  voiceId: string | null;
  sample: SubjectVoiceSample | null;
}) {
  const revalidator = useRevalidator();
  const isPending = sample?.clone_status === "pending" || sample?.clone_status === "cloning";

  // Poll while clone is in flight.
  useEffect(() => {
    if (!isPending) return;
    const i = setInterval(() => revalidator.revalidate(), 3000);
    return () => clearInterval(i);
  }, [isPending, revalidator]);

  if (voiceId) {
    return (
      <div className="mt-4 rounded-md border border-dusk-700/15 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-serif text-base text-dusk-900">Voice ready</p>
            <p className="mt-1 text-xs text-dusk-500">
              Engine: {sample?.engine ?? "—"} · ID: <code className="text-dusk-700">{voiceId}</code>
            </p>
          </div>
          <RevokeButton subjectId={subjectId} />
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="mt-4 rounded-md border border-dusk-700/15 bg-white p-5">
        <p className="font-serif text-base text-dusk-900">Cloning voice…</p>
        <p className="mt-1 text-xs text-dusk-500">
          This usually takes under a minute. The page will update when it&apos;s ready.
        </p>
      </div>
    );
  }

  if (sample?.clone_status === "failed") {
    return (
      <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-5">
        <p className="font-serif text-base text-red-900">Voice clone failed</p>
        <p className="mt-1 text-xs text-red-800">{sample.clone_error ?? "Unknown error."}</p>
        <div className="mt-3">
          <VoiceUploader subjectId={subjectId} />
        </div>
      </div>
    );
  }

  return <VoiceUploader subjectId={subjectId} />;
}

function VoiceUploader({ subjectId }: { subjectId: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [attestation, setAttestation] = useState<AttestationKind | null>(null);
  const [ack, setAck] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const revalidator = useRevalidator();

  function chooseFile() {
    fileRef.current?.click();
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!isAllowedVoiceMime(file.type)) {
      setError("Audio must be MP3, M4A, WAV, WebM, or Ogg.");
      return;
    }
    if (file.size > VOICE_SAMPLE_MAX_BYTES) {
      setError("Audio is over 50 MB.");
      return;
    }
    setShowConsent(true);
  }

  async function getAudioDurationMs(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const el = new Audio();
        el.preload = "metadata";
        el.src = url;
        el.onloadedmetadata = () => {
          const d = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
          URL.revokeObjectURL(url);
          resolve(d);
        };
        el.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }

  async function handleSubmit() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    if (!attestation) {
      setError("Choose one of the consent options.");
      return;
    }
    if (!ack) {
      setError("Please acknowledge the no-distribution clause.");
      return;
    }

    const durationMs = await getAudioDurationMs(file);
    if (durationMs != null && durationMs < VOICE_SAMPLE_MIN_DURATION_MS) {
      setError(`Audio is ${(durationMs / 1000).toFixed(1)}s; need at least ${VOICE_SAMPLE_MIN_DURATION_MS / 1000}s.`);
      return;
    }

    setStatus("uploading");
    try {
      const urlRes = await fetch(`/api/subjects/${subjectId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "upload-url", content_type: file.type }),
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start upload.");
      }
      const { upload_url, storage_path, sample_id } = (await urlRes.json()) as {
        upload_url: string;
        storage_path: string;
        sample_id: string;
      };

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status}).`);
      }

      const confirmRes = await fetch(`/api/subjects/${subjectId}/voice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "confirm",
          sample_id,
          storage_path,
          content_type: file.type,
          byte_size: file.size,
          duration_ms: durationMs,
          attestation_kind: attestation,
          acknowledged_no_distribution: true,
        }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save voice sample.");
      }
      if (fileRef.current) fileRef.current.value = "";
      setShowConsent(false);
      setAttestation(null);
      setAck(false);
      setStatus("idle");
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-dusk-700/15 bg-white p-4">
      <p className="text-sm text-dusk-700">
        Upload a clear, single-speaker recording of at least 10 seconds.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg"
        className="hidden"
        onChange={handleFileChosen}
      />
      <button
        type="button"
        onClick={chooseFile}
        className="mt-3 inline-flex items-center justify-center rounded-md bg-dusk-700 px-4 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900"
      >
        Choose audio file
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {showConsent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dusk-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-sand-50 p-6 shadow-xl">
            <h3 className="font-serif text-xl text-dusk-900">Voice cloning consent</h3>
            <p className="mt-2 text-sm text-dusk-700">
              Voice cloning is a regulated capability. Confirm one of the following.
            </p>

            <fieldset className="mt-4 space-y-2">
              {ATTESTATION_KINDS.map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-dusk-700/20 bg-white p-3 text-sm text-dusk-700 has-[:checked]:border-sage-500 has-[:checked]:bg-sage-400/10"
                >
                  <input
                    type="radio"
                    name="attestation"
                    value={k}
                    checked={attestation === k}
                    onChange={() => setAttestation(k)}
                    className="mt-1 text-sage-500 focus:ring-sage-500"
                  />
                  <span>{ATTESTATION_LABELS[k]}</span>
                </label>
              ))}
            </fieldset>

            <details className="mt-4 text-xs text-dusk-500">
              <summary className="cursor-pointer text-dusk-700">Read the full attestation text</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-dusk-700">
                {ATTESTATION_TEXT}
              </pre>
            </details>

            <label className="mt-4 flex items-start gap-2 text-sm text-dusk-700">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-1 text-sage-500 focus:ring-sage-500"
              />
              <span>
                I understand voice cloning is regulated. I will not share or distribute generated audio.
                I can revoke this voice at any time.
              </span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowConsent(false);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-sm text-dusk-500 hover:text-dusk-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={status === "uploading" || !attestation || !ack}
                className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-5 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "uploading" ? "Uploading…" : "Agree and upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RevokeButton({ subjectId }: { subjectId: string }) {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!window.confirm("Revoke this voice? Future replies will not use it. This is irreversible — a new sample is required to use it again.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/voice`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(`Revoke failed: ${body.error ?? res.status}`);
      }
    } finally {
      setBusy(false);
      revalidator.revalidate();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-xs text-dusk-500 hover:text-red-700 disabled:opacity-50"
    >
      {busy ? "Revoking…" : "Revoke"}
    </button>
  );
}

const STATUS_LABEL: Record<CorpusIngestStatus, string> = {
  pending: "Queued…",
  embedding: "Embedding…",
  ready: "Ready",
  failed: "Failed",
};

function CorpusPanel({ subjectId, docs }: { subjectId: string; docs: SubjectCorpusDoc[] }) {
  const revalidator = useRevalidator();
  const anyInflight = docs.some((d) => d.ingest_status === "pending" || d.ingest_status === "embedding");

  useEffect(() => {
    if (!anyInflight) return;
    const i = setInterval(() => revalidator.revalidate(), 3000);
    return () => clearInterval(i);
  }, [anyInflight, revalidator]);

  return (
    <div className="mt-4 space-y-4">
      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-dusk-700/20 p-6 text-center text-sm text-dusk-500">
          No documents yet.
        </div>
      ) : (
        <ul className="divide-y divide-dusk-700/10 rounded-md border border-dusk-700/15 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium text-dusk-900">{d.title}</p>
                <p className="text-xs text-dusk-500">
                  {d.source_kind} · {STATUS_LABEL[d.ingest_status]}
                  {d.ingest_status === "ready" ? ` · ${d.chunk_count} chunks` : ""}
                  {d.ingest_status === "failed" && d.ingest_error ? ` · ${d.ingest_error}` : ""}
                </p>
              </div>
              <DeleteDocButton subjectId={subjectId} docId={d.id} />
            </li>
          ))}
        </ul>
      )}
      <CorpusUploader subjectId={subjectId} />
    </div>
  );
}

function DeleteDocButton({ subjectId, docId }: { subjectId: string; docId: string }) {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!window.confirm("Delete this document? Its chunks will be removed from retrieval.")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/subjects/${subjectId}/corpus?doc_id=${encodeURIComponent(docId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(`Delete failed: ${body.error ?? res.status}`);
      }
    } finally {
      setBusy(false);
      revalidator.revalidate();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-xs text-dusk-500 hover:text-red-700 disabled:opacity-50"
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}

function CorpusUploader({ subjectId }: { subjectId: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"file" | "paste">("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revalidator = useRevalidator();

  async function uploadFile() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file.");
      return;
    }
    if (!isAllowedCorpusMime(file.type)) {
      setError("File must be .txt, .md, or .pdf.");
      return;
    }
    if (!title.trim()) {
      setError("Give the document a title.");
      return;
    }

    setBusy(true);
    try {
      const urlRes = await fetch(`/api/subjects/${subjectId}/corpus`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "upload-url", content_type: file.type, title: title.trim() }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => ({}))).error ?? "Upload URL failed");
      const { upload_url, storage_path, doc_id } = (await urlRes.json()) as {
        upload_url: string;
        storage_path: string;
        doc_id: string;
      };

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

      const confirmRes = await fetch(`/api/subjects/${subjectId}/corpus`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "confirm-file",
          doc_id,
          storage_path,
          content_type: file.type,
          byte_size: file.size,
          title: title.trim(),
        }),
      });
      if (!confirmRes.ok) throw new Error((await confirmRes.json().catch(() => ({}))).error ?? "Confirm failed");

      if (fileRef.current) fileRef.current.value = "";
      setTitle("");
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPaste() {
    setError(null);
    if (!title.trim()) {
      setError("Give the document a title.");
      return;
    }
    if (!text.trim()) {
      setError("Paste some text.");
      return;
    }
    if (text.length > CORPUS_INLINE_MAX_CHARS) {
      setError(`Paste must be ${CORPUS_INLINE_MAX_CHARS.toLocaleString()} chars or fewer.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/corpus`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "paste", title: title.trim(), text }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      setTitle("");
      setText("");
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-dusk-700/15 bg-white p-4">
      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={mode === "paste" ? "font-medium text-dusk-900" : "text-dusk-500 hover:text-dusk-900"}
        >
          Paste text
        </button>
        <span className="text-dusk-400">·</span>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={mode === "file" ? "font-medium text-dusk-900" : "text-dusk-500 hover:text-dusk-900"}
        >
          Upload file
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-dusk-700">Title</span>
        <input
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Letters from 1998"
          className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-sm text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
        />
      </label>

      {mode === "paste" ? (
        <label className="mt-3 block text-sm">
          <span className="text-dusk-700">Text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="mt-1 block w-full rounded-md border border-dusk-700/30 bg-white px-3 py-2 text-sm text-dusk-900 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
          />
          <span className="mt-1 block text-xs text-dusk-500">
            Up to {CORPUS_INLINE_MAX_CHARS.toLocaleString()} characters.
          </span>
        </label>
      ) : (
        <label className="mt-3 block text-sm">
          <span className="text-dusk-700">File (.txt, .md, .pdf)</span>
          <input
            ref={fileRef}
            type="file"
            accept="text/plain,text/markdown,application/pdf,.txt,.md,.pdf"
            className="mt-1 block w-full text-sm text-dusk-900"
          />
          <span className="mt-1 block text-xs text-dusk-500">
            Up to 25 MB. PDF text extraction is queued for a follow-up — paste the text for now.
          </span>
        </label>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={mode === "paste" ? uploadPaste : uploadFile}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md bg-dusk-700 px-4 py-2 text-sm font-medium text-sand-50 transition hover:bg-dusk-900 disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? "Saving…" : "Add document"}
        </button>
      </div>
    </div>
  );
}
