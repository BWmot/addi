/**
 * Unit Tests for IdGenerator
 */
import * as assert from "assert";
import { IdGenerator } from "../src/common/utils/id";

describe("IdGenerator", () => {
  it("generate() should return a non-empty string", () => {
    const id = IdGenerator.generate();
    assert.ok(id, "Generated ID should not be empty");
    assert.strictEqual(typeof id, "string", "Generated ID should be a string");
  });

  it("generate() should return unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(IdGenerator.generate());
    }
    assert.strictEqual(ids.size, 100, "All generated IDs should be unique");
  });

  it("generate() should contain a hyphen separator", () => {
    const id = IdGenerator.generate();
    assert.ok(
      id.includes("-"),
      "UUID-like ID should contain hyphen separators",
    );
  });

  it("generate() should return consistent format (UUID v4 style)", () => {
    const id = IdGenerator.generate();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(
      uuidRegex.test(id),
      `Generated ID "${id}" should match UUID v4 format`,
    );
  });
});
