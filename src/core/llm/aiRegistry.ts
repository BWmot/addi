import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import { extractReasoningMiddleware } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Provider, Model } from "../../common/types";
import { logger, LogScope } from "../../common/logger";
import { createReasoningContentInjectMiddleware } from "./reasoningContentInjectMiddleware";

// AI SDK 的 Provider 实例通常是一个函数，接受 modelId 返回 LanguageModelV1
// 我们定义一个通用的类型别名
type AIProviderInstance = (modelId: string) => LanguageModel;

/**
 * Common settings shape for all AI SDK provider factories.
 * Defined as a concrete type (not using optional properties) to avoid conflicts
 * with `exactOptionalPropertyTypes` in tsconfig.
 */
interface BaseProviderSettings {
  baseURL: string;
  apiKey: string;
  fetch: typeof globalThis.fetch;
}

/**
 * Factory interface for creating AI Provider instances (e.g. OpenAI, Anthropic).
 */
export interface ProviderFactory {
  id: string;
  label: string;
  create: (provider: Provider) => AIProviderInstance;
}

/**
 * Registry for all supported AI Providers.
 * Maps provider types (vendor strings) to their respective factory functions.
 *
 * Instance-based design for testability and dependency injection.
 * Use `AIProviderRegistry.getInstance()` for the global singleton,
 * or create a new instance for testing / custom setups.
 */
export class AIProviderRegistry {
  private static _instance: AIProviderRegistry | undefined;
  private factories: Record<string, ProviderFactory> = {};
  private initialized = false;

