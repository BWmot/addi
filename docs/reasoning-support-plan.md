# AI SDK Reasoning & Thinking Capabilities — 统一中间件架构方案

## 概述

Vercel AI SDK v6 提供了强大的 `LanguageModelV4Middleware` 机制，允许在 LLM 调用的请求/响应生命周期中注入自定义逻辑。本文档基于对以下资源的深度调研，提出 Addi 的统一 reasoning 中间件架构：

- **@ai-sdk/deepseek** 源码审计（message conversion、V4 多轮策略）
- **@ai-sdk/openai-compatible** 源码分析（schema 双字段支持）
- **extractReasoningMiddleware**（AI SDK Core 内置，~249 行）
- **DeepSeek Thinking Mode API 官方文档**（多轮规则、tool call 场景）
- **Xiaomi MiMo API 文档**（OpenAI 兼容、reasoning_content 回传规则）
- **AI SDK v6 官方文档**（wrapLanguageModel、LanguageModelV4Middleware 接口）

---

## 一、背景：三类模型的 reasoning 行为差异

### 1.1 DeepSeek R1（非 V4 模式）

| 特性 | 行为 |
|------|------|
| model ID | `deepseek-reasoner`（即将废弃）→ `deepseek-v4-flash` |
| reasoning 格式 | `reasoning_content` 字段（OpenAI 兼容） |
| 思考开关 | `extra_body: {thinking: {type: "enabled/disabled"}}` |
| 多轮无工具调用 | 历史 `reasoning_content` 可从 messages 中省略（API 忽略） |
| 多轮有工具调用 | 历史 `reasoning_content` **必须**回传（否则 400 错误） |
| @ai-sdk/deepseek 行为 | 非 V4：过滤掉最近一次 user 消息之前所有 assistant 的 reasoning |

### 1.2 DeepSeek V4（deepseek-v4-pro / deepseek-v4-flash）

| 特性 | 行为 |
|------|------|
| model ID | `deepseek-v4-pro`, `deepseek-v4-flash` |
| reasoning 格式 | `reasoning_content` 字段 |
| 思考开关 | `extra_body: {thinking: {type: "enabled"}}` + `reasoning_effort` |
| 多轮无工具调用 | 历史 `reasoning_content` 可省略（API 忽略） |
| 多轮有工具调用 | 历史 `reasoning_content` **必须**回传（否则 400 错误） |
| @ai-sdk/deepseek 行为 | V4：**保留所有** assistant 的 reasoning，且为空时 backfill `reasoning_content: ''` |

### 1.3 Xiaomi MiMo（小米大语言模型）

| 特性 | 行为 |
|------|------|
| model ID | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-pro`, `mimo-v2-omni`, `mimo-v2-flash` |
| reasoning 格式 | `reasoning_content` 字段（**完全** OpenAI 兼容） |
| 思考开关 | `thinking: {type: "enabled/disabled"}`（在 extra_body 中） |
| 多轮无工具调用 | 历史 `reasoning_content` 可省略 |
| 多轮有工具调用 | 历史 `reasoning_content` **必须**回传（否则 400 错误） |
| API 类型 | `openai-completions`（Addi 中 providerType 已配置） |

### 1.4 核心结论：三者对齐

> **所有三个模型系列在使用 `reasoning_content` 字段方面完全一致，**
> **多轮回传规则也完全一致（无工具调用→可省略，有工具调用→必须回传）。**
>
> 这意味着一个**统一的中间件**可以同时服务 DeepSeek R1、V4 和 MiMo。

---

## 二、当前架构的问题

### 2.1 问题 1：`messageConverter.ts` 字段名错误（Bug）

**文件**: `src/core/llm/messageConverter.ts:166`

```typescript
// ❌ 当前代码（错误）
content.push({ type: "reasoning", reasoning } as any);

