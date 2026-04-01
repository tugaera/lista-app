import en from "./en.json";
import pt from "./pt.json";

export type Locale = "en" | "pt";
export type TranslationKey = keyof typeof en;

const translations: Record<Locale, Record<string, string>> = { en, pt };

export function translate(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key as string] ?? translations.en[key as string] ?? (key as string);
}

export const localeNames: Record<Locale, string> = {
  en: "English",
  pt: "Portugues",
};
