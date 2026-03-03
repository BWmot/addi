import { JSONSchema7 } from 'ai';
import { ModelCapabilities } from './capabilities';

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
  responseFormat?: { type: 'text' } | { type: 'json'; schema?: JSONSchema7 };
  /** Tool choice setting */
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
  /** Maximum steps for tool calls (when tools are enabled) */
  maxSteps?: number;
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
