# VS Code API 参考

> 更新时间：2026-04-07

---

## Language Model API

### 核心接口

```typescript
interface LanguageModelChatProvider {
  provideLanguageModelChatInformation(options: {
    silent: boolean;
  }): Promise<LanguageModelChatInformation[]>;
  provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: Progress<LanguageModelResponsePart>,
    token?: CancellationToken
  ): Promise<void>;
}
```

### LanguageModelChatInformation

```typescript
interface LanguageModelChatInformation {
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

---

## 消息类型

```typescript
enum LanguageModelChatMessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

class LanguageModelChatMessage {
  role: LanguageModelChatMessageRole;
  content: string;
  static User(content: string): LanguageModelChatMessage;
  static Assistant(content: string): LanguageModelChatMessage;
  static System(content: string): LanguageModelChatMessage;
}
```

---

## 响应部分类型

| 类型                          | 说明          |
| ----------------------------- | ------------- |
| `LanguageModelTextPart`       | 文本内容      |
| `LanguageModelThinkingPart`   | 思考/推理内容 |
| `LanguageModelToolCallPart`   | 工具调用请求  |
| `LanguageModelToolResultPart` | 工具执行结果  |

### 构造方式

```typescript
new LanguageModelTextPart('text');
new LanguageModelThinkingPart('thinking', 'id', metadata);
new LanguageModelToolCallPart('callId', 'toolName', args);
new LanguageModelToolResultPart('callId', [new LanguageModelTextPart('result')]);
```

---

## 工具 API

```typescript
// 注册工具
lm.registerToolDefinition(definition, tool): Disposable

// 调用工具
lm.invokeTool(toolName, options, token): Promise<LanguageModelToolResult>

// 工具定义
interface LanguageModelToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}
```

---

## 内置命令

### Chat

| 命令 ID                                 | 说明           |
| --------------------------------------- | -------------- |
| `workbench.action.chat.open`            | 打开聊天视图   |
| `workbench.action.chat.newChat`         | 开始新聊天     |
| `workbench.action.chat.openModelPicker` | 打开模型选择器 |

### Editor

| 命令 ID                        | 说明       |
| ------------------------------ | ---------- |
| `vscode.open`                  | 打开资源   |
| `workbench.action.files.save`  | 保存文件   |
| `editor.action.formatDocument` | 格式化文档 |
| `editor.action.rename`         | 重命名符号 |

### View

| 命令 ID                         | 说明       |
| ------------------------------- | ---------- |
| `workbench.view.explorer`       | 资源管理器 |
| `workbench.panel.output.focus`  | 输出面板   |
| `workbench.action.showCommands` | 命令面板   |

---

## Proposed API

类型定义位于 `src/proposedApi/`:

```typescript
// Thinking Part
new LanguageModelThinkingPart(value, id?, metadata?)

// Error
LanguageModelError.NotFound(message)
LanguageModelError.NoPermissions(message)
LanguageModelError.Blocked(message)
```
