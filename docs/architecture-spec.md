# Addi 架构规范

> 本文档定义 Addi 扩展的核心架构设计与约束，所有开发工作必须遵守。

---

## 一、分层架构

```
VS Code (Copilot) → Addi → AI SDK → Providers
```

| 层级           | 目录                  | 职责                        | 禁止依赖               |
| -------------- | --------------------- | --------------------------- | ---------------------- |
| Presentation   | `src/presentation/`   | UI、命令、视图、用户交互    | —                      |
| Application    | `src/application/`    | 业务用例（UseCases）        | vscode.*               |
| Core           | `src/core/`           | LLM 编排、Provider 工厂注册 | vscode.*（除类型声明） |
| Infrastructure | `src/infrastructure/` | 存储、加密、VS Code 配置    | —                      |
| Domain         | `src/domain/`         | 接口定义                    | —                      |
| Common         | `src/common/`         | 纯类型、工具函数、日志      | vscode.*（除日志封装） |

**规则**：
- `core/` 层不得包含 UI 组件（如 `TreeItem` 子类）——UI 类必须放在 `presentation/`
- `common/` 中的工具函数不得依赖 VS Code API——依赖 vscode 的工具放在 `infrastructure/` 或 `presentation/`
- Application 层 UseCases 通过接口注入依赖，不直接引用具体实现类

---

## 二、核心数据流

```
用户 → AddiChatProvider → LLMService → AI SDK → 远程 API → 流式响应 → VS Code
```

1. `AddiChatProvider.provideLanguageModelChatResponse()` 接收 Chat 请求
2. 从 `model.id` 查找本地 Model 对象，获取 `provider` 和 `apiKey`
3. `LLMService.chat()` → `MessageConverter.toAiCoreMessages()` 转换消息格式
4. `AIProviderRegistry.createModel(provider, model)` 使用 **`model.rid`** 创建 AI SDK 实例
5. `streamText()` 获取流式响应 → `processStreamPart()` 处理每个 part
6. 工具调用通过 `ToolOrchestrator.executeTool()` 执行

---

## 三、Model 双 ID 设计

每个 Model 包含两个标识符，**严格区分用途，不可混用**：

| 字段  | 名称       | 用途                         | 示例                                   |
| ----- | ---------- | ---------------------------- | -------------------------------------- |
| `id`  | Local UUID | 本地内部管理：存储、查找、UI | `550e8400-e29b-41d4-a716-446655440000` |
| `rid` | Remote ID  | 远程 API 调用：发送给 AI SDK | `gpt-4o`, `claude-sonnet-4-20250514`   |

### 使用规则

| 场景                 | 使用字段    | 说明                  |
| -------------------- | ----------- | --------------------- |
| 模型查找 (findModel) | `model.id`  | 本地唯一标识用于查找  |
| UI 显示 / TreeItem   | `model.id`  | TreeItem 等 UI 元素   |
| 删除/更新模型        | `model.id`  | 作为方法参数传递      |
| 调用 AI SDK          | `model.rid` | 作为 `model` 参数发送 |
| 配置信息展示         | `model.rid` | 用户看到的远程模型 ID |

### 类型定义

```typescript
// src/common/types/model.ts
export type ModelDraft = {
  rid: string;    // 远程模型 ID（必填）
  name: string;
  id?: string;    // 本地 UUID（创建时自动生成）
  // ... 其他字段
};

export interface ModelConfig {
  id: string;     // 本地 UUID
  rid: string;    // 远程模型 ID
  // ... 其他字段
}

export interface Model extends ModelConfig, ModelStats {}
```

### 正确与错误示例

```typescript
// ❌ 错误：使用 model.id 调用 AI SDK
aiProviderInstance(model.id);

// ✅ 正确：使用 model.rid 调用 AI SDK
aiProviderInstance(model.rid);

// ❌ 错误：假设字符串参数就是 rid
const modelId = typeof modelOrId === "string" ? modelOrId : modelOrId.id;

// ✅ 正确：字符串参数当作 rid，对象参数取其 rid
const modelId = typeof modelOrId === "string" ? modelOrId : modelOrId.rid;
```

---

## 四、存储结构

### 4.1 存储键规范

所有存储键必须以 `addi.` 前缀开头：

