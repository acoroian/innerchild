-- Add `language` to subjects so each Subject carries their own spoken language.
--
-- Use case: user is Romanian (user_profiles.locale='ro-RO') but their
-- grandfather only spoke Hungarian. The reply LLM should answer letters
-- to grandfather in Hungarian, regardless of the user's locale or the
-- letter's language. The hotline lookup still uses user_profiles.locale
-- because the user is the one who'd need a hotline, not the Subject.
--
-- BCP-47 language tags. We don't constrain via CHECK because the set we
-- want to support will grow; instead we keep the column open and validate
-- at the application boundary against SUBJECT_LANGUAGES in lib/subjects.ts.

alter table public.subjects
  add column if not exists language text not null default 'en-US';

comment on column public.subjects.language is
  'BCP-47 language tag the Subject speaks. Drives reply LLM language. Validated app-side.';
