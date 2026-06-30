# VS Code API 参考

> 更新时间：2026-04-22
> 基于 VS Code Copilot API

---

## Language Model API

### LanguageModelChatProvider (Proposed: chatProvider)

```typescript
interface LanguageModelChatProvider<
  T extends LanguageModelChatInformation = LanguageModelChatInformation,
> {
  provideLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,
    token: CancellationToken,
  ): ProviderResult<T[]>;

  provideLanguageModelChatResponse(
    model: T,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
  ): Thenable<void>;
}
```

### LanguageModelChatInformation

```typescript
interface LanguageModelChatInformation {
  id: string;
  name: string;
  family: string;
  tooltip?: string;
  detail?: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: {
    imageInput?: boolean;
    toolCalling?: boolean | number;
  };
}
```

### LanguageModelChatInformation 注意事项

- 只返回当前 VS Code API 明确定义的字段。不要把 QuickPick/TreeItem 风格字段混进模型元数据里。
- 已确认不要返回 `category`。`category` 不是 `LanguageModelChatInformation` 字段，会让 Copilot Chat 输入框下方的模型按钮可以显示当前模型，但点击模型按钮无法弹出模型列表。
- 模型来源/分组信息用 `detail` 或 `tooltip` 表达。真正的模型分组由 VS Code 的 language model provider groups 机制处理，不由 provider 返回的 `category` 控制。
- `isUserSelectable` 是 VS Code host 内部仍会读取的兼容字段，但它不在当前 `@types/vscode` 的公开接口中。使用时只用于显隐控制，不要依赖它承载 UI 分组。
- 修改 `provideLanguageModelChatInformation()` 后必须同时验证两条路径：侧边栏 `Addi: Set Model to Copilot` 能直接切换，以及 Copilot Chat 输入框下方的模型按钮能打开 picker。

---

## 消息类型

```typescript
enum LanguageModelChatMessageRole {
  User = "user",
  Assistant = "assistant",
  System = "system",
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
new LanguageModelTextPart("text");
new LanguageModelThinkingPart("thinking", "id", metadata);
new LanguageModelToolCallPart("callId", "toolName", args);
new LanguageModelToolResultPart("callId", [new LanguageModelTextPart("result")]);
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

类型定义位于 `typings/proposedApi/`。

### languageModelThinkingPart

```typescript
// Thinking Part
new LanguageModelThinkingPart(value, id?, metadata?)

// value: string | string[]
// id?: string - 思考序列的唯一标识符
// metadata?: { readonly [key: string]: any }
```

### LanguageModelChatMessage2

支持多部分内容的增强消息类型：

```typescript
class LanguageModelChatMessage2 {
  static User(
    content: string | Array<TextPart | ToolResultPart | DataPart>,
  ): LanguageModelChatMessage2;
  static Assistant(
    content: string | Array<TextPart | ToolCallPart | DataPart>,
  ): LanguageModelChatMessage2;

  content: Array<TextPart | ToolResultPart | ToolCallPart | DataPart | LanguageModelThinkingPart>;
}
```

### toolInvocationApproveCombination

允许用户批准特定工具+参数组合：

```typescript
interface LanguageModelToolConfirmationMessages {
  approveCombination?: {
    message: string | MarkdownString; // 批准按钮的标签
    arguments?: string; // 参数的可读表示
  };
}
```

### chatParticipantPrivate (重要更新)

新增子代理和权限相关功能：

```typescript
interface ChatRequest {
  subAgentInvocationId?: string; // 子代理调用 ID
  subAgentName?: string; // 子代理显示名
  parentRequestId?: string; // 父请求 ID
  permissionLevel?: string; // 'autoApprove' | 'autopilot'
  hasHooksEnabled: boolean;
  isSystemInitiated?: boolean; // 系统发起请求
  chatSessionResource: Uri; // 注意：已从 sessionId 改为 Uri
}

interface LanguageModelToolInvocationOptions<T> {
  subAgentInvocationId?: string;
  preToolUseResult?: {
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    updatedInput?: object;
  };
}

class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
  toolResultMessage?: string | MarkdownString;
  toolResultDetails?: Array<Uri | Location>;
  toolMetadata?: unknown;
  hasError?: boolean;
}
```

### Error Types

```typescript
LanguageModelError.NotFound(message);
LanguageModelError.NoPermissions(message);
LanguageModelError.Blocked(message);
```
