---
description: Apply when working on the Addi VS Code extension codebase
applyTo: "src/**/*.ts"
---

# Addi 开发规范

> 适用于所有 AI Agent 在 Addi 项目中生成、审查或修改代码时遵循。

---

## 项目概述

Addi 是一个 VS Code 扩展，桥接 AI SDK 与 VS Code Copilot API，支持自定义 LLM 提供商。

**核心能力**：多 Provider、流式响应、工具调用、Thinking/Reasoning 处理、Vision 多模态。

---

## 开发环境

| 要求    | 版本       | 说明              |
| ------- | ---------- | ----------------- |
| VS Code | `^1.118.0` | Proposed API 支持 |
| Bun     | 最新版     | 运行时和包管理    |
| Windows | PowerShell | 终端环境          |

> **注意**：本项目使用 **Bun** 作为包管理器和运行时，不使用 npm/yarn/pnpm。

---

## 常用命令

```powershell
bun install        # 安装依赖
bun run watch      # 开发模式（监听编译）
bun run build      # 构建（编译 + 打包 VSIX）
bun run clean      # 清理构建产物
bun test           # 运行单元测试
bun run test       # 运行端到端测试（需 VS Code 实例）
bun run lint       # oxlint 检查
bun run lint:fix   # oxlint 自动修复
bun run format     # oxfmt 格式化
bun run format:check  # oxfmt 检查（CI 用）
```

按 `F5` 启动 Extension Development Host 调试。

---

## 代码规范

### 命名

| 类型      | 规范             | 示例                            |
| --------- | ---------------- | ------------------------------- |
| 类/接口   | PascalCase       | `LLMService`, `ProviderFactory` |
| 方法/变量 | camelCase        | `getProvider()`, `modelList`    |
| 常量      | UPPER_SNAKE_CASE | `DEFAULT_MAX_TOKENS`            |
| 文件      | kebab-case       | `llm-service.ts`                |

### 日志

```typescript
import { logger } from "./common/logger";

logger.debug("Debug info", { data: "value" }, "ComponentName");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message", error, "ComponentName");
```

日志查看：`Ctrl+Shift+U` → Output 面板 → 选择 "Addi"。

### 类型

- 优先 `interface` 用于可扩展类型
- 使用 `type` 用于联合类型、交叉类型
- 避免 `any`，使用 `unknown` 替代
- 使用 `unknown` + 类型守卫替代类型断言

### 错误处理

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  logger.error("Operation failed", error, "ComponentName");
  throw error;
}
```

---

## 项目分层架构

```
VS Code (Copilot) → Addi → AI SDK → Providers
```

| 层级           | 目录                  | 职责                     |
| -------------- | --------------------- | ------------------------ |
| Presentation   | `src/presentation/`   | UI、命令、视图           |
| Application    | `src/application/`    | 业务用例（UseCases）     |
| Core           | `src/core/`           | LLM 编排、Provider 注册  |
| Infrastructure | `src/infrastructure/` | 存储、加密、VS Code 配置 |
| Domain         | `src/domain/`         | 接口定义、领域模型       |
| Common         | `src/common/`         | 通用类型、工具、日志     |

### 核心组件

| 组件                 | 文件                                         | 职责                 |
| -------------------- | -------------------------------------------- | -------------------- |
| AddiChatProvider     | `src/core/providers/AddiChatProvider.ts`     | VS Code ChatProvider |
| LLMService           | `src/core/llm/llmService.ts`                 | 流式处理、工具调用   |
| AIRegistry           | `src/core/llm/aiRegistry.ts`                 | Provider 工厂注册    |
| MessageConverter     | `src/core/llm/messageConverter.ts`           | 消息格式转换         |
| ToolOrchestrator     | `src/core/llm/toolOrchestrator.ts`           | 工具执行编排         |
| ProviderModelManager | `src/core/providers/ProviderModelManager.ts` | Provider/Model CRUD  |

### 数据流

```
用户 → AddiChatProvider → LLMService → AI SDK → 流式响应 → VS Code
```

1. `provideLanguageModelChatResponse()` 接收 Chat 请求
2. `MessageConverter.toAiCoreMessages()` 转换消息格式
3. `streamText()` 获取流式响应 → `processStreamPart()` 处理每个 part
4. 工具调用通过 `ToolOrchestrator.executeTool()` 执行

---

## Model ID 双标识设计

每个 Model 包含两个标识符，**不可混淆**：

| 字段  | 名称       | 用途                          | 示例                                   |
| ----- | ---------- | ----------------------------- | -------------------------------------- |
| `id`  | Local UUID | 本地内部管理：存储、UI、查找  | `550e8400-e29b-41d4-a716-446655440000` |
| `rid` | Remote ID  | 远程 API 调用：实际发送给模型 | `gpt-4o`, `claude-sonnet-4-20250514`   |

**使用规则**：

- **内部管理**（查找、删除、UI 显示）→ 使用 `model.id`
- **AI SDK 交互**（API 调用、createModel）→ 使用 `model.rid`

```typescript
// ❌ 错误：使用 model.id 调用 AI SDK
aiProviderInstance(model.id);

