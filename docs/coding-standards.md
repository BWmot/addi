# Addi 编码规范

> 本文档定义 Addi 项目代码质量标准与约束，所有代码提交必须遵守。

---

## 一、类型安全

### 1.1 禁止滥用 `any` 和 `as any`

- 禁止使用 `any` 类型——使用 `unknown` 替代
- 禁止使用 `as any` 类型断言——使用类型守卫或扩展类型定义
- 配置参数使用 `Record<string, unknown>` 而非 `Record<string, any>`

```typescript
// ❌ 错误
const data: any = JSON.parse(str);
(provider as any).apiKey = key;

// ✅ 正确
const data: unknown = JSON.parse(str);
// 直接使用已定义的字段
provider.apiKey = key;
```

### 1.2 Proposed API 类型扩展

当 VS Code Proposed API 类型定义不完整时，定义扩展接口而非 `as any`：

```typescript
// ❌ 错误
const tools = (options as any)?.tools;

// ✅ 正确
interface ExtendedLMOptions extends vscode.ProvideLanguageModelChatResponseOptions {
  tools?: vscode.LanguageModelChatTool[];
}
const tools = (options as ExtendedLMOptions)?.tools;
```

### 1.3 接口优先

- 使用 `interface` 定义可扩展的类型
- 使用 `type` 定义联合类型、交叉类型
- Provider 工厂的 settings 参数必须有具体类型约束

---

## 二、分层约束

### 2.1 依赖方向

```
Presentation → Application → Core → Domain (接口)
                Infrastructure → Domain (接口)
Common → 无外部依赖（纯类型/工具）
```

### 2.2 具体规则

| 规则                      | 说明                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `core/` 不含 UI 组件      | `TreeItem` 子类、Webview 相关类必须放在 `presentation/`          |
| `common/` 不依赖 vscode   | 依赖 VS Code API 的工具放在 `infrastructure/` 或 `presentation/` |
| UseCases 接口注入         | Application 层通过接口注入依赖，不直接引用具体实现类             |
| 存储操作归 infrastructure | 所有 Memento/SecretStorage 操作封装在 `infrastructure/storage/`  |

### 2.3 文件归属参考

| 文件类型                | 归属目录                 | 示例                                |
| ----------------------- | ------------------------ | ----------------------------------- |
| TreeItem 子类           | `presentation/views/`    | `treeItems.ts`                      |
| 用户反馈/通知           | `presentation/utils/`    | `feedback.ts`                       |
| VS Code 配置读取        | `infrastructure/vscode/` | `configService.ts`                  |
| 纯工具函数（无 vscode） | `common/utils/`          | `id.ts`, `validator.ts`, `token.ts` |
| 类型定义                | `common/types/`          | `model.ts`, `provider.ts`           |

---

## 三、日志规范

### 3.1 使用方式

```typescript
import { logger } from "./common/logger";

logger.debug("调试信息", { key: "value" }, "ComponentName");
logger.info("一般信息");
logger.warn("警告信息");
logger.error("错误信息", error, "ComponentName");
```

### 3.2 初始化要求

`Logger` 必须在扩展激活时调用 `initialize(context)` 初始化，将 channel 注册到 `context.subscriptions`。未初始化时调用日志方法会抛出异常（防止资源泄漏）。

### 3.3 敏感信息脱敏

日志中涉及 API Key 等敏感信息时，使用 `maskSecret()` 脱敏：

```typescript
logger.debug("API Key loaded", { key: maskSecret(apiKey) });
```

---

## 四、错误处理

### 4.1 标准模式

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  logger.error("操作失败", error, "ComponentName");
  throw error;
}
```

### 4.2 用户面错误

面向用户的错误消息必须友好、可操作：

```typescript
// ❌ 错误
throw new Error("ERR_INVALID_INPUT");

// ✅ 正确
UserFeedback.showError("Model name cannot be empty");
```

### 4.3 命令注册模式

命令处理函数统一使用 `wrapWithErrorHandling` 包装：

```typescript
function wrapWithErrorHandling(id: string, handler: Function) {
  return async (...args: any[]) => {
    try {
      logger.info(`Command ${id} invoked`);
      await handler(...args);
    } catch (error) {
      UserFeedback.showError(`Failed: ${error}`);
      logger.error(`${id} failed`, error);
    }
  };
}
```

---

## 五、验证模式

验证方法返回错误信息字符串或 `null`，使用 `getError` 命名：

```typescript
// ❌ 错误：validate 返回 null 表示成功，语义反转
static validateName(name: string): string | null { ... }

// ✅ 正确：getError 返回错误信息或 null
static getNameError(name: string): string | null {
  return name.trim().length > 0 ? null : "Name cannot be empty";
}
```

调用方式：

```typescript
const error = InputValidator.getNameError(name);
if (error) {
  UserFeedback.showError(error);
  return;
}
```

---

## 六、API Key 处理

### 6.1 存储规则

- API Key 只存储在 VS Code `SecretStorage` 中
- 禁止写入 `Memento`、`State`、配置文件或日志

### 6.2 空字符串语义

空字符串统一视为无效输入，静默忽略：

```typescript
// ApiKeyService.setApiKey()
if (!apiKey || !apiKey.trim()) {
  return; // 静默忽略空值
}
```

删除 API Key 必须调用 `deleteApiKey()`，不依赖传入空字符串。

---

## 七、命名规范

| 类型      | 规范             | 示例                            |
| --------- | ---------------- | ------------------------------- |
| 类/接口   | PascalCase       | `LLMService`, `ProviderFactory` |
| 方法/变量 | camelCase        | `getProvider()`, `modelList`    |
| 常量      | UPPER_SNAKE_CASE | `DEFAULT_MAX_TOKENS`            |
| 文件      | kebab-case       | `llm-service.ts`                |

---

## 八、测试规范

### 8.1 单元测试

- 纯函数（`TokenFormatter`、`IdGenerator`、`InputValidator`）必须有单元测试
- 测试文件放在 `tests-unit/` 目录，命名 `*.test.ts`
- 运行：`bun test`

### 8.2 端到端测试

- 集成测试放在 `tests-e2e/` 目录
- 运行：`bun run test`（需要 VS Code 实例）

---

## 九、添加新功能

### 9.1 添加新命令

1. 在 `src/presentation/commands/` 对应文件中添加处理函数
2. 在 `src/presentation/extension.ts` 中注册命令

### 9.2 添加新类型

1. 在 `src/common/types/` 对应文件中添加类型定义
2. 通过 `src/common/types/index.ts` barrel export

### 9.3 注册新 Provider

参考 [架构规范 § 5.3](./architecture-spec.md#53-注册新-provider)。
