# Addi 开发规范

> 更新时间：2026-04-07

---

## 概述

Addi 桥接 AI SDK 与 VS Code Copilot API，支持自定义 LLM 提供商。

---

## 开发环境

| 要求    | 版本       | 说明              |
| ------- | ---------- | ----------------- |
| VS Code | 1.109+     | Proposed API 支持 |
| Bun     | 最新版     | 运行时和包管理    |
| Windows | PowerShell | 终端              |

---

## 常用命令

```powershell
bun install        # 安装依赖
bun run watch      # 开发模式（监听）
bun test           # 运行测试
bun run build      # 构建（编译 + 打包 VSIX）
bun run clean      # 清理构建产物
```

---

## 代码规范

### 命名

| 类型      | 规范        | 示例                  |
| --------- | ----------- | --------------------- |
| 类/接口   | PascalCase  | `LLMService`          |
| 方法/变量 | camelCase   | `getProviderInstance` |
| 常量      | UPPER_SNAKE | `DEFAULT_MAX_TOKENS`  |
| 文件名    | kebab-case  | `llm-service.ts`      |

### 日志

```typescript
import { logger } from "./common/logger";

logger.debug("Debug info", { data: "value" }, "Component");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message", error);
```

### 类型

```typescript
// 接口用于可扩展类型
interface Provider {
  id: string;
  name: string;
}

// 类型别名用于联合类型
type Status = 'loading' | 'success' | 'error';

// 避免 any，使用 unknown
function parse(data: unknown): string { ... }
```

---

## 存储键规范

| 键名                     | 存储          | 说明                        |
| ------------------------ | ------------- | --------------------------- |
| `addi.config`            | Memento       | Provider/Model 配置（同步） |
| `addi.config.modifiedAt` | Memento       | 配置修改时间                |
| `addi.local.apikeys.*`   | SecretStorage | API Keys（不同步）          |
| `addi.local.deviceId`    | SecretStorage | 设备标识                    |
| `addi.local.backups`     | Memento       | 本地备份记录                |

---

## Provider 注册

在 `src/core/llm/aiRegistry.ts` 的 `ensureInitialized()` 中注册新 Provider：

```typescript
this.register({
  id: "custom-provider",
  label: "Custom Provider",
  create: (p) => {
    const settings = { baseURL: p.apiEndpoint, apiKey: p.apiKey };
    return createCustomProvider(settings);
  },
});
```

---

## 开发流程

1. 阅读设计文档 (`docs/*.md`)
2. 审计现有代码实现
3. 分阶段执行修改
4. 每阶段完成后总结并确认下一步
5. 定期回顾文档与代码一致性

---

## 相关文档

- `docs/project-document.md` - 架构设计
- `docs/ai-sdk-reference.md` - AI SDK 参考
- `docs/vscode-reference.md` - VS Code API 参考
- `docs/dev-coding-notes.md` - 开发注意事项
- `README.md` - 项目入门
