import type { SupabaseClient } from "@supabase/supabase-js";

import { pickPresetVoice } from "~/services/voice/preset-voices.server";

import type { CreateSubjectInput, Subject, SubjectPhoto } from "./subjects";

export * from "./subjects";

export async function listSubjects(supabase: SupabaseClient): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Subject[];
}

export async function getSubject(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<Subject | null> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("id", subjectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Subject) ?? null;
}

export async function listSubjectPhotos(
  supabase: SupabaseClient,
  subjectId: string,
): Promise<SubjectPhoto[]> {
  const { data, error } = await supabase
    .from("subject_photos")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubjectPhoto[];
}

export async function createSubject(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSubjectInput,
): Promise<Subject> {
  // Pre-pick a preset voice from kind + age + gender so the Subject is
  // immediately writable (canWrite needs voice_id). When the user later
  // uploads a real voice sample, the clone-voice job replaces this on paid
  // tiers, or keeps a smart preset on free tier.
  const preset = pickPresetVoice({
    kind: input.kind,
    age: input.age_at_subject ?? null,
    gender: input.gender ?? null,
  });

  const { data, error } = await supabase
    .from("subjects")
    .insert({
      user_id: userId,
      kind: input.kind,
      display_name: input.display_name,
      age_at_subject: input.age_at_subject ?? null,
      relationship: input.relationship ?? null,
      gender: input.gender ?? null,
      tone: input.tone ?? null,
      key_memories: input.key_memories ?? [],
      things_to_avoid: input.things_to_avoid ?? null,
      ...(input.language ? { language: input.language } : {}),
      voice_id: preset.voiceId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Subject;
}

export async function updateSubject(
  supabase: SupabaseClient,
  subjectId: string,
  patch: Partial<CreateSubjectInput>,
): Promise<Subject> {
  const { data, error } = await supabase
    .from("subjects")
    .update({
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.display_name !== undefined ? { display_name: patch.display_name } : {}),
      ...(patch.age_at_subject !== undefined ? { age_at_subject: patch.age_at_subject } : {}),
      ...(patch.relationship !== undefined ? { relationship: patch.relationship } : {}),
      ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
      ...(patch.key_memories !== undefined ? { key_memories: patch.key_memories } : {}),
      ...(patch.things_to_avoid !== undefined ? { things_to_avoid: patch.things_to_avoid } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
    })
    .eq("id", subjectId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Subject;
}

export async function softDeleteSubject(supabase: SupabaseClient, subjectId: string): Promise<void> {
  const { error } = await supabase
    .from("subjects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", subjectId);
  if (error) throw error;
}
