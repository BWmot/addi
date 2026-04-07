# AI SDK 参考

> 更新时间：2026-04-07

---

## 支持的 Providers

| Provider ID               | 适用场景         | 特性                         |
| ------------------------- | ---------------- | ---------------------------- |
| `openai-completions`      | OpenAI/DeepSeek  | Chat completions, 流式       |
| `openai-responses`        | 新版 OpenAI API  | 原生工具支持                 |
| `anthropic-messages`      | Claude 模型      | Thinking, Vision, 工具使用    |
| `google-generativeContent`| Gemini 模型      | 多模态                       |

---

## Provider 注册

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册：

```typescript
this.register({
  id: 'custom-provider',
  label: 'Custom Provider',
  create: (p) => {
    const settings = {
      baseURL: p.apiEndpoint,
      apiKey: p.apiKey,
    };
    return createCustomProvider(settings);
  },
});
```

---

## 流输出格式

| Part 类型         | 说明           |
| ----------------- | -------------- |
| `start`           | 流开始         |
| `reasoning-delta` | 思考内容       |
| `text-delta`      | 文本内容       |
| `tool-call`       | 工具调用       |
| `tool-result`     | 工具结果       |
| `finish`          | 流完成         |

### finishReason 值

| 值              | 说明             |
| --------------- | ---------------- |
| `stop`          | 正常完成         |
| `length`        | 达到最大输出长度 |
| `tool-calls`    | 需要调用工具     |

---

## 工具调用流程

1. **定义** → ToolRegistry 注册
2. **转换** → SchemaConverter 转为 AI SDK 格式
3. **调用** → LLM 生成 tool-call
4. **执行** → ToolOrchestrator 执行
5. **反馈** → 结果返回 LLM

---

## 类型映射

| AI SDK           | VS Code                     |
| ---------------- | --------------------------- |
| `text-delta`     | `LanguageModelTextPart`     |
| `reasoning-delta`| `LanguageModelThinkingPart` |
| `tool-call`      | `LanguageModelToolCallPart` |
| `tool-result`    | `LanguageModelToolResultPart` |

---

## Thinking/Reasoning

对于 Claude 等支持推理的模型：

```typescript
if (model.capabilities?.reasoning) {
  modelSettings.thinking = {
    type: 'enabled',
    budgetTokens: Math.floor(model.maxOutputTokens / 2)
  };
}
```

---

## 依赖

```json
{
  "@ai-sdk/openai": "^3.0.31",
  "@ai-sdk/openai-compatible": "^3.0.0",
  "@ai-sdk/anthropic": "^3.0.46",
  "@ai-sdk/google": "^3.0.30"
}
```
