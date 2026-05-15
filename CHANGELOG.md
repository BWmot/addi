# Change Log

All notable changes to the "addi" extension will be documented in this file.

## v1.1.1 - 2026-05-?? (Unreleased)

### Fixed

- **Provider checkbox → Model propagation**: Provider-level experimental options (`reasoningContentAdapt`, `extractReasoningContent`) now correctly propagate to:
  - The model creation form (pre-fills checkboxes when creating a new model under a provider)
  - The model edit form (uses provider-level option as display fallback if model-level option is not set)
  - Previously, checking these options at the provider level had no visible effect on individual model forms

### Changed

- **Middleware rename & enhancement**: `reasoningContentInjectMiddleware` → `reasoningContentAdaptMiddleware`
  - **Bidirectional adapt**: Added response-side `wrapStream`/`wrapGenerate` hooks (pass-through as framework extension points) alongside existing request-side `transformParams` for multi-turn reasoning backfill
  - **Updated all code references**: `aiRegistry.ts`, `llmService.ts`, `ModelOptions` type, webview UI (types, ProviderForm, ModelForm, i18n)
  - **Deleted legacy file**: `reasoningContentInjectMiddleware.ts` removed
- **Documentation updated**: `docs/reasoning-support-plan.md` and `README.md` references to old middleware name updated

## v1.1.0 - 2026-05-15

### Added

- **i18n Multi-Language Support (Complete)**: Full localization of both code-level strings (via `vscode.l10n.t()` API) and `package.json` contribution strings (via `%key%` syntax + `package.nls.*.json` files):
  - `bundle.l10n.json` / `bundle.l10n.zh-cn.json` — 157 code-level translation keys for source files
  - `package.nls.json` / `package.nls.zh-cn.json` — 66 `package.json` contribution keys (command titles/shortTitles, view names, configuration descriptions, welcome text, etc.)
- **Localization Contribution Point**: Added `l10n` contribution point in `package.json` pointing to `./l10n/` directory
- **Webview UI (React + TypeScript + Vite)**: Brand new `webview-ui/` sub-project replacing the old `resources/editor.html` — introduces modern React forms for both Provider and Model editing with type-safe data flow
- **ModelForm & ProviderForm Components**: New interactive forms with per-provider conditional rendering (OpenAI → "Reasoning Effort", Anthropic/Google → "Thinking Level"), field validation, and experimental features section
- **Reasoning/Thinking Support**:
  - `reasoningContentInjectMiddleware.ts` — middleware for `reasoning_content` field injection in multi-turn backfill scenarios
  - `reasoningUtils.ts` — utility functions for reasoning content extraction and handling
  - `reasoning-support-plan.md` — comprehensive integration plan documentation
- **End-to-End Tests**: New `tests-e2e/` suite with comprehensive tests for data normalization and remote model fetching
- **Agent Development Rules**: New `.github/copilot-instructions.md` and `agent-dev-rules.instructions.md` for consistent AI-assisted development

### Changed

- **All User-Facing Strings Localized**: Replaced hardcoded English strings with `vscode.l10n.t()` calls across all source files including provider commands, model commands, config commands (export/import/init/restore/backup), and utility feedback methods
- **Chinese Translation Bundle**: Added complete Chinese (Simplified) translations for all 157 code-level strings and all 66 `package.json` contribution strings
- **Architecture Restructure**: Removed the `src/application/` Use Cases layer (ConfigUseCases, ModelUseCases, ProviderUseCases) in favor of a cleaner domain/presentation/infrastructure split
- **DeepSeek Support**: Updated architecture specification (`docs/architecture-spec.md`) to document DeepSeek model integration patterns
- **LLM Service Refactor**: Major updates to `llmService.ts` with improved reasoning effort mapping across providers (OpenAI, Anthropic, Google) and better options handling
- **ProviderModelManager**: Enhanced `addModel()` and `updateModel()` to properly handle `options` (reasoningEffort, budgetTokens, reasoningContentInject, extractReasoningContent) alongside existing fields
- **StorageService**: Optimized save logic with change detection to prevent sync storms; improved secret handling and extended data management
- **Editor View**: Enhanced form save/load with proper options passthrough, speed history preservation, and batch mode support
- **Linting Infrastructure**: Replaced ESLint configuration with OXLint (`oxlintrc.json`) and OXFmt (`oxfmtrc.json`) for faster linting
- **Documentation Consolidation**: Reorganized docs — removed outdated files (`architecture-audit.md`, `code-quality-audit.md`, `dev-coding-notes.md`, `execution-plan.md`, `project-document.md`), added new structured docs (`architecture-spec.md`, `coding-standards.md`, `reasoning-support-plan.md`, `webview-ui-migration-plan.md`)
- **Build Script Updates**: Updated `scripts/build.ts` and `scripts/clean.ts` for the new webview-ui architecture
- **Type Safety**: Replaced `any` types with `unknown` in webview-ui component handlers

