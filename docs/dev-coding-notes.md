# 开发规范

> 更新时间：2026-04-07

---

## 环境要求

| 工具    | 版本要求 | 说明              |
| ------- | -------- | ----------------- |
| VS Code | 1.109+   | Proposed API 支持 |
| Bun     | 最新版   | 包管理            |

```powershell
bun install    # 安装依赖
bun run watch  # 开发模式（监听编译）
```

按 `F5` 启动调试。

---

## 项目结构

```
src/
├── common/           # 通用类型、工具
│   ├── types/        # Provider, Model, Tool 等类型
│   ├── utils/         # 工具函数
│   └── logger.ts      # 日志
├── core/
│   ├── llm/          # LLM 核心
│   │   ├── aiRegistry.ts       # Provider 注册
│   │   ├── llmService.ts       # 主服务
│   │   ├── messageConverter.ts # 消息转换
│   │   └── toolOrchestrator.ts  # 工具编排
│   └── providers/
│       ├── AddiChatProvider.ts  # VS Code ChatProvider
│       └── ProviderModelManager.ts
├── infrastructure/
│   ├── storage/      # 存储服务 (Memento + SecretStorage)
│   └── crypto/       # AES-256-GCM 加密
├── presentation/
│   ├── commands/     # VS Code 命令
│   └── views/         # UI
├── domain/           # 领域层
└── proposedApi/     # VS Code Proposed API 类型
```

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
logger.error("Error message", error);
```

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

### 类型

- 优先 `interface`，需要灵活性时用 `type`
- 避免 `any`，用 `unknown` 替代

---

## 存储键规范

所有存储键必须以 `addi.` 前缀：

| 键                        | 存储    | 说明          |
| ------------------------- | ------- | ------------- |
| `addi.config`             | Memento | Provider 配置 |
| `addi.config.modifiedAt`  | Memento | 配置修改时间  |
| `addi.local.stats`        | State   | 本地模型统计  |
| `addi.local.deviceId`     | Secret  | 设备 ID       |
| `addi.local.apikeys.{id}` | Secret  | API Key       |
| `addi.local.backups`      | State   | 配置备份      |

---

## Provider 注册

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册：

```typescript
this.register({
  id: "provider-id",
  label: "Display Name",
  create: (p) => {
    return createProvider({
      baseURL: p.apiEndpoint,
      apiKey: p.apiKey,
    });
  },
});
```

---

## 常用命令

```powershell
bun install      # 安装
bun run watch    # 开发模式
bun run test     # 测试
```

1. 在 `src/core/llm/aiRegistry.ts` 中注册 Provider 工厂
2. 配置 Provider 的 API Endpoint
3. 添加 Model 配置

```typescript
// 示例: 添加新 Provider
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

### 添加新的命令

1. 在 `src/presentation/commands.ts` 中添加命令处理函数
2. 在 `src/presentation/extension.ts` 中注册命令

```typescript
// 注册命令
vscode.commands.registerCommand("addi.myCommand", async () => {
  // 命令逻辑
});
```

### 添加新的类型

1. 在 `src/common/types.ts` 中添加类型定义
2. 导出类型供其他模块使用

```typescript
// 添加新类型
export interface NewFeature {
  id: string;
  name: string;
}
```

---

## 调试指南

### VS Code 调试

1. 打开项目根目录
2. 切换到调试视图 (`Ctrl+Shift+D`)
3. 点击 "Extension" 运行
4. 使用 `Ctrl+Shift+P` → `Developer: Reload Window` 重新加载

### 日志调试

项目使用统一的日志系统：

```typescript
import { logger } from "./common/logger";

// 调试 LLM 请求
logger.debug(
  "Chat request",
  {
    provider: provider.name,
    model: model.id,
    messages: messageSummary,
  },
  "LLMService",
);
```

### 查看日志

1. 打开 Output 面板 (`View > Output`)
2. 从下拉菜单中选择 "Addi"

---

## 测试指南

### AI SDK 测试脚本

位置: `scripts/test-ai-sdk.js`

```powershell
# 设置环境变量 (Windows PowerShell)
$env:API_KEY = "your-api-key"

# 流对话测试
bun run scripts/test-ai-sdk.js stream

# 普通对话测试
bun run scripts/test-ai-sdk.js generate

# 工具调用测试
bun run scripts/test-ai-sdk.js tools

# Anthropic SDK 测试
bun run scripts/test-ai-sdk.js anthropic

# 运行所有测试
bun run scripts/test-ai-sdk.js all
```

### 单元测试

```powershell
# 运行所有测试
bun test

# 运行特定测试
bun test src/test/core/messageConverter.test.ts

# 监视模式
bun run watch
```

### 测试注意事项

- 测试需要正确的 ExtensionContext mock
- 避免测试需要 UI 交互的用例（如文件选择器）
- 使用 `vscodeEnv` 获取模拟的 VS Code 环境变量

---

## 注意事项

### VS Code Proposed API

- 项目使用 `src/proposedApi/` 中的自定义类型定义
- Proposed API 可能随 VS Code 版本变化
- 需要 VS Code 1.109+ 才能使用

### Provider 配置

- API Key 存储在 SecretStorage 中，敏感安全
- Provider 配置通过 WorkspaceState 持久化
- Model 配置中的 `isUserSelectable` 控制模型可见性

### 流式响应

- 使用 `streamText` 获取流式响应
- 需要处理 `text-delta`、`reasoning-delta`、`tool-call` 等事件
- 工具调用是多轮的，需要反馈结果给 LLM

### 错误处理

- 网络错误需要记录详细日志
- API 错误需要记录响应状态码和错误体
- 使用 `LanguageModelError` 抛出符合 VS Code 规范的错误

### 性能优化

- 工具查找使用 Map 缓存
- 异步处理使用 Promise.all 并行执行
- 避免在主线程中进行耗时操作

---

## 相关文档

- [AI SDK 参考](./ai-sdk-reference.md)
- [VS Code API 参考](./vscode-reference.md)
- [项目架构文档](./project-document.md)
