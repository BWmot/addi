# AI SDK Reasoning & Thinking Capabilities Integration Plan

## Overview

Vercel AI SDK provides powerful abstractions for different providers' specific logic. Among the most complex features is the new explicit "Thinking" or "Reasoning" capabilities across cutting-edge LLMs (such as OpenAI `o1`/`o3`, Anthropic `claude-3-7-sonnet`, Google `gemini-2.0-flash-thinking`, DeepSeek `deepseek-reasoner`).

This document outlines the state of Reasoning support in Addi, and our roadmap for giving users more granular control over these capabilities uniformly across providers.

## Current State

- Addi handles reasoning universally through a boolean capability flag: `model.capabilities.reasoning` (which corresponds to the UI checkbox id `m-think`).
- In `llmService.ts`, when `m-think` is checked, we intercept the AI SDK request and inject provider-specific capabilities dynamically:
  - **Anthropic (`anthropic-messages`)**: Uses `providerOptions.anthropic.thinking` with a default `budgetTokens` of `maxOutputTokens / 2` (min 1024).
  - **OpenAI (`openai-completions` / `openai-responses`)**: Uses `providerOptions.openai.reasoningEffort = "medium"`.
  - **Google (`google-generateContent`)**: Uses `providerOptions.google.thinkingConfig` passing `thinkingBudget` and `includeThoughts: true`.
  - **DeepSeek/MiMo (`deepseek`)**: Uses `providerOptions.deepseek.thinking = { type: "enabled" }`.
- AI SDK takes these options and handles the payload automatically. When parsing results, `part.type === "reasoning"` streams correctly back to the UI.

## Integration Plan (Next Steps)

### Phase 1: Robust Checkbox UI Linkage (Completed/Stable)

We have successfully mapped `<input type="checkbox" id="m-think"/>` to `model.capabilities.reasoning`. Toggling this checkbox immediately injects the aforementioned reasoning logic for all compatible providers in the backend.

### Phase 2: Granular UI Configurability (Proposed)

While a single toggle is easy, different providers expose rich parameters:

1. **OpenAI**: Effort Level (`low`, `medium`, `high`)
2. **Anthropic/Google**: Token Budget Constraints (Number value)

**Goal:** Modify `editor.html` to reveal sub-options when the "Think" checkbox is activated.

- If `p-type` is `openai-*` and `m-think` is true, reveal a dropdown for "Reasoning Effort".
- If `p-type` is `anthropic/google` and `m-think` is true, reveal a numeric input for "Thinking Budget (Tokens)".
- These granular parameters will be serialized directly into the model's `providerOptions` JSON field under the hood.

### Phase 3: Token Validation & Boundaries

- AI SDK enforced budgets (e.g. Anthropic requires minimum 1024 budget tokens).
- Currently, Addi automatically enforces `Math.max(1024, budget)` if `budgetTokens` is inferred.
- Add UI validation to notify users if they configure invalid budgets.

### Phase 4: Multi-turn Context Continuity

DeepSeek & MiMo strictly require `reasoning_content` to be passed back in multi-turn conversations if a tool was executed. Thanks to migrating deepseek/mimo traffic directly to `@ai-sdk/deepseek`, AI SDK automatically binds the previous model `reasoning` chunk into the next message's history payload.
As long as VS Code's `vscode.LanguageModelThinkingPart` is hydrated correctly in `messageConverter.ts`, multi-turn reasoning is safe.

## Technical Execution Reference

- `src/common/types/provider.ts`: Definition of `ProviderType`
- `src/core/llm/aiRegistry.ts`: Initialization of AI SDK clients (e.g. `createDeepSeek()`).
- `src/core/llm/llmService.ts`: Context extraction where `providerOptions` is matched against capabilities.
- `resources/editor.html`: View layer logic for options (to be enhanced).