| 键                        | 存储          | 同步 | 说明                |
| ------------------------- | ------------- | ---- | ------------------- |
| `addi.config`             | Memento       | ✅    | Provider/Model 配置 |
| `addi.config.modifiedAt`  | Memento       | ✅    | 配置修改时间        |
| `addi.local.apikeys.{id}` | SecretStorage | ❌    | API Keys（不同步）  |
| `addi.local.deviceId`     | SecretStorage | ❌    | 设备标识            |
| `addi.local.backups`      | Memento       | ❌    | 本地备份记录        |

**规则**：
- API Key 只存 `SecretStorage`，永不落盘明文，永不导出/同步
- 新增存储键必须使用 `addi.` 前缀 + `local.` 标记本地数据

### 4.2 存储层级

```
VS Code Storage
├── globalState (Memento)
│   ├── addi.config            # Provider 配置（会同步）
│   ├── addi.config.modifiedAt
│   └── addi.local.backups     # 本地备份（不同步）
│
└── secrets (SecretStorage)
    └── addi.local.apikeys.{providerId}  # API 密钥（不同步）

VS Code Settings (Sync)
└── addi.*                     # 用户设置（会同步）
```

### 4.3 数据规范化

每次加载数据时，`ProviderModelManager` 自动执行规范化：
- 若 `rid` 缺失，使用 `id` 作为 fallback
- 若 `id` 缺失，自动生成 UUID

---

## 五、Provider 类型与 AI SDK 映射

### 5.1 支持的 Provider 类型

| providerType             | AI SDK Provider                           | 适用模型                            |
| ------------------------ | ----------------------------------------- | ----------------------------------- |
| `openai-completions`     | `createOpenAI` / `createOpenAICompatible` | OpenAI、DeepSeek、Ollama 等兼容 API |
| `openai-responses`       | `createOpenAI` (responses API)            | OpenAI 原生 Responses API           |
| `anthropic-messages`     | `createAnthropic`                         | Claude 全系列                       |
| `google-generateContent` | `createGoogleGenerativeAI`                | Gemini 全系列                       |

### 5.2 遗留类型自动迁移

系统自动将旧格式 `providerType` 映射到新格式：

```typescript
const legacyMapping: Record<string, ProviderType> = {
  openai: "openai-completions",
  deepseek: "openai-completions",
  anthropic: "anthropic-messages",
  google: "google-generateContent",
};
```

### 5.3 注册新 Provider

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册：

```typescript
this.register({
  id: "custom-provider",
  label: "Custom Provider",
  create: (p) => {
    return createCustomProvider({
      baseURL: p.apiEndpoint,
      apiKey: p.apiKey,
    });
  },
});
```

---

## 六、核心组件职责

| 组件                 | 文件                                         | 职责                           |
| -------------------- | -------------------------------------------- | ------------------------------ |
| AddiChatProvider     | `src/core/providers/AddiChatProvider.ts`     | VS Code ChatProvider 实现      |
| LLMService           | `src/core/llm/llmService.ts`                 | 流式处理、工具调用编排         |
| AIProviderRegistry   | `src/core/llm/aiRegistry.ts`                 | Provider 工厂注册与创建        |
| MessageConverter     | `src/core/llm/messageConverter.ts`           | VS Code ↔ AI SDK 消息格式转换  |
| ToolOrchestrator     | `src/core/llm/toolOrchestrator.ts`           | 工具执行编排                   |
| ProviderModelManager | `src/core/providers/ProviderModelManager.ts` | Provider/Model CRUD 与数据管理 |

---

## 七、VS Code Proposed API

项目依赖以下 Proposed API，类型定义位于 `typings/proposedApi/`：

| API                                | 用途                    |
| ---------------------------------- | ----------------------- |
| `chatParticipantPrivate`           | Chat 子代理、权限管理   |
| `languageModelThinkingPart`        | Thinking/Reasoning 支持 |
| `toolInvocationApproveCombination` | 工具调用审批            |

> Proposed API 随 VS Code 版本变化，升级 VS Code 时需检查 API 兼容性。

---

## 八、代码审查检查清单

提交代码前确认：

- [ ] AI SDK 调用是否使用 `model.rid`（而非 `model.id`）？
- [ ] `createModel()` 传入的是完整 `model` 对象还是字符串（字符串须为 `rid`）？
- [ ] 新增存储键是否使用 `addi.` 前缀？
- [ ] 敏感数据是否只存 `SecretStorage`？
- [ ] `core/` 层是否引入了 UI 依赖？
- [ ] `common/` 工具是否依赖了 VS Code API？
