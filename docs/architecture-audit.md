# Addi 扩展数据流与架构审计文档

> 创建日期: 2026-04-29  
> 状态: 初稿

---

## 一、核心数据结构设计

### 1.1 Model 数据结构中的双 ID 设计

Addi 扩展中的每个 Model 都包含两个关键的标识符：

| 字段  | 名称            | 用途                                      | 示例                                   |
| ----- | --------------- | ----------------------------------------- | -------------------------------------- |
| `id`  | Local ID / UUID | 本地唯一标识，用于 addi 扩展内部管理      | `550e8400-e29b-41d4-a716-446655440000` |
| `rid` | Remote ID       | 远程 API 接受的模型 ID，用于实际 API 调用 | `gpt-4o`, `claude-3-5-sonnet-20241022` |

### 1.2 设计原因

1. **本地 UUID (`id`)**：
   - 提供稳定的内部引用，不受远程模型命名变化影响
   - 用于数据库存储、UI 交互、命令参数传递
   - 确保即使远程模型 ID 变更，内部引用仍有效

2. **远程 ID (`rid`)**：
   - 直接传递给 AI SDK 作为 `model` 参数
   - 必须与远程 API 期望的格式完全匹配
   - 可能包含版本号、时间戳等动态元素

### 1.3 类型定义

```typescript
// src/common/types/model.ts

export type ModelDraft = {
  rid: string; // remoteId - 远程模型的ID
  name: string;
  // ... 其他字段
  id?: string; // 本地生成的唯一标识
};

export interface ModelConfig {
  id: string;
  rid: string; // remoteId - 远程模型的ID
  // ... 其他字段
}

export interface Model extends ModelConfig, ModelStats {}
```

---

## 二、数据流向与执行流程

