/**
 * Unit Tests for remoteModelFetcher
 *
 * Tests the fetchProviderModelsFromApi() function with a mocked global fetch
 * to verify model parsing logic for OpenAI, Anthropic, and Google provider types.
 *
 * The private helper functions (normalizeBaseUrl, buildUrl, resolveModelsUrl,
 * readResponseError, coercePositiveInteger) are tested indirectly through
 * the main public function.
 */
import * as assert from "assert";
import {
  fetchProviderModelsFromApi,
  type RemoteModelFetcherOptions,
} from "../src/core/providers/remoteModelFetcher";
import type { Provider } from "../src/common/types";

// ─── Test Helpers ───────────────────────────────────────────────────────────

/** Save original fetch and restore after each test */
let originalFetch: typeof globalThis.fetch;

function createMockFetch(response: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
}) {
  return async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const body = response.text ?? JSON.stringify(response.body ?? {});
    return {
      ok: response.ok,
      status: response.status ?? 200,
      statusText: response.statusText ?? "OK",
      json: async () => response.body ?? {},
      text: async () => body,
    } as Response;
  };
}

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: overrides.id ?? "test-provider-id",
    name: overrides.name ?? "Test Provider",
    providerType: overrides.providerType ?? "openai-completions",
    apiEndpoint: overrides.apiEndpoint ?? "https://api.openai.com/v1",
    models: overrides.models ?? [],
    apiKey: overrides.apiKey,
  };
}

