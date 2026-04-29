/**
 * Unit Tests for dataNormalizer
 *
 * Tests the pure normalization functions extracted from ProviderModelManager:
 * - normalizeCapabilities() — merge/coerce capability objects
 * - normalizeProvidersInPlace() — migrate and fix provider/model data
 *
 * Note: normalizeProvidersInPlace depends on ConfigManager (vscode workspace)
 * and logger (vscode output channel), both available in vscode-test environment.
 */
import * as assert from "assert";
import {
  normalizeCapabilities,
  normalizeProvidersInPlace,
  type NormalizationResult,
} from "../src/core/providers/dataNormalizer";
import type { Provider, Model, ModelCapabilities } from "../src/common/types";

// ─── normalizeCapabilities() ────────────────────────────────────────────────

describe("normalizeCapabilities", () => {
  describe("empty inputs", () => {
    it("should return empty object when both source and fallback are undefined", () => {
      const result = normalizeCapabilities(undefined, undefined);
      assert.deepStrictEqual(result, {});
    });

    it("should return empty object when both source and fallback are empty", () => {
      const result = normalizeCapabilities({}, {});
      assert.deepStrictEqual(result, {});
    });
  });

  describe("imageInput", () => {
    it("should preserve imageInput from source", () => {
      const result = normalizeCapabilities({ imageInput: true }, {});
      assert.strictEqual(result.imageInput, true);
    });

    it("should use fallback imageInput when source has none", () => {
      const result = normalizeCapabilities({}, { imageInput: true });
      assert.strictEqual(result.imageInput, true);
    });

    it("should prefer source imageInput over fallback", () => {
      const result = normalizeCapabilities(
        { imageInput: true },
        { imageInput: false },
      );
      assert.strictEqual(result.imageInput, true);
    });

    it("should coerce falsy values to boolean false", () => {
      const result = normalizeCapabilities(
        { imageInput: 0 as unknown as boolean },
        undefined,
      );
      assert.strictEqual(result.imageInput, false);
    });

    it("should coerce truthy values to boolean true", () => {
      const result = normalizeCapabilities(
        { imageInput: 1 as unknown as boolean },
        undefined,
      );
      assert.strictEqual(result.imageInput, true);
    });
  });

  describe("toolCalling", () => {
    it("should preserve boolean toolCalling from source", () => {
      const result = normalizeCapabilities({ toolCalling: true }, {});
      assert.strictEqual(result.toolCalling, true);
    });

    it("should preserve numeric toolCalling from source", () => {
      const result = normalizeCapabilities({ toolCalling: 5 }, {});
      assert.strictEqual(result.toolCalling, 5);
    });

    it("should use fallback toolCalling when source has none", () => {
      const result = normalizeCapabilities({}, { toolCalling: true });
      assert.strictEqual(result.toolCalling, true);
    });

    it("should prefer source toolCalling over fallback", () => {
      const result = normalizeCapabilities(
        { toolCalling: 3 },
        { toolCalling: true },
      );
      assert.strictEqual(result.toolCalling, 3);
    });

    it("should coerce fallback boolean toolCalling correctly", () => {
      // fallback is a boolean, no coercion needed since typeof boolean
      const result = normalizeCapabilities({}, { toolCalling: false });
      assert.strictEqual(result.toolCalling, false);
    });

    it("should coerce number source to number (stays as-is)", () => {
      const result = normalizeCapabilities({ toolCalling: 10 }, {});
      assert.strictEqual(result.toolCalling, 10);
    });
  });

  describe("combined capabilities", () => {
    it("should merge imageInput from source and toolCalling from fallback", () => {
      const result = normalizeCapabilities(
        { imageInput: true },
        { toolCalling: 7 },
      );
      assert.strictEqual(result.imageInput, true);
      assert.strictEqual(result.toolCalling, 7);
    });

    it("should merge all fields correctly", () => {
      const result = normalizeCapabilities(
        { imageInput: true, toolCalling: 3 },
        { imageInput: false, toolCalling: true },
      );
      assert.strictEqual(result.imageInput, true);
      assert.strictEqual(result.toolCalling, 3);
    });
  });

  describe("ignoring other capability fields", () => {
    it("should not include audioInput, videoInput, reasoning in result", () => {
      const source: ModelCapabilities = {
        imageInput: false,
        audioInput: true,
        videoInput: true,
        toolCalling: false,
        reasoning: true,
      };
      const result = normalizeCapabilities(source, undefined);
      // Only imageInput and toolCalling are in the result
      assert.strictEqual(result.imageInput, false);
      assert.strictEqual(result.toolCalling, false);
      assert.strictEqual(result.audioInput, undefined);
      assert.strictEqual(result.videoInput, undefined);
      assert.strictEqual(result.reasoning, undefined);
    });
  });
});

