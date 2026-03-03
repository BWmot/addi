# Change Log

All notable changes to the "addi" extension will be documented in this file.

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