### 2.1 完整的用户请求处理流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VS Code 用户请求                                │
│                         (Copilot Chat 选择模型发送消息)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AddiChatProvider.provideLanguageModelChatResponse()                        │
│  ────────────────────────────────────────────────────────────────────────  │
│  1. 从 model.id 提取 addi 内部模型标识符                                      │
│  2. 调用 repository.findModel(modelId) 查找模型                              │
│  3. 获取 provider.apiKey 从 SecretStorage                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LLMService.chat()                                                          │
│  ────────────────────────────────────────────────────────────────────────  │
│  1. 转换 VS Code 消息为 AI SDK 格式                                         │
│  2. 准备 tools（如果模型支持）                                              │
│  3. 调用 executeDirect()                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LLMService.buildAiOptions()                                                │
│  ────────────────────────────────────────────────────────────────────────  │
│  调用 AIProviderRegistry.createModel(provider, model)                       │
│  ⚠️ 关键点：这里必须传入完整的 model 对象，而非仅 model.id                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AIProviderRegistry.createModel()  [已修复]                                  │
│  ────────────────────────────────────────────────────────────────────────  │
│  之前错误用法：                                                               │
│    const modelId = typeof modelOrId === "string" ? modelOrId : modelOrId.id; │
│                                                                             │
│  ✅ 正确用法：                                                                │
│    let modelId: string;                                                     │
│    let model: Model | undefined;                                            │
│    if (typeof modelOrId === "string") {                                     │
│      modelId = modelOrId; // 当作 rid 处理                                   │
│    } else {                                                                 │
│      modelId = modelOrId.rid; // 使用远程 ID                                  │
│      model = modelOrId as Model;                                            │
│    }                                                                        │
│  ────────────────────────────────────────────────────────────────────────  │
│  使用 modelId (rid) 创建 AI SDK 的 LanguageModel 实例                        │
│  AI SDK 会将此 modelId 作为请求中的 model 参数发送                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI SDK 发送请求到远程 API                                                   │
│  ────────────────────────────────────────────────────────────────────────  │
│  {                                                                          │
│    "model": "gpt-4o",  ← 这里必须是 rid，而非本地 UUID                      │
│    "messages": [...]                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 模型查询流程 (findModel)

```typescript
// ProviderModelManager.findModel() 源码解析

findModel(modelId: string): { provider: Provider; model: Model } | null {
  for (const provider of this.getProviders()) {
    // ✅ 查找时使用 model.id (本地 UUID)
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return { provider, model };
    }
  }
  return null;
}
```

**关键点**：

- `findModel()` 使用 `model.id` (本地 UUID) 进行查找
- 返回的 `model` 对象包含完整的 `id` 和 `rid` 字段
- 后续调用 AI SDK 时，必须使用 `model.rid` 而非 `model.id`

---

## 三、关键代码位置与注意事项

### 3.1 已修复的错误位置

| 文件                         | 行号 | 修复内容                                              |
| ---------------------------- | ---- | ----------------------------------------------------- |
| `src/core/llm/aiRegistry.ts` | ~200 | 修复 `createModel()` 使用 `model.rid` 而非 `model.id` |

### 3.2 正确使用 id/rid 的场景

| 场景                 | 使用的字段  | 说明                  |
| -------------------- | ----------- | --------------------- |
| 模型查找 (findModel) | `model.id`  | 本地唯一标识用于查找  |
| UI 显示              | `model.id`  | TreeItem 等 UI 元素   |
| 删除/更新模型        | `model.id`  | 作为方法参数传递      |
| 发送给 AI SDK        | `model.rid` | 实际 API 调用         |
| 配置信息显示         | `model.rid` | 用户看到的远程模型 ID |

### 3.3 典型错误代码模式

```typescript
// ❌ 错误：直接使用 model.id 作为远程 ID
aiProviderInstance(model.id);

// ✅ 正确：使用 model.rid 作为远程 ID
aiProviderInstance(model.rid);

// ❌ 错误：假设 modelOrId 是字符串就是 rid
const modelId = typeof modelOrId === "string" ? modelOrId : modelOrId.id;

// ✅ 正确：字符串参数当作 rid，对象参数取其 rid
const modelId = typeof modelOrId === "string" ? modelOrId : modelOrId.rid;
```

---

## 四、数据同步与存储

### 4.1 存储结构

```
VS Code Storage
├── globalState (Memento)
│   ├── addi.config          # Provider 配置 (会同步)
│   ├── addi.config.modifiedAt
│   └── addi.local.backups   # 本地备份 (不同步)
│
└── secrets (SecretStorage)
    └── addi.local.apikeys.{providerId}  # API 密钥 (不同步)

VS Code Settings (Sync)
└── addi.*                   # 用户设置 (会同步)
```

### 4.2 数据规范化 (normalizeProvidersInPlace)

每次加载数据时，`ProviderModelManager` 会自动规范化数据：

```typescript
// 确保 rid 存在
if (!ridRaw) {
  // 如果没有 rid，则使用 id 作为 rid
  mutableModel["rid"] = mutableModel["id"] as string;
}

// 确保 id 存在
if (!idCandidate) {
  mutableModel["id"] = IdGenerator.generate();
}
```

---

## 五、Provider 类型与 AI SDK 适配

### 5.1 Provider Type 映射

| providerType             | AI SDK Provider                           | API Endpoint            |
| ------------------------ | ----------------------------------------- | ----------------------- |
| `openai-completions`     | `createOpenAI` / `createOpenAICompatible` | `/chat/completions`     |
| `openai-responses`       | `createOpenAI` (responses API)            | `/responses`            |
| `anthropic-messages`     | `createAnthropic`                         | `/messages`             |
| `google-generateContent` | `createGoogleGenerativeAI`                | `/name:generateContent` |

### 5.2 遗留类型迁移

```typescript
// 自动迁移旧格式 providerType
const legacyMapping: Record<string, ProviderType> = {
  openai: "openai-completions",
  deepseek: "openai-completions",
  anthropic: "anthropic-messages",
  google: "google-generateContent",
  // ... 其他
};
```

---

## 六、测试与验证

### 6.1 验证修复是否生效

1. 配置一个带有多个模型的 Provider
2. 在 Copilot Chat 中选择其中一个模型
3. 发送消息，观察日志输出
4. 检查发送到远程 API 的请求中 `model` 字段是否为 `rid`（如 `gpt-4o`）而非 UUID

### 6.2 日志检查点

在 `AIProviderRegistry.createModel()` 中添加的日志：

```typescript
logger.debug("Creating AI model", {
  requestedId: typeof modelOrId === "string" ? modelOrId : modelOrId.id,
  finalModelId: modelId, // 应该是 rid
  hasModelObject: typeof modelOrId !== "string",
});
```

---

## 七、后续开发注意事项

### 7.1 新增代码时遵守的规则

1. **任何与 AI SDK 交互的地方**：
   - 必须使用 `model.rid` 而非 `model.id`
   - 如果传入字符串参数，必须确保它是 `rid` 而非 `id`

2. **任何与内部管理交互的地方**：
   - 使用 `model.id` 进行查找、更新、删除

3. **类型定义**：
   - 保持 `ModelDraft` 中 `rid` 为必填项
   - 添加注释说明 `id` vs `rid` 的区别

### 7.2 代码审查检查清单

- [ ] 新代码是否直接使用 `model.id` 调用 AI SDK？
- [ ] 传入 `createModel()` 的参数类型是否明确？
- [ ] 是否需要添加日志以帮助调试 ID 传递问题？

---

## 八、相关文件索引

| 文件                                           | 职责                         |
| ---------------------------------------------- | ---------------------------- |
| `src/common/types/model.ts`                    | Model 数据类型定义           |
| `src/common/types/provider.ts`                 | Provider 类型定义            |
| `src/core/llm/aiRegistry.ts`                   | AI SDK 工厂方法 **[已修复]** |
| `src/core/llm/llmService.ts`                   | LLM 服务主入口               |
| `src/core/providers/AddiChatProvider.ts`       | VS Code Chat Provider        |
| `src/core/providers/ProviderModelManager.ts`   | Provider/Model 业务逻辑      |
| `src/infrastructure/storage/storageService.ts` | 数据持久化                   |

---

_文档版本: 1.0.0_
