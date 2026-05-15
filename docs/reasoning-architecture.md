# Reasoning 统一中间件架构参考

> 本文档定义 Addi 的 reasoning/thinking 内容处理架构，涵盖中间件设计、Provider 行为差异及集成约束。

---

## 一、Provider reasoning 行为参考

### 1.1 DeepSeek（OpenAI 兼容）

| 特性                   | 行为                                                           |
| ---------------------- | -------------------------------------------------------------- |
| ProviderType           | `openai-completions`                                           |
| reasoning 格式         | `reasoning_content` 字段（与 `content` 同级）                  |
| 思考开关               | `extra_body: {thinking: {type: "enabled/disabled"}}`           |
| 多轮无工具调用         | 历史 `reasoning_content` 可省略（API 忽略）                    |
| 多轮有工具调用         | `reasoning_content` **必须**回传（否则 400 错误）              |

### 1.2 Xiaomi MiMo

| 特性           | 行为                                                             |
| -------------- | ---------------------------------------------------------------- |
| ProviderType   | `openai-completions`                                             |
| reasoning 格式 | `reasoning_content` 字段（完全 OpenAI 兼容）                     |
| 思考开关       | `thinking: {type: "enabled/disabled"}`（在 `extra_body` 中）     |
| 多轮无工具调用 | 历史 `reasoning_content` 可省略                                  |
| 多轮有工具调用 | `reasoning_content` **必须**回传（否则 400 错误）                |

### 1.3 核心结论

> 所有使用 `reasoning_content` 字段的模型系列在多轮回传规则上完全一致：
> **无工具调用 → 可省略，有工具调用 → 必须回传**。
> 这意味着一个统一的中间件可以同时服务 DeepSeek、MiMo 等模型。

## 二、统一中间件架构设计

### 3.1 中间件名称

**最终名称**: `reasoningContentAdaptMiddleware`

备选名称考虑：
| 名称 | 评价 |
|------|------|
| `reasoningContentAdaptMiddleware` | ✅ 准确描述功能（双向适配 reasoning_content） |
| `reasoningContentMiddleware` | 可接受，但略模糊 |
| `deepseekReasoningMiddleware` | ❌ 不够通用（也用于 MiMo） |
| `thinkingContentInjector` | ❌ 与 AI SDK 的 "thinking" 术语混淆 |

### 3.2 设计决策：手动启用 vs 自动检测

**结论：采用模型级别的"实验性功能"手动开关，而非自动检测。**

#### 为什么不用自动检测？

| 方案                               | 优点                                 | 缺点                                                     |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| 🔴 自动检测（API URL + Model RID） | 零配置                               | 误判风险（相同 model ID 跨供应商）、边界难覆盖、调试困难 |
| ✅ **手动开关（实验性功能）**      | 用户完全可控、零误判、适合自定义模型 | 用户需知道何时开启                                       |

**关键问题**：从实际配置看，CSU 等第三方转发服务既有 DeepSeek 模型（需中间件），也有自己的模型（不需中间件），且 model ID 命名可能重叠（如 `deepseek-v3-thinking` vs `DeepSeek-V4-Flash`）。自动检测难以 100% 准确区分。

这两个开关对应 `ModelConfig.options` 中的 `reasoningContentAdapt` 和 `extractReasoningContent` 字段，由用户在模型编辑页面配置，`createModel()` 根据 model options 决定是否包装对应中间件。

### 3.3 中间件配置（运行时）

两个独立中间件，各自拥有独立配置入口，由模型 options 控制：

```typescript
// ModelOptions 新增字段
interface ModelOptions {
  // ... existing fields ...

  /**
   * [实验性] 启用 reasoning_content 双向适配
   * 适用：DeepSeek V4/R1、MiMo 等使用 reasoning_content API 字段的模型
   * 启用后自动处理多轮 reasoning 内容的回传与 backfill
   */
  reasoningContentAdapt?: boolean;

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
  const messages = params.prompt.map((msg) => {
    if (msg.role !== "assistant") return msg;

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
 * 创建 reasoning_content 双向适配中间件
 *
 * 此中间件由用户在模型编辑页面手动启用（实验性功能），
 * 而非自动检测。用户通过模型选项中的 reasoningContentAdapt 控制。
 */
function createReasoningContentAdaptMiddleware(config: {
  v4StrictMode: boolean; // 由 model.rid 判断后传入
  // 无需 apiUrlPattern / modelIdPattern — 用户手动控制
}): LanguageModelMiddleware {
  // ...
}
```

---

