/**
 * i18n translation key definitions.
 * Every key used in the UI must be defined here for type safety.
 */
export interface I18nMessages {
  // ── Common ──
  common: {
    save: string;
    delete: string;
    verifyConnection: string;
    cancel: string;
    default: string;
    notApplicable: string;
  };

  // ── Provider Form ──
  provider: {
    title: string;
    name: string;
    apiType: string;
    apiEndpoint: string;
    apiKey: string;
    apiKeyPlaceholder: string;
    apiKeySavedSecurely: string;
    description: string;
    website: string;
    defaultModelSettings: string;
    defaultModelSettingsDesc: string;
    defaultTemperature: string;
    thinkingLabel: {
      anthropicGoogle: string;
      default: string;
    };
    thinkingHint: string;
    /** Provider-specific thinking hints keyed by providerType */
    thinkingHintMap: Record<string, string>;
    budgetTokensLabel: string;
    budgetTokensPlaceholder: string;
    budgetTokensHint: string;
    extraBody: string;
    extraBodyPlaceholder: string;
    globalExtraBody: string;
    experimental: string;
    experimentalDesc: string;
    reasoningContentInject: string;
    reasoningContentInjectHint: string;
    extractReasoningContent: string;
    extractReasoningContentHint: string;
    apiTypeOptions: Record<string, string>;
  };

  // ── Model Form ──
  model: {
    title: string;
    titleBatch: string;
    displayName: string;
    remoteModelId: string;
    remoteModelIdPlaceholder: string;
    maxInputTokens: string;
    maxOutputTokens: string;
    capabilities: string;
    toolCalling: string;
    thinking: string;
    vision: string;
    settingsOverrides: string;
    settingsOverridesDesc: string;
    temperature: string;
    thinkingLabel: {
      anthropicGoogle: string;
      default: string;
    };
    thinkingHint: string;
    /** Provider-specific thinking hints keyed by providerType */
    thinkingHintMap: Record<string, string>;
    budgetTokensLabel: string;
    budgetTokensPlaceholder: string;
    budgetTokensHint: string;
    extraBody: string;
    extraBodyPlaceholder: string;
    experimental: string;
    experimentalDesc: string;
    reasoningContentInject: string;
    reasoningContentInjectHint: string;
    extractReasoningContent: string;
    extractReasoningContentHint: string;
    batchDisabled: string;
  };

  // ── App ──
  app: {
    noSelection: string;
  };

  // ── Feedback messages ──
  feedback: {
    low: string;
    medium: string;
    high: string;
    defaultNotApplicable: string;
  };
}
