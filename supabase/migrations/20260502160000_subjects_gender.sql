-- Add `gender` to subjects so the preset voice picker can choose by gender.
-- Used together with kind + age_at_subject to map to an ElevenLabs preset
-- voice on free-tier accounts (where real cloning isn't available). Optional
-- — null means we fall back to a neutral voice.

alter table public.subjects
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female', 'nonbinary', 'unspecified'));

comment on column public.subjects.gender is
  'male | female | nonbinary | unspecified | null. Used with age + kind to auto-pick a preset voice on free tiers.';
