import type { JSONSchema7 } from "ai";
import type { ModelCapabilities } from "./capabilities";

/**
 * Model behavior options based on AI SDK LanguageModelV3CallOptions.
 * These options control the model's generation behavior.
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/settings
 */
export interface ModelOptions {
  /** Maximum number of tokens to generate */
  maxOutputTokens?: number;
  /** Sampling temperature (0-2). Higher = more creative/risky, lower = more focused/deterministic */
  temperature?: number;
  /** Nucleus sampling - cumulative probability threshold */
  topP?: number;
  /** Only sample from top K options */
  topK?: number;
  /** Stop sequences that halt generation */
  stopSequences?: string[];
  /** Reduces repetition of tokens */
  presencePenalty?: number;
  /** Reduces repeated words/phrases */
  frequencyPenalty?: number;
  /** Seed for deterministic results (if supported by provider) */
  seed?: number;
  /** Output format: text or JSON */
  responseFormat?: { type: "text" } | { type: "json"; schema?: JSONSchema7 };
  /** Tool choice setting */
  toolChoice?: "auto" | "required" | "none" | { type: "tool"; toolName: string };
  /** Maximum steps for tool calls (when tools are enabled) */
  maxSteps?: number;

  /**
   * Provider-specific options passed directly to the AI SDK provider.
   *
   * This is the correct way to pass thinking/reasoning configuration
   * that varies by provider. Examples:
   *
   * **Anthropic** (budget-based):
   * ```json
   * { "anthropic": { "thinking": { "type": "enabled", "budgetTokens": 12000 } } }
   * ```
   * **Anthropic** (adaptive):
   * ```json
   * { "anthropic": { "thinking": { "type": "adaptive" } } }
   * ```
   * **OpenAI**:
   * ```json
   * { "openai": { "reasoningEffort": "medium", "reasoningSummary": "auto" } }
   * ```
   * **Google** (Gemini 3):
   * ```json
   * { "google": { "thinkingConfig": { "thinkingLevel": "high", "includeThoughts": true } } }
   * ```
   * **Google** (Gemini 2.5):
   * ```json
   * { "google": { "thinkingConfig": { "thinkingBudget": 8192, "includeThoughts": true } } }
   * ```
   */
  providerOptions?: Record<string, Record<string, unknown>>;
}

export interface RemoteModelInfo {
  id: string;
  name?: string;
  description?: string;
  family?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapabilities;
}

export type ModelDraft = {
  rid: string; // remoteId - 远程模型的ID
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  /** Extra body fields (JSON string) to be sent with the request */
  extraBody?: string;
  /** Extra headers (JSON string) to be sent with the request */
  extraHeader?: string;
  /** Model behavior options (temperature, topP, etc.) - overrides provider global options */
  options?: ModelOptions;
  id?: string; // 本地生成的唯一标识
  // Stats - Optional in draft, managed separately in runtime
  speedHistory?: number[];
  averageSpeed?: number;
};

/**
 * Persisted configuration for a model (Synced).
 */
export interface ModelConfig {
  id: string;
  rid: string; // remoteId - 远程模型的ID
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  /** Extra body fields (JSON string) to be sent with the request - overrides provider global setting */
  extraBody?: string;
  /** Extra headers (JSON string) to be sent with the request - overrides provider global setting */
  extraHeader?: string;
  /** Model behavior options (temperature, topP, etc.) - overrides provider global options */
  options?: ModelOptions;
  /** Whether the model shows in the Copilot Chat model picker */
  isUserSelectable?: boolean;
}

/**
 * Runtime statistics for a model (Local only).
 */
export interface ModelStats {
  speedHistory?: number[];
  averageSpeed?: number;
}

/**
 * Represents a specific AI model configuration.
 * Combines static config and runtime stats.
 */
export interface Model extends ModelConfig, ModelStats {}
