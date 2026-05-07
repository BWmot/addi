# Addi — Extend Copilot with Your Own AI Models

<a href="https://github.com/deepwn/addi/releases"><img alt="Release" src="https://img.shields.io/github/v/release/deepwn/addi?logo=github" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=deepwn.addi"><img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%3E%3D1.118-blue?logo=visual-studio-code" /></a>
<a href="https://github.com/deepwn/addi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/deepwn/addi" /></a>

Addi bridges GitHub Copilot with your preferred AI providers. Instead of being locked into a single vendor's models, you can connect Copilot to OpenAI-compatible APIs, Anthropic Claude, Google Gemini, or any custom LLM endpoint — giving you full control over your AI stack while keeping Copilot's interface and workflow.

## Features

- **Multi-Provider Support** — Connect OpenAI, Anthropic, Google, DeepSeek, Ollama, or any OpenAI-compatible API
- **Full Copilot Integration** — Models appear directly in Copilot's model picker
- **Streaming Responses** — Real-time token-by-token output
- **Tool Calling** — Use Copilot tools (code search, terminal, file editing) with your models
- **Reasoning / Thinking** — View the model's reasoning process for supported models
- **Vision** — Send images to models that support multimodal input
- **Speed Monitoring** — Track real-time performance metrics per model
- **Import / Export** — Backup, migrate, or share configurations as JSON

## Quick Start

1. **Install** the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=deepwn.addi)
2. **Open the Addi sidebar** in the Activity Bar
3. **Add a Provider** — click the `+` button, enter your API endpoint and key
4. **Add a Model** — right-click the provider, fill in the model ID and capabilities
5. **Open Copilot Chat** — select your model from the model picker and start chatting

> For detailed setup instructions, see the [User Guide](./docs/DOCUMENTATION.md).

## Supported Providers

| Provider          | Type ID                  | Examples                             |
| ----------------- | ------------------------ | ------------------------------------ |
| OpenAI-compatible | `openai-completions`     | OpenAI, DeepSeek, local Ollama, etc. |
| OpenAI Responses  | `openai-responses`       | OpenAI (native tool support)         |
| Anthropic         | `anthropic-messages`     | Claude Sonnet, Claude Opus           |
| Google            | `google-generateContent` | Gemini Pro, Gemini Flash             |

## Documentation

| Document                                           | Description                                             |
| -------------------------------------------------- | ------------------------------------------------------- |
| [User Guide](./docs/DOCUMENTATION.md)              | Installation, configuration, usage, and troubleshooting |
| [Changelog](./CHANGELOG.md)                        | Version history and release notes                       |
| [Architecture](./docs/project-document.md)         | Technical architecture overview                         |
| [Code Quality Audit](./docs/code-quality-audit.md) | Codebase quality analysis                               |

## Contributing

Issues and pull requests are welcome at [github.com/deepwn/addi](https://github.com/deepwn/addi).

## License

[MIT License](./LICENSE)
