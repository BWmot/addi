# AI SDK 参考

> 更新时间：2026-04-22
> 基于 AI SDK v6.x

---

## 支持的 Providers

| Provider ID              | 适用场景        | 特性                       |
| ------------------------ | --------------- | -------------------------- |
| `openai-completions`     | OpenAI/DeepSeek | Chat completions, 流式     |
| `openai-responses`       | 新版 OpenAI API | 原生工具支持               |
| `anthropic-messages`     | Claude 模型     | Thinking, Vision, 工具使用 |
| `google-generateContent` | Gemini 模型     | 多模态                     |

---

## Provider 注册

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册：

```typescript
this.register({
  id: "custom-provider",
  label: "Custom Provider",
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

## 流输出格式 (TextStreamPart)

AI SDK v6 使用统一的 `TextStreamPart` 类型表示流式输出：

### text 相关

```typescript
{
  type: "text";
  text: string;
}
{
  type: "text-delta";
  textDelta: string;
}
{
  type: "text-start";
}
{
  type: "text-end";
}
```

### reasoning 相关

```typescript
{
  type: "reasoning";
  text: string;
}
{
  type: "reasoning-delta";
  textDelta: string;
}
{
  type: "reasoning-start";
}
{
  type: "reasoning-end";
}
{
  type: "reasoning-part-finish";
}
```

### tool-call 相关

```typescript
{
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: object;
}
{
  type: "tool-call-streaming-start";
  toolCallId: string;
  toolName: string;
}
{
  type: "tool-call-delta";
  toolCallId: string;
  toolName: string;
  argsTextDelta: string;
}
{
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: object;
  output: any;
}
```

### finish reason 值

```typescript
type FinishReason =
  | "stop" // 正常完成
  | "length" // 达到最大输出长度
  | "content-filter" // 内容过滤
  | "tool-calls" // 需要调用工具
  | "error" // 错误
  | "other"; // 其他原因
```

---

## streamText 返回类型

```typescript
const result = streamText({ model, messages, tools });

// 流式访问
for await (const part of result.fullStream) {
  // part 是 TextStreamPart<TOOLS>
}

// 便捷属性
result.textStream; // AsyncIterable<string> - 纯文本流
result.fullStream; // AsyncIterable<TextStreamPart> - 完整流
result.reasoning; // Promise<ReasoningOutput[]> - reasoning 输出
result.toolCalls; // Promise<TypedToolCall[]> - 工具调用
result.toolResults; // Promise<TypedToolResult[]> - 工具结果
result.finishReason; // PromiseLike<FinishReason>
result.usage; // Promise<LanguageModelUsage>
```

---

## 工具调用流程

1. **定义** → ToolRegistry 注册
2. **转换** → SchemaConverter 转为 AI SDK 格式
3. **调用** → LLM 生成 tool-call
4. **执行** → ToolOrchestrator 执行
5. **反馈** → 结果返回 LLM

---

## 类型映射

| AI SDK v6         | VS Code                       |
| ----------------- | ----------------------------- |
| `text-delta`      | `LanguageModelTextPart`       |
| `reasoning-delta` | `LanguageModelThinkingPart`   |
| `tool-call`       | `LanguageModelToolCallPart`   |
| `tool-result`     | `LanguageModelToolResultPart` |

---

## AI SDK Message Types (ModelMessage)

```typescript
// 系统消息
type SystemModelMessage = {
  role: "system";
  content: string;
  providerOptions?: ProviderOptions;
};

// 用户消息
type UserModelMessage = {
  role: "user";
  content: string | Array<TextPart | ImagePart | FilePart>;
  providerOptions?: ProviderOptions;
};

// 助手消息
type AssistantModelMessage = {
  role: "assistant";
  content: string | Array<TextPart | FilePart | ReasoningPart | ToolCallPart>;
};

// 工具消息
type ToolModelMessage = {
  role: "tool";
  content: Array<ToolResultPart>;
};

// Content Part 类型
type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
type ImagePart = {
  type: "image";
  image: string | Uint8Array | URL;
  mediaType?: string;
};
type FilePart = {
  type: "file";
  data: string | Uint8Array;
  mediaType: string;
  filename?: string;
};
type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: object;
};
type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: object;
  output: unknown;
};
```

---

## Thinking/Reasoning 配置

对于 Claude 等支持推理的模型：

```typescript
// aiRegistry.ts 中配置
if (model.capabilities?.reasoning) {
  modelSettings.thinking = {
    type: 'enabled',
    budgetTokens: Math.floor(model.maxOutputTokens / 2)
  };
}

// 支持的类型
modelSettings.thinking =
  | { type: 'enabled', budgetTokens: number }  // 启用思考
  | { type: 'disabled' }                       // 禁用
  | { type: 'auto' }                           // 自动（由模型决定）
  | { type: 'adaptive' }                       // 自适应
```

---

## Tool 定义

```typescript
import { tool, jsonSchema } from "ai";

// 定义工具
const myTool = tool({
  description: "A tool description",
  parameters: jsonSchema(
    z.object({
      arg1: z.string(),
      arg2: z.number(),
    }),
  ),
  execute: async (args) => {
    return `Result: ${args.arg1}`;
  },
});

// 或使用动态工具
const dynamicTool = dynamicTool({
  description: "Dynamic tool",
  parameters: jsonSchema({ type: "object" }),
});
```

---

## 依赖版本

```json
{
  "ai": "^6.0.168",
  "@ai-sdk/openai": "^3.0.53",
  "@ai-sdk/openai-compatible": "^2.0.41",
  "@ai-sdk/anthropic": "^3.0.71",
  "@ai-sdk/google": "^3.0.64"
}
```

---

## 关键变更 (v5 → v6)

1. **TextStreamPart 统一流格式**: 所有流式输出使用统一的 part 类型
2. **Tool 类型重构**: 使用 `Tool<INPUT, OUTPUT>` 泛型
3. **Reasoning 支持增强**: 新增 `reasoning-part-finish` 等事件
4. **Tool Approval**: 新增 `tool-approval-request` 类型
5. **StepResult 增强**: 每个 step 包含完整的 `content` 数组
