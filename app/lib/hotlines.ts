// Locale → mental-health hotline lookup. Used by the reply prompt to lead
// with care when crisis_flag !== 'none'. Adding a locale is a code change,
// not a config change — these need legal review per region.
//
// Plan-CRITICAL #4: keep en-US default to 988 and require a Spanish/UK
// followup before claiming i18n.

export interface HotlineSpec {
  // Short name shown to the user.
  name: string;
  // Display string (e.g. "988", "0800-58-58-58", "Text HOME to 741741").
  contact: string;
  // One-line how-to.
  hint: string;
}

const HOTLINES: Record<string, HotlineSpec> = {
  "en-US": {
    name: "988 Suicide & Crisis Lifeline",
    contact: "988",
    hint: "Call or text 988 (US) for 24/7 crisis support.",
  },
};

export function localeHotline(locale: string): HotlineSpec {
  return HOTLINES[locale] ?? HOTLINES["en-US"];
}
