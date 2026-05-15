# AI SDK (Vercel) — Reasoning/Thinking Content Handling Audit

> **Providers audited**: Anthropic, Google, OpenAI  
> **SDK version**: `ai` (core), `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`

---

## Table of Contents

- [AI SDK (Vercel) — Reasoning/Thinking Content Handling Audit](#ai-sdk-vercel--reasoningthinking-content-handling-audit)
  - [Table of Contents](#table-of-contents)
  - [1. Core AI SDK — `streamText` \& `fullStream`](#1-core-ai-sdk--streamtext--fullstream)
    - [`streamText` Function](#streamtext-function)
    - [`fullStream` Part Emission](#fullstream-part-emission)
    - [UI Message Stream](#ui-message-stream)
    - [`DefaultStepResult`](#defaultstepresult)
  - [2. Core AI SDK — `extractReasoningContent`](#2-core-ai-sdk--extractreasoningcontent)
  - [3. Core AI SDK — `toResponseMessages`](#3-core-ai-sdk--toresponsemessages)
  - [4. Core AI SDK — `generateText` (non-streaming)](#4-core-ai-sdk--generatetext-non-streaming)
  - [5. Anthropic Provider — Streaming](#5-anthropic-provider--streaming)
    - [Thinking Block Schema](#thinking-block-schema)
    - [Stream Event Conversion](#stream-event-conversion)
  - [6. Anthropic Provider — Non-Streaming (`doGenerate`)](#6-anthropic-provider--non-streaming-dogenerate)
  - [7. Anthropic Provider — Tool Input Conversion](#7-anthropic-provider--tool-input-conversion)
  - [8. Google Provider — Streaming](#8-google-provider--streaming)
    - [Thinking Config](#thinking-config)
    - [Stream Event Conversion](#stream-event-conversion-1)
  - [9. Google Provider — Non-Streaming](#9-google-provider--non-streaming)
  - [10. Google Provider — Tool Input Conversion](#10-google-provider--tool-input-conversion)
  - [11. OpenAI Provider — Chat Completions API (`doStream`)](#11-openai-provider--chat-completions-api-dostream)
    - [Stream Processing Logic](#stream-processing-logic)
    - [Chat Completions Response Schema](#chat-completions-response-schema)
  - [12. OpenAI Provider — Chat Completions API (`doGenerate`)](#12-openai-provider--chat-completions-api-dogenerate)
  - [13. OpenAI Provider — Responses API (`doStream`)](#13-openai-provider--responses-api-dostream)
    - [Comprehensive Reasoning Handling ✅](#comprehensive-reasoning-handling-)
  - [14. OpenAI Provider — Responses API (`doGenerate`)](#14-openai-provider--responses-api-dogenerate)
  - [15. OpenAI Provider — Tool Input Conversion](#15-openai-provider--tool-input-conversion)
  - [16. Key Gaps \& Critical Findings](#16-key-gaps--critical-findings)
    - [🔴 Critical: OpenAI Chat Completions — `reasoning_content` Not Handled](#-critical-openai-chat-completions--reasoning_content-not-handled)
    - [🟡 OpenAI Responses API — Fully Supported ✅](#-openai-responses-api--fully-supported-)
    - [🟢 Anthropic — Fully Supported ✅](#-anthropic--fully-supported-)
    - [🟢 Google — Fully Supported ✅](#-google--fully-supported-)
    - [Summary Table](#summary-table)
    - [Recommendations](#recommendations)

---

## 1. Core AI SDK — `streamText` & `fullStream`

### `streamText` Function

Creates a `DefaultStreamTextResult` which provides:
- `.textStream` — plain text deltas only
- `.fullStream` — all part types via `pipeThrough` transform
- `.reasoning` / `.reasoningText` — filtered reasoning parts
- `.text` — concatenated text parts

### `fullStream` Part Emission

The `fullStream` property exposes reasoning content through three event types:

| Event | Purpose |
|---|---|
| `reasoning-start` | Creates `activeReasoningContent[id]` with `{type: "reasoning", text: "", providerMetadata}` |
| `reasoning-delta` | Appends `part.text` to `activeReasoningContent[id].text` |
| `reasoning-end` | Deletes active reasoning entry from tracking |

### UI Message Stream

When streaming to UI (e.g., via `toDataStream()`), reasoning parts are emitted as:
- `reasoning-start`
- `reasoning-delta`
- `reasoning-end`

Controlled by the `sendReasoning` flag (if `false`, reasoning parts are suppressed in the UI stream).

### `DefaultStepResult`

Exposes:
- `.reasoning` — array of filtered reasoning parts
- `.reasoningText` — joined text from all reasoning parts

---

## 2. Core AI SDK — `extractReasoningContent`

**Location**: `node_modules/ai/dist/index.mjs`, ~line 2967-2980

```typescript
function extractReasoningContent(content: ContentPart[]): string {
  return content
    .filter(part => part.type === "reasoning")
    .map(part => part.text)
    .join("\n");
}
```

**Behavior**:
- Filters all content parts where `type === "reasoning"`
- Joins their `.text` values with `\n`
- Used in `generateText` and `toResponseMessages` to extract reasoning from non-streaming responses

---

## 3. Core AI SDK — `toResponseMessages`

**Location**: `node_modules/ai/dist/index.mjs`, ~line 3942-4102

Converts recorded content (from `streamText` or `generateText`) into the `response` message format.

**Reasoning handling**:
- Passes `type: "reasoning"` parts **as-is** with their original shape
- Preserves `providerMetadata` attached to reasoning parts
- Does NOT filter out or modify reasoning content in any way

---

## 4. Core AI SDK — `generateText` (non-streaming)

**Location**: `node_modules/ai/dist/index.mjs`, ~line 4102-4560

Calls the provider's `doGenerate()` method, then processes the returned content via `asContent()`.

**Reasoning handling**:
- `doGenerate()` returns `content` array with `{type: "reasoning", text, providerMetadata}` parts
- `asContent()` preserves these reasoning parts in the final result
- `DefaultStepResult.reasoning` and `.reasoningText` expose them downstream

---

## 5. Anthropic Provider — Streaming

**Location**: `node_modules/@ai-sdk/anthropic/dist/index.mjs`, ~line 4320-4840

### Thinking Block Schema

Anthropic's thinking content blocks come in two forms:

```typescript
// Standard thinking
{ type: "thinking", thinking: string, signature: string }

// Redacted thinking (server-side redacted)
{ type: "redacted_thinking", data: string }
```

### Stream Event Conversion

| Anthropic SSE Event | AI SDK Stream Event | Details |
|---|---|---|
| `content_block_start` with `type: "thinking"` | `reasoning-start` | Tracks as `{type: "reasoning"}` |
| `content_block_start` with `type: "redacted_thinking"` | `reasoning-start` | Sets `providerMetadata.anthropic.redactedData` |
| `thinking_delta` | `reasoning-delta` | Delta text appended |
| `signature_delta` | `reasoning-delta` | Empty text + `providerMetadata.anthropic.signature` updated |
| `content_block_stop` with `type: "reasoning"` | `reasoning-end` | Finalizes the reasoning block |

**Key detail**: `signature_delta` emits a `reasoning-delta` with **empty text** but carries the signature in `providerMetadata`, which is important for continuing conversations.

---

## 6. Anthropic Provider — Non-Streaming (`doGenerate`)

**Location**: `node_modules/@ai-sdk/anthropic/dist/index.mjs`, ~line 3759-3900

```typescript
case "thinking": {
  content.push({
    type: "reasoning",
    text: part.thinking,
    providerMetadata: {
      anthropic: { signature: part.signature }
    }
  });
  break;
}
case "redacted_thinking": {
  content.push({
    type: "reasoning",
    text: "",
    providerMetadata: {
      anthropic: { redactedData: part.data }
    }
  });
  break;
}
```

**Observations**:
- Maps `part.thinking` → `{type: "reasoning", text}` — ✅ Full text preserved
- Maps `part.signature` → `providerMetadata.anthropic.signature` — ✅ Signature preserved
- Redacted thinking: text is empty string, actual redacted data goes to `providerMetadata.anthropic.redactedData` — ⚠️ No visible content in reasoning text

---

## 7. Anthropic Provider — Tool Input Conversion

When sending `type: "reasoning"` parts back to the Anthropic API (e.g., in a subsequent request):

- `{type: "reasoning", text, providerMetadata: {anthropic: {signature}}}` → `{type: "thinking", thinking: text, signature}`
- `{type: "reasoning", text: "", providerMetadata: {anthropic: {redactedData}}}` → `{type: "redacted_thinking", data: redactedData}`

Anthropic's `reasoningMetadataSchema` accepts `signature` and `redactedData` fields.

---

## 8. Google Provider — Streaming

**Location**: `node_modules/@ai-sdk/google/dist/index.mjs`, ~line 1700-2120

### Thinking Config

```typescript
thinkingConfig: {
  thinkingBudget: number,
  thinkingLevel: "minimal" | "low" | "medium" | "high"
}
```

### Stream Event Conversion

Google marks reasoning via `thought === true` on content parts.

| Condition | AI SDK Stream Event | Details |
|---|---|---|
| `part.thought === true` and `currentReasoningBlockId === null` | `reasoning-start` | Includes `providerMetadata` with `thoughtSignature` |
| `part.thought === true` and block active | `reasoning-delta` | Delta text + `providerMetadata.thoughtSignatureMetadata` |
| Non-thought text starts while reasoning block active | `reasoning-end` | Closes current reasoning block |
| On stream `flush` with active block | `reasoning-end` | Ensures no dangling reasoning block |

**Usage tracking**: Google returns `thoughtsTokenCount` which is mapped to `outputTokens.reasoning` in usage conversion (~line 255-300).

---

## 9. Google Provider — Non-Streaming

**Location**: `node_modules/@ai-sdk/google/dist/index.mjs`, ~line 1571

Parts where `part.thought === true` are converted to:
```typescript
{ type: "reasoning", text: part.text, ... }
```

The `thought` flag distinguishes reasoning from regular text content in the response.

---

## 10. Google Provider — Tool Input Conversion

When `type: "reasoning"` parts are sent back:
```typescript
{ type: "reasoning", text, providerMetadata }
→ { text: part.text, thought: true, thoughtSignature }
```

Preserves the `thought` flag to re-inject reasoning into the API call.

---

## 11. OpenAI Provider — Chat Completions API (`doStream`)

**Location**: `node_modules/@ai-sdk/openai/dist/index.mjs`, ~line 915-1180

### Stream Processing Logic

The stream transform processes each chunk from the SSE stream:

1. **`delta.content`** — If non-null, emits `text-start` (if not active) then `text-delta`
2. **`delta.tool_calls`** — If present, processes tool call deltas
3. **`delta.annotations`** — If present, emits URL citation sources
4. On `flush` — emits `text-end` (if text was active) and `finish`

```
⚠️ CRITICAL: `reasoning_content` is NEVER checked or processed
```

**The OpenAI Chat Completions API** can return `delta.reasoning_content` for reasoning models (o1, o3, etc.) in streaming mode, but the AI SDK's `doStream` implementation:
- Only checks `delta.content` and `delta.tool_calls`
- Has **no code** to read `delta.reasoning_content`
- Does **not** emit `reasoning-start/delta/end` for reasoning content
- Reasoning tokens from o-series models are **silently dropped**

### Chat Completions Response Schema

The schema (`openaiChatChunkSchema`) defines:
```typescript
delta: {
  role: z.enum(["assistant"]).nullish(),
  content: z.string().nullish(),
  tool_calls: z.array(...).nullish(),
  annotations: z.array(...).nullish()
  // ❌ NO reasoning_content field defined
}
```

Line 451: `completion_tokens_details.reasoning_tokens` IS tracked for usage statistics, but the actual reasoning **text content** is never extracted.

---

## 12. OpenAI Provider — Chat Completions API (`doGenerate`)

**Location**: `node_modules/@ai-sdk/openai/dist/index.mjs`, ~line 842-920

```typescript
const choice = response.choices[0];
const content = [];

const text = choice.message.content;
if (text != null && text.length > 0) {
  content.push({ type: "text", text });
}
// tool_calls processing...
// annotations processing...
```

**Issues**:
- Only reads `choice.message.content` (the visible text response)
- **No check for `choice.message.reasoning_content`**
- Reasoning from o-series models is **silently dropped** in non-streaming mode too
- The chat response schema (`openaiChatResponseSchema`, line 323) defines `message.content` and `message.tool_calls` but **no `reasoning_content` field**

---

## 13. OpenAI Provider — Responses API (`doStream`)

**Location**: `node_modules/@ai-sdk/openai/dist/index.mjs`, ~line 5590-6400+

### Comprehensive Reasoning Handling ✅

Unlike the Chat Completions API, the Responses API path has **full reasoning support**:

| SSE Event | AI SDK Stream Event | Details |
|---|---|---|
| `response.output_item.added` with `type: "reasoning"` | `reasoning-start` | Sets `activeReasoning[id]` with `encryptedContent`, emits reasoning-start with `providerMetadata.openai.itemId` and `reasoningEncryptedContent` |
| `response.reasoning_summary_part.added` | `reasoning-end` (previous) + `reasoning-start` (new) | Closes prior summary part, starts new one |
| `response.reasoning_summary_text.delta` | `reasoning-delta` | Appends summary text delta |
| `response.reasoning_summary_part.done` | `reasoning-end` | Finalizes summary part (or marks "can-conclude" if `!store`) |
| `response.output_item.done` with `type: "reasoning"` | `reasoning-end` (for all active) | Ensures all active summary parts are closed |

**Encrypted reasoning content**: When the API returns `encrypted_content` on the reasoning item, it's stored in `providerMetadata.openai.reasoningEncryptedContent`.

---

## 14. OpenAI Provider — Responses API (`doGenerate`)

**Location**: `node_modules/@ai-sdk/openai/dist/index.mjs`, ~line 5114-5590

```typescript
case "reasoning": {
  if (part.summary.length === 0) {
    part.summary.push({ type: "summary_text", text: "" });
  }
  for (const summary of part.summary) {
    content.push({
      type: "reasoning",
      text: summary.text,
      providerMetadata: {
        [providerOptionsName]: {
          itemId: part.id,
          reasoningEncryptedContent: part.encrypted_content ?? null
        }
      }
    });
  }
  break;
}
```

**Behavior**:
- Iterates `part.summary` array (each `{type: "summary_text", text}`)
- Pushes one reasoning content part per summary entry
- Preserves `itemId` and `encrypted_content` in `providerMetadata`
- Handles empty summary with a fallback `{text: ""}` entry

---

## 15. OpenAI Provider — Tool Input Conversion

**Location**: `node_modules/@ai-sdk/openai/dist/index.mjs`, ~line 3100-3200

```typescript
if (part.type === "reasoning") {
  // Send as { type: "reasoning", id, encrypted_content, summary }
  // Non-OpenAI reasoning parts → warning: "Non-OpenAI reasoning parts are not supported"
}
```

---

## 16. Key Gaps & Critical Findings

### 🔴 Critical: OpenAI Chat Completions — `reasoning_content` Not Handled

| Aspect | Status |
|---|---|
| Streaming (`doStream`) | ❌ **No handling of `reasoning_content`** — reasoning tokens silently dropped |
| Non-Streaming (`doGenerate`) | ❌ **No handling of `reasoning_content`** — reasoning content silently dropped |
| Usage token tracking | ✅ `completion_tokens_details.reasoning_tokens` IS tracked |
| Schema definition | ❌ No `reasoning_content` field in `openaiChatChunkSchema` or `openaiChatResponseSchema` |

**Impact**: Users of o1, o3, o4-mini, and gpt-5 reasoning models via the **Chat Completions API** will lose all reasoning text when using the AI SDK.

### 🟡 OpenAI Responses API — Fully Supported ✅

The Responses API path has comprehensive reasoning handling for both streaming and non-streaming modes. This is the recommended path for reasoning models.

### 🟢 Anthropic — Fully Supported ✅

Both streaming (thinking_delta, signature_delta) and non-streaming (thinking/redacted_thinking response parts) are properly handled.

**Minor caveat**: Redacted thinking content has empty `text` — the actual data is only accessible via `providerMetadata.anthropic.redactedData`.

### 🟢 Google — Fully Supported ✅

Both streaming (via `thought === true` parts) and non-streaming modes properly identify and convert reasoning content. Usage tracking includes `thoughtsTokenCount → reasoning` mapping.

### Summary Table

| Provider | API Path | Stream Reasoning | Non-Stream Reasoning | Tool Input Roundtrip |
|---|---|---|---|---|
| **Anthropic** | Messages API | ✅ `thinking_delta` / `signature_delta` | ✅ `thinking` / `redacted_thinking` parts | ✅ Full roundtrip |
| **Google** | Gemini API | ✅ `thought: true` parts | ✅ `thought: true` parts | ✅ Full roundtrip |
| **OpenAI** | Chat Completions | ❌ `reasoning_content` dropped | ❌ `reasoning_content` dropped | N/A |
| **OpenAI** | Responses API | ✅ Summary parts + encrypted | ✅ Summary array | ✅ Full roundtrip |

### Recommendations

1. **Use OpenAI Responses API** instead of Chat Completions API for reasoning models (o1, o3, o4-mini, gpt-5).
2. **Patch the Chat Completions `doStream`** to handle `delta.reasoning_content` — or use the AI SDK's built-in `providerOptions` to specify the Responses API.
3. **For Anthropic redacted thinking**: If users need the redacted content, access it via `providerMetadata.anthropic.redactedData` rather than `.text`.
