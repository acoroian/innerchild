import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ATTESTATION_TEXT,
  ATTESTATION_TEXT_VERSION,
  consentCanonicalJson,
  type AttestationKind,
  type ConsentRecord,
  type SubjectVoiceSample,
} from "./voice";

export * from "./voice";

export async function getLatestConsentForSubject(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<ConsentRecord | null> {
  const { data, error } = await supabase
    .from("consent_records")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ConsentRecord) ?? null;
}

export async function getLatestVoiceSample(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<SubjectVoiceSample | null> {
  const { data, error } = await supabase
    .from("subject_voice_samples")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SubjectVoiceSample) ?? null;
}

export interface InsertConsentInput {
  userId: string;
  subjectId: string;
  attestationKind: AttestationKind;
  acknowledgedNoDistribution: boolean;
  ip: string | null;
  userAgent: string | null;
  revoked?: boolean;
}

export async function insertConsentRecord(
  supabase: SupabaseClient,
  input: InsertConsentInput,
): Promise<ConsentRecord> {
  const prev = await getLatestConsentForSubject(supabase, input.subjectId);
  const created_at = new Date().toISOString();
  const revoked = input.revoked ?? false;

  const canonical = consentCanonicalJson({
    user_id: input.userId,
    subject_id: input.subjectId,
    attestation_kind: input.attestationKind,
    attestation_text_version: ATTESTATION_TEXT_VERSION,
    attestation_text_full: ATTESTATION_TEXT,
    acknowledged_no_distribution: input.acknowledgedNoDistribution,
    revoked,
    prev_hash: prev?.content_hash ?? null,
    created_at,
  });
  const content_hash = createHash("sha256").update(canonical).digest("hex");

  const { data, error } = await supabase
    .from("consent_records")
    .insert({
      user_id: input.userId,
      subject_id: input.subjectId,
      attestation_kind: input.attestationKind,
      attestation_text_version: ATTESTATION_TEXT_VERSION,
      attestation_text_full: ATTESTATION_TEXT,
      acknowledged_no_distribution: input.acknowledgedNoDistribution,
      ip: input.ip,
      user_agent: input.userAgent,
      content_hash,
      prev_hash: prev?.content_hash ?? null,
      revoked,
      created_at,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ConsentRecord;
}

// Re-verify the chain for a subject. Returns first index where break occurs,
// or null if intact. Used by the export/audit job.
export function verifyConsentChain(records: ConsentRecord[]): number | null {
  // Records must be sorted oldest-first.
  let prevHash: string | null = null;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const canonical = consentCanonicalJson({
      user_id: r.user_id,
      subject_id: r.subject_id,
      attestation_kind: r.attestation_kind,
      attestation_text_version: r.attestation_text_version,
      attestation_text_full: r.attestation_text_full,
      acknowledged_no_distribution: r.acknowledged_no_distribution,
      revoked: r.revoked,
      prev_hash: prevHash,
      created_at: r.created_at,
    });
    const expected = createHash("sha256").update(canonical).digest("hex");
    if (expected !== r.content_hash) return i;
    if (r.prev_hash !== prevHash) return i;
    prevHash = r.content_hash;
  }
  return null;
}
