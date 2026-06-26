/**
 * Unit tests for reasoning policy helpers.
 */
import * as assert from "assert";
import type { Provider, Model } from "../src/common/types";
import {
  shouldSkipOpenAIReasoningEffort,
  stripOpenAIReasoningEffort,
  needsSuffixRepeatCleanup,
} from "../src/core/llm/reasoningPolicy";

describe("reasoningPolicy", () => {
  const gpt55Model: Model = {
    id: "local-id",
    rid: "gpt-5.5-mini",
    name: "GPT-5.5 Mini",
    family: "gpt",
    version: "1.0",
    maxInputTokens: 128000,
    maxOutputTokens: 32768,
    capabilities: {
      reasoning: true,
      toolCalling: true,
    },
  };

  const nonGpt55Model: Model = {
    ...gpt55Model,
    rid: "gpt-5-mini",
  };

  const openaiCompatProvider: Provider = {
    id: "openai-compat",
    name: "OpenAI Compatible",
    providerType: "openai-completions",
    models: [],
  };

  const openaiResponsesProvider: Provider = {
    id: "openai-responses",
    name: "OpenAI Responses",
    providerType: "openai-responses",
    models: [],
  };

  it("skips reasoningEffort for gpt-5.5 on openai-completions", () => {
    assert.strictEqual(shouldSkipOpenAIReasoningEffort(openaiCompatProvider, gpt55Model), true);
  });

  it("does not skip reasoningEffort for other models", () => {
    assert.strictEqual(
      shouldSkipOpenAIReasoningEffort(openaiCompatProvider, nonGpt55Model),
      false,
    );
  });

  it("does not skip reasoningEffort for non-openai-completions providers", () => {
    assert.strictEqual(
      shouldSkipOpenAIReasoningEffort(openaiResponsesProvider, gpt55Model),
      false,
    );
  });

  it("strips existing OpenAI reasoningEffort when skip policy applies", () => {
    const providerOptions: Record<string, Record<string, unknown>> = {
      openai: {
        reasoningEffort: "high",
        reasoningSummary: "auto",
      },
      openaiProxy: {
        reasoningEffort: "medium",
        reasoningSummary: "detailed",
      },
    };

    stripOpenAIReasoningEffort(providerOptions, openaiCompatProvider, gpt55Model, "openaiProxy");

    assert.deepStrictEqual(providerOptions, {
      openai: {
        reasoningSummary: "auto",
      },
      openaiProxy: {
        reasoningSummary: "detailed",
      },
    });
  });
});

// ============================================================================
// needsSuffixRepeatCleanup
// ============================================================================

describe("needsSuffixRepeatCleanup", () => {
  const makeModel = (rid: string, name = "", family = ""): Model => ({
    id: "local-id",
    rid,
    name,
    family,
    version: "1.0",
    maxInputTokens: 128000,
    maxOutputTokens: 32768,
    capabilities: { reasoning: false, toolCalling: false },
  });

  const makeProvider = (id: string): Provider => ({
    id,
    name: id,
    providerType: "openai-completions",
    models: [],
  });

  const genericProvider = makeProvider("my-provider");

  it("enables cleanup for DeepSeek by rid", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("deepseek-v3")), true);
  });

  it("enables cleanup for DeepSeek by name", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("custom-model", "DeepSeek V3")), true);
  });

  it("enables cleanup for GLM by family", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("glm-4", "", "glm")), true);
  });

  it("enables cleanup for Qwen by rid", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("qwen-max")), true);
  });

  it("enables cleanup for MiMo by rid", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("mimo-7b")), true);
  });

  it("enables cleanup when provider id contains deepseek", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(makeProvider("deepseek-official"), makeModel("some-model")), true);
  });

  it("disables cleanup for GPT", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("gpt-4o", "GPT-4o", "gpt")), false);
  });

  it("disables cleanup for Claude", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("claude-3-5-sonnet", "Claude 3.5 Sonnet", "claude")), false);
  });

  it("disables cleanup for Gemini", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("gemini-2.5-pro", "Gemini 2.5 Pro", "gemini")), false);
  });

  it("disables cleanup for GPT-4o-mini by name only", () => {
    assert.strictEqual(needsSuffixRepeatCleanup(genericProvider, makeModel("gpt-4o-mini", "GPT-4o Mini")), false);
  });
});
