# Addi User Guide

> Addi lets you use any AI model with GitHub Copilot in VS Code.

---

## Table of Contents

- [Addi User Guide](#addi-user-guide)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
    - [From VS Code Marketplace](#from-vs-code-marketplace)
    - [Requirements](#requirements)
  - [Getting Started](#getting-started)
    - [1. Add a Provider](#1-add-a-provider)
    - [2. Add a Model](#2-add-a-model)
    - [3. Use in Copilot Chat](#3-use-in-copilot-chat)
  - [Provider Configuration](#provider-configuration)
    - [Provider Types](#provider-types)
    - [API Endpoints](#api-endpoints)
    - [API Keys](#api-keys)
  - [Model Configuration](#model-configuration)
    - [Basic Fields](#basic-fields)
    - [Capabilities](#capabilities)
      - [Tool Calling Depth](#tool-calling-depth)
    - [Token Limits](#token-limits)
    - [Advanced Options](#advanced-options)
      - [Extra Body Examples](#extra-body-examples)
      - [Extra Headers Examples](#extra-headers-examples)
  - [Using Models in Copilot](#using-models-in-copilot)
    - [Model Picker](#model-picker)
    - [Tool Calling](#tool-calling)
    - [Reasoning / Thinking](#reasoning--thinking)
    - [Vision](#vision)
  - [Managing Providers \& Models](#managing-providers--models)
    - [Sidebar Operations](#sidebar-operations)
    - [Batch Operations](#batch-operations)
    - [Pull Models from API](#pull-models-from-api)
  - [Import, Export \& Backup](#import-export--backup)
    - [Use Cases](#use-cases)
  - [Settings](#settings)
  - [Speed \& Performance](#speed--performance)
    - [How Speed is Measured](#how-speed-is-measured)
  - [Troubleshooting](#troubleshooting)
    - [Model doesn't appear in Copilot's model picker](#model-doesnt-appear-in-copilots-model-picker)
    - [API errors when using a model](#api-errors-when-using-a-model)
    - [Can't toggle model visibility](#cant-toggle-model-visibility)
    - [Speed shows 0 or is inaccurate](#speed-shows-0-or-is-inaccurate)
    - [Models with Reasoning enabled show errors](#models-with-reasoning-enabled-show-errors)
    - [How to reset everything](#how-to-reset-everything)
  - [Command Reference](#command-reference)
  - [Getting Help](#getting-help)

---

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for **"Addi"**
4. Click **Install**

### Requirements

- **VS Code** 1.118.0 or later
- **GitHub Copilot** extension installed and active

---

## Getting Started

### 1. Add a Provider

A **Provider** is an API endpoint that hosts AI models (e.g., OpenAI API, a local Ollama server, Anthropic API).

1. Click the **Addi icon** in the Activity Bar (left sidebar)
2. Click the **`+`** button at the top of the Providers panel, or use `Ctrl+Shift+P` → `Addi: Add Provider`
3. Fill in the form:

| Field            | Description          | Example                     |
| ---------------- | -------------------- | --------------------------- |
| **Name**         | Display label        | `My OpenAI`                 |
| **API Endpoint** | Base URL of the API  | `https://api.openai.com/v1` |
| **API Key**      | Authentication token | `sk-...`                    |
| **Type**         | API format           | `openai-completions`        |

4. Click **Save**

### 2. Add a Model

A **Model** is a specific AI model accessible through a provider.

1. In the sidebar, **right-click** a provider → **"Add Model"**
2. Fill in the form:

| Field            | Description                       | Example                              |
| ---------------- | --------------------------------- | ------------------------------------ |
| **Model ID**     | Remote identifier used by the API | `gpt-4o`, `claude-sonnet-4-20250514` |
| **Display Name** | Label shown in Copilot            | `GPT-4o`                             |
| **Family**       | Model family / series             | `gpt`, `claude`, `gemini`            |
| **Version**      | Version string                    | `4o`, `3.5`, `2.0`                   |

3. Configure **Capabilities** (see [Capabilities](#capabilities))
4. Click **Save**

### 3. Use in Copilot Chat

1. Open **Copilot Chat** (`Ctrl+Shift+I` or click the Copilot icon)
2. Click the **model picker** at the top of the chat panel
3. Find your model under the **Addi** section
4. Select it and start chatting

> **Note**: If a model doesn't appear in the picker, it may need the **Tool Calling** capability enabled. See [Troubleshooting](#model-doesnt-appear-in-copilots-model-picker).

---

## Provider Configuration

### Provider Types

Choose the type that matches your API:

| Type                     | When to Use                                | Examples                                |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| `openai-completions`     | OpenAI-compatible `/chat/completions` APIs | OpenAI, DeepSeek, Ollama, vLLM, LocalAI |
| `openai-responses`       | OpenAI's newer Responses API               | OpenAI (with native tool support)       |
| `anthropic-messages`     | Anthropic Messages API                     | Claude models                           |
| `google-generateContent` | Google Generative AI API                   | Gemini models                           |

### API Endpoints

Common endpoint formats:

| Provider       | Endpoint                                           |
| -------------- | -------------------------------------------------- |
| OpenAI         | `https://api.openai.com/v1`                        |
| DeepSeek       | `https://api.deepseek.com/v1`                      |
| Anthropic      | `https://api.anthropic.com`                        |
| Google         | `https://generativelanguage.googleapis.com/v1beta` |
| Ollama (local) | `http://localhost:11434/v1`                        |

> **Tip**: Some providers need `/v1` at the end, others don't. If you get errors, try adding or removing it.

### API Keys

- API keys are stored securely in VS Code's **SecretStorage** (encrypted, never synced)
- Set or update a key via **right-click provider → "Set API Key"**
- For local models (Ollama), you can leave the key empty or use a placeholder like `ollama`

---

## Model Configuration

### Basic Fields

| Field        | Required | Description                                |
| ------------ | -------- | ------------------------------------------ |
| Model ID     | Yes      | The exact model identifier the API expects |
| Display Name | No       | Custom label (defaults to Model ID)        |
| Family       | No       | Used for grouping and defaults             |
| Version      | No       | Displayed in tooltips                      |

### Capabilities

Enable capabilities that your model supports. These affect how Addi handles requests and what features are available in Copilot.

| Capability       | Description                              | Required For                              |
| ---------------- | ---------------------------------------- | ----------------------------------------- |
| **Vision**       | Model can process images                 | Sending images in chat                    |
| **Tool Calling** | Model can use Copilot tools              | Appearing in the model picker; agent mode |
| **Reasoning**    | Model supports thinking/reasoning output | Viewing reasoning in chat                 |

> **Important**: **Tool Calling** is required for a model to appear in Copilot's model picker. Models without it will show a `(?)` warning icon in the sidebar.

#### Tool Calling Depth

Tool Calling can be set to:
- **`true`** (enabled) — Model supports tool use
- **`false`** (disabled) — Model cannot use tools
- **A number** (e.g., `3`) — Maximum number of sequential tool call rounds

### Token Limits

| Field             | Default | Description                                   |
| ----------------- | ------- | --------------------------------------------- |
| Max Input Tokens  | 80,000  | Maximum tokens the model can receive as input |
| Max Output Tokens | 128,000 | Maximum tokens the model can generate         |

> Default values can be changed globally in **Settings** → `addi.defaultMaxInputTokens` / `addi.defaultMaxOutputTokens`.

### Advanced Options

| Field             | Format | Description                                     |
| ----------------- | ------ | ----------------------------------------------- |
| **Extra Body**    | JSON   | Additional parameters sent with every request   |
| **Extra Headers** | JSON   | Additional HTTP headers sent with every request |

#### Extra Body Examples

```json
{
  "temperature": 0.7,
  "top_p": 0.9,
  "stream": true
}
```

> `stream` defaults to `true`. Set to `false` to disable streaming.

#### Extra Headers Examples

```json
{
  "X-Custom-Header": "value",
  "HTTP-Referer": "https://myapp.com"
}
```

---

## Using Models in Copilot

### Model Picker

- Open the model picker from the top of the Copilot Chat panel
- Addi models appear under the **Addi** section
- Show/hide individual models via **right-click model → "Show in Picker" / "Hide from Picker"**
- Show/hide all models for a provider via **right-click provider → "Show All in Picker" / "Hide All from Picker"**

### Tool Calling

When a model supports Tool Calling, Copilot can:
- Search your workspace for files and code
- Run terminal commands
- Edit files directly
- Use other VS Code tools

Without Tool Calling, the model can only respond with text (no agent capabilities).

### Reasoning / Thinking

For models with **Reasoning** enabled:
- Claude models show extended thinking output
- OpenAI models use reasoning effort levels
- Google models show thinking summaries

Reasoning output appears as collapsible blocks in the chat panel.

### Vision

For models with **Vision** enabled:
- Paste or drag images into Copilot Chat
- The model receives images alongside your text prompt
- Supports common formats: PNG, JPEG, GIF, WebP

---

## Managing Providers & Models

### Sidebar Operations

**Right-click a Provider:**

| Action          | Description                               |
| --------------- | ----------------------------------------- |
| Add Model       | Create a new model under this provider    |
| Edit Provider   | Modify provider name, endpoint, type      |
| Copy Provider   | Duplicate the provider configuration      |
| Delete Provider | Remove the provider and all its models    |
| Set API Key     | Set or update the API key                 |
| Pull Models     | Fetch available models from the API       |
| Show/Hide All   | Toggle visibility of all models in picker |

**Right-click a Model:**

| Action           | Description                            |
| ---------------- | -------------------------------------- |
| Edit Models      | Open the model editor                  |
| Copy Model       | Duplicate the model                    |
| Delete Models    | Remove the model                       |
| Show in Picker   | Make model visible in Copilot's picker |
| Hide from Picker | Hide model from Copilot's picker       |

### Batch Operations

- **Select multiple models** in the sidebar to edit or delete them at once
- **Batch edit** lets you change capabilities, token limits, or other fields for multiple models simultaneously

### Pull Models from API

1. **Right-click a provider** → **"Pull Models"**
2. Addi connects to the API and fetches the available model list
3. New models are added; existing models are updated with remote metadata
4. Review and adjust capabilities as needed

> **Note**: Pulled models may need manual capability adjustment — the API metadata doesn't always indicate tool calling or vision support.

---

## Import, Export & Backup

Access via the **sidebar toolbar** or `Ctrl+Shift+P`:

| Command                      | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| `Addi: Export Configuration` | Export all providers and models as a JSON file |
| `Addi: Import Configuration` | Import providers and models from a JSON file   |
| `Addi: Backup Providers`     | Create a local backup (stored in VS Code)      |
| `Addi: Restore from Backup`  | Restore from a previous local backup           |
| `Addi: Manage Backups`       | View and manage saved backups                  |

### Use Cases

- **Team sharing**: Export config, share the JSON file, teammates import it
- **Device migration**: Export on old machine, import on new machine
- **Experimentation**: Backup before making changes, restore if needed

> **Note**: API keys are **not** included in exports for security. You'll need to re-enter keys after importing.

---

## Settings

Open via `Ctrl+,` → search **"Addi"**, or use `Ctrl+Shift+P` → `Addi: Open Settings`.

| Setting                       | Type    | Default | Description                                                                       |
| ----------------------------- | ------- | ------- | --------------------------------------------------------------------------------- |
| `addi.defaultMaxInputTokens`  | number  | 80,000  | Default max input tokens for new models                                           |
| `addi.defaultMaxOutputTokens` | number  | 128,000 | Default max output tokens for new models                                          |
| `addi.confirmDelete`          | boolean | true    | Show confirmation before deleting                                                 |
| `addi.sortRule`               | enum    | `none`  | Sort providers/models by: `none`, `alphabet`, `input tokens`, `output tokens`     |
| `addi.sortTarget`             | enum    | `both`  | Apply sort to: `providers`, `models`, `both`                                      |
| `addi.syncConfiguration`      | boolean | false   | Sync provider config across devices via VS Code Settings Sync (API keys excluded) |

---

## Speed & Performance

Addi tracks model speed during chat usage:

- **Speed** is measured in **tokens per second (t/s)**
- Displayed in the sidebar next to each model (e.g., `42/s`)
- Hover over a model to see detailed speed in the tooltip
- Speed is calculated from the last 5 measurements (rolling average)
- Measured during both streaming and non-streaming requests

### How Speed is Measured

1. Timestamp when the first token arrives from the API
2. Timestamp when the response completes
3. Token count from the AI SDK's usage data (precise, not estimated)
4. Speed = tokens ÷ duration

---

## Troubleshooting

### Model doesn't appear in Copilot's model picker

**Cause**: Tool Calling capability is not enabled.

**Fix**:
1. Right-click the model → **"Edit Models"**
2. Enable **Tool Calling**
3. Save

Models without Tool Calling cannot be used in Copilot Chat.

---

### API errors when using a model

**Common causes and fixes**:

| Symptom            | Likely Cause                         | Fix                                      |
| ------------------ | ------------------------------------ | ---------------------------------------- |
| 401 Unauthorized   | Invalid API key                      | Re-enter the key via "Set API Key"       |
| 404 Not Found      | Wrong endpoint URL                   | Check the URL; try adding/removing `/v1` |
| 403 Forbidden      | Region restriction or quota exceeded | Check provider dashboard                 |
| Connection refused | Wrong endpoint or network issue      | Verify the URL; check firewall/proxy     |

**Verify your setup**:
1. Test the API endpoint directly with `curl` or the provider's playground
2. Ensure the **Provider Type** matches the API format
3. Check the **Output** panel (`Ctrl+Shift+U` → select "Addi") for detailed error logs

---

### Can't toggle model visibility

VS Code may cache the visibility state. To reset:

1. Open Copilot Chat → model picker → **"Manage Models..."**
2. Find **Addi** in the list
3. Right-click → **"Show in the Chat Model Picker"**

After this, Addi will manage visibility correctly.

---

### Speed shows 0 or is inaccurate

- Speed is only measured after actual chat usage (not on configuration)
- Very short responses (< 10 tokens) may show 0 due to sanity checks
- Cancelled requests are excluded from speed calculations
- First few measurements may vary; speed stabilizes after 5 uses

---

### Models with Reasoning enabled show errors

- Ensure the **Provider Type** matches the API
- Anthropic models require sufficient `maxOutputTokens` for thinking budget
- Some providers may not support reasoning — check provider documentation

---

### How to reset everything

If you encounter persistent issues:

1. `Ctrl+Shift+P` → `Addi: Clean All Addi Storage`
2. `Ctrl+Shift+P` → `Addi: Reset All Addi Settings`
3. Restart VS Code
4. Re-add your providers and models

---

## Command Reference

All commands are available via `Ctrl+Shift+P`:

| Command                             | Description                 |
| ----------------------------------- | --------------------------- |
| `Addi: Add Provider`                | Create a new provider       |
| `Addi: Edit Provider`               | Modify selected provider    |
| `Addi: Copy Provider`               | Duplicate a provider        |
| `Addi: Delete Provider`             | Remove a provider           |
| `Addi: Set API Key`                 | Set or update API key       |
| `Addi: Add Model`                   | Add a model to a provider   |
| `Addi: Edit Models`                 | Edit model configuration    |
| `Addi: Copy Model`                  | Duplicate a model           |
| `Addi: Delete Models`               | Remove model(s)             |
| `Addi: Pull Provider Models`        | Fetch models from API       |
| `Addi: Set Model to Copilot`        | Quick-set model in Copilot  |
| `Addi: Show Models in Picker`       | Make model visible          |
| `Addi: Hide Models from Picker`     | Hide model from picker      |
| `Addi: Export Configuration`        | Export to JSON              |
| `Addi: Import Configuration`        | Import from JSON            |
| `Addi: Backup Providers`            | Create local backup         |
| `Addi: Restore from Backup`         | Restore from backup         |
| `Addi: Manage Backups`              | View/manage backups         |
| `Addi: Open Settings`               | Open Addi settings          |
| `Addi: Provider & Model Management` | Open management view        |
| `Addi: Show Logs`                   | Open Addi output logs       |
| `Addi: Initialize Extension`        | Reset all data and settings |

---

## Getting Help

- **Issues & Bugs**: [github.com/deepwn/addi/issues](https://github.com/deepwn/addi/issues)
- **Logs**: `Ctrl+Shift+P` → `Addi: Show Logs` for detailed diagnostics
