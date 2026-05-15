# AI SDK Reasoning 数据流审计 — 改进清单与执行计划

> **审计时间**: 2026-05-15  
> **审计范围**: AI SDK v6 全链路 `reasoning_content` / `reasoning-delta` 数据流  
> **审计文件**:
> - `node_modules/@ai-sdk/openai-compatible/dist/index.mjs` — Provider 层
> - `node_modules/ai/dist/index.mjs` — Core SDK 层（createOutputTransformStream、fullStream、extractReasoningMiddleware）
> - `src/core/llm/llmService.ts` — Addi 流式/非流式执行引擎
> - `src/core/llm/reasoningUtils.ts` — 推理内容提取工具
> - `src/core/llm/reasoningContentAdaptMiddleware.ts` — reasoning_content 适配中间件
> - `src/core/llm/aiRegistry.ts` — 模型工厂与中间件链
> - `src/core/llm/messageConverter.ts` — VS Code ↔ AI SDK 消息转换

---

## 目录

- [AI SDK Reasoning 数据流审计 — 改进清单与执行计划](#ai-sdk-reasoning-数据流审计--改进清单与执行计划)
  - [目录](#目录)
  - [一、概述](#一概述)
    - [1.1 审计结论摘要](#11-审计结论摘要)
    - [1.2 数据流总图](#12-数据流总图)
  - [二、问题清单](#二问题清单)
    - [P0-01: 工具调用轮次 reasoning\_content backfill 策略错误](#p0-01-工具调用轮次-reasoning_content-backfill-策略错误)
      - [问题描述](#问题描述)
      - [修复方案](#修复方案)
      - [设计依据](#设计依据)
      - [验证方法](#验证方法)
    - [P0-02: fromAiCoreMessage 丢失 LanguageModelThinkingPart](#p0-02-fromaicoremessage-丢失-languagemodelthinkingpart)
      - [问题描述](#问题描述-1)
      - [修复方案](#修复方案-1)
      - [验证方法](#验证方法-1)
    - [P1-01: hasStreamPartVisibleContent 缺少 delta 防御性检查](#p1-01-hasstreampartvisiblecontent-缺少-delta-防御性检查)
      - [问题描述](#问题描述-2)
      - [修复方案](#修复方案-2)
      - [验证方法](#验证方法-2)
    - [P1-02: reasoning-part-finish 死代码](#p1-02-reasoning-part-finish-死代码)
      - [问题描述](#问题描述-3)
      - [修复方案](#修复方案-3)
      - [验证方法](#验证方法-3)
    - [P2-01: reasoningContentAdaptMiddleware wrapStream/wrapGenerate 纯透传](#p2-01-reasoningcontentadaptmiddleware-wrapstreamwrapgenerate-纯透传)
      - [问题描述](#问题描述-4)
      - [修复方案](#修复方案-4)
    - [P2-02: buildAiOptions providerOptions 重复逻辑](#p2-02-buildaioptions-provideroptions-重复逻辑)
      - [问题描述](#问题描述-5)
      - [修复方案](#修复方案-5)
    - [P3-01: extractReasoningMiddleware 与原生 reasoning 重复风险](#p3-01-extractreasoningmiddleware-与原生-reasoning-重复风险)
      - [问题描述](#问题描述-6)
      - [修复方案（初步构想）](#修复方案初步构想)
    - [P3-02: fromAiCoreMessage 仅处理单层 content](#p3-02-fromaicoremessage-仅处理单层-content)
      - [问题描述](#问题描述-7)
  - [三、执行计划](#三执行计划)
    - [Phase 1 — 关键修复（P0）](#phase-1--关键修复p0)
    - [Phase 2 — 代码健壮性（P1）](#phase-2--代码健壮性p1)
    - [Phase 3 — 架构优化（P2）](#phase-3--架构优化p2)
    - [Phase 4 — 远期规划（P3）](#phase-4--远期规划p3)
  - [四、验收标准](#四验收标准)
    - [4.1 流式多轮对话测试](#41-流式多轮对话测试)
    - [4.2 非流式多轮对话测试](#42-非流式多轮对话测试)
    - [4.3 混合场景测试](#43-混合场景测试)
  - [五、附录](#五附录)
    - [5.1 AI SDK 数据流关键节点速查](#51-ai-sdk-数据流关键节点速查)
    - [5.2 术语表](#52-术语表)

---

## 一、概述

### 1.1 审计结论摘要

| 维度             | 结论                                                             |
| ---------------- | ---------------------------------------------------------------- |
| 流式 reasoning   | ✅ `handleThinkingDelta` 使用 `part.text ?? part.delta` 正确      |
| 非流式 reasoning | ✅ `extractReasoningContentFromStep` 正确处理所有字段格式         |
| 多轮回传 backfill | ⚠️ **P0-01**: 工具调用轮次可能 400（空字符串策略错误）           |
| 消息反向转换     | ⚠️ **P0-02**: `fromAiCoreMessage` 丢弃 reasoning 内容            |
| 中间件链顺序     | ✅ `wrapLanguageModel` reverse+reduceRight 保证 v3 包裹 v4        |
| 日志可见性       | ✅ `hasStreamPartVisibleContent` 推理部分通过 `text` 字段判断     |

### 1.2 数据流总图

```
                          ┌───────────────────────────────────┐
                          │         AI SDK Core               │
                          │  createOutputTransformStream      │
  ┌──────────────┐        │  ┌─────────────────────────────┐  │        ┌──────────────────┐
  │  DeepSeek API │───────┼─▶│ delta → text  (L~7429)     │──┼───────▶│   fullStream     │
  │  reasoning_   │ delta │  │ { delta } → { text }        │  │ text   │   Consumer       │
  │  content      │       │  └─────────────────────────────┘  │        │                  │
  └──────────────┘        │  ┌─────────────────────────────┐  │        │ part.text         │
                          │  │ extractReasoningMiddleware  │──┼───────▶│   ?? part.delta   │
                          │  │ <think> 提取, emits  delta  │  │        │                  │
                          │  └─────────────────────────────┘  │        └────────┬─────────┘
                          │  ┌─────────────────────────────┐  │               │
                          │  │ reasoningContentAdapt       │──┼───────────────┤
                          │  │ (v3, 包裹上述)              │  │  pass-through │
                          │  └─────────────────────────────┘  │               ▼
                          │                                   │        ┌──────────────────┐
                          │  wrapLanguageModel                 │        │  VS Code         │
                          │  .reverse().reduceRight()          │        │  LanguageModel-  │
                          └───────────────────────────────────┘        │  ThinkingPart    │
                                                                       └──────────────────┘
```

---

## 二、问题清单

### P0-01: 工具调用轮次 reasoning_content backfill 策略错误

| 字段             | 值                                                          |
| ---------------- | ----------------------------------------------------------- |
| **风险等级**     | 🔴 **P0 — 关键**                                           |
| **位置**         | `src/core/llm/reasoningContentAdaptMiddleware.ts` L~235     |
| **影响范围**     | DeepSeek 多轮对话中带工具调用时报 400                       |
| **发现难度**     | ⭐⭐ 中等 — 需要理解 DeepSeek API 回传规则 + AI SDK converter 逻辑 |

#### 问题描述

1. **backfill 范围太宽**：`transformParams` 对所有 provider 类型统一执行 backfill，
   但只有 `openai-completions`（通过 `@ai-sdk/openai-compatible`）使用 `reasoning_content` 协议。
   `openai-responses`、`anthropic-messages`、`google-generateContent` 各自有独立的 reasoning 机制，
   不应该注入 `type: "reasoning"` part。

2. **backfill 值错误**：对**所有**缺少 `type: "reasoning"` part 的 assistant 消息统一注入空字符串 `""`：

   ```typescript
   const reasoningPart: LanguageModelV3ReasoningPart = {
     type: "reasoning",
     text: "",   // <-- 空字符串
   };
   ```

   在 `@ai-sdk/openai-compatible` 的 `convertToChatMessages` 中，`text: ""` 导致 `reasoning.length > 0` 为 `false`，
   因此**永远不会输出 `reasoning_content` 字段**。

   然而 DeepSeek Thinking Mode API 要求：**有工具调用的轮次必须回传 `reasoning_content`**（否则 400）。
   当前策略对有工具调用的消息也注入空字符串，无法满足此要求。

#### 修复方案

**改动一：Provider 类型守卫** — `createReasoningContentAdaptMiddleware` 接收 `providerType`，
仅当 `providerType === "openai-completions"` 时执行 `transformParams` backfill：

```typescript
// reasoningContentAdaptMiddleware.ts
export function createReasoningContentAdaptMiddleware(
  providerType?: string,
): LanguageModelMiddleware {
  const isOpenAICompatible = providerType === "openai-completions";

  transformParams: async ({ params }) => {
    // ─── Provider 类型守卫 ──────────────────────────────────────────
    // 仅对 openai-compatible 类 provider 执行 reasoning_content backfill。
    if (!isOpenAICompatible) {
      return params;
    }
    // ... backfill 逻辑 ...
  };
}

// aiRegistry.ts — 传入 providerType
middlewares.push(createReasoningContentAdaptMiddleware(provider.providerType));
```

**改动二：backfill text 差异化** — 有/无工具调用用不同的 text：

```typescript
// Before:
const reasoningPart: LanguageModelV3ReasoningPart = {
  type: "reasoning",
  text: "",   // 统一空字符串 → 永远不输出 reasoning_content
};

// After:
const reasoningText = hasToolCalls ? " " : "";
//                     ^^^^^^^^^^^^^^^^^^^^^^
//   - 有工具调用 → 空格 " "   → AI SDK 输出 reasoning_content → API 不会拒绝
//   - 无工具调用 → 空字符串 "" → AI SDK 跳过 reasoning_content → 减少多余请求体
const reasoningPart: LanguageModelV3ReasoningPart = {
  type: "reasoning",
  text: reasoningText,
};
```

#### 设计依据

`reasoning_content` 是 OpenAI Chat Completions API 的扩展字段（由 DeepSeek 率先实现）。
只有使用 `openai-completions` 类型 + 自定义端点的 provider（底层 → `@ai-sdk/openai-compatible`）
的 `convertToChatMessages` 中有 `case 'reasoning'` 分支处理此字段。

其他 provider 类型：
| Provider 类型       | reasoning 机制             | 是否需要 backfill |
|--------------------|---------------------------|-------------------|
| `openai-completions` | `reasoning_content` 字段 | ✅ 是（此 P0） |
| `openai-responses`   | 原生 `reasoningEffort`   | ❌ 否 |
| `anthropic-messages` | extended thinking        | ❌ 否 |
| `google-generateContent` | 自有协议             | ❌ 否 |

#### 验证方法

1. 启动带 `reasoningContentAdapt` 的 DeepSeek 模型
2. 发起多轮对话，至少一轮包含工具调用
3. 确认 WireShark / 日志中第二轮请求包含 `reasoning_content` 字段
4. 确认 API 返回 200 而非 400
5. 对 `openai-responses` / `anthropic-messages` 类型模型启用 `reasoningContentAdapt`，
   确认不触发 backfill 日志

---

### P0-02: fromAiCoreMessage 丢失 LanguageModelThinkingPart

| 字段             | 值                                                              |
| ---------------- | --------------------------------------------------------------- |
| **风险等级**     | 🔴 **P0 — 关键**                                               |
| **位置**         | `src/core/llm/messageConverter.ts` L~208-230                    |
| **影响范围**     | 聊天历史保存/恢复时推理内容丢失                                 |
| **发现难度**     | ⭐ 简单 — 代码明确跳过了所有非 `text` 类型                     |

#### 问题描述

`fromAiCoreMessage` 只处理 `type === "text"` 的内容部分，对 `type: "reasoning"` 的部分静默跳过：

```typescript
const parts: vscode.LanguageModelTextPart[] = [];

for (const part of message.content) {
  if (part.type === "text") {
    parts.push(new vscode.LanguageModelTextPart(part.text));
  }
  // 注意：反向转换时，tool-call 和 reasoning 通常需要特殊处理
  // 这里简化处理，仅转换文本部分
}
```

此外，该函数的返回类型是 `vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2`，但后者支持混合内容 (parts)，前者不支持。当前没有做版本路由。

#### 修复方案

```typescript
// fromAiCoreMessage 改进:
// 1. 检查 LanguageModelChatMessage2 是否可用
// 2. 检查 LanguageModelThinkingPart 是否可用
// 3. 根据可用性路由到不同路径

const useChatMessage2 = "LanguageModelChatMessage2" in vscode;
const hasThinkingSupport = "LanguageModelThinkingPart" in vscode;

// 构建一个支持所有 part 类型的数组
const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelThinkingPart)[] = [];

for (const part of message.content) {
  if (part.type === "text") {
    parts.push(new vscode.LanguageModelTextPart(part.text));
  } else if (part.type === "reasoning" && hasThinkingSupport) {
    parts.push(new vscode.LanguageModelThinkingPart(part.text));
  }
  // tool-call parts 需要更复杂的处理，暂略
}
```

#### 验证方法

1. 调用支持 reasoning 的模型，获取含推理内容的响应
2. 将 AI SDK 消息通过 `fromAiCoreMessage` 转换
3. 确认输出的 VS Code 消息包含 `LanguageModelThinkingPart`

---

### P1-01: hasStreamPartVisibleContent 缺少 delta 防御性检查

| 字段             | 值                                                              |
| ---------------- | --------------------------------------------------------------- |
| **风险等级**     | 🟡 **P1 — 中等**                                               |
| **位置**         | `src/core/llm/reasoningUtils.ts` L~13-15                        |
| **影响范围**     | 仅在特定上下文切换时可能误判                                     |
| **发现难度**     | ⭐ 简单 — 与 `handleThinkingDelta` 的防御性设计不一致           |

#### 问题描述

`hasStreamPartVisibleContent` 只检查 `candidate["text"]`，而 `handleThinkingDelta` 使用 `part.text ?? part.delta`。两者防御策略不一致：

```typescript
// reasoningUtils.ts — 只检查 text:
case "reasoning-delta":
  return typeof candidate["text"] === "string" && candidate["text"].length > 0;

// llmService.ts — 同时检查 text 和 delta:
const text = part.text ?? part.delta;
```

虽然在 `fullStream` 上下文中总是 `text` 属性，但如果代码未来在 v4 stream 上下文（原始 provider 输出，使用 `delta`）中使用此函数，会错误将 reasoning 内容判定为不可见。

#### 修复方案

```typescript
case "reasoning-delta": {
  const text = candidate["text"] ?? candidate["delta"];
  return typeof text === "string" && text.length > 0;
}
```

#### 验证方法

- 代码审查确认改动正确
- 无功能性影响（当前所有调用方都使用 fullStream）

---

### P1-02: reasoning-part-finish 死代码

| 字段             | 值                                                            |
| ---------------- | ------------------------------------------------------------- |
| **风险等级**     | 🟡 **P1 — 中等**                                             |
| **位置**         | `src/core/llm/llmService.ts` L~747-749                        |
| **影响范围**     | 无（死代码）                                                   |
| **发现难度**     | ⭐ 简单 — AI SDK 从不发出此类型                                |

#### 问题描述

`processResponsePart` 注册了 `reasoning-part-finish` 处理器，但 AI SDK 的 `fullStream` 从不发出此 stream part 类型。经源代码验证（`ai/dist/index.mjs` 全文搜索），没有任何 emit `reasoning-part-finish` 的代码路径。这是一个永远不会执行的空函数。

#### 修复方案

```typescript
// 删除以下代码块:
"reasoning-part-finish": () => {
  // Part finished silently
},
```

或将 reasoning 结束逻辑移至 `finish` 处理器的 reasoning 相关分支。

#### 验证方法

- 代码审查
- 确认 `finish` 事件仍能正常触发 reasoning 结束逻辑（如有）

---

### P2-01: reasoningContentAdaptMiddleware wrapStream/wrapGenerate 纯透传

| 字段             | 值                                                              |
| ---------------- | --------------------------------------------------------------- |
| **风险等级**     | 🟢 **P2 — 建议改进**                                           |
| **位置**         | `src/core/llm/reasoningContentAdaptMiddleware.ts` L~285-315     |
| **影响范围**     | 代码可维护性、中间件名称与行为的一致性                           |
| **发现难度**     | ⭐⭐ 中等 — 需要理解中间件设计意图                               |

#### 问题描述

`wrapStream` 和 `wrapGenerate` 当前是纯透传：

```typescript
wrapStream: async ({ doStream }) => {
  return doStream();
},
wrapGenerate: async ({ doGenerate }) => {
  return doGenerate();
},
```

中间件名称中的 "Adapt"（适配）与现实行为不匹配。虽然当前 `@ai-sdk/openai-compatible` 已经正确处理 reasoning_content，但这使中间件实际上只做了请求侧 backfill（`transformParams`），响应侧没有做任何适配。

#### 修复方案

**Option A（推荐）**: 为 `wrapStream` 添加日志包装，使其在 "透传" 的同时提供可观测性：

```typescript
wrapStream: async ({ doStream }) => {
  const stream = await doStream();
  // wrapStream 当前为透传，因为 @ai-sdk/openai-compatible 已正确处理
  // reasoning_content → reasoning-delta 转换。如需添加适配逻辑，
  // 可将 stream 通过额外的 TransformStream 处理。
  return stream;
},
```

**Option B**: 移除两个空钩子，仅保留 `transformParams` + `specificationVersion`，重命名为 `reasoningContentBackfillMiddleware`。

---

### P2-02: buildAiOptions providerOptions 重复逻辑

| 字段             | 值                                                          |
| ---------------- | ----------------------------------------------------------- |
| **风险等级**     | 🟢 **P2 — 建议改进**                                       |
| **位置**         | `src/core/llm/llmService.ts` L~295-420                      |
| **影响范围**     | 代码可维护性、扩展新 provider 时需要修改多处                  |
| **发现难度**     | ⭐ 简单 — 明显的 if/else 重复模式                           |

#### 问题描述

`buildAiOptions` 中 `reasoningEffort` 映射逻辑对每个 provider 类型（`openai-responses`、`openai-completions`、`anthropic-messages`、`google-generateContent`）都有独立的 `if` 块，且每个块内又有额外的嵌套条件。代码高度重复：

```typescript
// OpenAI (/responses)
if (providerType === "openai-responses" && !providerOptions["openai"]) {
  providerOptions["openai"] = { reasoningEffort: effort };
}
// openai-completions
if (providerType === "openai-completions" && !providerOptions[openaiCompatibleKey]) {
  providerOptions[openaiCompatibleKey] = { reasoningEffort: effort };
}
// Anthropic
if (providerType === "anthropic-messages" && !providerOptions["anthropic"]) {
  providerOptions["anthropic"] = { thinking: { type: "enabled", budgetTokens: ... } };
}
// Google
if (providerType === "google-generateContent" && !providerOptions["google"]) {
  providerOptions["google"] = { thinkingConfig: { thinkingBudget: ... } };
}
```

#### 修复方案

提取为配置表：

```typescript
type EffortMapper = {
  key: string | ((isNative: boolean) => string);
  buildOptions: (effort: string, model: Model) => Record<string, unknown>;
};

const EFFORT_MAPPERS: Record<string, EffortMapper> = {
  "openai-responses": {
    key: "openai",
    buildOptions: (effort) => ({ reasoningEffort: effort }),
  },
  "openai-completions": {
    key: (isNative) => isNative ? "openai" : "openaiProxy",
    buildOptions: (effort) => ({ reasoningEffort: effort }),
  },
  "anthropic-messages": {
    key: "anthropic",
    buildOptions: (effort) => ({
      thinking: {
        type: "enabled",
        budgetTokens: { low: 1024, medium: 4096, high: 8192 }[effort] ?? 4096,
      },
    }),
  },
  "google-generateContent": {
    key: "google",
    buildOptions: (effort) => ({
      thinkingConfig: {
        thinkingBudget: { low: 1024, medium: 4096, high: 8192 }[effort] ?? 4096,
        includeThoughts: true,
      },
    }),
  },
};
```

---

### P3-01: extractReasoningMiddleware 与原生 reasoning 重复风险

| 字段             | 值                                                              |
| ---------------- | --------------------------------------------------------------- |
| **风险等级**     | 🔵 **P3 — 远期规划**                                           |
| **位置**         | `src/core/llm/aiRegistry.ts` L~320-330 + `llmService.ts` L~770  |
| **影响范围**     | UI 显示重复的思考内容                                            |
| **发现难度**     | ⭐⭐⭐ 高 — 依赖具体模型行为，难以自动检测                        |

#### 问题描述

当**同时启用** `extractReasoningContent`（提取 `<think>` 标签）和 `reasoningContentAdapt`（处理 `reasoning_content`）时，如果一个模型**同时**：
1. 通过 `reasoning_content` API 字段返回推理内容（被 `@ai-sdk/openai-compatible` 转为 `reasoning-delta`）
2. 在 `text` 输出中也包含 `<think>` 标签（被 `extractReasoningMiddleware` 转为另一个 `reasoning-delta`）

则用户会看到**重复的思考内容**。

当前 `processResponsePart` 没有针对这种双重触发做任何去重。

#### 修复方案（初步构想）

在 `handleThinkingDelta` 中添加**内容哈希去重**：

```typescript
private handleThinkingDelta(
  part: any,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  options: ExecutionOptions,
): void {
  const text = part.text ?? part.delta;
  if (!text) return;

  // 简单的去重：如果文本与上一个 delta 相同，跳过
  // （注：这仅是一个初步方案，需要根据实际模型行为调整）
  if (this._lastReasoningDelta === text) return;
  this._lastReasoningDelta = text;

  this.reportReasoning(text, part, progress, options);
}
```

> **注意**: 此问题需要在特定模型上复现后才能确认是否需要修复。

---

### P3-02: fromAiCoreMessage 仅处理单层 content

| 字段             | 值                                                              |
| ---------------- | --------------------------------------------------------------- |
| **风险等级**     | 🔵 **P3 — 远期规划**                                           |
| **位置**         | `src/core/llm/messageConverter.ts` L~200                        |
| **影响范围**     | 嵌套内容丢失                                                     |
| **发现难度**     | ⭐⭐ 中等                                                        |

#### 问题描述

`fromAiCoreMessage` 假设 `message.content` 是 `string` 或 `ContentPart[]`，但实际上 AI SDK 的 `AssistantModelMessage.content` 可以是：
- `string` ✅ 已处理
- `Array<TextPart | FilePart | ReasoningPart | ToolCallPart>` ⚠️ 只处理了 `TextPart`

但 `UserModelMessage.content` 可以是
- `string` ✅
- `Array<TextPart | ImagePart | FilePart>` ⚠️ 未区分处理

目前未造成实际影响，因为 `fromAiCoreMessage` 的使用场景有限。

---

## 三、执行计划

### Phase 1 — 关键修复（P0）

| #     | 问题     | 文件                                              | 改动量   | 预估工时 | 依赖 |
| ----- | -------- | ------------------------------------------------- | -------- | -------- | ---- |
| P0-01 | Backfill | `reasoningContentAdaptMiddleware.ts` + `aiRegistry.ts` | ~15 行 | 20 min   | 无   |
| P0-02 | 消息转换 | `messageConverter.ts`                             | ~10 行   | 30 min   | 无   |

> **P0-01 扩充说明**（2026-05-15）：修复范围从"1 行 text 值"扩展为：
> 1. 中间件工厂接收 `providerType` 参数，`transformParams` 仅对 `openai-completions` 类型执行 backfill
> 2. backfill text 值差异化：有工具调用 → `" "`（空格），无工具调用 → `""`（空字符串）
> 3. `aiRegistry.ts` 传入 `provider.providerType`

**执行顺序**: P0-01 → P0-02（无依赖关系，可并行）

**验证**: 见第四章验收标准。

### Phase 2 — 代码健壮性（P1）

| #     | 问题         | 文件                        | 改动量 | 预估工时 | 依赖       |
| ----- | ------------ | --------------------------- | ------ | -------- | ---------- |
| P1-01 | delta fallback | `reasoningUtils.ts`        | 3 行   | 5 min    | 无         |
| P1-02 | 死代码       | `llmService.ts`             | 3 行   | 5 min    | 无         |

**执行顺序**: 并行，无依赖。

### Phase 3 — 架构优化（P2）

| #     | 问题           | 文件              | 改动量 | 预估工时 | 依赖   |
| ----- | -------------- | ----------------- | ------ | -------- | ------ |
| P2-01 | 中间件透传     | `reasoningContentAdaptMiddleware.ts` | ~10 行 | 20 min | P0-01 后 |
| P2-02 | providerOptions | `llmService.ts`   | ~50 行 | 45 min  | 无     |

### Phase 4 — 远期规划（P3）

| #     | 问题         | 文件          | 改动量 | 预估工时 | 依赖       |
| ----- | ------------ | ------------- | ------ | -------- | ---------- |
| P3-01 | 重复推理     | `llmService.ts` | ~5 行 | 30 min | 需要复现确认 |
| P3-02 | 嵌套内容     | `messageConverter.ts` | ~15 行 | 30 min | P0-02 后 |

---

## 四、验收标准

### 4.1 流式多轮对话测试

| #   | 测试场景                               | 预期结果                               | 涉及问题  |
| --- | -------------------------------------- | -------------------------------------- | --------- |
| T1  | DeepSeek（openai-completions）不带工具调用的多轮对话 | 每轮都显示思考内容，API 返回 200，日志可见 `reasoning_filling_fallback` | P0-01 |
| T2  | DeepSeek（openai-completions）带工具调用的多轮对话   | 工具调用轮次请求体包含 `reasoning_content`，API 返回 200               | P0-01 |
| T3  | openai-responses 启用 reasoningContentAdapt         | `transformParams` 直接透传，日志无 fallback 记录                       | P0-01 |
| T4  | 流式响应全遍历                         | 所有 `reasoning-delta` 被正确处理      | —         |

### 4.2 非流式多轮对话测试

| #   | 测试场景                               | 预期结果                               | 涉及问题  |
| --- | -------------------------------------- | -------------------------------------- | --------- |
| T4  | 非流式 generateText + reasoning        | `processReasoning` 正确提取思考内容     | —         |
| T5  | AI SDK → VS Code 消息转换              | `fromAiCoreMessage` 保留推理内容       | P0-02     |

### 4.3 混合场景测试

| #   | 测试场景                               | 预期结果                               | 涉及问题  |
| --- | -------------------------------------- | -------------------------------------- | --------- |
| T6  | extractReasoningContent + reasoningContentAdapt 同时启用 | 不出现重复思考内容 | P3-01 |

---

## 五、附录

### 5.1 AI SDK 数据流关键节点速查

| 层级             | 文件/函数                                    | `reasoning-delta` 属性        | 经过转换          |
| ---------------- | -------------------------------------------- | ----------------------------- | ----------------- |
| Provider         | `@ai-sdk/openai-compatible` `doStream`       | `{ delta: string }`           | 原始 SSE 解析     |
| Provider         | `@ai-sdk/openai-compatible` `doGenerate`     | 返回 `{ reasoning }` top-level | —                 |
| Core SDK         | `ai/dist/index.mjs` `createOutputTransformStream` L~7429 | `{ delta }` → `{ text }` | ✅ **关键转换点** |
| Core SDK         | `ai/dist/index.mjs` fullStream consumer      | 使用 `part.text`              | 已转换            |
| Core SDK         | `ai/dist/index.mjs` extractReasoningMiddleware | emit `{ delta: text }`       | v4 raw level      |
| Core SDK         | `ai/dist/index.mjs` 反向转换（L~7937）       | `part.text` → `{ delta }`     | generateText → stream |
| Addi             | `llmService.ts` `handleThinkingDelta`        | `part.text ?? part.delta`     | ✅ 防御性处理     |
| Addi             | `reasoningUtils.ts` `hasStreamPartVisibleContent` | 仅 `candidate["text"]` | ⚠️ 缺少 fallback  |
| VS Code          | `LanguageModelThinkingPart`                  | 构造时传入 `value`             | 终端展示          |

### 5.2 术语表

| 术语                    | 说明                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `reasoning_content`     | DeepSeek/OpenAI API 返回的推理内容字段（非流式/流式 delta）    |
| `reasoning-delta`       | AI SDK v4 stream part 类型，表示推理内容增量                   |
| `LanguageModelThinkingPart` | VS Code API，用于在聊天 UI 中展示推理/思考内容              |
| `createOutputTransformStream` | AI SDK Core 中转换 provider chunk 到 consumer part 的流转换器 |
| `extractReasoningMiddleware` | AI SDK 内置中间件，从 `<think>` 标签提取推理内容              |
| `reasoningContentAdaptMiddleware` | Addi 自定义中间件，处理 `reasoning_content` 字段双向适配     |
| `backfill`              | 在历史消息中注入缺失的 `reasoning` part 以符合 API 要求        |
| `convertToChatMessages` | `@ai-sdk/openai-compatible` 中 ModelMessage → API message 的转换器 |

---

> **文档维护**: 每次 Phase 完成后更新本文档的状态。  
> **审计更新**: 当 AI SDK 或 `@ai-sdk/openai` 版本更新时，重新验证 `reasoning_content` schema 丢失问题。
