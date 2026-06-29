import type { I18nMessages } from "./types";

const en: I18nMessages = {
  common: {
    save: "Save",
    delete: "Delete",
    verifyConnection: "Verify Connection",
    cancel: "Cancel",
    default: "Default",
    notApplicable: "N/A",
  },

  provider: {
    title: "Provider Details",
    name: "Name",
    apiType: "API Type",
    apiEndpoint: "API Endpoint",
    apiKey: "API Key",
    apiKeyPlaceholder: "Paste your API key here",
    apiKeySavedSecurely: "Stored securely via VS Code SecretStorage.",
    description: "Description",
    website: "Website",
    defaultModelSettings: "Default Model Settings",
    defaultModelSettingsDesc: "Defaults inherited by all models. Can be overridden per model.",
    defaultTemperature: "Default Temperature",
    thinkingLabel: {
      anthropicGoogle: "Default Thinking Level",
      default: "Default Reasoning Effort",
    },
    thinkingHint: "Default thinking/reasoning effort for all models.",
    thinkingHintMap: {
      "openai-responses": "OpenAI (Responses API): maps to reasoningEffort parameter.",
      "openai-completions": "OpenAI-compatible (DeepSeek, MiMo, etc.): passed as reasoning effort.",
      "anthropic-messages": "Anthropic: Low→1024, Medium→4096, High→8192 budget tokens.",
      "google-generateContent": "Google: maps to thinkingConfig.thinkingLevel.",
    } as Record<string, string>,
    budgetTokensLabel: "Budget Tokens Override",
    budgetTokensPlaceholder: "e.g. 4096 — overrides level-based mapping",
    budgetTokensHint:
      "Anthropic: set a budgetTokens value (e.g. 1024, 4096, 8192). Leave empty to use level-based mapping above.",
    extraBody: "Extra Body (JSON Override)",
    extraBodyPlaceholder: '{"key": "value"}',
    globalExtraBody: "Global Extra Body (applied to all models)",
    experimental: "🧪 Experimental",
    experimentalDesc: "Experimental. Test thoroughly before using in production.",
    reasoningContentAdapt: "Adapt reasoning_content thinking mode",
    reasoningContentAdaptHint:
      "For Deepseek / MiMo and similar models using reasoning_content API. Automatically converts and handles response thinking content and specific data format requirements.",
    extractReasoningContent: "Extract reasoning from <think> tags",
    extractReasoningContentHint:
      "Some models return thinking inside <think> XML tags. Extracts and displays it automatically.",
    apiTypeOptions: {
      "openai-completions": "OpenAI (/completions)",
      "openai-responses": "OpenAI (/responses)",
      "anthropic-messages": "Anthropic (/messages)",
      "google-generateContent": "Google (/name:generateContent)",
    },
  },

  model: {
    title: "Model Details",
    titleBatch: "Edit Multiple Models ({count})",
    displayName: "Display Name",
    remoteModelId: "Model ID (e.g. gpt-4)",
    remoteModelIdPlaceholder: "e.g. gpt-4",
    maxInputTokens: "Max Input Tokens",
    maxOutputTokens: "Max Output Tokens",
    capabilities: "Capabilities",
    toolCalling: "Tool",
    thinking: "Think",
    vision: "Vision",
    settingsOverrides: "Settings & Overrides",
    settingsOverridesDesc:
      "Override provider defaults for this model. Leave empty to inherit from provider.",
    temperature: "Temperature",
    thinkingLabel: {
      anthropicGoogle: "Thinking Level",
      default: "Reasoning Effort",
    },
    thinkingHint: "Controls thinking/reasoning effort level.",
    thinkingHintMap: {
      "openai-responses": "OpenAI (Responses API): maps to reasoningEffort parameter.",
      "openai-completions":
        "OpenAI-compatible (DeepSeek, MiMo, etc.): passed as reasoning effort for thinking-enabled models.",
      "anthropic-messages":
        "Anthropic: Low→1024, Medium→4096, High→8192 budget tokens. Maps to extended thinking budget.",
      "google-generateContent": "Google: maps to thinkingConfig.thinkingLevel for Gemini models.",
    } as Record<string, string>,
    budgetTokensLabel: "Thinking Budget (Tokens) Override",
    budgetTokensPlaceholder: "e.g. 4096 — overrides level-based mapping",
    budgetTokensHint:
      "Anthropic: set a budgetTokens value (e.g. 1024, 4096, 8192). Leave empty to use level-based mapping above.",
    extraBody: "Model Extra Body (JSON Override)",
    extraBodyPlaceholder: '{"key": "value"}',
    experimental: "🧪 Experimental",
    experimentalDesc: "Experimental. Test thoroughly before using in production.",
    reasoningContentAdapt: "Adapt reasoning_content thinking mode",
    reasoningContentAdaptHint:
      "For Deepseek / MiMo and similar models using reasoning_content API. Automatically converts and handles response thinking content and specific data format requirements.",
    extractReasoningContent: "Extract reasoning from <think> tags",
    extractReasoningContentHint:
      "Some models return thinking inside <think> XML tags. Extracts and displays it automatically.",
    streamCleanup: "Enable stream cleanup",
    streamCleanupHint:
      "Removes repeated suffixes and whitespace during streaming. Use only for models that exhibit looping or repeated tail output.",
    batchDisabled: "Not available in batch mode",
  },

  app: {
    noSelection: "Select an item to edit",
  },

  feedback: {
    low: "Low",
    medium: "Medium",
    high: "High",
    defaultNotApplicable: "Default (N/A)",
  },
};

export default en;
