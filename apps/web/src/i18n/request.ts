import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['pl', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pl';
export const localeCookieName = 'NEXT_LOCALE';

function pickLocale(value: string | undefined | null): Locale {
  if (value && (locales as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return defaultLocale;
}

function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const langs = header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.split('-')[0]?.toLowerCase())
    .filter(Boolean) as string[];
  for (const lang of langs) {
    if ((locales as readonly string[]).includes(lang)) return lang as Locale;
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;

  let locale: Locale;
  if (cookieLocale) {
    locale = pickLocale(cookieLocale);
  } else {
    const hdrs = await headers();
    locale = localeFromAcceptLanguage(hdrs.get('accept-language')) ?? defaultLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
