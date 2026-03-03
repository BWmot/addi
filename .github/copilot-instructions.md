# Addi 项目开发规范

## 概述

本文件定义了 addi 项目开发过程中的最佳实践和注意事项，确保开发流程的一致性和高效性。

## 开发环境

- **操作系统**: Windows / MacOS
- **终端**: PowerShell / Zsh
- **包管理器**: Bun
- **VS Code**: 1.109+ (用于 Proposed API 支持)

### 必需工具

| 工具    | 版本要求 | 说明              |
| ------- | -------- | ----------------- |
| VS Code | 1.109+   | 用于 Proposed API |
| Bun     | 最新版   | 运行时和包管理    |

## 核心规范

### 1. 命令规范

确认了当前环境为 Windows / MacOS，请根据操作系统选择合适的终端进行开发。以下是一些示例：

- ✅ 使用 PowerShell 命令
- ✅ 使用 Zsh 命令
- ✅ 使用 Bun 管理依赖
- ❌ 避免在 Windows 使用 Linux 相关命令或语法（如 `2>&1` 重定向、如 `&&` 拼接命令）
- ❌ 避免在 MacOS 使用 Windows 相关命令或语法（如 `dir` 列出目录、如 `copy` 复制文件）

windows 用户可以使用 PowerShell，macOS 用户可以使用 Zsh 或 Bash。确保在编写脚本时考虑到不同平台的兼容性，避免使用特定于某个平台的命令或语法。

```powershell
# 正确示例
bun install
bun run build

# windows错误示例
npm run build && echo "done"  # 不使用 &&
ls -la  # 不使用 ls

# macOS错误示例
dir  # 不使用 dir
copy file1.txt file2.txt  # 不使用 copy
```

### 2. 文档规范

- 本地设计文档存放在 `docs/` 目录下，其他文档以markdown格式存放在根目录
- 设计文档应包含详细的设计方案、数据结构定义、流程图等，以便开发者理解和参考
- 定期对照官方文档验证设计方案的正确性，确保与最新的 API 和功能保持一致
- 如发现不满足开发需求或出现偏差，或项目查询到更好的工程化方案，也可以讨论后修订文档

### 3. 代码规范

#### 命名规范

| 类型   | 规范             | 示例                                     |
| ------ | ---------------- | ---------------------------------------- |
| 类名   | PascalCase       | `LLMService`, `AIRegistry`               |
| 接口   | PascalCase       | `ProviderFactory`, `ModelCapabilities`   |
| 方法   | camelCase        | `getProviderInstance()`, `chat()`        |
| 变量   | camelCase        | `providerInstance`, `modelList`          |
| 常量   | UPPER_SNAKE_CASE | `DEFAULT_MAX_TOKENS`                     |
| 文件名 | kebab-case       | `llm-service.ts`, `message-converter.ts` |

#### 导入规范

```typescript
// 优先使用绝对导入
import { LLMService } from './core/llm/llmService';
import { logger } from './common/logger';

// 避免使用相对路径深度导入
// ❌ import { xxx } from '../../../../common/logger';
// ✅ import { logger } from '../common/logger';
```

#### 日志规范

```typescript
import { logger } from './common/logger';

// 不同级别的日志
logger.debug('Debug info', { data: 'value' }, 'ComponentName');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);

// 格式: logger.debug(message, data?, componentName?)
```

#### 错误处理规范

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

#### 类型规范

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

### 4. 脚本规范

- 项目辅助脚本存放在 `scripts/` 下
- 脚本使用 TypeScript (`.ts`) 编写，由 Bun 执行
- 主要脚本：
  - `scripts/build.ts` - 构建和打包 VSIX
  - `scripts/clean.ts` - 清理构建产物
- 项目的测试脚本放在 `tests-e2e/` 下

### 5. 测试规范

- E2E 测试位于 `tests-e2e/` 目录
- 根据项目变动及时修正单元测试内容，确保测试覆盖率和准确性
- 定期运行测试，确保代码质量和功能稳定性

### 6. 文档驱动开发

- 设计文档是开发的核心依据
- 保持文档与代码的同步，任何代码变更都应首先更新设计文档
- 定期回顾文档与代码的一致性，确保长期维护性

## 开发流程

### 代码审计流程

1. 阅读设计文档，理解需求
2. 审计现有代码实现
3. 对比差异，形成修改计划
4. 分阶段执行修改，频繁出错的点应该分解成更小的任务步骤
5. 执行完去除改动后冗余代码，或先注释掉不再使用的代码块
6. 每阶段完成后总结并确认下一步，结合项目情况提出工作建议
7. 当不确定语法是否有效时，通过编译报错快速验证
8. 定期回顾文档与代码的一致性，确保长期维护性
9. 如有不确定的地方，及时查阅官方文档或寻求帮助
10. 允许破坏性更新，但需明确标记不兼容变更，由用户同意后执行

### 修改计划执行

- 使用 Markdown 勾选标记跟踪进度
- 及时修订计划中的步骤，或拆解更小的任务以适应实际开发情况
- 每完成一个阶段，回顾总结并确认下一步计划
- 当用户提到的某些规定规范未包含在本文同时确有必要，可以询问后更新至本文件中

### 版本管理

版本以a.b.c格式管理，遵循语义化版本控制原则：

- **a**: 主版本，包含重大变更和不兼容更新
- **b**: 次版本，包含向下兼容的新功能
- **c**: 修订版本，包含向下兼容的问题修复

### 更新规则：

- 0.0.c -> 0.0.(c+1)：开发验证阶段，功能不完整，允许频繁破坏性更新带来更多尝试与迭代
- 0.0.c -> 0.1.0：初始开发阶段，功能不完整，可能包含破坏性变更，但开始形成版本规范
- 0.b.c -> 1.0.0：初始发布，基本功能完成，可能包含破坏性变更，但需要形成正式的发布报告
- 1.b.c -> 1.b.(c+N)：修复 bug 或小改动，保持向下兼容
- 1.b.c -> 1.(b+1).0：添加新功能，但保持向下兼容，或提供自动迁移能力，或给出明确的升级指南
- 1.b.c -> (a+1).0.0：包含不兼容的重大变更（硬迁出的分支），需形成破坏性更新报告，给出迁移工具或升级指南

## 常用命令

```powershell
# 安装依赖
bun install

# 开发模式（监听）
bun run watch

# 运行测试
bun test

# 构建（编译 + 打包 VSIX）
bun run build

# 构建并安装到 VS Code
bun run build:install

# 构建并发布到 GitHub（需要交互确认）
bun run build:release

# 清理构建产物
bun run clean

# 清理所有（包括 node_modules、.vsix、.vscode-test）
bun run clean:all
```

## 注意事项

1. **编译错误检查**: 每次修改后运行 `bun run build` 检查编译
2. **类型重定义**: 确保类型定义与文档一致
3. **去除冗余**: 直接删除陈旧和无用的代码
4. **分阶段执行**: 每完成一个阶段，总结并确认下一步
5. **官方文档**: 把握不准时查阅官方文档
6. **脚本安全**: `--release` 参数需要交互确认，非 TTY 模式下会被拒绝

## 相关文档

- `docs/project-document.md` - 项目架构与设计文档
- `docs/ai-sdk-reference.md` - AI SDK 参考文档
- `docs/vscode-reference.md` - VS Code API 参考文档
- `docs/dev-coding-notes.md` - 开发规范与注意事项
- `README.md` - 项目入门指南
