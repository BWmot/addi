# Addi — Extend Your VS Code Copilot with Custom AI Providers and Models

## 简介

Addi 是一个 VS Code 扩展，让你在 GitHub Copilot 中使用自定义 AI 供应商与模型。通过桥接 AI SDK (Vercel) 与 VS Code 的 Language Model Chat API，Addi 支持多种 LLM 提供商，包括 OpenAI、Anthropic、Google、Ollama 等。

<a href="https://github.com/deepwn/addi/releases"><img alt="Release" src="https://img.shields.io/github/v/release/deepwn/addi?logo=github" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
<a href="https://github.com/deepwn/addi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/deepwn/addi" /></a>
<a href="https://github.com/deepwn/addi/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/deepwn/addi" /></a>

> [!WARNING]
> BREAKING CHANGE: 正式版本 `v1.0.0` 往后将保持配置兼容，但针对内部测试版 `v0.0.x` 将不考虑兼容，请务必注意非兼容问题！
>
> 由于 Copilot Chat API 的接口更新，以及对 Addi 配置项的优化重构，旧版本的模型配置已不再兼容新接口与正式版插件，请重新添加 Provider 和 Model。
>
> 如果你之前使用过 Addi，请务必删除旧的 Provider 和 Model 配置，或在首次更新到 `v1.0.0` 时，通过`Ctrl+P` 输入`Addi:` 选择运行 `Addi: Clean All Addi Storage` 和 `Addi: Reset All Addi Settings` 清空原有冲突配置，并按照新的流程重新添加，以确保兼容最新的 Copilot Chat API 和正式版 Addi 插件。
>
> 正式版本往后将专注于对自定义供应商和模型的管理，已去除内测版提供的mcp-server相关功能，在做好备份和工具脚本归档的前提下，可以清除 `~/.addi/bin` 等yaml文件和binary。

## 核心功能

- **多提供商支持** - 添加和管理多个 AI 服务供应商
- **多模型管理** - 为每个提供商添加、编辑、删除模型
- **流式响应** - 完整的流式输出支持
- **工具调用** - 支持 Tool Calling 功能
- **推理过程** - 显示模型的 Thinking/Reasoning 过程

## 安装

**插件市场：** 搜索 "Addi" 或命令面板执行 `ext install addi`

**本地 VSIX：**

```powershell
# 安装依赖并打包
bun install
bun run build

# 直接命令行安装或手动安装
code --install-extension addi-*.vsix
```

## 快速开始

### 1. 添加 Provider

Provider 是 AI 服务的访问端点：

1. 在侧边栏点击 "添加 Provider"
2. 填写基本信息：
   - **名称** - 显示名称
   - **端点 URL** - API 请求地址 (如 `https://api.openai.com/v1`)
   - **API Key** - 访问令牌
   - **类型** - 供应商 API 类型
3. 保存完成

### 2. 添加 Model

Model 是具体的 AI 模型实例：

1. 右键点击 Provider 选择 "添加 Model"
2. 填写模型信息：
   - **模型 ID** - API 调用的远程标识符
   - **显示名称** - 界面显示名称
   - **最大 Tokens** - 上下文窗口大小
   - **能力选项** - 视觉、音频、推理、工具调用等
3. 保存完成

### 3. 使用模型

1. 在 Copilot Chat 中打开模型选择器
2. 选择 Addi 下的模型
3. 开始对话

## 支持的提供商

| 提供商    | 类型 ID                  | 说明                       |
| --------- | ------------------------ | -------------------------- |
| OpenAI    | `openai-completions`     | OpenAI、DeepSeek、本地模型 |
| OpenAI    | `openai-responses`       | 新版 API，原生工具支持     |
| Anthropic | `anthropic-messages`     | Claude 系列模型            |
| Google    | `google-generateContent` | Gemini 系列模型            |

## 项目结构

```
addi/
├── src/
│   ├── common/              # 通用工具和类型定义
│   │   ├── logger.ts        # 日志工具
│   │   └── types/           # 类型定义
│   │       ├── provider.ts  # Provider 类型
│   │       ├── model.ts     # Model 类型
│   │       └── messages.ts  # 消息类型
│   ├── core/
│   │   ├── llm/            # LLM 核心逻辑
│   │   │   ├── aiRegistry.ts       # 提供商注册
│   │   │   ├── llmService.ts        # 主服务
│   │   │   ├── messageConverter.ts # 消息转换
│   │   │   ├── modelTester.ts       # 模型测试
│   │   │   ├── toolOrchestrator.ts  # 工具编排
│   │   │   └── toolRegistry.ts      # 工具注册
│   │   └── providers/
│   │       ├── AddiChatProvider.ts   # 主聊天提供者
│   │       └── ProviderModelManager.ts
│   ├── infrastructure/
│   │   └── storage/        # 存储服务
│   └── presentation/
│       ├── commands.ts     # VS Code 命令
│       ├── extension.ts    # 扩展入口
│       └── views/          # UI 视图
├── docs/                   # 架构设计文档
└── resources/              # 静态资源
```

