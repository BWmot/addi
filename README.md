# Addi — Extend Copilot with Your Own AI Models

<a href="https://github.com/deepwn/addi/releases"><img alt="Release" src="https://img.shields.io/github/v/release/deepwn/addi?logo=github" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=deepwn.addi"><img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.120-blue?logo=visual-studio-code" /></a>
<a href="https://github.com/deepwn/addi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/deepwn/addi" /></a>
<a href="https://github.com/deepwn/addi/actions"><img alt="GitHub Actions" src="https://img.shields.io/badge/i18n-ZH%20%7C%20EN-blue?logo=localizely" /></a>

**Addi** is a VS Code extension that bridges **GitHub Copilot** with your preferred AI providers. Instead of being locked into a single vendor's models, you can connect Copilot to OpenAI-compatible APIs, Anthropic Claude, Google Gemini, DeepSeek, or any custom LLM endpoint — giving you full control over your AI stack while keeping Copilot's native interface and workflow.

> 💡 **Why Addi?** You get Copilot's seamless IDE integration (inline completions, agent mode, tool calling, file operations) with your choice of models — no vendor lock-in, no browser tabs, no CLI tools.

---

## Features

### 🤖 Multi-Provider, Multiple Models per Provider
Connect **OpenAI** (GPT-4o, o-series), **Anthropic** (Claude Sonnet/Opus), **Google** (Gemini Pro/Flash), **DeepSeek**, **Ollama** (local), or any **OpenAI-compatible** endpoint. Each provider can host multiple models with independent configurations.

### 🔧 Full Copilot Integration
Models appear directly in Copilot's model picker — use them in chat, agent mode, or inline edits. Works with Copilot's built-in tools: code search, terminal execution, file editing, and diagnostics.

### 💬 Streaming & Thinking
Real-time token-by-token output with reasoning/thinking display for supported models (OpenAI o-series, Anthropic Claude with extended thinking, Google Gemini thinking, DeepSeek R1). Supports `reasoning_content` backfill in multi-turn conversations — tested with DeepSeek V4/R1 and Xiaomi MiMo v2+ via OpenAI-compatible endpoint.

### 👁️ Vision & Tool Calling
Send images to multimodal models and leverage Copilot's tool ecosystem. Models with tool-calling capabilities can use code search, terminal, file operations, and more directly from the chat interface.

### ⚡ Speed Monitoring
Track real-time performance metrics per model — average speed, rolling window history, and latency stats. See exactly how your models perform in the sidebar.

### 🖥️ Modern Webview UI
React + TypeScript + Vite forms for provider and model editing, with per-provider conditional rendering (reasoning effort for OpenAI, thinking level for Anthropic/Google), field validation, and experimental features section.

### 🌐 Multi-Language (i18n)
Fully localized extension UI with English and Chinese (Simplified) support. Both code-level strings and contribution point strings (commands, views, configuration) are translated. Automatically matches VS Code's display language.

### 📦 Import / Export
Backup, migrate, or share provider configurations as JSON. Supports encrypted export for secure configuration sharing across devices.

---

## Quick Start

1. **Install** the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=deepwn.addi)
2. **Open the Addi sidebar** — click the icon in the Activity Bar
3. **Add a Provider** — click the `+` button, fill in the API endpoint and key in the webview form
4. **Add a Model** — click a provider's `+` button, configure model ID, capabilities, and reasoning options
5. **Open Copilot Chat** — select your model from the model picker and start coding

> For detailed setup instructions, see the [User Guide](./docs/DOCUMENTATION.md).

## Supported Providers

| Provider          | Type ID                  | Examples                             |
| ----------------- | ------------------------ | ------------------------------------ |
| OpenAI-compatible | `openai-completions`     | OpenAI, DeepSeek, local Ollama, etc. |
| OpenAI Responses  | `openai-responses`       | OpenAI (native tool support)         |
| Anthropic         | `anthropic-messages`     | Claude Sonnet, Claude Opus           |
| Google            | `google-generateContent` | Gemini Pro, Gemini Flash             |

## Documentation

| Document                                                         | Description                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| [User Guide](./docs/DOCUMENTATION.md)                            | Installation, configuration, usage, and troubleshooting     |
| [Changelog](./CHANGELOG.md)                                      | Version history and release notes                           |
| [Architecture Spec](./docs/architecture-spec.md)                 | Layered architecture, data flow, core design constraints    |
| [Coding Standards](./docs/coding-standards.md)                   | Type safety, logging, error handling, naming conventions    |
| [AI SDK Reference](./docs/ai-sdk-reference.md)                   | AI SDK v6 API types and mapping                             |
| [VS Code API Reference](./docs/vscode-reference.md)              | VS Code Copilot API and Proposed API reference              |
| [Reasoning Architecture](./docs/reasoning-architecture.md)       | Architecture reference for reasoning/thinking capabilities   |
| [Config Export/Import](./docs/encrypted-config-export-import.md) | Encrypted JSON backup, migration, and sharing of configs    |

## Feature Roadmap

- **🌐 Complete i18n**: Full localization with Chinese (Simplified) support — everything from command labels to config descriptions
- **🖥️ Webview UI**: New React + TypeScript + Vite forms replacing the legacy HTML editor
- **🧠 Reasoning Support**: Thinking/reasoning content adaptation middleware and utilities
- **🔬 E2E Tests**: Comprehensive test suite for data normalization and model fetching
- **🔐 Encrypted Config Export/Import**: Secure backup and migration of provider/model configurations
- **⚡ Performance Metrics**: Real-time speed monitoring and historical performance tracking
- **🛠️ More Providers**: Ongoing integration of new providers and model types based on user demand

See the [full changelog](./CHANGELOG.md) for details.

## Contributing

Issues and pull requests are welcome at [github.com/deepwn/addi](https://github.com/deepwn/addi). Please review our [coding standards](./docs/coding-standards.md) before contributing.

## License

[MIT License](./LICENSE)