### Fixed

- **Extension i18n Not Working for `package.json` UI**: Fixed bug where VS Code would not show Chinese translations for command titles, view names, configuration descriptions, or other `package.json` contribution strings — root cause was that `package.json` used direct English strings instead of `%key%` syntax, and no `package.nls.*.json` files existed. Fixed by creating `package.nls.json` (English) and `package.nls.zh-cn.json` (Chinese), and replacing all 66 user-facing strings in `package.json`'s `contributes` section with `%key%` references
- **Unused Variable**: Removed unused `isOpenAI` variable in `ModelForm.tsx`

### Removed

- **Legacy Editor HTML**: Removed `resources/editor.html` (1395 lines) — fully replaced by webview-ui React application
- **Application Layer**: Removed `src/application/` directory (ConfigUseCases, ModelUseCases, ProviderUseCases and their index files)
- **Outdated Documents**: Removed `architecture-audit.md`, `code-quality-audit.md`, `dev-coding-notes.md`, `execution-plan.md`, `project-document.md`

## v1.0.5 - 2026-05-07

### Added

- **Remote Model Fetcher**: New `remoteModelFetcher` module for fetching available models from API endpoints with automatic normalization and legacy field migration
- **Data Normalizer**: New `dataNormalizer` module for normalizing model data across different provider formats, including backward-compatible migration of legacy fields
- **Provider Model Manager Interface**: New `IProviderModelManager` interface defining the contract for provider and model management operations
- **Sort Strategy**: New sorting utility for providers and models — supports sort by name (alphabet), input tokens, or output tokens
- **Tree Item Enhancements**: New `ProviderTreeItem` and `ModelTreeItem` classes for improved sidebar display, showing speed metrics, thinking/vision indicators, and warnings for models without tool calling
- **Speed History Tracking**: Added `speedHistory` and `averageSpeed` fields to Model type — tracks performance over a rolling window of the last 5 measurements
- **Proposed API Typings**: Added proposed API type declarations for `chatParticipantPrivate`, `languageModelThinkingPart`, and `toolInvocationApproveCombination`

### Changed

- **Vision Capability**: Simplified model capabilities from three separate flags (`imageInput`, `audioInput`, `videoInput`) to a single `vision` boolean — the previous approach was inaccurate as no models support audio/video input separately; legacy fields are automatically migrated on load
- **ProviderModelManager Refactor**: Major refactoring with mutex for thread-safe operations, improved validation logic, and cleaner internal architecture
- **InputValidator**: Updated validation methods with stricter and more consistent rules
- **Speed Measurement Accuracy**: Replaced estimated token count (`Math.ceil(textLength / 4)`) with precise counts from AI SDK's `result.usage` for streaming responses; added `onFinish` callback for non-streaming stats
- **Test Coverage**: Expanded unit tests significantly — new tests for `dataNormalizer`, `remoteModelFetcher`, `sortStrategy`, `validator`, `id`, and `token` modules
- **README & Documentation**: Rewrote README.md as project introduction and added comprehensive user guide (`docs/DOCUMENTATION.md`) with installation, configuration, usage, and troubleshooting

### Removed

- **Domain Events**: Removed unused `DomainEvents`, `EventBus`, and related event bus infrastructure (dead code)
- **Tool Parser**: Removed unused `toolParser.ts` utility (dead code)

### Fixed

- **Speed Calculation**: Fixed inaccurate speed metrics for streaming responses that relied on character-based estimation instead of actual token counts
- **Non-streaming Stats**: Fixed missing speed/stats reporting for non-streaming (batch) requests by adding `onFinish` callback in `buildAiOptions()`

## v1.0.4 - 2026-04-29

### Change

- **fix createModel()** fix a bug extension using `id` (addi uuid) but not `rid` (remote model id) in request. the correct way is use `id` for local storage and UI, but use `rid` for any API request. the `findModel()` function will return both `id` and `rid` in the model object now, so make sure to use the correct field in the right place.

### Misc

- **update deps & add some documents** for next minor version dev and refactor do some documents and vibe coding plan.

## v1.0.3 - 2026-04-22

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

## v1.0.2 - 2026-04-04

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

## v1.0.1 - 2026-03-15

### Changed

- **Dependencies**: Updated npm dependencies and `@types/vscode` to `^1.110.0`

### Fixed

- **Model Add/Copy**: Fixed `family` and `version` fields missing when adding or copying models

## v1.0.0 - 2026-03-01

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
