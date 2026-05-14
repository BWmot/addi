export type ProviderType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generateContent";

export interface ModelCapabilities {
  vision?: boolean;
  toolCalling?: boolean | number;
  reasoning?: boolean;
}

export interface ModelOptions {
  /** Temperature - determines the creativity/randomness (0.0 to 1.0/2.0 depending on provider) */
  temperature?: number;
  /** TopP parameter */
  topP?: number;
  /** Frequency Penalty */
  frequencyPenalty?: number;
  /** Presence Penalty */
  presencePenalty?: number;
  /**
   * OpenAI Native Reasoning Effort ('low' | 'medium' | 'high')
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * Anthropic/Google Native Thinking Budget (Tokens)
   */
  budgetTokens?: number;
  /**
   * [实验性] 启用 reasoning_content 字段注入中间件
   */
  reasoningContentInject?: boolean;
  /**
   * [实验性] 从 <think> 标签提取 reasoning 内容
   */
  extractReasoningContent?: boolean;
}

export interface ModelConfig {
  id: string;
  rid: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  extraBody?: string;
  extraHeader?: string;
  options?: ModelOptions;
  isUserSelectable?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  description?: string;
  website?: string;
  apiEndpoint?: string;
  models: ModelConfig[];
  order?: number;
  extraBody?: string;
  extraHeader?: string;
  options?: ModelOptions;
  apiKey?: string; // Appended for UI transmission
  maskedApiKey?: string;
  apiKeyTouched?: boolean;
}

/** Message received from the extension (VS Code -> Webview) */
export interface WebviewUpdateMessage {
  type: 'update';
  locale: string;           // vscode.env.language
  mode: 'edit' | 'create';
  item: {
    type: 'provider' | 'model';
    isBatchMode?: boolean;
    batchCount?: number;
    data: ProviderConfig | ModelConfig & { parentProviderType?: string };
    parentId?: string;
  };
}
