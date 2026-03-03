# AI SDK 参考文档

> 更新时间：2026-03-01

本文档是 Addi 项目与 AI SDK (Vercel) 集成的技术参考，包含 API 使用、Provider 配置、流输出格式等内容。

---

## 目录

1. [AI SDK 概述](#ai-sdk-概述)
2. [支持的 Providers](#支持的-providers)
3. [Provider 注册与配置](#provider-注册与配置)
4. [流输出格式](#流输出格式)
5. [工具调用集成](#工具调用集成)
6. [类型转换](#类型转换)
7. [错误处理](#错误处理)
8. [最佳实践](#最佳实践)

---

## AI SDK 概述

### 简介

Addi 使用 [AI SDK](https://ai-sdk.dev/) (Vercel) 作为核心 LLM 抽象层，提供：

- **统一 API** - 跨多个 Provider 的统一接口
- **Provider 工厂** - 创建 LanguageModel 实例
- **工具调用支持** - 结构化输出生成
- **流式响应处理** - 高效的流输出处理

### 项目依赖

```json
{
  "@ai-sdk/openai": "^3.0.31",
  "@ai-sdk/openai-compatible": "^3.0.0",
  "@ai-sdk/anthropic": "^3.0.46",
  "@ai-sdk/google": "^3.0.30"
}
```

### 核心文件

| 文件                               | 职责                      |
| ---------------------------------- | ------------------------- |
| `src/core/llm/aiRegistry.ts`       | Provider 注册与工厂       |
| `src/core/llm/llmService.ts`       | LLM 服务编排、流式处理    |
| `src/core/llm/messageConverter.ts` | VS Code → AI SDK 消息转换 |
| `src/core/llm/toolRegistry.ts`     | 工具定义注册              |
| `src/core/llm/toolOrchestrator.ts` | 工具执行编排              |

---

## 支持的 Providers

### 1. OpenAI (/completions)

- **Provider ID**: `openai-completions`
- **API Endpoint**: `https://api.openai.com/v1`
- **适用场景**: OpenAI、DeepSeek、本地模型
- **特性**: Chat completions、function calling、流式输出

```typescript
{
  "providerType": "openai-completions",
  "apiEndpoint": "https://api.openai.com/v1",
  "apiKey": "sk-..."
}
```

### 2. OpenAI (/responses)

- **Provider ID**: `openai-responses`
- **API Endpoint**: `https://api.openai.com/v1`
- **适用场景**: 新版 API，原生工具支持
- **特性**: 原生工具调用、更高的可靠性

### 3. Anthropic (/messages)

- **Provider ID**: `anthropic-messages`
- **API Endpoint**: `https://api.anthropic.com`
- **适用场景**: Claude 模型
- **特性**:
  - 原生 thinking/reasoning 支持
  - Vision/图像理解
  - 工具使用

```typescript
{
  "providerType": "anthropic-messages",
  "apiEndpoint": "https://api.anthropic.com/v1",
  "apiKey": "sk-ant-..."
}
```

### 4. Google Generative AI

- **Provider ID**: `google-generativeContent`
- **API Endpoint**: `https://generativelanguage.googleapis.com`
- **适用场景**: Gemini 模型
- **特性**: 多模态、快速生成

### 5. OpenAI 兼容 Provider

任何实现 OpenAI API 规范的 Provider 都可使用：

- **Provider ID**: `openai-completions`
- **适用场景**: 本地模型、代理服务

```typescript
{
  "providerType": "openai-completions",
  "apiEndpoint": "http://localhost:11434/v1",
  "apiKey": "not-required"
}
```

---

## Provider 注册与配置

### ProviderFactory 接口

```typescript
export interface ProviderFactory {
  id: string;
  label: string;
  create: (provider: Provider) => AIProviderInstance;
}
```

### 注册新 Provider

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 方法中注册：

```typescript
this.register({
  id: 'custom-provider',
  label: 'Custom Provider',
  create: (p) => {
    const settings: any = {
      baseURL: p.apiEndpoint,
      apiKey: p.apiKey,
      fetch: createDebugFetch(),
    };
    return createCustomProvider(settings);
  },
});
```

### 配置项

#### Provider 配置

| 配置项         | 类型    | 说明         |
| -------------- | ------- | ------------ |
| `providerType` | string  | Provider ID  |
| `apiEndpoint`  | string  | API 基础 URL |
| `apiKey`       | string  | API 认证密钥 |
| `models`       | Model[] | 可用模型列表 |

#### Model 配置

| 配置项            | 类型   | 说明           |
| ----------------- | ------ | -------------- |
| `id`              | string | 模型标识       |
| `name`            | string | 显示名称       |
| `capabilities`    | object | 模型能力       |
| `maxInputTokens`  | number | 最大输入 token |
| `maxOutputTokens` | number | 最大输出 token |

#### Capabilities 对象

```typescript
interface ModelCapabilities {
  imageInput?: boolean; // 支持图像输入
  audioInput?: boolean; // 支持音频输入
  videoInput?: boolean; // 支持视频输入
  toolCalling?: boolean | number; // 支持工具调用
  reasoning?: boolean; // 支持思考/推理
}
```

### Thinking/Reasoning 配置

对于支持 reasoning 的模型（如 Claude），Addi 自动配置 thinking budget：

```typescript
// src/core/llm/aiRegistry.ts
if (model && model.capabilities?.reasoning) {
  if (provider.providerType === 'anthropic-messages') {
    const budget = model.maxOutputTokens ? Math.floor(model.maxOutputTokens / 2) : 4096;
    modelSettings.thinking = { type: 'enabled', budgetTokens: budget };
  }
}
```

---

## 流输出格式

### 流部分类型

| 类型              | 说明         |
| ----------------- | ------------ |
| `start`           | 流开始       |
| `reasoning-delta` | 思考内容增量 |
| `text-delta`      | 文本内容增量 |
| `text-end`        | 文本块结束   |
| `tool-call`       | 工具调用     |
| `tool-result`     | 工具结果     |
| `finish-step`     | 步骤完成     |
| `finish`          | 流完成       |
| `error`           | 错误         |

### 完整示例

```json
[
  { "type": "start" },
  { "type": "reasoning-delta", "id": "reasoning-0", "reasoningDelta": "思考内容..." },
  { "type": "text-delta", "id": "txt-0", "text": "实际回复内容..." },
  { "type": "text-end", "id": "txt-0" },
  { "type": "finish-step", "finishReason": "stop", ... },
  { "type": "finish", "finishReason": "stop", ... }
]
```

### finishReason 值

| 值               | 说明             |
| ---------------- | ---------------- |
| `stop`           | 正常完成         |
| `length`         | 达到最大输出长度 |
| `tool-calls`     | 需要调用工具     |
| `content-filter` | 内容被过滤       |
| `error`          | 发生错误         |

### MiniMax 特殊配置

MiniMax OpenAI 兼容接口需要设置 `reasoning_split` 参数：

```typescript
// OpenAI 兼容接口
extra_body: {
  reasoning_split: true;
}

// Anthropic 兼容接口（推荐，自动分离思考内容）
// 无需额外配置
```

---

## 工具调用集成

### 工具定义

```typescript
const tool = {
  description: 'Search for files in the workspace',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern' },
    },
    required: ['pattern'],
  },
};
```

### 执行流程

1. **定义** - 工具注册到 ToolRegistry
2. **转换** - SchemaConverter 转为 AI SDK 格式
3. **调用** - LLM 生成工具调用
4. **执行** - ToolOrchestrator 执行工具
5. **反馈** - 结果返回给 LLM

### 工具相关流部分

#### tool-call

```json
{
  "type": "tool-call",
  "toolCallId": "call-abc123",
  "toolName": "calculate",
  "args": { "expression": "15 + 27" }
}
```

#### tool-result

```json
{
  "type": "tool-result",
  "toolCallId": "call-abc123",
  "toolName": "calculate",
  "output": "42",
  "result": "42"
}
```

---

## 类型转换

### AI SDK → VS Code 类型映射

| AI SDK Part Type  | VS Code Part Type             | 说明      |
| ----------------- | ----------------------------- | --------- |
| `text-delta`      | `LanguageModelTextPart`       | 文本内容  |
| `reasoning-delta` | `LanguageModelThinkingPart`   | 思考/推理 |
| `tool-call`       | `LanguageModelToolCallPart`   | 工具调用  |
| `tool-result`     | `LanguageModelToolResultPart` | 工具结果  |

### 转换代码

```typescript
// src/core/llm/llmService.ts
const handlers = {
  'text-delta': (p) => {
    progress.report(new vscode.LanguageModelTextPart(p.text));
  },
  'reasoning-delta': (p) => {
    progress.report(new vscode.LanguageModelThinkingPart(p.reasoningDelta, p.id, p.metadata));
  },
  'tool-call': (p) => {
    progress.report(
      new vscode.LanguageModelToolCallPart(p.toolCallId, p.toolName, p.args || p.input)
    );
  },
  'tool-result': (p) => {
    const toolRes = p.result || p.output;
    const res = typeof toolRes === 'string' ? toolRes : JSON.stringify(toolRes);
    progress.report(
      new vscode.LanguageModelToolResultPart(p.toolCallId, [new vscode.LanguageModelTextPart(res)])
    );
  },
};
```

### VS Code 类型详情

#### LanguageModelTextPart

```typescript
new LanguageModelTextPart('Hello world');
// 属性: value: string
```

#### LanguageModelThinkingPart

```typescript
new LanguageModelThinkingPart('思考内容...', 'reasoning-0', metadata);
// 属性: value: string | string[], id?: string, metadata?: {...}
```

#### LanguageModelToolCallPart

```typescript
new LanguageModelToolCallPart('call-123', 'getTime', {});
// 属性: callId: string, name: string, arguments: any
```

#### LanguageModelToolResultPart

```typescript
new LanguageModelToolResultPart('call-123', [new LanguageModelTextPart('result')]);
// 属性: callId: string, content: Array<TextPart | DataPart>
```

---

## 错误处理

### 错误类型

```typescript
// API 错误
{
  "type": "error",
  "error": {
    "name": "AI_APICallError",
    "url": "https://api.example.com/v1/chat/completions",
    "statusCode": 401,
    "responseBody": "{\"error\":{\"message\":\"Unauthorized\"}}"
  }
}
```

### MiniMax 错误码

| 错误码 | 说明                          |
| ------ | ----------------------------- |
| 1004   | 认证失败 - 检查 API Key       |
| 401    | 未授权 - Authorization 头缺失 |
| 429    | 请求频率超限                  |
| 500    | 服务器内部错误                |

### 调试日志

Addi 包装了原生 `fetch`，记录：

- 请求 URL
- 请求体片段（前 2000 字符）
- 响应状态码
- 错误响应

查看日志：`View > Output > Addi`

---

## 最佳实践

### 1. 使用本地模型

```typescript
{
  "providerType": "openai-completions",
  "apiEndpoint": "http://localhost:11434/v1",
  "apiKey": ""
}
```

### 2. 配置 Claude Thinking Budget

确保模型配置了 `capabilities.reasoning: true`：

```typescript
{
  "id": "claude-3-5-sonnet-20241022",
  "name": "Claude 3.5 Sonnet",
  "capabilities": { "reasoning": true },
  "maxOutputTokens": 8192
}
```

### 3. 启用调试日志

在 `View > Output > Addi` 中查看 `[AI-SDK Fetch]` 日志。

---

## 相关文档

- [VS Code API 参考](./vscode-reference.md)
- [项目架构文档](./project-document.md)
- [开发规范](./dev-coding-notes.md)
- [AI SDK 官方文档](https://ai-sdk.dev/docs/ai-sdk-core)
- [AI SDK OpenAI Provider](https://ai-sdk.dev/docs/reference/ai-sdk/openai)
- [AI SDK Anthropic Provider](https://ai-sdk.dev/docs/reference/ai-sdk/anthropic)
- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
