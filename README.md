# Addi — Extend Copilot with Your Own AI Models

<a href="https://github.com/deepwn/addi/releases"><img alt="Release" src="https://img.shields.io/github/v/release/deepwn/addi?logo=github" /></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
<a href="https://github.com/deepwn/addi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/deepwn/addi" /></a>

Addi bridges GitHub Copilot with your preferred AI providers. Instead of being locked into a single vendor's models, you can connect Copilot to OpenAI-compatible APIs, Anthropic Claude, Google Gemini, or any custom LLM endpoint — giving you full control over your AI stack while keeping Copilot's interface and workflow.

> [!IMPORTANT]
> **Upgrading from v0.0.x**: Configuration format has changed in v1.0+. On first upgrade, run `Addi: Clean All Addi Storage` and `Addi: Reset All Addi Settings` via `Ctrl+P` to clear old data before re-adding providers.

## What You Can Do

- **Use any OpenAI-compatible model** with Copilot Chat
- **Connect Claude, Gemini, or custom endpoints** without vendor lock-in
- **Manage multiple providers and models** from a single VS Code sidebar
- **Enable advanced features** like Tool Calling and Reasoning on supported models
- **Import/export configurations** for team sharing or backup

## Quick Start

### 1. Add a Provider

A Provider is an API endpoint (e.g., OpenAI API, a local Ollama server):

1. Click **"Add Provider"** in the Addi sidebar
2. Fill in the connection details:
   - **Name** — Display label
   - **API Endpoint** — Base URL (e.g., `https://api.openai.com/v1`)
   - **API Key** — Your access token
   - **Type** — Provider API type
3. Save

### 2. Add a Model

A Model is a specific AI model accessible through that provider:

1. Right-click a Provider → **"Add Model"**
2. Configure the model:
   - **Model ID** — Remote identifier (e.g., `gpt-4o`, `claude-sonnet-4-20250514`)
   - **Display Name** — Label shown in Copilot
   - **Max Tokens** — Context window size
   - **Capabilities** — Vision, Audio, Reasoning, Tool Calling
3. Save

### 3. Use in Copilot

1. Open the model picker in Copilot Chat
2. Select a model under **Addi**
3. Start chatting

## Supported Providers

| Provider          | Type ID                  | Notes                          |
| ----------------- | ------------------------ | ------------------------------ |
| OpenAI-compatible | `openai-completions`     | OpenAI, DeepSeek, local models |
| OpenAI Responses  | `openai-responses`       | Native tool support            |
| Anthropic         | `anthropic-messages`     | Claude models with Thinking    |
| Google            | `google-generateContent` | Gemini multimodal              |

## Configuration Management

Back up or migrate your setup via Command Palette (`Ctrl+Shift+P`):

| Command                      | Description                 |
| ---------------------------- | --------------------------- |
| `Addi: Export Configuration` | Export all settings as JSON |
| `Addi: Import Configuration` | Import from JSON            |
| `Addi: Backup Providers`     | Local backup of providers   |
| `Addi: Restore from Backup`  | Restore from backup         |

## Troubleshooting

### Model doesn't appear in Copilot's model picker

Copilot requires models to have **Tool Calling** capability. Enable it in the model's settings — you'll see a `(?)` warning icon if the capability is missing.

### API errors when using a model

Common causes:

- **Wrong Provider type** — Ensure the provider type matches the API format
- **Incorrect Endpoint** — Try adding/removing `/v1` from the URL
- **Invalid API Key** — Test with `curl` or the provider's playground first
- **Network restrictions** — Some providers are region-locked

### Can't toggle model visibility

VS Code may cache the visibility state. To reset:

1. Open Copilot Chat → model picker → **"Manage Models..."**
2. Find **Addi** in the list
3. Right-click → **"Show in the Chat Model Picker"**

After this, Addi will manage visibility correctly.

For other issues, open a [GitHub Issue](https://github.com/deepwn/addi/issues).

## License

MIT License — see [LICENSE](./LICENSE)
