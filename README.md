# Addi — VS Code Copilot 自定义模型扩展

<a href="https://github.com/deepwn/addi/releases"><img alt="Release" src="https://img.shields.io/github/v/release/deepwn/addi?logo=github" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
<a href="https://github.com/deepwn/addi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/deepwn/addi" /></a>

Addi 是一个 VS Code 扩展，让你在 GitHub Copilot 中使用自定义 AI 供应商与模型。支持 OpenAI、Anthropic、Google Gemini、Ollama 等多种 LLM 提供商。

> [!IMPORTANT]
> **从 v0.0.x 升级注意**: 旧版本配置不再兼容。首次更新到 v1.0+ 时，请通过 `Ctrl+P` 输入 `Addi:` 运行 `Clean All Addi Storage` 和 `Reset All Addi Settings` 清空旧配置后重新添加。

## 核心功能

- **多提供商支持** - 添加和管理多个 AI 服务供应商
- **多模型管理** - 为每个提供商添加、编辑、删除模型
- **流式响应** - 完整的流式输出支持
- **工具调用** - 支持 Tool Calling 功能
- **推理过程** - 显示模型的 Thinking/Reasoning 过程

## 安装

从 VS Code 插件市场搜索 "Addi" 安装，或执行 `ext install addi`

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

## 配置导入/导出

插件支持 JSON 格式的配置备份与迁移，可在命令面板 (`Ctrl+Shift+P`) 中使用：

- `Addi: Export Configuration` - 导出所有配置
- `Addi: Import Configuration` - 导入配置
- `Addi: Backup Providers` - 本地备份提供商
- `Addi: Restore from Backup` - 从备份恢复

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