// ✅ 正确代码（AI SDK v4 content part 规范要求字段名为 text）
content.push({ type: "reasoning", text: reasoning });
```

AI SDK v4 的 `CoreAssistantMessage` 中，`reasoning` part 的签名是 `{ type: "reasoning"; text: string; providerMetadata?: Record<string, Record<string, JSONValue>> }`，而非 `{ type: "reasoning"; reasoning: string }`。虽然 `as any` 避开了类型检查，但可能导致下游 SDK 序列化异常。

### 2.2 问题 2：`@ai-sdk/deepseek` 的 V4 backfill 策略过于保守

`@ai-sdk/deepseek` 的 `convertToDeepseekChatMessages()` 中，当 `isDeepSeekV4` 时，对**所有** assistant 消息都 backfill `reasoning_content: ''`。这虽然不会导致 400 错误（比实际需要的更保守），但对于不需要回传的场景（无工具调用）会浪费 token。

### 2.3 问题 3：`@ai-sdk/openai-compatible` 没有 V4 风格的 backfill

`@ai-sdk/openai-compatible` 在消息转换时，只会在 reasoning 存在时设置 `reasoning_content`，不会进行 V4 风格的 backfill。这意味着使用 `openai-completions` 类型连接 DeepSeek/MiMo 端点时，多轮工具调用后**可能触发 400 错误**。

### 2.4 问题 4：`llmService.ts` 的 DeepSeek 分支过于专用

```typescript
// llmService.ts 当前有专门针对 providerType === "deepseek" 的分支
if (providerType === "deepseek" && !providerOptions["deepseek"]) {
  providerOptions["deepseek"] = { thinking: { type: "enabled" } };
}
```

当 DeepSeek/MiMo 通过 `openai-completions` 访问时，这个分支不会被触发，导致 reasoning 需要手动的额外处理。

---

## 三、统一中间件架构设计

### 3.1 中间件名称

**最终名称**: `reasoningContentInjectMiddleware`

备选名称考虑：
| 名称 | 评价 |
|------|------|
| `reasoningContentInjectMiddleware` | ✅ 准确描述功能（注入 reasoning_content） |
| `reasoningContentMiddleware` | 可接受，但略模糊 |
| `deepseekReasoningMiddleware` | ❌ 不够通用（也用于 MiMo） |
| `thinkingContentInjector` | ❌ 与 AI SDK 的 "thinking" 术语混淆 |

### 3.2 设计决策：手动启用 vs 自动检测

**结论：采用模型级别的"实验性功能"手动开关，而非自动检测。**

#### 为什么不用自动检测？

| 方案 | 优点 | 缺点 |
|------|------|------|
| 🔴 自动检测（API URL + Model RID） | 零配置 | 误判风险（相同 model ID 跨供应商）、边界难覆盖、调试困难 |
| ✅ **手动开关（实验性功能）** | 用户完全可控、零误判、适合自定义模型 | 用户需知道何时开启 |

**关键问题**：从实际配置看，CSU 等第三方转发服务既有 DeepSeek 模型（需中间件），也有自己的模型（不需中间件），且 model ID 命名可能重叠（如 `deepseek-v3-thinking` vs `DeepSeek-V4-Flash`）。自动检测难以 100% 准确区分。

#### 用户交互方案

在模型编辑页面新增「实验性功能」折叠区，提供两个独立开关：

```
┌─ 实验性功能 ─────────────────────────────┐
│                                          │
│  ☐ 注入 reasoning_content 字段（多轮回传）  │
│    适用: DeepSeek/MiMo 等使用该 API 字段    │
│    的模型。启用后可正确处理多轮思考上下文。    │
│                                          │
│  ☐ 从 <think> 标签提取 reasoning 内容      │
│    适用: 某些模型将思考过程放在 <think>      │
│    标签中返回。启用后可自动提取并显示。       │
│                                          │
└──────────────────────────────────────────┘
```

**工作流程**：
1. 用户添加自定义模型 → 在"实验性功能"区勾选所需选项
2. `ModelConfig.options` 中新增 `reasoningContentInject` 和 `extractReasoningContent` 字段
3. `createModel()` 根据模型 options 决定是否包装中间件
4. 用户随时可以开关，修改立即生效

### 3.3 中间件配置（运行时）

两个独立中间件，各自拥有独立配置入口，由模型 options 控制：

```typescript
// ModelOptions 新增字段
interface ModelOptions {
  // ... existing fields ...

