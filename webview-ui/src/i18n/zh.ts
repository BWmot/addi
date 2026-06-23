import type { I18nMessages } from "./types";

const zh: I18nMessages = {
  common: {
    save: "保存",
    delete: "删除",
    verifyConnection: "验证连接",
    cancel: "取消",
    default: "默认",
    notApplicable: "N/A",
  },

  provider: {
    title: "提供商",
    name: "名称",
    apiType: "API 类型",
    apiEndpoint: "API 地址",
    apiKey: "API 密钥",
    apiKeyPlaceholder: "输入你的 API 密钥",
    apiKeySavedSecurely: "由 VS Code SecretStorage 安全存储。",
    description: "描述",
    website: "网站",
    defaultModelSettings: "默认模型设置",
    defaultModelSettingsDesc: "全局默认值，会被所有模型继承，也可在单个模型中覆盖。",
    defaultTemperature: "默认 Temperature",
    thinkingLabel: {
      anthropicGoogle: "默认思考级别",
      default: "默认推理强度",
    },
    thinkingHint: "所有模型的默认思考/推理的强度。",
    thinkingHintMap: {
      "openai-responses": "OpenAI (Responses API)：映射到 reasoningEffort。",
      "openai-completions": "OpenAI 兼容接口 (DeepSeek, MiMo 等)：作为 reasoning effort 传递。",
      "anthropic-messages": "Anthropic：低→1024，中→4096，高→8192 tokens。",
      "google-generateContent": "Google：映射到 thinkingConfig.thinkingLevel。",
    } as Record<string, string>,
    budgetTokensLabel: "Budget Tokens 覆盖",
    budgetTokensPlaceholder: "如 4096 — 覆盖级别映射",
    budgetTokensHint:
      "Anthropic：设置具体 budgetTokens（如 1024、4096、8192）。留空则使用上方级别映射。",
    extraBody: "额外 Body（JSON 覆盖）",
    extraBodyPlaceholder: '{"key": "value"}',
    globalExtraBody: "全局额外 Body（应用于所有模型）",
    experimental: "🧪 实验性功能",
    experimentalDesc: "实验性功能，生产环境使用前请充分测试。",
    reasoningContentAdapt: "适配 reasoning_content 思考模式",
    reasoningContentAdaptHint:
      "适用于 Deepseek / MiMo 等使用 reasoning_content API 的模型。自动转换和处理思考响应内容以及对思考回传的特定格式要求。",
    extractReasoningContent: "从 <think> 标签提取推理内容",
    extractReasoningContentHint:
      "部分模型在 <think> XML 标签内返回思考内容。启用后可自动提取并显示。",
    apiTypeOptions: {
      "openai-completions": "OpenAI (/completions)",
      "openai-responses": "OpenAI (/responses)",
      "anthropic-messages": "Anthropic (/messages)",
      "google-generateContent": "Google (/name:generateContent)",
    },
  },

  model: {
    title: "模型",
    titleBatch: "批量编辑 ({count} 个模型)",
    displayName: "显示名称",
    remoteModelId: "模型 ID（如 gpt-4）",
    remoteModelIdPlaceholder: "如 gpt-4",
    maxInputTokens: "最大输入 Tokens",
    maxOutputTokens: "最大输出 Tokens",
    capabilities: "模型能力",
    toolCalling: "工具",
    thinking: "思考",
    vision: "视觉",
    settingsOverrides: "设置与覆盖",
    settingsOverridesDesc: "覆盖提供商默认值。留空则继承提供商设置。",
    temperature: "Temperature",
    thinkingLabel: {
      anthropicGoogle: "思考级别",
      default: "推理强度",
    },
    thinkingHint: "控制思考/推理的强度。",
    thinkingHintMap: {
      "openai-responses": "OpenAI (Responses API)：映射到 reasoningEffort。",
      "openai-completions":
        "OpenAI 兼容 (DeepSeek, MiMo 等)：作为推理力度参数传递给支持思考的模型。",
      "anthropic-messages": "Anthropic：低→1024，中→4096，高→8192 tokens。映射到扩展思考预算。",
      "google-generateContent": "Google：映射到 Gemini 模型的 thinkingConfig.thinkingLevel。",
    } as Record<string, string>,
    budgetTokensLabel: "思考预算 (Tokens) 覆盖",
    budgetTokensPlaceholder: "如 4096 — 覆盖级别映射",
    budgetTokensHint:
      "Anthropic：设置具体 budgetTokens（如 1024、4096、8192）。留空则使用上方级别映射。",
    extraBody: "额外 Body (JSON 覆盖)",
    extraBodyPlaceholder: '{"key": "value"}',
    experimental: "🧪 实验性",
    experimentalDesc: "实验性功能，生产环境使用前请充分测试。",
    reasoningContentAdapt: "适配 reasoning_content 思考模式",
    reasoningContentAdaptHint:
      "适用于 Deepseek / MiMo 等使用 reasoning_content API 的模型。自动转换和处理思考响应内容以及对思考回传的特定格式要求。",
    extractReasoningContent: "从 <think> 标签提取推理内容",
    extractReasoningContentHint:
      "部分模型在 <think> XML 标签内返回思考内容。启用后可自动提取并显示。",
    batchDisabled: "批量模式下不可编辑",
  },

  app: {
    noSelection: "请选择要编辑的项目",
  },

  feedback: {
    low: "低",
    medium: "中",
    high: "高",
    defaultNotApplicable: "默认 (N/A)",
  },
};

export default zh;
