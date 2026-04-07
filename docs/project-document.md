# 项目架构与设计文档

> 更新时间：2026-03-01

本文档是 Addi 项目的架构、设计和规范文档，包含项目概述、分层架构、核心组件、设计模式等内容。

---

## 目录

1. [项目概述](#项目概述)
2. [分层架构](#分层架构)
3. [核心组件](#核心组件)
4. [数据流](#数据流)
5. [类型系统](#类型系统)
6. [工具系统](#工具系统)
7. [存储系统](#存储系统)
8. [设计模式](#设计模式)
9. [模型可见性控制](#模型可见性控制)
10. [UI 设计](#ui-设计)

---

## 项目概述

### 目标

Addi 是一个 VS Code 扩展，桥接 AI SDK (Vercel) 与 VS Code 的 Language Model Chat API (Copilot)，让用户可以使用自定义的 LLM 提供商。

### 核心能力

- 支持多个 LLM 提供商 (OpenAI, Anthropic, Google, MiniMax 等)
- 完整的流式响应支持
- 工具调用 (Tool Calling) 集成
- Thinking/Reasoning 内容处理
- 多模型管理

---

## 分层架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code (Copilot)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              LanguageModelChatProvider API                  │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         Addi 扩展                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Presentation │  │    Core      │  │   Infrastructure    │   │
│  │   Layer      │  │    Layer     │  │      Layer          │   │
│  │              │  │              │  │                      │   │
│  │ - Commands  │  │ - LLMService │  │ - StorageService    │   │
│  │ - Views      │  │ - AIRegistry │  │ - SecretStorage     │   │
│  │ - Extension │  │ - Tools      │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       AI SDK Layer                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  OpenAI  │ │ Anthropic│ │  Google  │ │ Custom Provider  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     External Providers                          │
│      OpenAI  │  Anthropic  │  Google  │  MiniMax  │  Local    │
└─────────────────────────────────────────────────────────────────┘
```

### 层级职责

| 层级           | 职责               | 组件                                                |
| -------------- | ------------------ | --------------------------------------------------- |
| Presentation   | UI 交互、命令注册  | `commands/`, `extension.ts`, `views/`               |
| Core           | 业务逻辑、LLM 编排 | `llmService.ts`, `aiRegistry.ts`, `toolRegistry.ts` |
| Infrastructure | 数据持久化         | `storageService.ts`                                 |
| Common         | 共享类型和工具     | `types/`, `logger.ts`, `utils/`                     |

---

## 核心组件

### AddiChatProvider

**文件**: `src/core/providers/AddiChatProvider.ts`

VS Code `LanguageModelChatProvider` 接口的主要实现。

```typescript
export class AddiChatProvider implements vscode.LanguageModelChatProvider {
  // 提供可用模型列表
  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    token?: CancellationToken
  ): Promise<LanguageModelChatInformation[]>;

  // 处理聊天请求
  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: Progress<LanguageModelResponsePart>,
    token?: CancellationToken
  ): Promise<void>;
}
```

### LLMService

**文件**: `src/core/llm/llmService.ts`

核心 LLM 服务编排器，负责：

- 消息格式转换
- 流式响应处理
- 工具调用编排
- Thinking/Reasoning 处理

```typescript
export class LLMService {
  // 主聊天方法
  async chat(
    provider: Provider,
    model: Model,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions | undefined,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken
  ): Promise<void>;

  // 流式处理
  private processStreamPart(part: StreamPart, ...): void;

  // 工具调用
  private handleToolCalls(toolCalls: ToolCall[], ...): Promise<void>;
}
```

### AIRegistry

**文件**: `src/core/llm/aiRegistry.ts`

提供商注册表，管理 AI SDK 提供商实例。

```typescript
export class AIRegistry {
  // 获取或创建提供商实例
  getProviderInstance(provider: Provider): AIProviderInstance;

  // 获取支持的所有模型
  getAvailableModels(): Model[];
}
```

### MessageConverter

**文件**: `src/core/llm/messageConverter.ts`

消息格式转换器，桥接 VS Code 和 AI SDK 的消息格式。

```typescript
export class MessageConverter {
  // VS Code → AI SDK
  static async toAiCoreMessages(
    messages: readonly LanguageModelChatRequestMessage[],
    capabilities?: ModelCapabilities
  ): Promise<ModelMessage[]>;

  // AI SDK → VS Code
  static fromAiCoreMessage(message: ModelMessage): LanguageModelChatMessage;
}
```

### ToolRegistry

**文件**: `src/core/llm/toolRegistry.ts`

工具注册表，管理可用的 VS Code 命令工具。

```typescript
export class ToolRegistry {
  // 获取所有可用工具
  static getTools(): Promise<Map<string, ToolMetadata>>;

  // 执行工具
  static executeTool(name: string, input: any): Promise<ToolExecutionResult>;
}
```

### ProviderModelManager

**文件**: `src/core/providers/ProviderModelManager.ts`

Provider 和 Model 的 CRUD 管理：

- Provider/Model 增删改查
- 数据规范化
- 配置同步

---

## 数据流

### 聊天请求流程

```
User Input (Copilot)
       │
       ▼
VS Code Chat API
       │
       ▼
AddiChatProvider.provideLanguageModelChatResponse()
       │
       ├──▶ MessageConverter.toAiCoreMessages()
       │         │
       │         ▼
       │    AI SDK Format
       │
       ▼
LLMService.chat()
       │
       ├──▶ AIRegistry.getProviderInstance()
       │         │
       │         ▼
       │    Provider Instance
       │
       ▼
AI SDK streamText()
       │
       ▼
流处理 (LLMService.processStreamPart)
       │
       ├──▶ text-delta → LanguageModelTextPart
       ├──▶ reasoning-delta → LanguageModelThinkingPart
       └──▶ tool-call → LanguageModelToolCallPart
              │
              ▼
       ToolOrchestrator.executeTool()
              │
              ▼
       LanguageModelToolResultPart
              │
              ▼
       反馈给 LLM (多轮工具调用)
              │
              ▼
VS Code UI
```

### 工具调用流程

```
LanguageModelToolCallPart
         │
         ▼
ToolRegistry.executeTool(name, input)
         │
         ├──▶ 查找工具定义
         │
         ▼
执行 VS Code 命令
         │
         ▼
返回 ToolResult
         │
         ▼
转换为 LanguageModelToolResultPart
         │
         ▼
继续流式响应
```

---

## 类型系统

### 类型定义位置

| 类型                 | 文件                           |
| -------------------- | ------------------------------ |
| Provider/Model 类型  | `src/common/types/`            |
| 消息类型             | `src/common/types/messages.ts` |
| VS Code Proposed API | `src/proposedApi/`             |

### 核心类型

#### Provider

```typescript
interface Provider {
  id: string;
  name: string;
  providerType: ProviderType;
  apiEndpoint: string;
  apiKey?: string;
  models: Model[];
  isUserSelectable?: boolean;
}
```

#### Model

```typescript
interface Model {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  isUserSelectable?: boolean;
}
```

#### ModelCapabilities

```typescript
interface ModelCapabilities {
  imageInput?: boolean;
  audioInput?: boolean;
  videoInput?: boolean;
  toolCalling?: boolean | number;
  reasoning?: boolean;
}
```

---

## 工具系统

### 工具来源

1. **Host 工具**: VS Code Copilot 提供的内置工具 (`vscode.lm.tools`)
2. **Fallback 工具**: Addi 扩展注册的备用工具

### 工具定义格式

```typescript
interface LanguageModelToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}
```

---

## 存储系统

### 存储服务

**文件**: `src/infrastructure/storage/storageService.ts`

- **Provider/Model 配置**: 存储在 GlobalState (Memento) 中，可通过 VS Code 设置同步
- **API Keys**: 存储在 SecretStorage 中（本地存储，不同步）
- **模型统计信息**: 存储在 GlobalState 中（本地存储，不同步）

### 存储键

| 键名 | 类型 | 说明 |
|------|------|------|
| `addi.*` | GlobalState/SecretStorage | 所有 addi 相关数据的通配前缀 |
| `addi.config` | GlobalState | Provider 和 Model 配置（同步） |
| `addi.config.modifiedAt` | GlobalState | 配置修改时间戳 |
| `addi.local.stats` | GlobalState | 模型速度历史等本地统计 |
| `addi.local.deviceId` | SecretStorage | 设备唯一标识 |
| `addi.local.apikeys.*` | SecretStorage | 各 Provider 的 API Keys |
| `addi.local.backups` | GlobalState | 本地备份记录 |

### 数据分类

- **同步数据**: Provider 配置、Model 配置（可通过 `addi.syncConfiguration` 设置启用）
- **本地数据**: API Keys、模型使用统计（不跨设备同步）

---

## 设计模式

### 1. 工厂模式

AIRegistry 使用工厂模式创建提供商实例：

```typescript
class AIRegistry {
  private factories: Map<string, ProviderFactory> = new Map();

  register(factory: ProviderFactory) {
    this.factories.set(factory.id, factory);
  }
}
```

### 2. 单例模式

ToolRegistry 使用静态方法提供全局工具访问：

```typescript
class ToolRegistry {
  private static fallbackTools: Map<string, ToolMetadata>;

  static getTools(): Map<string, ToolMetadata> {
    return ToolRegistry.ensureFallbackTools();
  }
}
```

### 3. 事件驱动

ProviderModelManager 使用事件通知模型更新：

```typescript
private readonly _onDidChangeModels = new vscode.EventEmitter<void>();
public readonly onDidChangeModels = this._onDidChangeModels.event;
```

### 4. 依赖注入

通过构造函数注入依赖：

```typescript
constructor(
  private repository: ProviderRepository,
  private llmService: LLMService
) {}
```

---

## 性能优化

### 1. 工具查找优化

使用 Map 缓存工具，避免 O(N\*M) 查找：

```typescript
// 一次性构建映射表
const toolCallMap = new Map<string, string>();
for (const msg of messages) {
  // ...
}
```

### 2. 异步处理

流式响应使用异步处理，避免阻塞：

```typescript
// 并行处理多个工具调用
await Promise.all(toolCalls.map((tc) => this.executeTool(tc)));
```

---

## 模型可见性控制

### 设计概述

通过 `isUserSelectable` 属性控制模型在 Copilot Chat 模型选择器中的显示。

### 数据模型

```typescript
interface Model {
  // ... 其他字段
  // 控制是否在 Chat Model Picker 中显示
  // 默认值: false (隐藏)
  isUserSelectable?: boolean;
}
```

### 上下文菜单操作

| 操作         | 命令 ID                        | 说明                              |
| ------------ | ------------------------------ | --------------------------------- |
| Show Model   | `addi.showModelsInPicker`      | 设置 `isUserSelectable = true`    |
| Hide Model   | `addi.hideModelsFromPicker`    | 设置 `isUserSelectable = false`   |
| Show All     | `addi.showProviderModelsInPicker` | 显示 Provider 下所有模型       |
| Hide All     | `addi.hideProviderModelsFromPicker` | 隐藏 Provider 下所有模型     |
| Initialize   | `addi.initExtension`          | 重置扩展，清除所有数据和设置      |

### 扩展初始化

**命令 ID**: `addi.initExtension`

重置 Addi 扩展到初始状态，包括：
- 清除所有 SecretStorage 数据（API Keys 等，以 `addi.*` 为前缀）
- 清除所有 GlobalState 数据（Provider/Model 配置等，以 `addi.*` 为前缀）
- 重置所有 VS Code Settings 为默认值

此操作会显示确认对话框，操作前会自动创建备份。

### 实现逻辑

```typescript
// 在 AddiChatProvider 中
async provideLanguageModelChatInformation(
  options: { silent: boolean },
  token?: CancellationToken
): Promise<LanguageModelChatInformation[]> {
  const models = await getAllModels();

  return models
    .filter((model) => model.isUserSelectable) // 只返回可见模型
    .map((model) => ({
      id: model.id,
      name: model.name,
      // ...
      isUserSelectable: model.isUserSelectable,
    }));
}
```

---

## UI 设计

### 技术方案

项目计划使用 React + VSCode Elements 组件库重构 UI：

| 技术                | 用途                   |
| ------------------- | ---------------------- |
| VSCode Elements     | VS Code 风格 UI 组件库 |
| React 18+           | UI 框架                |
| Bun                 | 运行时 + JSX 编译      |
| Bun Standalone HTML | 构建独立的 HTML 文件   |

### 组件库

#### 表单组件

- `vscode-textfield` - 文本输入
- `vscode-textarea` - 多行文本
- `vscode-button` - 按钮
- `vscode-checkbox` - 复选框
- `vscode-single-select` / `vscode-multi-select` - 下拉选择

#### 布局组件

- `vscode-split-layout` - 分栏布局
- `vscode-collapsible` - 折叠面板
- `vscode-tabs` - 标签页

### Webview 结构

```
src/
├── webviews/
│   ├── index.html          ← 入口 HTML
│   ├── App.tsx             ← React 根组件
│   ├── components/
│   │   ├── ProviderForm.tsx
│   │   └── ModelForm.tsx
│   └── styles/
│       └── main.css
└── presentation/
    └── views/
```

### 构建命令

```bash
bun build --compile --target=browser ./src/webviews/<view-name>.html --outdir=resources/webviews
```

---

## 相关文档

- [开发规范](./dev-coding-notes.md)
- [AI SDK 参考](./ai-sdk-reference.md)
- [VS Code API 参考](./vscode-reference.md)
