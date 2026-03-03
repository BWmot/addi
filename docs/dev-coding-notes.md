# 开发规范与注意事项

> 更新时间：2026-03-01

本文档是 Addi 项目的开发规范和注意事项，包含开发环境要求、开发步骤、代码规范等内容。

---

## 目录

1. [开发环境要求](#开发环境要求)
2. [快速开始](#快速开始)
3. [项目结构](#项目结构)
4. [代码规范](#代码规范)
5. [常见开发任务](#常见开发任务)
6. [调试指南](#调试指南)
7. [测试指南](#测试指南)
8. [注意事项](#注意事项)

---

## 开发环境要求

### 必需工具

| 工具    | 版本要求 | 说明              |
| ------- | -------- | ----------------- |
| VS Code | 1.109+   | 用于 Proposed API |
| Bun     | 最新版   | 运行时和包管理    |

### 安装依赖

```powershell
# 安装依赖
bun install
```

---

## 快速开始

### 开发模式

```powershell
# 启动监视模式 (自动编译)
bun run watch
```

### 调试

1. 按 `F5` 启动调试
2. 选择 "Extension" 调试配置
3. 在新的 VS Code 窗口中测试

### 测试

```powershell
# 运行所有测试
bun run test

# 监视模式 (自动编译 + 测试)
bun run watch
```

---

## 项目结构

```
addi/
├── src/
│   ├── common/              # 通用工具和类型定义
│   │   ├── logger.ts       # 日志工具
│   │   └── types/          # 类型定义
│   │       ├── provider.ts # Provider 类型
│   │       ├── model.ts    # Model 类型
│   │       ├── messages.ts # 消息类型
│   │       ├── capabilities.ts
│   │       ├── config.ts
│   │       ├── tool.ts
│   │       └── index.ts
│   ├── core/
│   │   ├── llm/            # LLM 核心逻辑
│   │   │   ├── aiRegistry.ts       # 提供商注册
│   │   │   ├── llmService.ts      # 主服务
│   │   │   ├── messageConverter.ts # 消息转换
│   │   │   ├── modelTester.ts     # 模型测试
│   │   │   ├── toolOrchestrator.ts # 工具编排
│   │   │   └── toolRegistry.ts   # 工具注册
│   │   └── providers/
│   │       ├── AddiChatProvider.ts    # 主聊天提供者
│   │       └── ProviderModelManager.ts
│   ├── infrastructure/
│   │   └── storage/        # 存储服务
│   ├── presentation/
│   │   ├── commands/       # VS Code 命令
│   │   ├── extension.ts    # 扩展入口
│   │   └── views/         # UI 视图
│   ├── domain/            # 领域层
│   │   ├── events/
│   │   └── interfaces/
│   └── proposedApi/        # VS Code Proposed API 类型
├── scripts/               # 构建脚本
├── docs/                  # 文档
└── resources/             # 静态资源
```

---

## 代码规范

### 命名规范

| 类型   | 规范             | 示例                                     |
| ------ | ---------------- | ---------------------------------------- |
| 类名   | PascalCase       | `LLMService`, `AIRegistry`               |
| 接口   | PascalCase       | `ProviderFactory`, `ModelCapabilities`   |
| 方法   | camelCase        | `getProviderInstance()`, `chat()`        |
| 变量   | camelCase        | `providerInstance`, `modelList`          |
| 常量   | UPPER_SNAKE_CASE | `DEFAULT_MAX_TOKENS`                     |
| 文件名 | kebab-case       | `llm-service.ts`, `message-converter.ts` |

### 导入规范

```typescript
// 优先使用绝对导入
import { LLMService } from './core/llm/llmService';
import { logger } from './common/logger';

// 避免使用相对路径深度导入
// ❌ import { xxx } from '../../../../common/logger';
// ✅ import { logger } from '../common/logger';
```

### 日志规范

```typescript
import { logger } from './common/logger';

// 不同级别的日志
logger.debug('Debug info', { data: 'value' }, 'ComponentName');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);

// 格式: logger.debug(message, data?, componentName?)
```

### 错误处理规范

```typescript
// 使用 try-catch 包装异步操作
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', error, 'ComponentName');
  throw error; // 根据需要决定是否重新抛出
}
```

### 类型规范

```typescript
// 优先使用接口而非类型别名（当需要扩展时）
interface User {
  name: string;
  age: number;
}

// 使用类型别名当不需要扩展时
type Status = 'loading' | 'success' | 'error';

// 避免使用 any，使用 unknown 替代
function parse(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  throw new Error('Invalid data');
}
```

### 注释规范

```typescript
/**
 * 获取或创建提供商实例
 * @param provider - Provider 配置
 * @returns AI Provider 实例
 */
function getProviderInstance(provider: Provider): AIProviderInstance {
  // ... 实现
}
```

---

## 常见开发任务

### 添加新的 Provider

1. 在 `src/core/llm/aiRegistry.ts` 中注册 Provider 工厂
2. 配置 Provider 的 API Endpoint
3. 添加 Model 配置

```typescript
// 示例: 添加新 Provider
this.register({
  id: 'custom-provider',
  label: 'Custom Provider',
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
vscode.commands.registerCommand('addi.myCommand', async () => {
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
import { logger } from './common/logger';

// 调试 LLM 请求
logger.debug(
  'Chat request',
  {
    provider: provider.name,
    model: model.id,
    messages: messageSummary,
  },
  'LLMService'
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