  /**
   * [实验性] 启用 reasoning_content 字段注入
   * 适用：DeepSeek V4/R1、MiMo 等使用 reasoning_content API 字段的模型
   * 启用后自动处理多轮 reasoning 内容的回传与 backfill
   */
  reasoningContentInject?: boolean;

  /**
   * [实验性] 从 <think> 标签提取 reasoning 内容
   * 适用：某些将思考过程放在 <think> 标签中返回的模型
   */
  extractReasoningContent?: boolean;
}
```

### 3.4 核心逻辑

中间件使用 `LanguageModelV4Middleware` 的三个钩子：

#### 3.4.1 `transformParams` — 请求侧：注入 reasoning_content

```typescript
transformParams: async ({ params }) => {
  const messages = params.prompt.map(msg => {
    if (msg.role !== 'assistant') return msg;

    const reasoningContent = extractReasoningFromParts(msg.content);

    return {
      ...msg,
      _reasoningContent: reasoningContent,
    };
  });

  // Apply V4 backfill logic:
  const processedMessages = v4StrictMode
    ? backfillAllReasoning(messages)
    : filterReasoningBeforeLastUser(messages);

  return { ...params, prompt: processedMessages };
};
```

对应的 `transformArgs` 用于在底层 provider 发送请求前，将 `_reasoningContent` 注入到 `reasoning_content` 字段。

#### 3.4.2 `wrapGenerate` — 响应侧：提取 reasoning（非流式）

```typescript
wrapGenerate: async ({ doGenerate }) => {
  const result = await doGenerate();
  const newText = extractReasoningFromResponse(result.text);
  return {
    ...result,
    text: newText,
    reasoning: result.reasoning,
  };
};
```

#### 3.4.3 `wrapStream` — 响应侧：提取 reasoning（流式）

使用 TransformStream 状态机模式：

```
state: 'reasoning' | 'text' | 'idle'
buffer: string[]
isFirstReasoning: boolean
isFirstText: boolean
```

- 流式读取 API 返回的 chunks
- 提取 `reasoning_content` 字段 → 输出为 `part.type === "reasoning"`
- 提取 `content` 字段 → 输出为 `part.type === "text"`
- 支持 think 标签模式（`<think>...</think>`）和 `reasoning_content` 字段模式

### 3.5 中间件工厂函数

```typescript
/**
 * 创建 reasoning_content 注入中间件
 * 
 * 此中间件由用户在模型编辑页面手动启用（实验性功能），
 * 而非自动检测。用户通过模型选项中的 reasoningContentInject 控制。
 */
function createReasoningContentInjectMiddleware(config: {
  v4StrictMode: boolean;   // 由 model.rid 判断后传入
  // 无需 apiUrlPattern / modelIdPattern — 用户手动控制
}): LanguageModelV4Middleware {
  // ...
}
```

---

## 四、集成点

### 4.1 `aiRegistry.ts` — 中间件条件包装（基于模型 options）

```typescript
// 在 createModel() 方法中，根据模型 options 中的实验性功能开关
// 决定是否包装中间件