// ─── normalizeProvidersInPlace() ────────────────────────────────────────────

describe("normalizeProvidersInPlace", () => {
  /**
   * Helper: create a minimal valid provider for normalization tests.
   * We intentionally omit fields that normalization should fill in.
   */
  function makeRawProvider(overrides: Record<string, unknown> = {}): Provider {
    return {
      id: overrides.id as string ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: overrides.name as string ?? "Test Provider",
      providerType: overrides.providerType as any ?? "openai-completions",
      apiEndpoint: overrides.apiEndpoint as string ?? "https://api.openai.com/v1",
      models: overrides.models as any ?? [],
      ...overrides,
    } as Provider;
  }

  function makeRawModel(overrides: Record<string, unknown> = {}): Model {
    return {
      id: overrides.id as string ?? "model-id-001",
      rid: overrides.rid as string ?? "gpt-4",
      name: overrides.name as string ?? "GPT-4",
      family: overrides.family as string ?? "gpt",
      version: overrides.version as string ?? "1.0",
      maxInputTokens: overrides.maxInputTokens as number ?? 128000,
      maxOutputTokens: overrides.maxOutputTokens as number ?? 32000,
      capabilities: overrides.capabilities as any ?? {},
      ...overrides,
    } as Model;
  }

  describe("provider ID migration", () => {
    it("should migrate legacy numeric ID to UUID", () => {
      const provider = makeRawProvider({ id: "12345" });
      const result = normalizeProvidersInPlace([provider as any]);
      assert.ok(result.mutated, "Should be mutated");
      assert.ok(result.critical, "Should be critical");
      // New ID should be a UUID v4
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(
        uuidRegex.test(provider.id),
        `New ID "${provider.id}" should be UUID format`,
      );
    });

    it("should migrate empty ID to UUID", () => {
      const provider = makeRawProvider({ id: "" });
      const result = normalizeProvidersInPlace([provider as any]);
      assert.ok(result.mutated);
      assert.ok(result.critical);
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(provider.id));
    });

    it("should NOT migrate valid UUID format ID", () => {
      const validId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const provider = makeRawProvider({ id: validId });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.id, validId, "Valid UUID should not change");
    });
  });

  describe("models array recovery", () => {
    it("should reset invalid models array to empty", () => {
      const provider = makeRawProvider({ models: "not-an-array" as any });
      const result = normalizeProvidersInPlace([provider as any]);
      assert.ok(result.mutated);
      assert.ok(result.critical);
      assert.deepStrictEqual(provider.models, []);
    });

    it("should filter out null/undefined entries from models", () => {
      const validModel = makeRawModel();
      const provider = makeRawProvider({
        models: [validModel, null, undefined, validModel] as any,
      });
      const result = normalizeProvidersInPlace([provider as any]);
      assert.ok(result.mutated);
      assert.ok(result.critical);
      assert.strictEqual(provider.models.length, 2);
    });
  });

  describe("model field defaults", () => {
    it("should set default maxInputTokens when missing", () => {
      const model = makeRawModel({ maxInputTokens: "not-a-number" });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(typeof provider.models[0].maxInputTokens, "number");
      assert.ok(provider.models[0].maxInputTokens > 0);
    });

    it("should set default maxOutputTokens when missing", () => {
      const model = makeRawModel({ maxOutputTokens: undefined as any });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(typeof provider.models[0].maxOutputTokens, "number");
      assert.ok(provider.models[0].maxOutputTokens > 0);
    });

    it("should generate model ID when missing", () => {
      const model = makeRawModel({ id: "" });
      const provider = makeRawProvider({ models: [model] });
      const result = normalizeProvidersInPlace([provider as any]);
      assert.ok(result.critical);
      assert.ok(provider.models[0].id, "Should have generated an ID");
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(provider.models[0].id));
    });

    it("should set rid from id when rid is missing", () => {
      const model = makeRawModel({ rid: "" });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.ok(
        provider.models[0].rid,
        "rid should be set (fallback to id or generated)",
      );
    });

    it("should set default family when missing", () => {
      const model = makeRawModel({ family: "" });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.ok(provider.models[0].family, "family should be set");
    });

    it("should set default version when missing", () => {
      const model = makeRawModel({ version: "" });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.ok(provider.models[0].version, "version should be set");
    });
  });

  describe("capabilities normalization", () => {
    it("should initialize empty capabilities when missing", () => {
      const model = makeRawModel({ capabilities: undefined as any });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.ok(provider.models[0].capabilities, "capabilities should be set");
      assert.strictEqual(typeof provider.models[0].capabilities, "object");
    });

    it("should migrate legacy imageInput from model root to capabilities", () => {
      const model = makeRawModel({ capabilities: {} });
      (model as any).imageInput = true;
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      // After normalization, imageInput should be in capabilities, not at root
      assert.strictEqual(
        provider.models[0].capabilities.imageInput,
        true,
      );
      assert.strictEqual(
        (provider.models[0] as any).imageInput,
        undefined,
        "Legacy imageInput should be removed from root",
      );
    });

    it("should migrate legacy toolCalling from model root to capabilities", () => {
      const model = makeRawModel({ capabilities: {} });
      (model as any).toolCalling = 5;
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.models[0].capabilities.toolCalling, 5);
      assert.strictEqual(
        (provider.models[0] as any).toolCalling,
        undefined,
        "Legacy toolCalling should be removed from root",
      );
    });
  });

  describe("provider type normalization", () => {
    it("should map legacy 'openai' type to 'openai-completions'", () => {
      const provider = makeRawProvider({ providerType: "openai" as any });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "openai-completions");
    });

    it("should map legacy 'anthropic' type to 'anthropic-messages'", () => {
      const provider = makeRawProvider({ providerType: "anthropic" as any });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "anthropic-messages");
    });

    it("should map legacy 'google' type to 'google-generateContent'", () => {
      const provider = makeRawProvider({ providerType: "google" as any });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "google-generateContent");
    });

    it("should infer type from anthropic.com endpoint when type missing", () => {
      const provider = makeRawProvider({
        providerType: undefined as any,
        apiEndpoint: "https://api.anthropic.com/v1",
      });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "anthropic-messages");
    });

    it("should infer type from googleapis.com endpoint when type missing", () => {
      const provider = makeRawProvider({
        providerType: undefined as any,
        apiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
      });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "google-generateContent");
    });

    it("should default to openai-completions for unknown endpoints", () => {
      const provider = makeRawProvider({
        providerType: undefined as any,
        apiEndpoint: "https://custom-llm.example.com/v1",
      });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.providerType, "openai-completions");
    });
  });

  describe("idempotency", () => {
    it("should not mutate already-normalized providers", () => {
      const provider = makeRawProvider({
        models: [makeRawModel()],
      });
      // First pass
      normalizeProvidersInPlace([provider as any]);
      // Second pass — should be idempotent
      const result = normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(result.mutated, false, "Should not be mutated on second pass");
      assert.strictEqual(result.critical, false, "Should not be critical on second pass");
    });
  });

  describe("speed field handling", () => {
    it("should reset non-array speedHistory to empty array", () => {
      const model = makeRawModel();
      (model as any).speedHistory = "not-an-array";
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.deepStrictEqual(provider.models[0].speedHistory, []);
    });

    it("should delete non-number averageSpeed", () => {
      const model = makeRawModel();
      (model as any).averageSpeed = "fast";
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(provider.models[0].averageSpeed, undefined);
    });

    it("should preserve valid speed fields", () => {
      const model = makeRawModel({
        speedHistory: [10, 20, 30],
        averageSpeed: 20,
      });
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.deepStrictEqual(provider.models[0].speedHistory, [10, 20, 30]);
      assert.strictEqual(provider.models[0].averageSpeed, 20);
    });
  });

  describe("legacy field cleanup", () => {
    it("should remove non-string tooltip from model", () => {
      const model = makeRawModel();
      (model as any).tooltip = 123;
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual((provider.models[0] as any).tooltip, undefined);
    });

    it("should remove non-string detail from model", () => {
      const model = makeRawModel();
      (model as any).detail = { nested: true };
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual((provider.models[0] as any).detail, undefined);
    });

    it("should preserve string tooltip", () => {
      const model = makeRawModel();
      (model as any).tooltip = "This is a tooltip";
      const provider = makeRawProvider({ models: [model] });
      normalizeProvidersInPlace([provider as any]);
      assert.strictEqual(
        (provider.models[0] as any).tooltip,
        "This is a tooltip",
      );
    });
  });
});
