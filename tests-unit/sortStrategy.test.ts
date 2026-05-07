/**
 * Unit Tests for sortStrategy
 *
 * Tests the sortProviders() and sortModels() pure functions extracted from
 * providerView.ts. Verifies all sort rules, immutability, edge cases,
 * and descending-by-tokens semantics.
 */
import * as assert from "assert";
import { sortProviders, sortModels, type SortRule } from "../src/presentation/utils/sortStrategy";
import type { Provider, Model } from "../src/common/types";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeModel(overrides: Partial<Model> & Pick<Model, "rid" | "name">): Model {
  return {
    id: overrides.id ?? `id-${overrides.rid}`,
    rid: overrides.rid,
    name: overrides.name,
    family: overrides.family ?? "test",
    version: overrides.version ?? "1.0",
    maxInputTokens: overrides.maxInputTokens ?? 0,
    maxOutputTokens: overrides.maxOutputTokens ?? 0,
    capabilities: overrides.capabilities ?? {},
  };
}

function makeProvider(overrides: Partial<Provider> & Pick<Provider, "name">): Provider {
  return {
    id: overrides.id ?? `prov-${overrides.name}`,
    name: overrides.name,
    providerType: overrides.providerType ?? "openai-completions",
    models: overrides.models ?? [],
  };
}

// ─── sortProviders() ────────────────────────────────────────────────────────

describe("sortProviders", () => {
  const alpha = makeProvider({
    name: "Alpha",
    models: [
      makeModel({
        rid: "a1",
        name: "A1",
        maxInputTokens: 1000,
        maxOutputTokens: 500,
      }),
    ],
  });
  const beta = makeProvider({
    name: "Beta",
    models: [
      makeModel({
        rid: "b1",
        name: "B1",
        maxInputTokens: 5000,
        maxOutputTokens: 200,
      }),
      makeModel({
        rid: "b2",
        name: "B2",
        maxInputTokens: 3000,
        maxOutputTokens: 800,
      }),
    ],
  });
  const gamma = makeProvider({
    name: "Gamma",
    models: [
      makeModel({
        rid: "g1",
        name: "G1",
        maxInputTokens: 2000,
        maxOutputTokens: 1000,
      }),
    ],
  });

  describe('rule: "none"', () => {
    it("should return the original array reference unchanged", () => {
      const input = [beta, alpha, gamma];
      const result = sortProviders(input, "none");
      assert.strictEqual(result, input, "Should return the same array reference");
      assert.deepStrictEqual(
        result.map((p) => p.name),
        ["Beta", "Alpha", "Gamma"],
      );
    });
  });

  describe('rule: "alphabet"', () => {
    it("should sort providers by name case-insensitively", () => {
      const result = sortProviders([gamma, alpha, beta], "alphabet");
      assert.deepStrictEqual(
        result.map((p) => p.name),
        ["Alpha", "Beta", "Gamma"],
      );
    });

    it("should handle case differences (a < Z in locale-sensitive sort)", () => {
      const zebra = makeProvider({ name: "zebra" });
      const Alpha = makeProvider({ name: "Alpha" });
      const result = sortProviders([zebra, Alpha], "alphabet");
      // localeCompare with sensitivity: "base" treats a == A
      assert.strictEqual(result[0].name, "Alpha");
    });
  });

  describe('rule: "input tokens"', () => {
    it("should sort descending by the maximum maxInputTokens across child models", () => {
      // beta has model with maxInputTokens=5000 (highest), gamma=2000, alpha=1000
      const result = sortProviders([alpha, gamma, beta], "input tokens");
      assert.deepStrictEqual(
        result.map((p) => p.name),
        ["Beta", "Gamma", "Alpha"],
      );
    });

    it("should consider the highest token model in each provider", () => {
      // delta has a high model (9999) and a low model (10)
      const delta = makeProvider({
        name: "Delta",
        models: [
          makeModel({
            rid: "d1",
            name: "D1",
            maxInputTokens: 10,
            maxOutputTokens: 0,
          }),
          makeModel({
            rid: "d2",
            name: "D2",
            maxInputTokens: 9999,
            maxOutputTokens: 0,
          }),
        ],
      });
      const result = sortProviders([alpha, delta], "input tokens");
      assert.deepStrictEqual(
        result.map((p) => p.name),
        ["Delta", "Alpha"],
      );
    });
  });

  describe('rule: "output tokens"', () => {
    it("should sort descending by the maximum maxOutputTokens across child models", () => {
      // gamma has maxOutputTokens=1000 (highest), beta=800 (b2), alpha=500
      const result = sortProviders([alpha, beta, gamma], "output tokens");
      assert.deepStrictEqual(
        result.map((p) => p.name),
        ["Gamma", "Beta", "Alpha"],
      );
    });
  });

  describe("immutability", () => {
    it("should not mutate the original array", () => {
      const input = [gamma, alpha, beta];
      const originalOrder = input.map((p) => p.name);
      sortProviders(input, "alphabet");
      assert.deepStrictEqual(
        input.map((p) => p.name),
        originalOrder,
        "Original array should not be mutated",
      );
    });

    it("should return a new array reference", () => {
      const input = [gamma, alpha, beta];
      const result = sortProviders(input, "alphabet");
      assert.notStrictEqual(result, input, "Should be a different array reference");
    });
  });

  describe("edge cases", () => {
    it("should handle empty providers array", () => {
      const result = sortProviders([], "alphabet");
      assert.deepStrictEqual(result, []);
    });

    it("should handle single provider", () => {
      const result = sortProviders([alpha], "input tokens");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Alpha");
    });

    it("should handle providers with no models", () => {
      const empty = makeProvider({ name: "Empty", models: [] });
      const result = sortProviders([alpha, empty], "input tokens");
      // Empty provider should have maxTokens=0, alpha has 1000 → alpha first
      assert.strictEqual(result[0].name, "Alpha");
      assert.strictEqual(result[1].name, "Empty");
    });

    it("should treat undefined tokens as 0", () => {
      const modelWithUndefined = makeModel({
        rid: "undef",
        name: "Undef",
        maxInputTokens: undefined as unknown as number,
        maxOutputTokens: undefined as unknown as number,
      });
      const provider = makeProvider({
        name: "UndefProvider",
        models: [modelWithUndefined],
      });
      const result = sortProviders([provider, alpha], "input tokens");
      // alpha's model has 1000 > 0 → alpha first
      assert.strictEqual(result[0].name, "Alpha");
    });
  });
});

