# Change Log

All notable changes to the "addi" extension will be documented in this file.

## [1.0.3] - 2026-04-22

### Added

- **Extension Initialization Command**: New `addi.initializeExtension` command to clear storage and reset all settings
- **Provider Model Handling**: Improved provider model handling with better default token limits from ConfigManager

### Changed

- **Dependencies**: Updated npm dependencies including AI SDK v6.x, `@types/vscode`, and provider packages
- **Token Limits**: Updated default input and output token limits in model configurations
- **Code Documentation**: Re-documented and formatted codebase for better maintainability
- **Proposed API Updates**: Updated VS Code proposed API declarations to match official v15 specifications:
  - `languageModelThinkingPart`
  - `toolInvocationApproveCombination`
  - `chatParticipantPrivate`

### Removed

- **Deprecated Sync Commands**: Removed deprecated sync commands and related tests

## [1.0.2] - 2026-04-04

### Added

- **Tool Approval Combination API**: Add proposed API support for `LanguageModelToolConfirmationMessages.approveCombination`
- **Local Backup/Restore**: Add local backup and restore functionality for providers

### Changed

- **JSON Editor Enhancement**: Replaced plain textareas with enhanced JSON editors featuring:
  - Format, Minify, Clear buttons positioned inside the editor
  - Real-time JSON validation with red border on error
  - Improved tooltip examples for Extra Body and Extra Headers

### Fixed

- **Command Registration**: Fixed restoreFromBackup and manageBackups commands not registered in package.json
- **API Key Handling**: API key field only saves when explicitly modified
- **Token Input Validation**: Applied LIMIT to numeric token input and fixed version regex

## [1.0.1] - 2026-03-15

### Changed

- **Dependencies**: Updated npm dependencies and `@types/vscode` to `^1.110.0`

### Fixed

- **Model Add/Copy**: Fixed `family` and `version` fields missing when adding or copying models

## [1.0.0] - 2026-03-01

### Added

- **Multi-Provider Support**: Add support for multiple AI service providers including OpenAI, Anthropic, Google, and Ollama
- **Multi-Model Management**: Complete CRUD operations for models within each provider
- **Streaming Response**: Full streaming output support for real-time chat experience
- **Tool Calling**: Integration with VS Code Copilot's tool calling functionality
- **Thinking/Reasoning**: Display model's thinking/reasoning process in chat
- **Batch Operations**: Support for batch editing and deleting multiple models
- **Model Visibility Control**: Control which models are visible in Copilot's model selector
- **Import/Export**: JSON format configuration backup and migration
- **Pull Models**: Automatically fetch available model list from API endpoint

### Changed

- **Architecture**: Refactored to use AI SDK (Vercel) as core LLM abstraction layer
- **Storage**: Improved data persistence with SecretStorage for API keys
- **VS Code Compatibility**: Minimum VS Code version set to 1.109.0

### Fixed

- **Model Save Bug**: Fixed issue where model edits were not being saved correctly
- **Various UI Improvements**: Enhanced editor view and provider view interactions