const mockOptions: RemoteModelFetcherOptions = {
  getApiKey: async () => "test-api-key",
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("remoteModelFetcher", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("error handling", () => {
    it("should throw when API endpoint is not configured", async () => {
      const provider = makeProvider({ apiEndpoint: "" });
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, mockOptions),
        /API endpoint is not configured/,
      );
    });

    it("should throw when API endpoint is only whitespace", async () => {
      const provider = makeProvider({ apiEndpoint: "   " });
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, mockOptions),
        /API endpoint is not configured/,
      );
    });

    it("should throw when API key is not configured", async () => {
      const provider = makeProvider();
      const options: RemoteModelFetcherOptions = {
        getApiKey: async () => undefined,
      };
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, options),
        /API key is not configured/,
      );
    });

    it("should throw when API key is empty string", async () => {
      const provider = makeProvider();
      const options: RemoteModelFetcherOptions = {
        getApiKey: async () => "",
      };
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, options),
        /API key is not configured/,
      );
    });

    it("should wrap HTTP errors with status code", async () => {
      globalThis.fetch = createMockFetch({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        body: { error: { message: "Invalid API key" } },
      });

      const provider = makeProvider();
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, mockOptions),
        /Failed to fetch models:.*401.*Invalid API key/,
      );
    });

    it("should handle HTTP error with plain text body", async () => {
      globalThis.fetch = createMockFetch({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: "Something went wrong",
      });

      const provider = makeProvider();
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, mockOptions),
        /Failed to fetch models:.*500.*Something went wrong/,
      );
    });

    it("should handle HTTP error with string error in JSON", async () => {
      globalThis.fetch = createMockFetch({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        body: { error: "Rate limited" },
      });

      const provider = makeProvider();
      await assert.rejects(
        () => fetchProviderModelsFromApi(provider, mockOptions),
        /Failed to fetch models:.*403.*Rate limited/,
      );
    });
  });

  describe("unknown provider type", () => {
    it("should return empty array for unknown provider type", async () => {
      const provider = makeProvider({ providerType: "unknown-type" as any });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);
      assert.deepStrictEqual(models, []);
    });
  });

  // ─── OpenAI-Compatible ──────────────────────────────────────────────────

  describe("openai-completions provider", () => {
    it("should parse OpenAI models list", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [
            {
              id: "gpt-4o",
              display_name: "GPT-4o",
              owned_by: "openai",
            },
            {
              id: "gpt-3.5-turbo",
              display_name: "GPT-3.5 Turbo",
              owned_by: "openai",
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "openai-completions" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 2);
      assert.strictEqual(models[0].id, "gpt-4o");
      assert.strictEqual(models[0].name, "GPT-4o");
      assert.strictEqual(models[0].family, "openai");
      assert.strictEqual(models[1].id, "gpt-3.5-turbo");
    });

    it("should use id as name when display_name is missing", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [{ id: "gpt-4" }],
        },
      });

      const provider = makeProvider();
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "gpt-4");
      assert.strictEqual(models[0].name, "gpt-4");
    });

    it("should set description from owned_by when no explicit description", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [{ id: "gpt-4", owned_by: "openai" }],
        },
      });

      const provider = makeProvider();
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].description, "Owner: openai");
    });

    it("should skip entries without id", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [
            { id: "gpt-4" },
            { name: "no-id-model" }, // no id field
            null, // null entry
            42, // non-object entry
          ],
        },
      });

      const provider = makeProvider();
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "gpt-4");
    });

    it("should handle missing data array gracefully", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: { object: "list" },
      });

      const provider = makeProvider();
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.deepStrictEqual(models, []);
    });
  });

  describe("openai-responses provider", () => {
    it("should use same parsing logic as openai-completions", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [
            { id: "o1", display_name: "o1", owned_by: "openai" },
          ],
        },
      });

      const provider = makeProvider({ providerType: "openai-responses" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "o1");
    });
  });

  describe("OpenAI URL resolution", () => {
    it("should resolve /models from /chat/completions endpoint", async () => {
      let capturedUrl = "";
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return {
          ok: true,
          json: async () => ({ data: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider({
        apiEndpoint: "https://api.openai.com/v1/chat/completions",
      });
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.ok(
        capturedUrl.endsWith("/models"),
        `URL should end with /models, got: ${capturedUrl}`,
      );
      assert.ok(
        !capturedUrl.includes("/chat/completions"),
        "Should strip /chat/completions from URL",
      );
    });

    it("should append /models to base endpoint", async () => {
      let capturedUrl = "";
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return {
          ok: true,
          json: async () => ({ data: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider({
        apiEndpoint: "https://api.openai.com/v1",
      });
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(capturedUrl, "https://api.openai.com/v1/models");
    });

    it("should strip trailing slashes from endpoint", async () => {
      let capturedUrl = "";
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return {
          ok: true,
          json: async () => ({ data: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider({
        apiEndpoint: "https://api.openai.com/v1///",
      });
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(capturedUrl, "https://api.openai.com/v1/models");
    });

    it("should use Authorization Bearer header", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      globalThis.fetch = async (
        _input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        capturedHeaders = init?.headers as Record<string, string> | undefined;
        return {
          ok: true,
          json: async () => ({ data: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider();
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(capturedHeaders!["Authorization"], "Bearer test-api-key");
    });
  });

  // ─── Anthropic ──────────────────────────────────────────────────────────

  describe("anthropic-messages provider", () => {
    it("should parse Anthropic models list (models array)", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              id: "claude-3-opus-20240229",
              display_name: "Claude 3 Opus",
              description: "Most powerful model",
              input_token_limit: 200000,
              output_token_limit: 4096,
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "claude-3-opus-20240229");
      assert.strictEqual(models[0].name, "Claude 3 Opus");
      assert.strictEqual(models[0].description, "Most powerful model");
      assert.strictEqual(models[0].maxInputTokens, 200000);
      assert.strictEqual(models[0].maxOutputTokens, 4096);
    });

    it("should parse Anthropic models list (data array fallback)", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          data: [
            {
              id: "claude-3-sonnet-20240229",
              name: "claude-3-sonnet-20240229",
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "claude-3-sonnet-20240229");
    });

    it("should use name field as id fallback for Anthropic", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            { name: "claude-3-haiku-20240307" },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "claude-3-haiku-20240307");
    });

    it("should use x-api-key header for Anthropic", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      globalThis.fetch = async (
        _input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        capturedHeaders = init?.headers as Record<string, string> | undefined;
        return {
          ok: true,
          json: async () => ({ models: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider({ providerType: "anthropic-messages" });
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(capturedHeaders!["x-api-key"], "test-api-key");
      assert.strictEqual(capturedHeaders!["anthropic-version"], "2023-06-01");
    });

    it("should skip models without id or name", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            { id: "claude-3-opus" },
            { description: "no-id-or-name" },
            null,
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "claude-3-opus");
    });

    it("should parse token limits from alternative field names", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              id: "test-model",
              context_length: 100000,
              max_output_tokens: 8192,
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].maxInputTokens, 100000);
      assert.strictEqual(models[0].maxOutputTokens, 8192);
    });
  });

  // ─── Google ─────────────────────────────────────────────────────────────

  describe("google-generateContent provider", () => {
    it("should parse Google models list", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              name: "models/gemini-1.5-pro",
              displayName: "Gemini 1.5 Pro",
              description: "Google's most capable model",
              inputTokenLimit: 1048576,
              outputTokenLimit: 8192,
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "models/gemini-1.5-pro");
      assert.strictEqual(models[0].name, "Gemini 1.5 Pro");
      assert.strictEqual(models[0].description, "Google's most capable model");
      assert.strictEqual(models[0].maxInputTokens, 1048576);
      assert.strictEqual(models[0].maxOutputTokens, 8192);
    });

    it("should use name as id when name is the model identifier", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            { name: "models/gemini-2.0-flash" },
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].id, "models/gemini-2.0-flash");
      assert.strictEqual(models[0].name, "models/gemini-2.0-flash");
    });

    it("should pass API key as query parameter for Google", async () => {
      let capturedUrl = "";
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return {
          ok: true,
          json: async () => ({ models: [] }),
          text: async () => "{}",
        } as Response;
      };

      const provider = makeProvider({ providerType: "google-generateContent" });
      await fetchProviderModelsFromApi(provider, mockOptions);

      assert.ok(
        capturedUrl.includes("key=test-api-key"),
        `URL should contain API key, got: ${capturedUrl}`,
      );
    });

    it("should detect vision from inputModalities", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              name: "gemini-1.5-pro",
              inputModalities: ["TEXT", "IMAGE"],
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.ok(models[0].capabilities, "Should have capabilities");
      assert.strictEqual(models[0].capabilities?.vision, true);
    });

    it("should detect vision from supportedInputModalities", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              name: "gemini-pro-vision",
              supportedInputModalities: ["IMAGE", "TEXT"],
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].capabilities?.vision, true);
    });

    it("should not set vision when IMAGE modality is not present", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              name: "text-only-model",
              inputModalities: ["TEXT"],
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].capabilities?.vision, undefined);
    });

    it("should skip models without name", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            { name: "models/gemini-pro" },
            { displayName: "No Name Model" }, // no name field
            null,
          ],
        },
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0].id, "models/gemini-pro");
    });

    it("should handle missing models array gracefully", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {},
      });

      const provider = makeProvider({ providerType: "google-generateContent" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.deepStrictEqual(models, []);
    });
  });

  // ─── coercePositiveInteger edge cases (tested through Anthropic parsing) ─

  describe("token limit parsing", () => {
    it("should handle string token limits", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              id: "test-model",
              input_token_limit: "200000",
              output_token_limit: "4096",
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].maxInputTokens, 200000);
      assert.strictEqual(models[0].maxOutputTokens, 4096);
    });

    it("should ignore negative token values", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              id: "test-model",
              input_token_limit: -100,
              output_token_limit: -50,
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].maxInputTokens, undefined);
      assert.strictEqual(models[0].maxOutputTokens, undefined);
    });

    it("should ignore non-numeric token values", async () => {
      globalThis.fetch = createMockFetch({
        ok: true,
        body: {
          models: [
            {
              id: "test-model",
              input_token_limit: "very large",
              output_token_limit: null,
            },
          ],
        },
      });

      const provider = makeProvider({ providerType: "anthropic-messages" });
      const models = await fetchProviderModelsFromApi(provider, mockOptions);

      assert.strictEqual(models[0].maxInputTokens, undefined);
      assert.strictEqual(models[0].maxOutputTokens, undefined);
    });
  });
});