// ─── sortModels() ──────────────────────────────────────────────────────────

describe("sortModels", () => {
  const modelA = makeModel({
    rid: "a",
    name: "Alpha",
    maxInputTokens: 1000,
    maxOutputTokens: 300,
  });
  const modelB = makeModel({
    rid: "b",
    name: "Beta",
    maxInputTokens: 5000,
    maxOutputTokens: 100,
  });
  const modelC = makeModel({
    rid: "c",
    name: "Gamma",
    maxInputTokens: 2000,
    maxOutputTokens: 800,
  });

  describe('rule: "none"', () => {
    it("should return the original array reference unchanged", () => {
      const input = [modelB, modelA, modelC];
      const result = sortModels(input, "none");
      assert.strictEqual(result, input, "Should return the same array reference");
      assert.deepStrictEqual(
        result.map((m) => m.name),
        ["Beta", "Alpha", "Gamma"],
      );
    });
  });

  describe('rule: "alphabet"', () => {
    it("should sort models by name case-insensitively", () => {
      const result = sortModels([modelC, modelA, modelB], "alphabet");
      assert.deepStrictEqual(
        result.map((m) => m.name),
        ["Alpha", "Beta", "Gamma"],
      );
    });
  });

  describe('rule: "input tokens"', () => {
    it("should sort models descending by maxInputTokens", () => {
      const result = sortModels([modelA, modelC, modelB], "input tokens");
      assert.deepStrictEqual(
        result.map((m) => m.name),
        ["Beta", "Gamma", "Alpha"],
      );
    });

    it("should handle equal token values (stable-ish ordering)", () => {
      const m1 = makeModel({
        rid: "x",
        name: "X",
        maxInputTokens: 5000,
        maxOutputTokens: 0,
      });
      const m2 = makeModel({
        rid: "y",
        name: "Y",
        maxInputTokens: 5000,
        maxOutputTokens: 0,
      });
      const result = sortModels([m1, m2], "input tokens");
      assert.strictEqual(result.length, 2);
      // Both have same tokens, just verify no crash and both present
      assert.ok(result.some((m) => m.name === "X"));
      assert.ok(result.some((m) => m.name === "Y"));
    });
  });

  describe('rule: "output tokens"', () => {
    it("should sort models descending by maxOutputTokens", () => {
      // modelC=800, modelA=300, modelB=100
      const result = sortModels([modelB, modelA, modelC], "output tokens");
      assert.deepStrictEqual(
        result.map((m) => m.name),
        ["Gamma", "Alpha", "Beta"],
      );
    });
  });

  describe("immutability", () => {
    it("should not mutate the original array", () => {
      const input = [modelC, modelA, modelB];
      const originalOrder = input.map((m) => m.name);
      sortModels(input, "alphabet");
      assert.deepStrictEqual(
        input.map((m) => m.name),
        originalOrder,
      );
    });

    it("should return a new array reference for non-none rules", () => {
      const input = [modelC, modelA, modelB];
      const result = sortModels(input, "alphabet");
      assert.notStrictEqual(result, input);
    });
  });

  describe("edge cases", () => {
    it("should handle empty models array", () => {
      const result = sortModels([], "alphabet");
      assert.deepStrictEqual(result, []);
    });

    it("should handle single model", () => {
      const result = sortModels([modelA], "output tokens");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Alpha");
    });

    it("should treat undefined tokens as 0", () => {
      const undefModel = makeModel({
        rid: "undef",
        name: "Undef",
        maxInputTokens: undefined as unknown as number,
        maxOutputTokens: undefined as unknown as number,
      });
      const result = sortModels([undefModel, modelA], "input tokens");
      // modelA has 1000 > 0 → modelA first
      assert.strictEqual(result[0].name, "Alpha");
      assert.strictEqual(result[1].name, "Undef");
    });
  });
});

// ─── Type coverage ─────────────────────────────────────────────────────────

describe("SortRule type coverage", () => {
  it("should accept all valid sort rules without error", () => {
    const rules: SortRule[] = ["none", "alphabet", "input tokens", "output tokens"];
    for (const rule of rules) {
      const result = sortProviders([], rule);
      assert.ok(Array.isArray(result), `Rule "${rule}" should return an array`);
    }
  });
});
