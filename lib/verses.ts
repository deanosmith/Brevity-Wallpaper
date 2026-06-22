export type Verse = {
  text: string;
  reference: string;
  translation: "NKJV";
};

const FALLBACK_NKJV_VERSE: Verse = {
  text: "Rejoice always.",
  reference: "1 Thessalonians 5:16",
  translation: "NKJV",
};

export function getNkjvVerse(customText?: string, customReference?: string): Verse {
  const trimmedText = customText?.trim();

  if (trimmedText) {
    return {
      text: trimmedText.slice(0, 220),
      reference: customReference?.trim().slice(0, 60) || "Personal verse",
      translation: "NKJV",
    };
  }

  const configuredText = process.env.NKJV_VERSE_TEXT?.trim();

  if (configuredText) {
    return {
      text: configuredText.slice(0, 220),
      reference: process.env.NKJV_VERSE_REFERENCE?.trim().slice(0, 60) || "Verse of the day",
      translation: "NKJV",
    };
  }

  return FALLBACK_NKJV_VERSE;
}
