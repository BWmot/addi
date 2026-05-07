/**
 * Unit Tests for IdGenerator
 *
 * Tests UUID v4 format compliance, uniqueness, and consistency.
 * IdGenerator wraps Node's crypto.randomUUID().
 */
import * as assert from "assert";
import { IdGenerator } from "../src/common/utils/id";

describe("IdGenerator", () => {
  it("generate() should return a non-empty string", () => {
    const id = IdGenerator.generate();
    assert.ok(id, "Generated ID should not be empty");
    assert.strictEqual(typeof id, "string", "Generated ID should be a string");
    assert.ok(id.length > 0, "Generated ID length should be positive");
  });

  it("generate() should return consistent length (36 chars with hyphens)", () => {
    const id = IdGenerator.generate();
    assert.strictEqual(id.length, 36, `UUID should be 36 chars, got ${id.length}: "${id}"`);
  });

  it("generate() should contain hyphen separators at correct positions", () => {
    const id = IdGenerator.generate();
    // UUID format: 8-4-4-4-12 (hyphens at positions 8, 13, 18, 23)
    assert.strictEqual(id[8], "-", "Hyphen at position 8");
    assert.strictEqual(id[13], "-", "Hyphen at position 13");
    assert.strictEqual(id[18], "-", "Hyphen at position 18");
    assert.strictEqual(id[23], "-", "Hyphen at position 23");
  });

  it("generate() should return UUID v4 format", () => {
    const id = IdGenerator.generate();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of [8, 9, a, b]
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(uuidRegex.test(id), `Generated ID "${id}" should match UUID v4 format`);
  });

  it("generate() should have version nibble set to 4", () => {
    // Position 14 (0-indexed) should be '4' for UUID v4
    const id = IdGenerator.generate();
    assert.strictEqual(id[14], "4", `Version nibble should be 4, got "${id[14]}"`);
  });

  it("generate() should have variant bits in [8,9,a,b]", () => {
    // Position 19 (0-indexed) should be one of [8,9,a,b] for RFC 4122 variant
    const id = IdGenerator.generate();
    assert.ok(/[89ab]/i.test(id[19]), `Variant nibble should be 8/9/a/b, got "${id[19]}"`);
  });

  it("generate() should return unique IDs (uniqueness guarantee)", () => {
    const ids = new Set<string>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      ids.add(IdGenerator.generate());
    }
    assert.strictEqual(ids.size, count, `All ${count} generated IDs should be unique`);
  });

  it("generate() should only contain hex characters and hyphens", () => {
    const id = IdGenerator.generate();
    assert.ok(
      /^[0-9a-f-]+$/i.test(id),
      `ID should only contain hex chars and hyphens, got: "${id}"`,
    );
  });
});
