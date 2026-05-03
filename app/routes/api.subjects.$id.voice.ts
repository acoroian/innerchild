import { json, type ActionFunctionArgs } from "@remix-run/node";

import { requireUser } from "~/lib/auth.server";
import { dispatchJob, ensureInProcessHandlersWired } from "~/lib/dispatch.server";
import { getSubject } from "~/lib/subjects.server";
import {
  ATTESTATION_KINDS,
  buildVoiceSampleStoragePath,
  insertConsentRecord,
  isAllowedVoiceMime,
  VOICE_BUCKET,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MIN_DURATION_MS,
  type AllowedVoiceMime,
  type AttestationKind,
} from "~/lib/voice.server";

// Voice + consent flow. Three intents on POST, one DELETE for revocation.
//
//   POST { intent: "upload-url", content_type } → { upload_url, storage_path, sample_id }
//   POST { intent: "confirm", sample_id, storage_path, content_type, byte_size?,
//          duration_ms?, attestation_kind, acknowledged_no_distribution }
//        → { sample, consent }   (also enqueues clone-voice job)
//   DELETE → revokes voice (new consent row with revoked=true, nulls voice_id)
export async function action({ request, params }: ActionFunctionArgs) {
  const { user, supabase, responseHeaders } = await requireUser(request);
  const subjectId = params.id;
  if (!subjectId) {
    return json({ error: "Missing subject id" }, { status: 400, headers: responseHeaders });
  }

  const subject = await getSubject(supabase, subjectId);
  if (!subject) {
    return json({ error: "Subject not found" }, { status: 404, headers: responseHeaders });
  }

  if (request.method === "DELETE") {
    return revokeVoice({ user, supabase, responseHeaders, subjectId, request });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: responseHeaders });
  }

  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json({ error: "Body must be JSON" }, { status: 400, headers: responseHeaders });
  }

  if (body.intent === "upload-url") {
    const contentType = body.content_type;
    if (typeof contentType !== "string" || !isAllowedVoiceMime(contentType)) {
      return json(
        { error: "content_type must be one of audio/mpeg, audio/mp4, audio/wav, audio/webm, audio/ogg" },
        { status: 400, headers: responseHeaders },
      );
    }
    const sampleId = crypto.randomUUID();
    const storagePath = buildVoiceSampleStoragePath({
      userId: user.id,
      subjectId,
      sampleId,
      contentType: contentType as AllowedVoiceMime,
    });
    const { data, error } = await supabase.storage
      .from(VOICE_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      return json(
        { error: error?.message ?? "Could not issue upload URL" },
        { status: 500, headers: responseHeaders },
      );
    }
    return json(
      {
        upload_url: data.signedUrl,
        token: data.token,
        storage_path: storagePath,
        sample_id: sampleId,
      },
      { status: 201, headers: responseHeaders },
    );
  }

  if (body.intent === "confirm") {
    const sampleId = body.sample_id;
    const storagePath = body.storage_path;
    const contentType = body.content_type;
    const byteSize = body.byte_size;
    const durationMs = body.duration_ms;
    const attestationKind = body.attestation_kind;
    const ack = body.acknowledged_no_distribution;

    if (typeof sampleId !== "string" || typeof storagePath !== "string" || typeof contentType !== "string") {
      return json(
        { error: "sample_id, storage_path, content_type are required" },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!isAllowedVoiceMime(contentType)) {
      return json({ error: "content_type not allowed" }, { status: 400, headers: responseHeaders });
    }
    const expected = buildVoiceSampleStoragePath({
      userId: user.id,
      subjectId,
      sampleId,
      contentType: contentType as AllowedVoiceMime,
    });
    if (storagePath !== expected) {
      return json({ error: "storage_path does not match expected layout" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (byteSize !== undefined && (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 0)) {
      return json({ error: "byte_size must be a non-negative integer" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (typeof byteSize === "number" && byteSize > VOICE_SAMPLE_MAX_BYTES) {
      return json({ error: "Voice sample exceeds 50 MB limit" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (durationMs !== undefined && (typeof durationMs !== "number" || !Number.isInteger(durationMs) || durationMs < 0)) {
      return json({ error: "duration_ms must be a non-negative integer" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    if (typeof durationMs === "number" && durationMs < VOICE_SAMPLE_MIN_DURATION_MS) {
      return json(
        { error: `Voice sample must be at least ${VOICE_SAMPLE_MIN_DURATION_MS / 1000}s long` },
        { status: 400, headers: responseHeaders },
      );
    }
    if (typeof attestationKind !== "string" || !ATTESTATION_KINDS.includes(attestationKind as AttestationKind)) {
      return json(
        { error: `attestation_kind must be one of: ${ATTESTATION_KINDS.join(", ")}` },
        { status: 400, headers: responseHeaders },
      );
    }
    if (ack !== true) {
      return json(
        { error: "acknowledged_no_distribution must be true" },
        { status: 400, headers: responseHeaders },
      );
    }

    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const consent = await insertConsentRecord(supabase, {
      userId: user.id,
      subjectId,
      attestationKind: attestationKind as AttestationKind,
      acknowledgedNoDistribution: true,
      ip,
      userAgent,
    });

    const { data: sample, error: sampleErr } = await supabase
      .from("subject_voice_samples")
      .insert({
        id: sampleId,
        subject_id: subjectId,
        consent_record_id: consent.id,
        storage_path: storagePath,
        content_type: contentType,
        byte_size: byteSize ?? null,
        duration_ms: durationMs ?? null,
        clone_status: "pending",
      })
      .select("*")
      .single();
    if (sampleErr) {
      return json({ error: sampleErr.message }, { status: 500, headers: responseHeaders });
    }

    await ensureInProcessHandlersWired();
    await dispatchJob({
      kind: "clone-voice",
      payload: { voice_sample_id: sampleId },
      taskName: `clone-voice-${sampleId}`,
    });

    return json({ sample, consent }, { status: 202, headers: responseHeaders });
  }

  return json({ error: "intent must be 'upload-url' or 'confirm'" }, {
    status: 400,
    headers: responseHeaders,
  });
}

async function revokeVoice({
  user,
  supabase,
  responseHeaders,
  subjectId,
  request,
}: {
  user: { id: string };
  supabase: ReturnType<typeof import("~/lib/supabase.server").createServerSupabaseClient>;
  responseHeaders: Headers;
  subjectId: string;
  request: Request;
}) {
  const consent = await insertConsentRecord(supabase, {
    userId: user.id,
    subjectId,
    attestationKind: "self",
    acknowledgedNoDistribution: true,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
    revoked: true,
  });

  const { error } = await supabase
    .from("subjects")
    .update({ voice_id: null })
    .eq("id", subjectId);
  if (error) {
    return json({ error: error.message }, { status: 500, headers: responseHeaders });
  }
  return json({ ok: true, consent }, { headers: responseHeaders });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}