## 开发指南

### 环境要求

- VS Code 1.109+ (用于 Proposed API)
- Bun (运行时和包管理)

### 开发命令

```powershell
# 安装依赖
bun install

# 启动监视模式 (自动编译)
bun run watch

# 运行测试
bun test

# 打包扩展
bun run build
```

### 调试

1. 按 `F5` 启动调试
2. 选择 "Extension" 调试配置
3. 在新的 VS Code 窗口中测试

## 文档

- [项目架构与设计文档](./docs/project-document.md)
- [开发规范与注意事项](./docs/dev-coding-notes.md)
- [AI SDK 参考](./docs/ai-sdk-reference.md)
- [VS Code API 参考](./docs/vscode-reference.md)

## 常见问题

### 1. 填写了模型信息但出现报错

如果在添加模型后遇到使用时chat界面内报错，可能是以下原因：

- **供应商类型选择错误**：请确保在添加 Provider 时选择了正确的供应商类型，这会影响模型配置的验证和 API 调用方式。
- **API Endpoint 配置错误**：请确保 Provider 的 API Endpoint 已正确配置，并且能够访问，可尝试增加`/v1`或逐步移除URL后缀。
- **API Key 配置错误**：请确保 Provider 的 API Key 已正确配置，并且没有过期或权限不足，可尝试通过官方文档说明使用 `curl` 命令行工具测试 API Key 是否有效。
- **模型 ID 错误**：请确认模型 ID 与供应商 API 要求的标准调用名称一致，例如 OpenAI 的 `gpt-4` 或 `gpt-3.5-turbo`。
- **网络问题**：请检查网络连接，确保能够访问供应商的 API 端点，不会因地区锁定或其他原因导致请求失败。
- **请求格式错误**：确保模型配置中的选项（如 maxTokens、能力选项）符合供应商 API 的要求（可能存在不允许的自定义请求选项）。
- **供应商 API 特殊message要求**：供应商可能会更新 API 规范，或有独特的chat message格式或交流规则，导致原有插件的方案不兼容。请参考最新的供应商文档进行调整，或改用供应商的其他兼容类型接口。

### 2. 模型无法出现在模型选择列表中

如果你的模型没有出现在 Copilot 的模型选择器中，可能有以下原因：

- **模型不支持工具调用**：目前 Copilot 要求语言模型必须具备工具调用（Tool Calling）能力才能在选择器中显示。请在模型设置中启用 "Tool Calling" 选项。(无工具能力的模型后方将会显示一个`(?)`警告图标，启用后图标消失)
- **未设置 API Key**：确保供应商已正确配置 API Key，且模型显示没有警告图标。
- **Set Model to Copilot失败**：如果模型在选择器中看不到，或者无法从插件树状图直接设置为 Copilot 模型，可以尝试以下方法操作可见性。

### 3. 无法通过插件右键管理模型可见性（Show/Hide）

当你发现在插件中通过右键菜单切换模型的显示/隐藏状态后，模型选择器中的状态没有变化，这通常是因为 VS Code 内部有一个独立的隐藏状态覆盖了插件的设置。理论上插件在注册模型时会将模型直接设置为Show状态，但如果用户之前手动隐藏过该模型，VS Code 会记住这个隐藏状态并覆盖插件的设置，因此请参考以下步骤务必将模型的可见性，在管理页面改为可见：

1. 在 Copilot Chat 中打开模型选择器
2. 点击选择器最下方的 **"Manage Models..."** 选项
3. 进入 VS Code 的模型管理页面
4. 找到 **Addi** 供应商（通常在列表顶部）
5. 在 Addi 供应商标题上 **右键点击**
6. 选择 **"Show in the Chat Model Picker"**

完成以上步骤后，模型将交给 Addi 插件管理可见性，之后你就可以通过插件的右键菜单自由控制模型的显示/隐藏状态。

### 4. 其他疑难杂症

如果你遇到其他问题，欢迎提交 [GitHub Issue](https://github.com/deepwn/addi/issues)

## 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件