  /**
   * Get or create the global singleton instance.
   * Factories are registered lazily on first access.
   */
  static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry._instance) {
      AIProviderRegistry._instance = new AIProviderRegistry();
    }
    return AIProviderRegistry._instance;
  }

  register(factory: ProviderFactory) {
    this.factories[factory.id] = factory;
  }

  unregister(id: string) {
    delete this.factories[id];
  }

  getFactory(id: string): ProviderFactory | undefined {
    this.ensureInitialized();
    return this.factories[id];
  }

  getAvailableTypes() {
    this.ensureInitialized();
    return Object.values(this.factories).map((f) => ({
      label: f.label,
      value: f.id,
    }));
  }

  private ensureInitialized() {
    if (this.initialized) {
      return;
    }

    // Helper to create a fetch wrapper for error handling
    // Accepts an optional provider label to enrich error logs
    const createFetchWithErrorHandling = (
      baseFetch?: typeof globalThis.fetch,
      providerLabel?: string,
    ) => {
      return async (url: string | Request | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        const providerCtx = providerLabel ? `[${providerLabel}] ` : "";
        try {
          const fetchFn = baseFetch || fetch;
          // Add default User-Agent if not present (helps with some strict firewalls/providers like Minimax)
          const finalOptions = { ...options };
          if (!finalOptions.headers) {
            finalOptions.headers = {};
          }
          // Handle headers as Headers object or plain object
          if (finalOptions.headers instanceof Headers) {
            if (!finalOptions.headers.has("User-Agent")) {
              finalOptions.headers.set(
                "User-Agent",
                "Vscode Extension: Addi (https://github.com/deepwn/addi)",
              );
            }
          } else if (Array.isArray(finalOptions.headers)) {
            // [string, string][] format — add if missing
            const headersArray = finalOptions.headers as [string, string][];
            if (!headersArray.some(([k]) => k.toLowerCase() === "user-agent")) {
              headersArray.push([
                "User-Agent",
                "Vscode Extension: Addi (https://github.com/deepwn/addi)",
              ]);
            }
          } else {
            const headersRecord: Record<string, string> =
              (finalOptions.headers as Record<string, string>) || {};
            if (!headersRecord["User-Agent"] && !headersRecord["user-agent"]) {
              headersRecord["User-Agent"] =
                "Vscode Extension: Addi (https://github.com/deepwn/addi)";
            }
            finalOptions.headers = headersRecord;
          }

          const response = await fetchFn(url, finalOptions);
          if (!response.ok) {
            const errorMsg = `${providerCtx}[AI-SDK Fetch] Error ${response.status} from ${urlStr}`;
            try {
              const clone = response.clone();
              const text = await clone.text();
              logger.error(
                errorMsg,
                {
                  status: response.status,
                  body: text.substring(0, 500),
                  provider: providerLabel,
                },
                LogScope.AI_REGISTRY,
              );
            } catch (e) {
              logger.error(errorMsg, { provider: providerLabel, error: e }, LogScope.AI_REGISTRY);
            }
          }
          return response;
        } catch (e) {
          logger.error(
            `${providerCtx}[AI-SDK Fetch] Network Error: ${urlStr}`,
            { provider: providerLabel, error: e },
            LogScope.AI_REGISTRY,
          );
          throw e;
        }
      };
    };

    /**
     * Build common provider settings from a Provider config.
     * All properties are non-optional to be compatible with `exactOptionalPropertyTypes`.
     */
    const buildBaseSettings = (p: Provider, overrideBaseURL?: string): BaseProviderSettings => ({
      baseURL: overrideBaseURL ?? p.apiEndpoint ?? "",
      apiKey: p.apiKey ?? "",
      fetch: createFetchWithErrorHandling(undefined, p.name),
    });

    // OpenAI (/completions) - Most common, used by OpenAI, DeepSeek, local models, etc.
    this.register({
      id: "openai-completions",
      label: "OpenAI (/completions)",
      create: (p) => {
        const isCustomEndpoint = p.apiEndpoint && !p.apiEndpoint.includes("api.openai.com");
        const baseURL = p.apiEndpoint ? p.apiEndpoint.replace(/\/chat\/completions\/?$/, "") : "";

        // Smart Fallback: use createOpenAICompatible for custom endpoints
        if (isCustomEndpoint) {
          return createOpenAICompatible({
            baseURL,
            apiKey: p.apiKey ?? "",
            name: "openai-proxy",
            fetch: createFetchWithErrorHandling(undefined, p.name),
          });
        }

        return createOpenAI(buildBaseSettings(p, baseURL));
      },
    });

    // OpenAI (/responses) - Newer API with built-in tool support
    this.register({
      id: "openai-responses",
      label: "OpenAI (/responses)",
      create: (p) => {
        const baseURL = p.apiEndpoint ? p.apiEndpoint.replace(/\/responses\/?$/, "") : "";
        return createOpenAI(buildBaseSettings(p, baseURL));
      },
    });

    // Anthropic (/messages)
    this.register({
      id: "anthropic-messages",
      label: "Anthropic (/messages)",
      create: (p) => {
        // Manual mode: User must provide the correct baseURL.
        // e.g. https://api.minimaxi.com/anthropic/v1
        // We only strip /messages because the SDK adds it.
        const baseURL = p.apiEndpoint ? p.apiEndpoint.replace(/\/messages\/?$/, "") : "";
        return createAnthropic(buildBaseSettings(p, baseURL));
      },
    });

    // Google (/name:generateContent)
    this.register({
      id: "google-generateContent",
      label: "Google (/name:generateContent)",
      create: (p) => {
        return createGoogleGenerativeAI(buildBaseSettings(p));
      },
    });

    this.initialized = true;
  }

  /**
   * 根据 Provider 配置和 Model ID 创建 AI SDK 的 LanguageModel 实例
   *
   * 重要: 这里必须使用 model.rid (远程模型 ID)，而不是 model.id (本地 UUID)
   * 因为 AI SDK 需要知道实际的远程模型标识符来正确路由请求
   */
  createModel(provider: Provider, modelOrId: string | Model): LanguageModel {
    this.ensureInitialized();

    // 关键修复: 如果传入的是 Model 对象，必须使用 rid 而非 id
    // - id 是本地生成的 UUID，用于在 addi 扩展内部唯一标识模型
    // - rid 是远程 API 接受的模型 ID（如 "gpt-4o", "claude-3-5-sonnet"）
    let modelId: string;

    if (typeof modelOrId === "string") {
      // 如果直接传入的是字符串，当作 rid 处理
      modelId = modelOrId;
    } else {
      // 如果传入的是 Model 对象，使用 rid
      modelId = modelOrId.rid;
    }

    // 尝试获取对应的工厂，如果找不到则默认使用 openai (兼容模式)
    let factory = this.factories[provider.providerType];
    if (!factory) {
      if (["openai-completions", "openai-responses"].includes(provider.providerType)) {
        factory = this.factories["openai-completions"];
      } else {
        factory = this.factories["openai-completions"]; // Default fallback
      }
    }

    if (!factory) {
      // Should not happen if fallback is correct
      // Ensure factory is strictly not undefined for TypeScript
      factory = this.factories["openai-completions"];
      if (!factory) {
        throw new Error(`Provider factory not found for type: ${provider.providerType}`);
      }
    }

    const aiProviderInstance = factory.create(provider);
    let modelInstance = aiProviderInstance(modelId);

    // ──────────────────────────────────────────────────────────────────────
    // 中间件链 — 基于模型 options 中的实验性功能开关
    //
    // 使用 wrapLanguageModel 的中间件链机制，从右向左执行。
    // extractReasoningMiddleware 先执行（处理 <think> 标签内容层），
    // reasoningContentInjectMiddleware 后执行（包裹外层，处理 protocol 层）。
    //
    // 启用方式：由用户在模型编辑页面的"实验性功能"区手动勾选，
    // 而非自动检测。详见 docs/reasoning-support-plan.md §3.2。
    // ──────────────────────────────────────────────────────────────────────

    // 获取模型 options（用户手动配置的实验性功能开关）
    const modelOptions =
      (typeof modelOrId === "object" ? modelOrId.options : undefined) ??
      provider.models?.find((m) => m.rid === modelId || m.id === modelId)?.options;

    const middlewares: LanguageModelMiddleware[] = [];

    // [实验性] <think> 标签提取 — 从 text 中提取 <think>...</think> 内容
    if (modelOptions?.extractReasoningContent) {
      middlewares.push(
        extractReasoningMiddleware({
          tagName: "think",
          startWithReasoning: true,
        }),
      );
    }

    // [实验性] reasoning_content 字段注入 — 处理多轮回传
    // 对缺少 type: "reasoning" part 的 assistant 消息注入占位 part，
    // 确保 provider 的 convertTo*ChatMessages() 输出 reasoning_content 字段。
    // 适用 DeepSeek V4/R1、MiMo v2 等使用 reasoning_content API 字段的模型。
    if (modelOptions?.reasoningContentInject) {
      middlewares.push(createReasoningContentInjectMiddleware());
    }

    // 应用中间件链
    if (middlewares.length > 0) {
      modelInstance = wrapLanguageModel({
        model: modelInstance as any,
        middleware: middlewares,
        modelId,
        providerId: provider.providerType,
      });
    }

    // Debug log for model creation
    logger.debug(
      "AI SDK model created",
      {
        factoryType: provider.providerType,
        modelRid: modelId,
        providerName: provider.name,
        middlewareCount: middlewares.length,
        middlewareTypes: middlewares.map((m) => m.constructor?.name || "anonymous"),
      },
      LogScope.AI_REGISTRY,
    );

    return modelInstance;
  }
}
