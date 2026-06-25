import * as vscode from "vscode";
import type { ModelDraft, Provider, Model } from "../../common/types";
import { AIProviderRegistry } from "./aiRegistry";
import { generateText, type ModelMessage, type Tool, jsonSchema } from "ai";
import { logger, LogScope } from "../../common/logger";
import { LLMService } from "./llmService";
import { ConfigManager } from "../../infrastructure/vscode/configService";

export interface TestResult {
  success: boolean;
  error?: string;
  detectedMaxInputTokens?: number;
  detectedMaxOutputTokens?: number;
  visionSupported?: boolean;
  toolCallingSupported?: boolean;
  speed?: number;
}

export interface TestOptions {
  detectInput: boolean;
  detectOutput: boolean;
  checkVision: boolean;
  checkTools: boolean;
  checkSpeed: boolean;
}

export type ProgressCallback = (message: string) => void;

/**
 * Small JPEG test image (1x1 red pixel) used for vision capability detection.
 * Extracted to module scope for clarity and easier replacement.
 */
const VISION_TEST_IMAGE_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAZEAEAAgMAAAAAAAAAAAAAAAAAAQIxcbH/xAAVAQEBAAAAAAAAAAAAAAAAAAAGB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALH64jUcAF1Qf//Z";

export class ModelTester {
  static async testModelApi(
    provider: Provider,
    modelDraft: ModelDraft,
    options: TestOptions,
    token: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<TestResult> {
    const result: TestResult = { success: false };

    try {
      // 1. Basic Connectivity
      onProgress?.("Checking connectivity...");
      const connectToken = "ADDI_CONNECT_OK";

      // Use configured maxOutputTokens to verify if the model supports the setting
      const testMaxTokens =
        modelDraft.maxOutputTokens && modelDraft.maxOutputTokens > 0
          ? modelDraft.maxOutputTokens
          : undefined;

      const payload: {
        type: "text" | "vision" | "tools";
        prompt?: string;
        maxOutputTokens?: number;
      } = {
        type: "text",
        prompt: `Reply exactly '${connectToken}'`,
      };
      if (testMaxTokens !== undefined) {
        payload.maxOutputTokens = testMaxTokens;
      }

      const response = await ModelTester.performRequest(provider, modelDraft, payload, token);

      if (!response || !response.includes(connectToken)) {
        throw new Error(
          `Connection test failed: Model response did not contain expected token. Response: ${response ? response.slice(0, 100) : "empty"}`,
        );
      }
      result.success = true;

      // 2. Detect Token Limits
      if (options.detectInput || options.detectOutput) {
        onProgress?.("Detecting token limits...");
        // Use 'output' mode to enable error probing which is most effective for finding max context
        const limit = await ModelTester.detectLimit(
          provider,
          modelDraft,
          "output",
          token,
          onProgress,
        );

        if (limit !== undefined) {
          // Strategy: Use detected Output Limit (max_tokens) as the base.
          // Set maxOutputTokens to the detected limit.
          // Set maxInputTokens to half of the detected limit (as a conservative heuristic requested by user).
          if (options.detectOutput) {
            result.detectedMaxOutputTokens = limit;
            modelDraft.maxOutputTokens = limit;
          }
          if (options.detectInput) {
            const inputLimit = Math.floor(limit / 2);
            result.detectedMaxInputTokens = inputLimit;
            modelDraft.maxInputTokens = inputLimit;
          }
        }
      }

      // 3. Vision Check
      if (options.checkVision) {
        onProgress?.("Verifying vision capabilities...");
        try {
          await ModelTester.performRequest(provider, modelDraft, { type: "vision" }, token);
          result.visionSupported = true;
        } catch (e) {
          result.visionSupported = false;
        }
      }

      // 4. Tools Check
      if (options.checkTools) {
        onProgress?.("Verifying tool calling capabilities...");
        try {
          await ModelTester.performRequest(provider, modelDraft, { type: "tools" }, token);
          result.toolCallingSupported = true;
        } catch (e) {
          result.toolCallingSupported = false;
        }
      }

      // 5. Speed Test
      if (options.checkSpeed) {
        onProgress?.("Measuring response speed...");
        try {
          result.speed = await ModelTester.measureSpeed(provider, modelDraft, token);
        } catch (speedError) {
          logger.warn("Speed test failed", speedError, LogScope.MODEL_TESTER);
          // Don't fail the whole test, just leave speed undefined
        }
      }
    } catch (error: unknown) {
      result.error = (error as Error)?.message || String(error);
      logger.error("Model test failed", error, LogScope.MODEL_TESTER);
    }

    return result;
  }

  private static async performRequest(
    provider: Provider,
    modelDraft: ModelDraft,
    payload: {
      type: "text" | "vision" | "tools";
      prompt?: string;
      maxOutputTokens?: number;
    },
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const aiModel = AIProviderRegistry.getInstance().createModel(
      provider,
      ModelTester.resolveModelIdentifierFromDraft(modelDraft),
    );

    let messages: ModelMessage[];
    let tools: Record<string, Tool> | undefined;

    if (payload.type === "vision") {
      // Construct a vision message
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            {
              type: "image",
              image: Buffer.from(VISION_TEST_IMAGE_BASE64, "base64"),
            },
          ],
        },
      ];
    } else {
      // Use simple string content for text-only requests to ensure maximum compatibility
      messages = [{ role: "user", content: payload.prompt ?? "Reply 'OK'." }];
    }

    if (payload.type === "tools") {
      tools = {
        test_tool: {
          description: "A test tool",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
        },
      };
    }

    // Use maxTokens which is the standard property in AI SDK Core
    const result = await generateText({
      model: aiModel,
      messages,
      maxTokens: payload.maxOutputTokens ?? 100,
      tools,
      abortSignal: signal,
    });

    if (payload.type === "tools") {
      // Check if tool was called
      if (result.toolCalls && result.toolCalls.length > 0) {
        return "Tool called";
      }
      return "Tool not called";
    }

    return result.text;
  }

  private static async measureSpeed(
    provider: Provider,
    modelDraft: ModelDraft,
    token: AbortSignal,
  ): Promise<number> {
    // Use LLMService to measure speed
    const llmService = new LLMService();
    const model: Model = { ...modelDraft, id: "temp" };
    const messages = [new vscode.LanguageModelTextPart("Count from 1 to 50. e.g. 1, 2, 3...")];

    // Mock VS Code message
    const vsMessages: vscode.LanguageModelChatRequestMessage[] = [
      {
        role: vscode.LanguageModelChatMessageRole.User,
        content: messages,
        name: undefined,
      },
    ];

    let firstTokenTime = 0;
    let endTime = 0;
    let tokenCount = 0;

    const progressReporter: vscode.Progress<vscode.LanguageModelResponsePart> = {
      report: () => {
        // no-op
      },
    };

    const cancellationToken: vscode.CancellationToken = {
      isCancellationRequested: token.aborted,
      onCancellationRequested: (listener) => {
        token.addEventListener("abort", listener);
        return { dispose: () => token.removeEventListener("abort", listener) };
      },
    };

    await llmService.chat(
      provider,
      model,
      vsMessages,
      undefined,
      progressReporter,
      cancellationToken,
      (stats) => {
        firstTokenTime = stats.firstTokenTime;
        endTime = stats.endTime;
        tokenCount = stats.tokenCount;
      },
    );

    // Validate the timing data
    if (tokenCount > 0 && firstTokenTime > 0 && endTime > firstTokenTime) {
      const duration = (endTime - firstTokenTime) / 1000;
      // Sanity check: reject unrealistic durations (too fast or suspiciously slow)
      // Minimum 0.01 seconds (10ms) to avoid division by near-zero
      // Maximum 60 seconds to avoid measuring extremely slow responses
      if (duration >= 0.01 && duration <= 60) {
        const speed = tokenCount / duration;
        // Sanity check: reject unrealistic speeds (>10000 t/s is physically impossible)
        if (speed <= 10000) {
          return speed;
        }
      }
    }
    return 0;
  }

  private static resolveModelIdentifierFromDraft(modelDraft: ModelDraft): string {
    const trimmedId = modelDraft.id?.trim();
    if (trimmedId) {
      return trimmedId;
    }
    const trimmedFamily = (modelDraft.family ?? ConfigManager.getDefaultModelFamily()).trim();
    if (trimmedFamily) {
      return trimmedFamily;
    }
    const draftRid = modelDraft.rid?.trim();
    if (draftRid) {
      return draftRid;
    }
    return ConfigManager.getDefaultModelFamily();
  }

  private static async detectLimit(
    provider: Provider,
    modelDraft: ModelDraft,
    _mode: "input" | "output",
    token: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<number | undefined> {
    // 1. Try to probe via error message first (Zero-cost)
    // This is the most accurate way if the API supports it
    const probed = await ModelTester.probeLimitFromError(provider, modelDraft, token, onProgress);
    if (probed > 0) {
      onProgress?.(`Probed limit from API error: ${probed}`);
      return probed;
    }

    // 2. Binary Search for Output Limit (max_tokens)
    // If probing failed (API returned OK for huge max_tokens), it might mean the API ignores max_tokens
    // OR it supports a very large value. We try to find the boundary where it starts rejecting.
    // If it never rejects (even at 512k), we assume it ignores the parameter, but we return the highest tested value
    // as a "safe" limit, or we could fallback to a default.

    const testMode = "output";
    onProgress?.("Probing max_tokens limit via binary search...");

    // Coarse search (Reverse)
    // 512k, 256k, 128k, 64k, 32k, 16k, 8k, 4k
    const coarsePoints = [512000, 256000, 128000, 64000, 32000, 16000, 8000, 4000];
    let high = 0;
    let low = 0;

    for (const point of coarsePoints) {
      if (token.aborted) {
        return 0;
      }
      onProgress?.(`Probing ${testMode} limit: ${point} tokens...`);
      const success = await ModelTester.verifyLimit(provider, modelDraft, point, testMode, token);
      if (success) {
        if (point === coarsePoints[0]) {
          // If the highest point (128000) succeeds, it's possible the API ignores max_tokens.
          // In this case, returning 128000 is safer than 512000.
          return point;
        }
        low = point;
        // The gap is between this point (success) and the previous point (failed)
        const prevIndex = coarsePoints.indexOf(point) - 1;
        const prevPoint = prevIndex >= 0 ? coarsePoints[prevIndex] : undefined;
        high = prevPoint !== undefined ? prevPoint : point * 2;
        break;
      }
    }

    if (low === 0) {
      // Even the lowest point failed? Try a very small fallback
      const fallback = 1024;
      onProgress?.(`Probing fallback limit: ${fallback}...`);
      if (await ModelTester.verifyLimit(provider, modelDraft, fallback, testMode, token)) {
        return fallback;
      }
      return 0;
    }

    // Binary search between low and high
    onProgress?.(`Refining ${testMode} limit between ${low} and ${high}...`);
    let best = low;
    let l = low;
    let r = high;

    while (r - l > 1024) {
      if (token.aborted) {
        return best;
      }
      const mid = Math.floor((l + r) / 2);
      onProgress?.(`Probing ${testMode} limit: ${mid} tokens...`);
      const success = await ModelTester.verifyLimit(provider, modelDraft, mid, testMode, token);
      if (success) {
        best = mid;
        l = mid;
      } else {
        r = mid;
      }
    }

    return best;
  }

  private static async probeLimitFromError(
    provider: Provider,
    modelDraft: ModelDraft,
    token: AbortSignal,
    onProgress?: ProgressCallback,
  ): Promise<number> {
    try {
      // Send a huge max_tokens to provoke an error
      const hugeValue = 100000000;
      const payload = {
        type: "text",
        maxOutputTokens: hugeValue,
        prompt: "Reply 'OK'.",
      };

      // We expect this to fail and throw an error string
      await ModelTester.performRequest(provider, modelDraft, payload, token);
      return 0; // Surprisingly succeeded?
    } catch (e: unknown) {
      let errorMsg = (e instanceof Error ? e.message : String(e)).toLowerCase();

      // Check for AI SDK specific error fields to capture the full error details
      if ((e as Record<string, unknown>)?.responseBody) {
        errorMsg += " " + String((e as Record<string, unknown>)?.responseBody).toLowerCase();
      }
      if ((e as Record<string, unknown>)?.data) {
        errorMsg += " " + JSON.stringify((e as Record<string, unknown>)?.data).toLowerCase();
      }

      onProgress?.(`Probing error message: ${errorMsg}`);

      const patterns = [
        /range.*?\[\s*\d+\s*,\s*(\d+)\s*\]/, // Matches [1, 8192] -> 8192
        /range.*?\(\s*.*,\s*(\d+)\s*\)/, // Matches (1, 8192) -> 8192
        /between \d+ and (\d+)/, // Matches between 1 and 8192
        /maximum context length is (\d+)/,
        /context window is (\d+)/,
        /limit of (\d+)/,
        /limit is (\d+)/,
        /supports at most (\d+)/,
        /max_tokens.*?(\d+)/,
      ];

      for (const pattern of patterns) {
        const match = errorMsg.match(pattern);
        if (match && match[1]) {
          const val = Number.parseInt(match[1], 10);
          if (!isNaN(val) && val > 0) {
            return val;
          }
        }
      }
      return 0;
    }
  }

  private static async verifyLimit(
    provider: Provider,
    modelDraft: ModelDraft,
    value: number,
    mode: "input" | "output",
    token: AbortSignal,
  ): Promise<boolean> {
    try {
      const intValue = Math.floor(value);
      const payload: Record<string, unknown> = { type: "text" };

      if (mode === "input") {
        // Construct a prompt with approximately 'value' tokens.
        // We use "word " which is typically 1 token in many tokenizers.
        // To be safe and efficient, we can use a repeated string.
        // "a " is often 1 token.
        const chunk = "a ";
        const repeatCount = intValue;
        // Limit payload size to avoid OOM or network issues if value is huge
        if (repeatCount > 200000) {
          return false;
        } // Hard cap for safety

        payload.prompt = chunk.repeat(repeatCount) + "Reply 'OK'.";
        // We don't set maxOutputTokens here, let it use default
      } else {
        payload.maxOutputTokens = intValue;
        payload.prompt = "Reply 'OK'.";
      }

      const responseText = await ModelTester.performRequest(provider, modelDraft, payload, token);
      return responseText !== undefined;
    } catch (e) {
      return false;
    }
  }
}
