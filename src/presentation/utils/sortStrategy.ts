/**
 * Sorting strategies for Provider and Model tree views.
 *
 * Extracted from `providerView.ts` to keep the view layer thin and enable
 * independent testing / reuse of sort logic.
 */
import type { Provider, Model } from "../../common/types";

// ── Public Types ────────────────────────────────────────────────────────────

export type SortRule = "none" | "alphabet" | "input tokens" | "output tokens";
export type SortTarget = "both" | "providers" | "models";

// ── Provider Sorting ────────────────────────────────────────────────────────

/**
 * Sort providers according to the given rule.
 *
 * - `alphabet` — case-insensitive name sort
 * - `input tokens` — descending by the **maximum** `maxInputTokens` across all child models
 * - `output tokens` — descending by the **maximum** `maxOutputTokens` across all child models
 *
 * Returns a **new** array; the original is not mutated.
 */
export function sortProviders(providers: Provider[], rule: SortRule): Provider[] {
  if (rule === "none") {
    return providers;
  }

  const copy = [...providers];

  if (rule === "alphabet") {
    return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  if (rule === "input tokens") {
    return copy.sort((a, b) => {
      const maxA = Math.max(...a.models.map((m) => m.maxInputTokens || 0), 0);
      const maxB = Math.max(...b.models.map((m) => m.maxInputTokens || 0), 0);
      return maxB - maxA;
    });
  }

  // rule === "output tokens"
  return copy.sort((a, b) => {
    const maxA = Math.max(...a.models.map((m) => m.maxOutputTokens || 0), 0);
    const maxB = Math.max(...b.models.map((m) => m.maxOutputTokens || 0), 0);
    return maxB - maxA;
  });
}

// ── Model Sorting ───────────────────────────────────────────────────────────

/**
 * Sort models according to the given rule.
 *
 * - `alphabet` — case-insensitive name sort
 * - `input tokens` — descending by `maxInputTokens`
 * - `output tokens` — descending by `maxOutputTokens`
 *
 * Returns a **new** array; the original is not mutated.
 */
export function sortModels(models: Model[], rule: SortRule): Model[] {
  if (rule === "none") {
    return models;
  }

  const copy = [...models];

  if (rule === "alphabet") {
    return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  if (rule === "input tokens") {
    return copy.sort((a, b) => (b.maxInputTokens || 0) - (a.maxInputTokens || 0));
  }

  // rule === "output tokens"
  return copy.sort((a, b) => (b.maxOutputTokens || 0) - (a.maxOutputTokens || 0));
}