// ✅ 正确：使用 model.rid 调用 AI SDK
aiProviderInstance(model.rid);
```

---

## 存储键规范

所有存储键必须以 `addi.` 前缀开头：

| 键                        | 存储          | 同步 | 说明                |
| ------------------------- | ------------- | ---- | ------------------- |
| `addi.config`             | Memento       | ✅   | Provider/Model 配置 |
| `addi.config.modifiedAt`  | Memento       | ✅   | 配置修改时间        |
| `addi.local.apikeys.{id}` | SecretStorage | ❌   | API Keys（不同步）  |
| `addi.local.deviceId`     | SecretStorage | ❌   | 设备标识            |
| `addi.local.backups`      | Memento       | ❌   | 本地备份记录        |

> API Key 使用 VS Code `SecretStorage` 存储，永远不会被导出或同步。

---

## Provider 注册

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册新 Provider：

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

支持的 Provider 类型：

| providerType             | AI SDK Provider                           | 说明                               |
| ------------------------ | ----------------------------------------- | ---------------------------------- |
| `openai-completions`     | `createOpenAI` / `createOpenAICompatible` | OpenAI 兼容（含 DeepSeek、Ollama） |
| `openai-responses`       | `createOpenAI` (responses API)            | OpenAI 新版 Responses API          |
| `anthropic-messages`     | `createAnthropic`                         | Claude 模型                        |
| `google-generateContent` | `createGoogleGenerativeAI`                | Gemini 模型                        |

---

## VS Code Proposed API

项目使用以下 Proposed API，类型定义位于 `typings/proposedApi/`：

- `chatParticipantPrivate` — Chat 子代理、权限
- `languageModelThinkingPart` — Thinking/Reasoning 支持
- `toolInvocationApproveCombination` — 工具调用审批

> Proposed API 可能随 VS Code 版本变化，需关注更新。

---

## 工具链

| 工具           | 用途                        | 配置文件                      |
| -------------- | --------------------------- | ----------------------------- |
| **Bun**        | 包管理 + 运行时             | `bun.lock`                    |
| **oxlint**     | 代码检查（替代 ESLint）     | `.oxlintrc.json`              |
| **oxfmt**      | 代码格式化（替代 Prettier） | `.oxfmtrc.json`               |
| **TypeScript** | 类型检查                    | `tsconfig.json`               |
| **bun build**  | 构建打包                    | 内置于 `package.json` scripts |

---

## 开发注意事项

### 核心规则

1. 新增存储键必须使用 `addi.` 前缀
2. 敏感数据（API Key）只存 SecretStorage，不存 Memento
3. 使用 `model.rid` 调用 AI SDK，`model.id` 用于内部管理
4. 日志中使用 `maskSecret()` 脱敏 API Key
5. 错误消息需对用户友好
6. 不要硬编码 API Key 或密码

### 添加新命令

1. 在 `src/presentation/commands/` 对应文件中添加命令处理函数
2. 在 `src/presentation/extension.ts` 中注册命令

### 添加新类型

1. 在 `src/common/types/` 对应文件中添加类型定义
2. 通过 `src/common/types/index.ts` barrel export

---

## 参考文档

| 文档        | 路径                                     | 说明                           |
| ----------- | ---------------------------------------- | ------------------------------ |
| 用户指南    | `docs/DOCUMENTATION.md`                  | 安装、配置、使用               |
| 架构规范    | `docs/architecture-spec.md`              | 分层、数据流、核心设计约束     |
| 编码规范    | `docs/coding-standards.md`               | 类型安全、日志、错误处理等约束 |
| AI SDK      | `docs/ai-sdk-reference.md`               | AI SDK v6 API                  |
| VS Code API | `docs/vscode-reference.md`               | VS Code Copilot API            |
| 加密导出    | `docs/encrypted-config-export-import.md` | 加密功能说明                   |
