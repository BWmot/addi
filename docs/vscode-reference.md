# VS Code API 参考文档

> 更新时间：2026-03-01

本文档是 Addi 项目涉及的 VS Code API 参考，包含内置命令、Language Model API、类型定义等内容。

---

## 目录

1. [Language Model API](#language-model-api)
2. [消息类型](#消息类型)
3. [响应部分类型](#响应部分类型)
4. [Provider API](#provider-api)
5. [工具相关类型](#工具相关类型)
6. [内置命令](#内置命令)
7. [Proposed API 类型定义](#proposed-api-类型定义)

---

## Language Model API

### 核心接口

#### LanguageModelChatProvider

扩展实现此接口来向 VS Code Copilot 提供语言模型：

```typescript
export interface LanguageModelChatProvider {
  provideLanguageModelChatInformation(
    options: { silent: boolean },
    token?: CancellationToken
  ): Thenable<LanguageModelChatInformation[]>;

  provideLanguageModelChat(
    model: LanguageModelChatInformation,
    options?: LanguageModelChatRequestOptions,
    token?: CancellationToken
  ): Thenable<LanguageModelChat>;
}
```

#### LanguageModelChatInformation

可用语言模型的信息：

```typescript
export interface LanguageModelChatInformation {
  id: string;
  name: string;
  vendor: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsThinking?: boolean;
  supportsToolCalls?: boolean;
  isUserSelectable?: boolean;
}
```

#### LanguageModelChat

发送请求到语言模型的主要接口：

```typescript
export interface LanguageModelChat {
  sendRequest(
    messages: Array<LanguageModelChatMessage>,
    options?: LanguageModelChatRequestOptions,
    token?: CancellationToken
  ): Thenable<LanguageModelChatResponse>;

  countTokens(text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number>;
}
```

#### LanguageModelChatResponse

语言模型的响应，包含响应部分的流：

```typescript
export interface LanguageModelChatResponse {
  stream: AsyncIterable<
    LanguageModelTextPart | LanguageModelThinkingPart | LanguageModelToolCallPart | unknown
  >;
}
```

---

## 消息类型

### 消息角色枚举

```typescript
export enum LanguageModelChatMessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}
```

### LanguageModelChatMessage

标准消息格式（Addi 项目当前使用）：

```typescript
export class LanguageModelChatMessage {
  role: LanguageModelChatMessageRole;
  content: string;

  static User(content: string, name?: string): LanguageModelChatMessage;
  static Assistant(content: string, name?: string): LanguageModelChatMessage;
  static System(content: string): LanguageModelChatMessage;
}
```

**注意**：Addi 项目当前仅使用 `LanguageModelChatMessage`，不支持多部分内容（如 `LanguageModelChatMessage2`）。

---

## 响应部分类型

### LanguageModelTextPart

文本内容：

```typescript
export class LanguageModelTextPart {
  value: string;
  constructor(value: string);
}
```

### LanguageModelThinkingPart

思考/推理内容（适用于 Claude、DeepSeek 等模型）：

```typescript
export class LanguageModelThinkingPart {
  value: string | string[];
  id?: string;
  metadata?: { readonly [key: string]: any };

  constructor(value: string | string[], id?: string, metadata?: { readonly [key: string]: any });
}
```

### LanguageModelToolCallPart

工具调用请求：

```typescript
export class LanguageModelToolCallPart {
  callId: string; // 工具调用的唯一 ID
  name: string; // 工具名称
  arguments: any; // 传递给工具的参数

  constructor(callId: string, name: string, arguments: any);
}
```

### LanguageModelToolResultPart

工具执行结果：

```typescript
export class LanguageModelToolResultPart {
  toolCallId: string; // 对应的工具调用 ID
  content: Array<LanguageModelTextPart | LanguageModelDataPart>;

  constructor(toolCallId: string, content: Array<LanguageModelTextPart | LanguageModelDataPart>);
}
```

### LanguageModelDataPart

二进制数据（如图像）：

```typescript
export class LanguageModelDataPart {
  value: string | Uint8Array; // URL、Uint8Array 或 base64 字符串
  mimeType?: string;

  constructor(value: string | Uint8Array, mimeType?: string);
}
```

---

## Provider API

### LanguageModelChatRequestOptions

聊天请求选项：

```typescript
export interface LanguageModelChatRequestOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number | undefined;
  tools?: LanguageModelChatTool[];
}
```

### LanguageModelChatTool

语言模型可用的工具定义：

```typescript
export interface LanguageModelChatTool {
  name: string;
  description: string;
  inputSchema: object;
}
```

### LanguageModelChatToolInvocationOptions

工具调用选项：

```typescript
export interface LanguageModelChatToolInvocationOptions<T> {
  toolName: string;
  invocationContext?: { [key: string]: any };
  parameters: T;
}
```

---

## 工具相关类型

### LanguageModelToolDefinition

工具定义（名称、描述、输入 schema）：

```typescript
export interface LanguageModelToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}
```

### LanguageModelTool

工具实现：

```typescript
export interface LanguageModelTool<T> {
  invoke: (
    invocation: LanguageModelToolInvocationOptions<T>,
    token?: CancellationToken
  ) => Thenable<LanguageModelToolResult>;
}
```

### lm 命名空间

```typescript
// 注册工具定义
lm.registerToolDefinition(definition, tool): Disposable

// 调用工具
lm.invokeTool(tool, options, token): Thenable<LanguageModelToolResult>

// 嵌入模型
lm.embeddingModels: readonly string[]
lm.onDidChangeEmbeddingModels: Event<void>
lm.computeEmbeddings(model, input, token): Thenable<Embedding | Embedding[]>
lm.registerEmbeddingsProvider(model, provider): Disposable
```

---

## 内置命令

### Chat 命令

| 命令 ID                                   | 说明             |
| ----------------------------------------- | ---------------- |
| `workbench.action.chat.open`              | 打开聊天视图     |
| `workbench.action.chat.newChat`           | 开始新聊天       |
| `workbench.action.chat.changeModel`       | 更改语言模型     |
| `workbench.action.chat.focusInput`        | 聚焦聊天输入框   |
| `workbench.action.chat.submit`            | 提交当前输入     |
| `workbench.action.chat.cancel`            | 取消进行中的请求 |
| `workbench.action.chat.openModelPicker`   | 打开模型选择器   |
| `workbench.action.chat.switchToNextModel` | 切换到下一个模型 |

### Copilot Chat 命令

| 命令 ID                               | 说明               |
| ------------------------------------- | ------------------ |
| `github.copilot.chat.explain`         | 解释选中代码       |
| `github.copilot.chat.fix`             | 修复选中代码       |
| `github.copilot.chat.review`          | 审查选中代码       |
| `github.copilot.chat.attachFile`      | 附加文件到聊天     |
| `github.copilot.chat.attachSelection` | 附加选中内容到聊天 |

### Editor 命令

| 命令 ID                              | 说明           |
| ------------------------------------ | -------------- |
| `vscode.open`                        | 打开资源       |
| `vscode.diff`                        | 打开差异编辑器 |
| `workbench.action.files.save`        | 保存文件       |
| `workbench.action.files.saveAs`      | 另存为         |
| `workbench.action.closeActiveEditor` | 关闭编辑器     |
| `workbench.action.nextEditor`        | 下一个编辑器   |
| `workbench.action.previousEditor`    | 上一个编辑器   |
| `workbench.action.quickOpen`         | 快速打开       |
| `workbench.action.showCommands`      | 命令面板       |
| `editor.action.formatDocument`       | 格式化文档     |
| `editor.action.rename`               | 重命名符号     |
| `editor.action.goToDefinition`       | 跳转到定义     |
| `editor.action.goToReferences`       | 查找引用       |

### Terminal 命令

| 命令 ID                                     | 说明         |
| ------------------------------------------- | ------------ |
| `workbench.action.terminal.toggleTerminal`  | 切换终端     |
| `workbench.action.terminal.new`             | 新建终端     |
| `workbench.action.terminal.kill`            | 终止终端     |
| `workbench.action.terminal.runSelectedText` | 运行选中文本 |
| `workbench.action.terminal.focus`           | 聚焦终端     |
| `workbench.action.terminal.clear`           | 清除终端     |

### Debug 命令

| 命令 ID                           | 说明         |
| --------------------------------- | ------------ |
| `workbench.action.debug.start`    | 开始调试     |
| `workbench.action.debug.run`      | 运行不调试   |
| `workbench.action.debug.stop`     | 停止调试     |
| `workbench.action.debug.restart`  | 重新开始调试 |
| `workbench.action.debug.stepOver` | 逐过程       |
| `workbench.action.debug.stepInto` | 逐语句       |
| `workbench.action.debug.stepOut`  | 跳出         |
| `workbench.action.debug.continue` | 继续         |

### Git 命令

| 命令 ID        | 说明     |
| -------------- | -------- |
| `git.commit`   | 提交     |
| `git.push`     | 推送     |
| `git.pull`     | 拉取     |
| `git.stage`    | 暂存     |
| `git.unstage`  | 取消暂存 |
| `git.checkout` | 检出     |

### View 命令

| 命令 ID                          | 说明           |
| -------------------------------- | -------------- |
| `workbench.view.explorer`        | 聚焦资源管理器 |
| `workbench.view.search`          | 聚焦搜索       |
| `workbench.view.scm`             | 聚焦源代码管理 |
| `workbench.view.debug`           | 聚焦调试       |
| `workbench.view.extensions`      | 聚焦扩展       |
| `workbench.panel.output.focus`   | 聚焦输出面板   |
| `workbench.panel.problems.focus` | 聚焦问题面板   |

---

## Proposed API 类型定义

### 文件结构

Addi 项目的 Proposed API 类型定义位于 `src/proposedApi/` 目录：

```
src/proposedApi/
├── index.ts                                    # 导出入口
├── vscode.proposed.languageModelThinkingPart.d.ts  # Thinking Part 类型
├── vscode.proposed.languageModelError.d.ts         # Error 类型
└── vscode.proposed.lm.d.ts                        # 核心 LM 类型
```

### 错误类型

```typescript
// 使用示例
throw LanguageModelError.NotFound('Model gpt-4 not found');
throw LanguageModelError.NoPermissions('Insufficient permissions');
throw LanguageModelError.Blocked('Content filtered');
```

错误工厂方法：

- `LanguageModelError.NotFound(message)`
- `LanguageModelError.NoPermissions(message)`
- `LanguageModelError.Blocked(message)`

---

## 模型管理 API

### 获取可用模型

```typescript
// 获取所有可用的聊天模型
const models = await vscode.lm.selectChatModels();
```

### 监听模型变化

```typescript
vscode.lm.onDidChangeChatModels(() => {
  // 模型列表发生变化时触发
});
```

### Context Keys

在 `when` 子句中可用的键：

| Key                    | 说明                          |
| ---------------------- | ----------------------------- |
| `chatModelId`          | 当前选中模型的短 ID           |
| `chatModeKind`         | 当前代理类型 (ask/agent/edit) |
| `chatSessionHasModels` | 当前会话是否有可用模型        |
| `chatInputHasText`     | 聊天输入框是否有文本          |

---

## 相关文档

- [AI SDK 参考](./ai-sdk-reference.md)
- [项目架构文档](./project-document.md)
- [开发规范](./dev-coding-notes.md)
- [VS Code Language Model API 官方文档](https://code.visualstudio.com/api/extension-guides/language-model)
- [VS Code Copilot Chat 源码](https://github.com/microsoft/vscode-copilot-chat)