createModel(provider: Provider, modelOrId: string | Model): LanguageModel {
  // ... 现有代码 ...

  const aiProviderInstance = factory.create(provider);
  let modelInstance = aiProviderInstance(modelId);

  // 获取模型 options（用户手动配置的实验性功能开关）
  const modelOptions = (typeof modelOrId === "object" ? modelOrId.options : undefined)
    ?? provider.models.find(m => m.rid === modelId || m.id === modelId)?.options;

  const middlewares: LanguageModelV4Middleware[] = [];

  // [实验性] reasoning_content 字段注入
  if (modelOptions?.reasoningContentInject) {
    const isV4Model = /deepseek-v4|mimo-v2/i.test(modelId);
    middlewares.push(
      createReasoningContentInjectMiddleware({
        v4StrictMode: isV4Model,
      }),
    );
  }

  // [实验性] <think> 标签提取
  if (modelOptions?.extractReasoningContent) {
    middlewares.push(
      extractReasoningMiddleware({
        tagName: "think",
        startWithReasoning: true,
      }),
    );
  }

  // 应用中间件链（如有）
  if (middlewares.length > 0) {
    modelInstance = wrapLanguageModel({
      model: modelInstance,
      // wrapLanguageModel 从右到左执行，因此按顺序推入即可
      middleware: middlewares,
      modelId,
      providerId: provider.providerType,
    });
  }

  return modelInstance;
}
```

> **为什么不是自动检测？** 见 3.2 节。手动开关方案避免了跨供应商 model ID 重叠导致的误判问题，让用户对自己添加的模型有完全控制权。

### 4.2 `llmService.ts` — 简化 DeepSeek 分支

中间件启用后，`llmService.ts` 中的 DeepSeek 专用分支可简化：

```typescript
// ❌ 当前：需要为 deepseek 单独设置 providerOptions
if (providerType === "deepseek" && !providerOptions["deepseek"]) {
  providerOptions["deepseek"] = { thinking: { type: "enabled" } };
}

// ✅ 中间件方案：中间件自动处理 reasoning_content
// 对于通过 openai-completions 访问的 DeepSeek/MiMo，只需
// 使用通用的 openai providerOptions
if (providerType === "openai-completions" && /* model is deepseek/mimo */) {
  providerOptions["openai"] = { reasoningEffort: "medium" };
}
```

### 4.3 `messageConverter.ts` — 修复字段名

```typescript
// ❌ 当前
content.push({ type: "reasoning", reasoning } as any);

