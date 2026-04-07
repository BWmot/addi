# 架构设计

> 更新时间：2026-04-07

---

## 概述

Addi 桥接 AI SDK 与 VS Code Copilot API，支持自定义 LLM 提供商。

**核心能力**：多 Provider、流式响应、工具调用、Thinking/Reasoning 处理。

---

## 分层架构

```
VS Code (Copilot) → Addi → AI SDK → Providers
```

| 层级           | 职责       | 组件                                  |
| -------------- | ---------- | ------------------------------------- |
| Presentation   | UI、命令   | `commands/`, `views/`, `extension.ts` |
| Core           | LLM 编排   | `llmService.ts`, `aiRegistry.ts`      |
| Infrastructure | 数据持久化 | `storageService.ts`, `crypto/`        |
| Common         | 类型、工具 | `types/`, `logger.ts`                 |

---

## 核心组件

| 组件             | 文件                                     | 职责                 |
| ---------------- | ---------------------------------------- | -------------------- |
| AddiChatProvider | `src/core/providers/AddiChatProvider.ts` | VS Code ChatProvider |
| LLMService       | `src/core/llm/llmService.ts`             | 流式处理、工具调用   |
| AIRegistry       | `src/core/llm/aiRegistry.ts`             | Provider 注册        |
| MessageConverter | `src/core/llm/messageConverter.ts`       | 消息格式转换         |
| ToolOrchestrator | `src/core/llm/toolOrchestrator.ts`       | 工具执行编排         |

---

## 数据流

```
用户 → AddiChatProvider → LLMService → AI SDK → 流式响应 → VS Code
```

### 核心流程

1. **Chat 请求**: `provideLanguageModelChatResponse()`
2. **消息转换**: `MessageConverter.toAiCoreMessages()`
3. **流式处理**: `streamText()` → `processStreamPart()`
4. **工具调用**: `ToolOrchestrator.executeTool()`

---

## 类型

```typescript
interface Provider {
  id: string;
  name: string;
  providerType: string; // 'openai-completions', 'anthropic-messages'
  apiEndpoint: string;
  models: Model[];
}

interface Model {
  id: string;
  name: string;
  capabilities?: {
    toolCalling?: boolean | number;
    reasoning?: boolean;
    imageInput?: boolean;
  };
  maxInputTokens?: number;
  maxOutputTokens?: number;
  isUserSelectable?: boolean;
}
```

---

## 存储

| 存储          | 用途     | API                   |
| ------------- | -------- | --------------------- |
| Memento       | 配置     | `context.globalState` |
| SecretStorage | 敏感数据 | `context.secrets`     |

**存储键前缀**: `addi.*`