## 三、集成点

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
  if (modelOptions?.reasoningContentAdapt) {
    const isV4Model = /deepseek-v4|mimo-v2/i.test(modelId);
    middlewares.push(
      createReasoningContentAdaptMiddleware({
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

### 4.2 `llmService.ts` — DeepSeek 分支处理

中间件启用后，`llmService.ts` 中的 DeepSeek 专用分支无需特殊处理。对于通过 `openai-completions` 访问的 DeepSeek/MiMo，使用通用的 openai providerOptions 即可：

```typescript
if (providerType === "openai-completions" && /* model is deepseek/mimo */) {
  providerOptions["openai"] = { reasoningEffort: "medium" };
}
```

### 4.3 `messageConverter.ts` — reasoning part 字段名

AI SDK v4 的 `CoreAssistantMessage` 中，`reasoning` part 的字段名必须为 `text`：

```typescript
content.push({ type: "reasoning", text: reasoning });
```

---

## 四、extractReasoningMiddleware 联合使用方案

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

### 5.2 extractReasoningMiddleware 的定位

`extractReasoningMiddleware` 作为可选功能引入，用于处理将 reasoning 放在 `<think>` 标签中的模型。当前目标模型（DeepSeek R1/V4、MiMo）本身不会输出 `<think>` 标签，它们使用 `reasoning_content` API 字段。但通过第三方转发时，某些模型的响应格式可能因转发层实现差异而包含 `<think>` 标签。

### 5.3 中间件链方案

```typescript
// 使用中间件链：两个中间件按顺序应用
// 1. reasoningContentAdaptMiddleware → 协议层（reasoning_content 字段）
// 2. extractReasoningMiddleware → 内容层（<think> 标签）
modelInstance = wrapLanguageModel({
  model: modelInstance,
  middleware: [
    reasoningContentAdaptMiddleware({ ... }),
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

1. `reasoningContentAdaptMiddleware` 处理 `reasoning_content` 字段 → 转换为 `reasoning` part
2. `extractReasoningMiddleware` 再检查剩余的 `text` part 中是否有 `<think>` 标签
3. 任何未被 API 层捕获的 reasoning（遗漏在 `text` 中的标签内容）都会被二次提取

> **`wrapLanguageModel` 的中间件数组是从右向左执行的**，因此 `extractReasoningMiddleware` 放在数组最后（先执行），`reasoningContentAdaptMiddleware` 放在前面（后执行，包裹外层）。

### 5.4 extractReasoningMiddleware 的启用场景

| 场景                                     | reasoningContentAdapt                 | extractReasoning                      |
| ---------------------------------------- | -------------------------------------- | --------------------------------------- |
| DeepSeek 官方 API（`deepseek-v4-*`）     | ✅ 适用（多轮回传必需）                | ❌ 不适用（官方直接用 reasoning_content）|
| MiMo 官方 API（`mimo-v2*`）              | ✅ 适用（多轮回传必需）                | ❌ 不适用（官方直接用 reasoning_content）|
| 第三方转发 CSU（`deepseek-v3-thinking`） | 🟡 如遇多轮 400 错误则开启             | 🟡 如返回包含 `<think>` 标签则开启      |
| QwQ / 本地模型                           | ❌ 不适用（无 reasoning_content 字段） | ✅ 适用（需从 `<think>` 标签提取）      |

（`extractReasoningMiddleware` 不由 `createModel()` 默认包装，而是通过模型编辑页面的「实验性功能」开关 `extractReasoningContent` 手动控制。）

### 5.5 两个中间件的对比

| 维度     | extractReasoningMiddleware           | reasoningContentAdaptMiddleware           |
| -------- | ------------------------------------ | ----------------------------------------- |
| 来源     | `ai` package（内置）                 | Addi 自定义                               |
| 作用域   | 内容层：`<think>` 标签提取           | 协议层：`reasoning_content` 字段注入/提取 |
| 多轮处理 | 不支持                               | 支持（V4 backfill、过滤）                 |
| 自动检测 | 无（需手动配置 tagName）             | 自动基于 API URL + Model RID 判断         |
| 适用场景 | 将 reasoning 放在 `content` 中的模型 | 使用 `reasoning_content` API 字段的模型   |
| 启用方式 | 用户按需配置                         | 自动检测，零配置                          |

---

## 五、已确认的发现与验证

### 6.1 DeepSeek 官方文档关键发现

| 发现项                 | 描述                                                                       | 来源               |
| ---------------------- | -------------------------------------------------------------------------- | ------------------ |
| V4 model ID            | `deepseek-v4-pro`（替代即将废弃的 `deepseek-chat` 和 `deepseek-reasoner`） | DeepSeek API 首页  |
| 思考开关               | `extra_body: {thinking: {type: "enabled/disabled"}}`                       | Thinking Mode 文档 |
| reasoning 字段         | 返回 `reasoning_content`（与 `content` 同级）                              | Thinking Mode 文档 |
| 多轮-无工具调用        | `reasoning_content` 可省略（API 忽略）                                     | Thinking Mode 文档 |
| 多轮-有工具调用        | `reasoning_content` **必须**回传（否则 400）                               | Thinking Mode 文档 |
| 推荐做法               | `messages.append(response.choices[0].message)` 自动保留所有字段            | Thinking Mode 文档 |
| deepseek-chat 废弃     | 2026/07/24 废弃，映射到 deepseek-v4-flash 的非思考模式                     | API 首页           |
| deepseek-reasoner 废弃 | 2026/07/24 废弃，映射到 deepseek-v4-flash 的思考模式                       | API 首页           |

### 6.2 MiMo 官方文档关键发现

| 发现项                 | 描述                                                 | 来源              |
| ---------------------- | ---------------------------------------------------- | ----------------- |
| API 格式               | 完全 OpenAI 兼容                                     | MiMo API 文档     |
| reasoning 字段         | `choices.message.reasoning_content`（非流式）        | MiMo API 文档     |
| 流式字段               | `choices.delta.reasoning_content`（流式）            | MiMo API 文档     |
| 思考开关               | `extra_body: {thinking: {type: "enabled/disabled"}}` | MiMo API 文档     |
| 多轮-无工具调用        | `reasoning_content` 可省略                           | MiMo 公告         |
| 多轮-有工具调用        | `reasoning_content` **必须**回传（否则 400）         | MiMo 公告         |
| 受影响模型             | V2.5-Pro, V2.5, V2-Pro, V2-Omni, V2-Flash            | MiMo 公告         |
| 推荐做法               | `messages.append(assistant_message)` 自动保留        | MiMo 公告示例代码 |
| 不支持 thinking 的模型 | TTS 系列（mimo-v2.5-tts 等）                         | MiMo API 文档     |

### 6.3 设计一致性验证

| 设计决策                      | DeepSeek 实际行为       | MiMo 实际行为             | 一致?               |
| ----------------------------- | ----------------------- | ------------------------- | ------------------- |
| 使用 `reasoning_content` 字段 | ✅ 官方文档确认         | ✅ 官方文档确认           | ✅                  |
| 多轮无工具调用可省略          | ✅ 官方明确说明         | ✅ 官方明确说明           | ✅                  |
| 多轮有工具调用必须回传        | ✅ 官方明确说明         | ✅ 官方明确说明           | ✅                  |
| V4 backfill 空字符串          | ✅ 安全做法（虽略保守） | ✅ 安全做法               | ✅                  |
| `extra_body.thinking` 控制    | ✅ 需在 extra_body 中   | ✅ 需在 extra_body 中     | ✅                  |
| `reasoning_effort` 支持       | ✅ 支持                 | ❌ 不支持（默认 enabled） | ⚠️ 由中间件配置控制 |

统一中间件架构与 DeepSeek 和 MiMo 的实际 API 行为完全一致。唯一差异是 MiMo 不支持 `reasoning_effort`（思考模式默认开启），这可通过中间件配置来控制。

---

## 六、技术参考

### 相关文件

| 文件                                               | 用途                                     |
| -------------------------------------------------- | ---------------------------------------- |
| `src/core/llm/aiRegistry.ts`                       | Provider 注册、model 创建、中间件包装点  |
| `src/core/llm/llmService.ts`                       | LLM 调用编排、providerOptions 注入       |
| `src/core/llm/messageConverter.ts`                 | VS Code ↔ AI SDK 消息转换（含 bug）      |
| `src/common/types/config.ts`                       | Model 类型定义（capabilities.reasoning） |
| `src/core/llm/reasoningContentAdaptMiddleware.ts` | 统一中间件实现                          |
| `docs/ai-sdk-reference.md`                         | AI SDK 接口参考                          |

### 外部参考

- [AI SDK: LanguageModelV4Middleware](https://ai-sdk.dev/docs/reference/ai-sdk-core/language-model-v4-middleware)
- [AI SDK: wrapLanguageModel](https://ai-sdk.dev/docs/reference/ai-sdk-core/wrap-language-model)
- [DeepSeek Thinking Mode API](https://api-docs.deepseek.com/guides/thinking_mode)
- [Xiaomi MiMo API 文档](https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api)
- [extractReasoningMiddleware 源码](https://github.com/vercel/ai/blob/main/packages/core/src/util/extract-reasoning-middleware.ts)
- [@ai-sdk/deepseek 源码](https://github.com/vercel/ai/tree/main/packages/deepseek)
- [@ai-sdk/openai-compatible 源码](https://github.com/vercel/ai/tree/main/packages/openai-compatible)
