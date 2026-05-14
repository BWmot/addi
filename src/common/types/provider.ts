import type { ModelOptions } from "./model";

/**
 * API Types based on the API interface format.
 * This simplifies provider selection to 4 main types.
 */
export type ProviderType =
  | "openai-completions" // OpenAI (/completions) - Most common, used by OpenAI, DeepSeek, local models, etc.
  | "openai-responses" // OpenAI (/responses) - Newer API with built-in tool support
  | "anthropic-messages" // Anthropic (/messages)
  | "google-generateContent" // Google (/name:generateContent)
  | "deepseek"; // DeepSeek/MiMo (Native ai-sdk/deepseek supporting reasoning_content)

/**
 * Persisted configuration for a provider (Synced).
 */
export interface ProviderConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  description?: string;
  website?: string;
  apiEndpoint?: string;
  models: ModelConfig[];
  /** Order for model picker category grouping (lower = higher in list) */
  order?: number;
  /** Extra body fields (JSON string) applied to all models in this provider */
  extraBody?: string;
  /** Extra headers (JSON string) applied to all models in this provider */
  extraHeader?: string;
  /** Default model behavior options applied to all models in this provider */
  options?: ModelOptions;
}

/**
 * Represents an AI Provider (e.g. OpenAI, DeepSeek, or a custom OAI-compatible provider).
 * runtime object with secrets and full models.
 */
export interface Provider extends Omit<ProviderConfig, "models"> {
  /** API Key (stored securely). This field is usually empty in memory for security. */
  apiKey?: string;
  /** List of models associated with this provider. */
  models: Model[];
}

export interface ProviderRepository {
  getProviders(): Provider[];
  findModel(modelId: string): { provider: Provider; model: Model } | null;
  getApiKey(providerId: string): Promise<string | undefined>;
  onDidUpdate?: (listener: () => any) => any;
  updateModelSpeed?(providerId: string, modelId: string, speed: number): Promise<void>;
}

// 引入 Model 类型用于 Provider 接口
import type { Model, ModelConfig } from "./model";
