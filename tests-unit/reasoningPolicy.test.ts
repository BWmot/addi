/**
 * Unit tests for reasoning policy helpers.
 */
import * as assert from "assert";
import type { Provider, Model } from "../src/common/types";
import {
  shouldSkipOpenAIReasoningEffort,
  stripOpenAIReasoningEffort,
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