// ✅ 修复后
content.push({ type: "reasoning", text: reasoning });
```

---

## 五、extractReasoningMiddleware 联合使用方案

### 5.1 extractReasoningMiddleware 是什么

AI SDK 内置的 `extractReasoningMiddleware`（来自 `ai` package，约 249 行）用于从生成文本中提取 XML 标签包裹的 reasoning 内容。它解决的是**内容格式**问题。

**函数签名**：
```typescript
extractReasoningMiddleware({
  tagName: string;         // 标签名，如 'think' → <think>...</think>
  separator?: string;      // reasoning 与 text 的分隔符，默认 '\n'
  startWithReasoning?: boolean; // 是否以 reasoning token 开头，默认 false
}): LanguageModelMiddleware
```

**工作原理**：
- `wrapGenerate`：用正则 `/<tagName>(.*?)<\/tagName>/gs` 从 `text` part 中提取 → 拆分为 `reasoning` part + `text` part
- `wrapStream`：用 TransformStream 状态机，buffer 扫描 `getPotentialStartIndex()`，按 `isReasoning`/`isFirstReasoning`/`isFirstText`/`afterSwitch` 状态输出 `reasoning-start`/`reasoning-delta`/`reasoning-end`/`text-start`/`text-delta`/`text-end` 事件

**适用场景**：某些模型（如 Fireworks QwQ、Mistral magistral）将 reasoning 直接放在 `<think>` 标签中输出在 `content` 字段里，而非使用专用的 `reasoning_content` API 字段。

### 5.2 是否需要引入 extractReasoningMiddleware

**结论：需要作为可选功能引入，但不强制启用。**

理由：
1. **当前目标模型（DeepSeek R1/V4、MiMo）本身不会输出 `<think>` 标签**，它们使用 `reasoning_content` API 字段
2. **但通过第三方转发（CSU 等）时**，某些模型（如 `deepseek-v3-thinking`、`DeepSeek-V4-Flash`）的响应格式可能因转发层的实现差异而包含 `<think>` 标签
3. **对于未来可能接入的、仅支持标签格式的模型**（如 QwQ、某些本地模型），`extractReasoningMiddleware` 是必要的补充
4. 使用 `wrapLanguageModel` 的中间件链**可以同时应用两个中间件**，互不冲突

### 5.3 中间件链方案

```typescript
// 使用中间件链：两个中间件按顺序应用
// 1. reasoningContentInjectMiddleware → 协议层（reasoning_content 字段）
// 2. extractReasoningMiddleware → 内容层（<think> 标签）
modelInstance = wrapLanguageModel({
  model: modelInstance,
  middleware: [
    reasoningContentInjectMiddleware({ ... }),
    extractReasoningMiddleware({ 
      tagName: 'think',          // 从 <think> 标签提取
      startWithReasoning: true,  // 某些模型省略开头标签
    }),
  ],
  modelId,
  providerId: provider.providerType,
});
```

**中间件链执行顺序**：
1. `reasoningContentInjectMiddleware` 先处理 `reasoning_content` 字段 → 转换为 `reasoning` part
2. `extractReasoningMiddleware` 再检查剩余的 `text` part 中是否有 `<think>` 标签
3. 任何未被 API 层捕获的 reasoning（遗漏在 `text` 中的标签内容）都会被二次提取

> **`wrapLanguageModel` 的中间件数组是从右向左执行的**，因此 `extractReasoningMiddleware` 放在数组最后（先执行），`reasoningContentInjectMiddleware` 放在前面（后执行，包裹外层）。

### 5.4 extractReasoningMiddleware 的启用策略

| 场景 | 推荐启用 reasoningContentInject | 推荐启用 extractReasoning |
|------|-------------------------------|--------------------------|
| DeepSeek 官方 API（`deepseek-v4-*`） | ✅ 建议用户开启 | ❌ 不开（官方直接用 reasoning_content） |
| MiMo 官方 API（`mimo-v2*`） | ✅ 建议用户开启 | ❌ 不开（官方直接用 reasoning_content） |
| 第三方转发 CSU（`deepseek-v3-thinking`） | 🟡 如遇多轮 400 错误则开启 | 🟡 如返回包含 `<think>` 标签则开启 |
| QwQ / 本地模型 | ❌ 不适用（无 reasoning_content 字段） | ✅ 建议用户开启 |

**推荐方案**：`extractReasoningMiddleware` 不由 `createModel()` 自动包装，而是通过模型编辑页面的「实验性功能」开关手动控制：
1. 在 `ModelOptions` 中新增 `extractReasoningContent` 布尔字段（见 3.2 节）
2. 用户需要时在模型编辑页面勾选 "从 `<think>` 标签提取 reasoning 内容"
3. `createModel()` 根据 `modelOptions.extractReasoningContent` 决定是否添加

### 5.5 两个中间件的对比

| 维度 | extractReasoningMiddleware | reasoningContentInjectMiddleware |
|------|--------------------------|-------------------------------|
| 来源 | `ai` package（内置） | Addi 自定义 |
| 作用域 | 内容层：`<think>` 标签提取 | 协议层：`reasoning_content` 字段注入/提取 |
| 多轮处理 | 不支持 | 支持（V4 backfill、过滤） |
| 自动检测 | 无（需手动配置 tagName） | 自动基于 API URL + Model RID 判断 |
| 适用场景 | 将 reasoning 放在 `content` 中的模型 | 使用 `reasoning_content` API 字段的模型 |
| 启用方式 | 用户按需配置 | 自动检测，零配置 |

---

## 六、已确认的发现与验证

### 6.1 DeepSeek 官方文档关键发现

| 发现项 | 描述 | 来源 |
|--------|------|------|
| V4 model ID | `deepseek-v4-pro`（替代即将废弃的 `deepseek-chat` 和 `deepseek-reasoner`） | DeepSeek API 首页 |
| 思考开关 | `extra_body: {thinking: {type: "enabled/disabled"}}` | Thinking Mode 文档 |
| reasoning 字段 | 返回 `reasoning_content`（与 `content` 同级） | Thinking Mode 文档 |
| 多轮-无工具调用 | `reasoning_content` 可省略（API 忽略） | Thinking Mode 文档 |
| 多轮-有工具调用 | `reasoning_content` **必须**回传（否则 400） | Thinking Mode 文档 |
| 推荐做法 | `messages.append(response.choices[0].message)` 自动保留所有字段 | Thinking Mode 文档 |
| deepseek-chat 废弃 | 2026/07/24 废弃，映射到 deepseek-v4-flash 的非思考模式 | API 首页 |
| deepseek-reasoner 废弃 | 2026/07/24 废弃，映射到 deepseek-v4-flash 的思考模式 | API 首页 |

### 6.2 MiMo 官方文档关键发现

| 发现项 | 描述 | 来源 |
|--------|------|------|
| API 格式 | 完全 OpenAI 兼容 | MiMo API 文档 |
| reasoning 字段 | `choices.message.reasoning_content`（非流式）| MiMo API 文档 |
| 流式字段 | `choices.delta.reasoning_content`（流式） | MiMo API 文档 |
| 思考开关 | `extra_body: {thinking: {type: "enabled/disabled"}}` | MiMo API 文档 |
| 多轮-无工具调用 | `reasoning_content` 可省略 | MiMo 公告 |
| 多轮-有工具调用 | `reasoning_content` **必须**回传（否则 400） | MiMo 公告 |
| 受影响模型 | V2.5-Pro, V2.5, V2-Pro, V2-Omni, V2-Flash | MiMo 公告 |
| 推荐做法 | `messages.append(assistant_message)` 自动保留 | MiMo 公告示例代码 |
| 不支持 thinking 的模型 | TTS 系列（mimo-v2.5-tts 等） | MiMo API 文档 |

### 6.3 设计一致性验证

| 设计决策 | DeepSeek 实际行为 | MiMo 实际行为 | 一致? |
|----------|-------------------|---------------|-------|
| 使用 `reasoning_content` 字段 | ✅ 官方文档确认 | ✅ 官方文档确认 | ✅ |
| 多轮无工具调用可省略 | ✅ 官方明确说明 | ✅ 官方明确说明 | ✅ |
| 多轮有工具调用必须回传 | ✅ 官方明确说明 | ✅ 官方明确说明 | ✅ |
| V4 backfill 空字符串 | ✅ 安全做法（虽略保守） | ✅ 安全做法 | ✅ |
| `extra_body.thinking` 控制 | ✅ 需在 extra_body 中 | ✅ 需在 extra_body 中 | ✅ |
| `reasoning_effort` 支持 | ✅ 支持 | ❌ 不支持（默认 enabled）| ⚠️ 由中间件配置控制 |

**结论**: 统一中间件架构与 DeepSeek 和 MiMo 的实际 API 行为完全一致。唯一差异是 MiMo 不支持 `reasoning_effort`（思考模式默认开启），这可通过中间件配置来控制。

---

## 七、实施路线图

### Phase 1: 修复 Bug（高优先级）

1. **修复 `messageConverter.ts`** 第 166 行的字段名错误
   - `{ type: "reasoning", reasoning }` → `{ type: "reasoning", text }`
   - 风险：低，单行修改
   - 测试：确保 `part.type === "reasoning"` 流式回传正确

### Phase 2: 实现统一中间件（核心）

1. **创建 `src/core/llm/reasoningContentInjectMiddleware.ts`**
   - 实现 `LanguageModelV4Middleware` 接口
   - 实现 `transformParams` 钩子（request 侧 reasoning_content 注入）
   - 实现 `wrapGenerate`/`wrapStream` 钩子（response 侧 reasoning 提取）
   - 实现 V4 strict mode backfill 逻辑
   - **无自动检测路由** — 中间件的启用由模型 options 控制（用户手动开关）

2. **中间件配置接口**
   ```typescript
   interface ReasoningContentInjectConfig {
     v4StrictMode?: boolean;    // 是否启用 V4 backfill（由 model.rid 判断）
     effortLevel?: 'low' | 'medium' | 'high'; // reasoning_effort
   }
   ```

### Phase 3: 集成到 Addi

1. **修改 `aiRegistry.ts`** — 在 `createModel()` 中自动包装中间件
2. **简化 `llmService.ts`** — 移除 DeepSeek 专用分支，统一使用 openai providerOptions
3. **修复 `messageConverter.ts`** — 字段名 bug 修复

### Phase 4: 测试验证

| 场景 | 期望行为 |
|------|----------|
| DeepSeek R1 + 单轮无工具 | ✅ reasoning 正确显示 |
| DeepSeek V4 + 单轮无工具 | ✅ reasoning 正确显示 |
| DeepSeek V4 + 多轮无工具 | ✅ 第二次请求无 400 错误 |
| DeepSeek V4 + 多轮有工具 | ✅ 第二次请求无 400 错误 |
| MiMo V2.5-Pro + 单轮无工具 | ✅ reasoning 正确显示 |
| MiMo V2.5-Pro + 多轮有工具 | ✅ 第二次请求无 400 错误 |
| OpenAI 标准模型 | ✅ 不受中间件影响（model ID 不匹配） |

### Phase 5: extractReasoningMiddleware 集成（实验性功能手动开关）

1. **模型配置扩展**：在 `ModelOptions` 中添加 `extractReasoningContent` 布尔字段
   ```typescript
   interface ModelOptions {
     // ...existing fields...
     reasoningContentInject?: boolean;  // [实验性] 见 Phase 2
     extractReasoningContent?: boolean; // [实验性] 用户手动开启
   }
   ```
2. **UI 展示**：在模型编辑页面的「实验性功能」折叠区添加复选框
3. **中间件链**：当 `options.extractReasoningContent` 为 `true` 时，`createModel()` 在 `reasoningContentInjectMiddleware` 链后追加 `extractReasoningMiddleware`
4. **适用于**：第三方转发模型（CSU 等）和仅支持标签格式的未来模型（QwQ 等）

### Phase 6: 后续优化

1. 支持 Anthropic 格式的 thinking 转换（通过 Anthropic 协议访问 DeepSeek 时）
2. 思考 token 用量统计与显示

---

## 八、技术参考

### 相关文件

| 文件 | 用途 |
|------|------|
| `src/core/llm/aiRegistry.ts` | Provider 注册、model 创建、中间件包装点 |
| `src/core/llm/llmService.ts` | LLM 调用编排、providerOptions 注入 |
| `src/core/llm/messageConverter.ts` | VS Code ↔ AI SDK 消息转换（含 bug） |
| `src/common/types/config.ts` | Model 类型定义（capabilities.reasoning） |
| `src/core/llm/reasoningContentInjectMiddleware.ts` | **新建** — 统一中间件实现 |
| `docs/ai-sdk-reference.md` | AI SDK 接口参考 |

### 外部参考

- [AI SDK: LanguageModelV4Middleware](https://ai-sdk.dev/docs/reference/ai-sdk-core/language-model-v4-middleware)
- [AI SDK: wrapLanguageModel](https://ai-sdk.dev/docs/reference/ai-sdk-core/wrap-language-model)
- [DeepSeek Thinking Mode API](https://api-docs.deepseek.com/guides/thinking_mode)
- [Xiaomi MiMo API 文档](https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api)
- [extractReasoningMiddleware 源码](https://github.com/vercel/ai/blob/main/packages/core/src/util/extract-reasoning-middleware.ts)
- [@ai-sdk/deepseek 源码](https://github.com/vercel/ai/tree/main/packages/deepseek)
- [@ai-sdk/openai-compatible 源码](https://github.com/vercel/ai/tree/main/packages/openai-compatible)
