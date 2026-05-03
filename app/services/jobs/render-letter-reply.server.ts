import { LETTER_AUDIO_BUCKET, LETTER_VIDEO_BUCKET, type LetterReplyStatus } from "~/lib/letters";
import { getServiceRoleSupabaseClient } from "~/lib/supabase.server";
import { chunkText } from "~/lib/corpus";
import { getAvatarEngine } from "~/services/avatar/index.server";
import { getEmbeddingEngine } from "~/services/embedding/index.server";
import { getLLM } from "~/services/llm/index.server";
import type { SubjectContext } from "~/services/llm/types.server";
import { getVoiceEngine } from "~/services/voice/index.server";

export interface RenderLetterReplyPayload {
  letter_id: string;
}

export interface RenderLetterReplyResult {
  status: "ok" | "skipped" | "error";
  letter_id?: string;
  reason?: string;
}

const RENDER_POLL_INTERVAL_MS = 4_000;
const RENDER_POLL_MAX_ATTEMPTS = 30; // ~2 minutes total

// End-to-end render. Mid-job idempotent: persists each stage's output before
// moving on, and re-fetches state on entry so a crashed/retried run picks up
// where it left off without re-billing the LLM/voice/avatar vendors.
export async function renderLetterReplyJob(
  payload: RenderLetterReplyPayload,
): Promise<RenderLetterReplyResult> {
  const supabase = getServiceRoleSupabaseClient();
  const llm = getLLM();
  const voice = getVoiceEngine();
  const avatar = getAvatarEngine();

  const { data: letter, error: lerr } = await supabase
    .from("letters")
    .select("*")
    .eq("id", payload.letter_id)
    .maybeSingle();
  if (lerr) return { status: "error", reason: lerr.message };
  if (!letter) return { status: "error", reason: "letter not found" };
  if (letter.reply_status === "ready") {
    return { status: "skipped", letter_id: letter.id, reason: "already ready" };
  }

  const { data: subject, error: serr } = await supabase
    .from("subjects")
    .select("*")
    .eq("id", letter.subject_id)
    .maybeSingle();
  if (serr) return { status: "error", reason: serr.message };
  if (!subject) return { status: "error", reason: "subject not found" };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("locale")
    .eq("user_id", letter.user_id)
    .maybeSingle();
  const locale = profile?.locale ?? "en-US";

  const updateLetter = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("letters").update(patch).eq("id", letter.id);
    if (error) throw error;
  };

  try {
    // ── Stage 1: classify crisis (idempotent — recompute is cheap & deterministic)
    await updateLetter({ reply_status: "classifying" satisfies LetterReplyStatus });
    const crisis = letter.crisis_flag !== "none" || letter.reply_script
      ? {
          flag: letter.crisis_flag,
          rationale: letter.crisis_rationale ?? undefined,
          classifierVersions: { prePass: "skipped" },
        }
      : await llm.classifyCrisis({ text: letter.body });

    await updateLetter({
      crisis_flag: crisis.flag,
      crisis_rationale: crisis.rationale ?? null,
    });

    // ── Stage 2: retrieve top-K RAG chunks (best-effort)
    await updateLetter({ reply_status: "retrieving" satisfies LetterReplyStatus });
    const ragChunks = await retrieveRagChunks({
      supabase,
      subjectId: letter.subject_id,
      query: letter.body,
      k: 6,
    });

    // ── Stage 3: generate script (skip if already persisted)
    let script = letter.reply_script as string | null;
    if (!script) {
      await updateLetter({ reply_status: "scripting" satisfies LetterReplyStatus });
      const subjectCtx = toSubjectContext(subject);
      const reply = await llm.generateReply({
        letter: letter.body,
        subject: subjectCtx,
        ragChunks,
        locale,
        crisis,
      });
      script = reply.script;
      await updateLetter({
        reply_script: script,
        llm_engine: process.env.REPLY_LLM ?? "mock",
      });
    }

    // ── Stage 4: synthesize audio (skip if already persisted)
    let audioPath = letter.reply_audio_path as string | null;
    if (!audioPath) {
      await updateLetter({ reply_status: "synthesizing" satisfies LetterReplyStatus });
      if (!subject.voice_id) {
        throw new Error("subject has no voice_id; clone a voice first");
      }
      const synth = await voice.synthesize({
        voiceId: subject.voice_id,
        text: script,
        idempotencyKey: `reply-voice-${letter.id}`,
      });
      const audioBuf = await fetchAudio(synth.audioUrl);
      audioPath = `${letter.user_id}/${letter.id}.mp3`;
      const { error: uploadErr } = await supabase.storage
        .from(LETTER_AUDIO_BUCKET)
        .upload(audioPath, audioBuf, {
          contentType: "audio/mpeg",
          upsert: true,
        });
      if (uploadErr) throw new Error(`audio upload: ${uploadErr.message}`);
      await updateLetter({
        reply_audio_path: audioPath,
        voice_engine: process.env.VOICE_ENGINE ?? "mock",
      });
    }

    // ── Stage 5: render avatar (start + poll)
    await updateLetter({ reply_status: "rendering" satisfies LetterReplyStatus });
    if (!subject.avatar_id) {
      // Lazy enrollment — fire it inline if Phase 1's eager hook hasn't run.
      // Use the latest primary photo for enrollment.
      const { data: primary } = await supabase
        .from("subject_photos")
        .select("storage_path")
        .eq("subject_id", subject.id)
        .eq("is_primary", true)
        .maybeSingle();
      if (!primary) throw new Error("subject has no primary photo");
      const { data: signed } = await supabase.storage
        .from("subject-photos")
        .createSignedUrl(primary.storage_path, 60 * 60);
      if (!signed) throw new Error("could not sign primary photo url");
      const enroll = await avatar.enrollFromPhoto({ photoUrl: signed.signedUrl });
      await supabase.from("subjects").update({ avatar_id: enroll.avatarId }).eq("id", subject.id);
      subject.avatar_id = enroll.avatarId;
    }

    const { data: signedAudio } = await supabase.storage
      .from(LETTER_AUDIO_BUCKET)
      .createSignedUrl(audioPath, 60 * 60);
    if (!signedAudio) throw new Error("could not sign reply audio url");

    let providerJobId = letter.avatar_provider_job_id as string | null;
    if (!providerJobId) {
      const job = await avatar.startRender({
        avatarId: subject.avatar_id,
        audioUrl: signedAudio.signedUrl,
        idempotencyKey: `reply-video-${letter.id}`,
      });
      providerJobId = job.providerJobId;
      await updateLetter({
        avatar_provider_job_id: providerJobId,
        avatar_engine: process.env.AVATAR_ENGINE ?? "mock",
      });
    }

    // Poll for ready. Real vendors typically resolve in 30–90s; mock resolves
    // immediately. After RENDER_POLL_MAX_ATTEMPTS we leave the row in
    // 'rendering' so a follow-up retry can keep polling.
    let videoUrl: string | null = null;
    let videoDurationMs = 0;
    for (let attempt = 0; attempt < RENDER_POLL_MAX_ATTEMPTS; attempt++) {
      const status = await avatar.pollRender({ providerJobId });
      if (status.status === "ready") {
        videoUrl = status.videoUrl;
        videoDurationMs = status.durationMs;
        break;
      }
      if (status.status === "failed") {
        throw new Error(`avatar render failed: ${status.reason}`);
      }
      await sleep(RENDER_POLL_INTERVAL_MS);
    }
    if (!videoUrl) {
      throw new Error("avatar render still pending after polling window");
    }

    const videoBuf = await fetchVideo(videoUrl);
    const videoPath = `${letter.user_id}/${letter.id}.mp4`;
    const { error: vErr } = await supabase.storage
      .from(LETTER_VIDEO_BUCKET)
      .upload(videoPath, videoBuf, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (vErr) throw new Error(`video upload: ${vErr.message}`);

    await updateLetter({
      reply_status: "ready" satisfies LetterReplyStatus,
      reply_video_path: videoPath,
      reply_video_duration_ms: videoDurationMs,
      ready_at: new Date().toISOString(),
    });

    return { status: "ok", letter_id: letter.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await supabase
      .from("letters")
      .update({ reply_status: "failed" satisfies LetterReplyStatus, reply_error: reason })
      .eq("id", letter.id);
    return { status: "error", reason };
  }
}

function toSubjectContext(subject: {
  id: string;
  display_name: string;
  kind: "inner_child" | "ancestor" | "other";
  age_at_subject: number | null;
  relationship: string | null;
  tone: SubjectContext["about"]["tone"] | null;
  key_memories: string[];
  things_to_avoid: string | null;
}): SubjectContext {
  return {
    subjectId: subject.id,
    displayName: subject.display_name,
    kind: subject.kind,
    ageInPhoto: subject.age_at_subject,
    relationship: subject.relationship,
    about: {
      keyMemories: subject.key_memories ?? [],
      tone: subject.tone ?? "gentle",
      thingsToAvoid: subject.things_to_avoid ?? "",
    },
  };
}

async function retrieveRagChunks({
  supabase,
  subjectId,
  query,
  k,
}: {
  supabase: ReturnType<typeof getServiceRoleSupabaseClient>;
  subjectId: string;
  query: string;
  k: number;
}): Promise<string[]> {
  // Worker uses service-role and bypasses the user-scoped RPC. Parallel
  // ownership is enforced upstream when the API created the letter, so it's
  // safe — but we still apply the explicit subject_id filter here.
  try {
    const embedder = getEmbeddingEngine();
    const [embedding] = await embedder.embed([chunkText(query, { size: 4000, overlap: 0 })[0]?.text ?? query]);
    const { data, error } = await supabase.rpc("retrieve_subject_chunks", {
      p_subject_id: subjectId,
      p_query: embedding,
      p_k: k,
    });
    if (error) {
      // The RPC is SECURITY DEFINER and uses auth.uid(); service-role calls
      // hit the "subject not owned by caller" branch. Fall back to a direct
      // query restricted to this subject_id.
      const { data: direct, error: dErr } = await supabase
        .from("subject_chunks")
        .select("text")
        .eq("subject_id", subjectId)
        .limit(k);
      if (dErr) return [];
      return (direct ?? []).map((r) => r.text as string);
    }
    return (data ?? []).map((r: { text: string }) => r.text);
  } catch (e) {
    console.warn("[render] RAG retrieval failed (non-fatal):", e);
    return [];
  }
}

async function fetchAudio(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  if (url.startsWith("https://mock.invalid")) {
    // Mock vendor — return a tiny silent MP3 placeholder so the upload pipeline
    // exercises the same code path as a real provider.
    return Buffer.from(SILENT_MP3_BASE64, "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch audio failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchVideo(url: string): Promise<Buffer> {
  if (url.startsWith("https://mock.invalid")) {
    // Mock vendor — return a tiny placeholder so Storage doesn't reject the upload.
    return Buffer.from(MINIMAL_MP4_BASE64, "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch video failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function decodeDataUrl(url: string): Buffer {
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("invalid data URL");
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  return meta.includes(";base64") ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Smallest valid MP3 frame (silent). 209 bytes after base64-decode. Good enough
// to exercise the upload path with mock vendors; real synth produces real audio.
const SILENT_MP3_BASE64 =
  "//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAAcAAAACAAACVwBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//////////////////////////////8AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABSAJAQEjQABzAAAAlfHvJEMAAAAAAAAAAAAAAAAAAAA";

// Smallest possible mp4 (just the ftyp box). Real renders return real video.
const MINIMAL_MP4_BASE64 = "AAAAGGZ0eXBpc29tAAAAAGlzb21tcDQyAAAAAA==";
