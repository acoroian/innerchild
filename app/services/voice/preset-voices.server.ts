// Picks an ElevenLabs preset voice ID for a Subject when real voice cloning
// is unavailable (free tier) or not yet performed. Inputs are the Subject's
// kind + age + gender; output is one of the standard ElevenLabs library
// voices already on the user's free-tier account.
//
// Why this lives here, not in the adapter: adapters take audio + consent and
// return a voice_id; they don't know about Subject metadata. Picking the
// right preset is a Subject-level decision, applied by the calling job.

import type { SubjectGender, SubjectKind } from "~/lib/subjects";

export interface PresetVoice {
  voiceId: string;
  name: string;
  blurb: string;
}

// IDs verified against the user's account. If a voice is removed from the
// public library, only this file changes.
const BILL: PresetVoice = {
  voiceId: "pqHfZKP75CvOlQylNhV4",
  name: "Bill",
  blurb: "older male — wise, mature, balanced",
};
const BRIAN: PresetVoice = {
  voiceId: "nPczCjzI2devNBz1zQrb",
  name: "Brian",
  blurb: "middle-aged male — deep, resonant, comforting",
};
const GEORGE: PresetVoice = {
  voiceId: "JBFqnCBsd6RMkjVDRZzb",
  name: "George",
  blurb: "middle-aged male — warm captivating storyteller",
};
const WILL: PresetVoice = {
  voiceId: "bIHbv24MWmeRgasZH58o",
  name: "Will",
  blurb: "young male — relaxed optimist",
};

const LILY: PresetVoice = {
  voiceId: "pFZP5JQG7iQjIQuC4Bku",
  name: "Lily",
  blurb: "older-leaning female — velvety actress",
};
const BELLA: PresetVoice = {
  voiceId: "hpp4J3VqNfWAUOO0d1Us",
  name: "Bella",
  blurb: "middle-aged female — professional, bright, warm",
};
const ALICE: PresetVoice = {
  voiceId: "Xb7hH8MSUJpSbSDYk0k2",
  name: "Alice",
  blurb: "middle-aged female — clear, engaging, gentle",
};
const SARAH: PresetVoice = {
  voiceId: "EXAVITQu4vr4xnSDxMaL",
  name: "Sarah",
  blurb: "young female — mature, reassuring, confident",
};
const JESSICA: PresetVoice = {
  voiceId: "cgSgspJ2msm6clMCkdW9",
  name: "Jessica",
  blurb: "young female — playful, bright, warm",
};

const RIVER: PresetVoice = {
  voiceId: "SAz9YHcvj6GT2YYXdXww",
  name: "River",
  blurb: "neutral — relaxed, calm, informative",
};

export interface PresetPickContext {
  kind: SubjectKind;
  age: number | null;
  gender: SubjectGender | null;
}

export function pickPresetVoice(ctx: PresetPickContext): PresetVoice {
  const age = ctx.age ?? defaultAgeForKind(ctx.kind);
  const gender = ctx.gender ?? "unspecified";

  if (gender === "male") {
    if (age >= 60) return BILL;
    if (age >= 35) return GEORGE;
    if (age >= 20) return BRIAN;
    return WILL; // teen / child stand-in (no child voices in standard library)
  }

  if (gender === "female") {
    if (age >= 60) return LILY;
    if (age >= 35) return BELLA;
    if (age >= 20) return ALICE;
    return JESSICA; // teen / child stand-in
  }

  // nonbinary / unspecified — neutral voice regardless of age
  return RIVER;
}

function defaultAgeForKind(kind: SubjectKind): number {
  switch (kind) {
    case "inner_child":
      return 7;
    case "ancestor":
      return 70;
    case "other":
      return 35;
  }
}

export const ALL_PRESET_VOICES: PresetVoice[] = [
  BILL, GEORGE, BRIAN, WILL,
  LILY, BELLA, ALICE, SARAH, JESSICA,
  RIVER,
];
