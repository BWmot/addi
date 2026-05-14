import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { I18nMessages } from './types';
import en from './en';
import zh from './zh';

/** Supported locales */
export type Locale = 'en' | 'zh';

/** Deeply resolve a dotted path like "model.title" from I18nMessages */
// Check if a type has only an index signature (like Record<string, string>)
type HasIndexSignature<T> = string extends keyof T ? true : false;

type NestedKeyOf<T extends { [key: string]: any }> = {
  [K in keyof T & string]:
    T[K] extends string | number | boolean | null | undefined ? K :
    HasIndexSignature<T[K]> extends true ? K :  // Record<string, ...> — treat as leaf
    T[K] extends { [key: string]: any }
      ? `${K}.${NestedKeyOf<T[K]>}`
      : K;
}[keyof T & string];

type TranslationKey = NestedKeyOf<I18nMessages>;

// ── Context ──

interface I18nContextValue {
  locale: Locale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Resolve a dotted path to a raw value (for accessing nested objects like hint maps) */
  tRaw: (key: TranslationKey) => unknown;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: (key) => key,
  tRaw: () => undefined,
  setLocale: () => {},
});

// ── Provider ──

const messages: Record<Locale, I18nMessages> = { en, zh };

/** Resolve a dotted path like "provider.title" within a messages object */
function resolve(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export const I18nProvider: React.FC<{ locale: Locale; children: React.ReactNode }> = ({
  locale: initialLocale,
  children,
}) => {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const msg = resolve(messages[locale] as unknown as Record<string, unknown>, key);
      if (msg === undefined || msg === null) {
        // fallback to English if key missing in current locale
        const fallback = resolve(messages.en as unknown as Record<string, unknown>, key);
        if (typeof fallback === 'string') return fallback;
        return key; // last resort: return the key itself
      }
      let result = String(msg);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    [locale],
  );

  const tRaw = useCallback(
    (key: TranslationKey): unknown => {
      const msg = resolve(messages[locale] as unknown as Record<string, unknown>, key);
      if (msg === undefined || msg === null) {
        return resolve(messages.en as unknown as Record<string, unknown>, key);
      }
      return msg;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, t, tRaw, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

// ── Hooks ──

export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t;
}

export function useLocale(): I18nContextValue {
  return useContext(I18nContext);
}

/**
 * Detect locale from VS Code language identifier.
 * Returns 'zh' for any Chinese variant (zh-CN, zh-TW, zh-Hans, etc.),
 * 'en' for everything else.
 */
export function detectLocale(vscodeLanguage: string): Locale {
  if (vscodeLanguage.startsWith('zh')) return 'zh';
  return 'en';
}
