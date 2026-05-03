import { config } from "~/lib/config.server";
import { getServiceRoleSupabaseClient } from "~/lib/supabase.server";
import { VOICE_BUCKET, type VoiceCloneStatus } from "~/lib/voice";
import { pickPresetVoice } from "~/services/voice/preset-voices.server";
import { getVoiceEngine } from "~/services/voice/index.server";

export interface CloneVoicePayload {
  voice_sample_id: string;
}

export interface CloneVoiceResult {
  status: "ok" | "skipped" | "error";
  voice_id?: string;
  reason?: string;
}

// Clone-voice job. Idempotent on subject_voice_samples.voice_id.
//
// Flow:
//   1. Load sample + consent.
//   2. If sample.clone_status === 'ready' && sample.voice_id, short-circuit.
//   3. Set status='cloning'.
//   4. Issue a 1h signed read URL for the audio (so the vendor can fetch it).
//   5. Call VoiceEngine.cloneFromSample with consent ref.
//   6. Persist voice_id + status='ready' on sample, mirror onto subjects.voice_id.
//   7. On failure: status='failed', clone_error=message.
//
// Uses service-role Supabase client because the worker runs without an
// authenticated user session.
export async function cloneVoiceJob(payload: CloneVoicePayload): Promise<CloneVoiceResult> {
  const supabase = getServiceRoleSupabaseClient();
  const voiceEngine = getVoiceEngine();

  const { data: sample, error: sampleErr } = await supabase
    .from("subject_voice_samples")
    .select("*")
    .eq("id", payload.voice_sample_id)
    .maybeSingle();
  if (sampleErr) return { status: "error", reason: sampleErr.message };
  if (!sample) return { status: "error", reason: "sample not found" };

  if (sample.clone_status === "ready" && sample.voice_id) {
    return { status: "skipped", voice_id: sample.voice_id, reason: "already cloned" };
  }

  const { data: consent, error: consentErr } = await supabase
    .from("consent_records")
    .select("*")
    .eq("id", sample.consent_record_id)
    .maybeSingle();
  if (consentErr) return { status: "error", reason: consentErr.message };
  if (!consent) return { status: "error", reason: "consent record missing" };
  if (consent.revoked) return { status: "error", reason: "consent revoked" };

  await supabase
    .from("subject_voice_samples")
    .update({ clone_status: "cloning" satisfies VoiceCloneStatus, clone_error: null })
    .eq("id", sample.id);

  const { data: signed, error: signedErr } = await supabase.storage
    .from(VOICE_BUCKET)
    .createSignedUrl(sample.storage_path, 60 * 60);
  if (signedErr || !signed) {
    const reason = signedErr?.message ?? "could not sign sample url";
    await supabase
      .from("subject_voice_samples")
      .update({ clone_status: "failed" satisfies VoiceCloneStatus, clone_error: reason })
      .eq("id", sample.id);
    return { status: "error", reason };
  }

  try {
    const result = await voiceEngine.cloneFromSample({
      audioUrl: signed.signedUrl,
      consent: {
        consentRecordId: consent.id,
        attestationKind: consent.attestation_kind,
        attestationTextVersion: consent.attestation_text_version,
      },
    });

    // Free-tier signal: when ELEVENLABS_PRESET_VOICE_ID is set, the adapter
    // returns it instead of doing a real clone. In that case, override with a
    // per-Subject smart preset based on kind + age + gender so different
    // Subjects get different voices instead of every one defaulting to the
    // single global preset.
    let voiceId = result.voiceId;
    if (config.ELEVENLABS_PRESET_VOICE_ID && voiceId === config.ELEVENLABS_PRESET_VOICE_ID) {
      const { data: subjForPick } = await supabase
        .from("subjects")
        .select("kind, age_at_subject, gender")
        .eq("id", sample.subject_id)
        .maybeSingle();
      if (subjForPick) {
        voiceId = pickPresetVoice({
          kind: subjForPick.kind,
          age: subjForPick.age_at_subject,
          gender: subjForPick.gender,
        }).voiceId;
      }
    }

    const { error: updErr } = await supabase
      .from("subject_voice_samples")
      .update({
        clone_status: "ready" satisfies VoiceCloneStatus,
        voice_id: voiceId,
        engine: process.env.VOICE_ENGINE ?? "mock",
        clone_error: null,
      })
      .eq("id", sample.id);
    if (updErr) throw updErr;

    const { error: subjErr } = await supabase
      .from("subjects")
      .update({ voice_id: voiceId })
      .eq("id", sample.subject_id);
    if (subjErr) throw subjErr;

    return { status: "ok", voice_id: voiceId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await supabase
      .from("subject_voice_samples")
      .update({ clone_status: "failed" satisfies VoiceCloneStatus, clone_error: reason })
      .eq("id", sample.id);
    return { status: "error", reason };
  }
}
