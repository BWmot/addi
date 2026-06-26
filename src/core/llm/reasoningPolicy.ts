import type { Provider, Model } from "../../common/types";

/**
 * Provider/model policy helpers for reasoning-related behavior.
 *
 * Policy: skip OpenAI reasoningEffort for models/providers that don't support it.
 *
 * Covered cases:
 * - gpt-5.5 models on completions path (known rejection)
 * - Third-party models using reasoning_content protocol (DeepSeek, MiMo, etc.)
 *   — detected by model RID, name, family, and provider ID
 * - All non-api.openai.com custom endpoints (conservative default)
 *   — third-party proxies almost always use reasoning_content, not reasoning_effort
 *
 * Sending reasoning_effort to unsupported models causes degraded output,
 * including repeated punctuation/characters (：, 。, etc.).
 */
export function shouldSkipOpenAIReasoningEffort(provider: Provider, model: Model): boolean {
  if (provider.providerType !== "openai-completions") {
    return false;
  }

  const rid = model.rid.trim().toLowerCase();
  const pid = provider.id?.trim().toLowerCase() ?? "";
  const name = model.name?.trim().toLowerCase() ?? "";
  const family = model.family?.trim().toLowerCase() ?? "";

  // gpt-5.5 — known rejection of reasoning_effort on completions path
  if (rid.startsWith("gpt-5.5")) {
    return true;
  }

  // Third-party OpenAI-compatible providers that use reasoning_content protocol
  // (DeepSeek, MiMo, etc.) — reasoning_effort is an OpenAI-only concept.
  // Check across all available model identifiers since proxy APIs may rename models.
  if (
    rid.includes("deepseek") ||
    name.includes("deepseek") ||
    family.includes("deepseek") ||
    pid.includes("deepseek") ||
    rid.includes("mimo") ||
    name.includes("mimo") ||
    family.includes("mimo") ||
    pid.includes("mimo")
  ) {
    return true;
  }

  // Conservative guard: for non-OpenAI custom endpoints, default to skipping
  // reasoning_effort.  Third-party models (proxied through openai-compatible)
  // use the reasoning_content protocol, not reasoning_effort.  Sending
  // reasoning_effort to these models can cause degraded output (e.g.
  // repeated punctuation / characters like ： and 。).
  if (
    provider.apiEndpoint &&
    !provider.apiEndpoint.includes("api.openai.com")
  ) {
    return true;
  }

  return false;
}

/**
 * Determine whether streaming suffix-repetition cleanup should be applied.
 *
 * Some open-source / Chinese models (DeepSeek, GLM, MiMo, Qwen, etc.) can
 * enter looping states where they emit the same sentence or clause repeatedly.
 * The collapseStreamSuffix heuristic catches this, but it is aggressive enough
 * to also eat legitimate repeated structures in normal Markdown responses
 * (ASCII art, tables, horizontal rules, numbered lists).
 *
 * Therefore we ONLY enable it for model families known to exhibit the loop
 * behaviour.  GPT, Claude, Gemini, and other models from major Western
 * providers are excluded.
 *
 * Detection uses model RID, name, family, and provider ID so it works even
 * when a proxy renames the model.
 */
export function needsSuffixRepeatCleanup(provider: Provider, model: Model): boolean {
  const rid    = model.rid?.trim().toLowerCase()    ?? "";
  const name   = model.name?.trim().toLowerCase()   ?? "";
  const family = model.family?.trim().toLowerCase() ?? "";
  const pid    = provider.id?.trim().toLowerCase()  ?? "";

  const ids = [rid, name, family, pid];

  const LOOP_PRONE_PATTERNS = [
    "deepseek",
    "mimo",
    "glm",
    "chatglm",
    "qwen",
    "baichuan",
    "yi-",
    "internlm",
    "hunyuan",
    "ernie",
  ];

  return LOOP_PRONE_PATTERNS.some(pat => ids.some(id => id.includes(pat)));
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
