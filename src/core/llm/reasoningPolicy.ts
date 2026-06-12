import type { Provider, Model } from "../../common/types";

/**
 * Small provider/model policy helpers for reasoning-related behavior.
 *
 * The current regression fix keeps gpt-5.5 models off the openai-completions
 * reasoningEffort path, because that compatibility route can still emit
 * chat/completions payloads that reject reasoning_effort.
 */
export function shouldSkipOpenAIReasoningEffort(provider: Provider, model: Model): boolean {
  if (provider.providerType !== "openai-completions") {
    return false;
  }

  return model.rid.trim().toLowerCase().startsWith("gpt-5.5");
}

/**
 * Remove any existing OpenAI reasoningEffort entries when the skip policy applies.
 *
 * This is necessary because model/provider level providerOptions can already
 * contain an OpenAI reasoningEffort value before the request-construction layer
 * decides whether to add another one.
 */
export function stripOpenAIReasoningEffort(
  providerOptions: Record<string, Record<string, unknown>>,
  provider: Provider,
  model: Model,
  openaiCompatibleKey: string,
): void {
  if (!shouldSkipOpenAIReasoningEffort(provider, model)) {
    return;
  }

  for (const key of ["openai", openaiCompatibleKey] as const) {
    const current = providerOptions[key];
    if (!current || typeof current !== "object") {
      continue;
    }

    if (!("reasoningEffort" in current)) {
      continue;
    }

    const { reasoningEffort: _ignored, ...rest } = current as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      providerOptions[key] = rest;
    } else {
      delete providerOptions[key];
    }
  }
}
