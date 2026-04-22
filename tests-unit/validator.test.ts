/**
 * Unit Tests for InputValidator
 */
import * as assert from "assert";
import { InputValidator } from "../src/common/utils/validator";

describe("InputValidator", () => {
  // ==================== validateName() Tests ====================

  describe("validateName()", () => {
    it("should return null for valid names", () => {
      assert.strictEqual(InputValidator.validateName("Test"), null);
      assert.strictEqual(InputValidator.validateName("My Provider"), null);
      assert.strictEqual(InputValidator.validateName("a"), null);
    });

    it("should trim whitespace before validation", () => {
      assert.strictEqual(InputValidator.validateName("  Test  "), null);
    });

    it("should return error for empty string", () => {
      assert.strictEqual(
        InputValidator.validateName(""),
        "Name cannot be empty",
      );
    });

    it("should return error for whitespace-only string", () => {
      assert.strictEqual(
        InputValidator.validateName("   "),
        "Name cannot be empty",
      );
    });
  });

  // ==================== validateVersion() Tests ====================

  describe("validateVersion()", () => {
    it("should return null for valid versions", () => {
      assert.strictEqual(InputValidator.validateVersion("1"), null);
      assert.strictEqual(InputValidator.validateVersion("1.0"), null);
      assert.strictEqual(InputValidator.validateVersion("1.0.0"), null);
      assert.strictEqual(InputValidator.validateVersion("128.0.0"), null);
    });

    it("should return error for invalid versions", () => {
      assert.strictEqual(
        InputValidator.validateVersion("v1.0"),
        "Version format is invalid, it should consist of numbers and dots",
      );
      assert.strictEqual(
        InputValidator.validateVersion("1.0.0.0"),
        "Version format is invalid, it should consist of numbers and dots",
      );
      assert.strictEqual(
        InputValidator.validateVersion("abc"),
        "Version format is invalid, it should consist of numbers and dots",
      );
      assert.strictEqual(
        InputValidator.validateVersion(""),
        "Version format is invalid, it should consist of numbers and dots",
      );
    });
  });

  // ==================== validateTokens() Tests ====================

  describe("validateTokens()", () => {
    it("should return null for valid token values", () => {
      assert.strictEqual(InputValidator.validateTokens("1000"), null);
      assert.strictEqual(InputValidator.validateTokens("128000"), null);
      assert.strictEqual(InputValidator.validateTokens("1k"), null);
    });

    it("should return error for invalid token values", () => {
      assert.strictEqual(
        InputValidator.validateTokens("abc"),
        "Token count must be a positive integer",
      );
      assert.strictEqual(
        InputValidator.validateTokens(""),
        "Token count must be a positive integer",
      );
    });
  });
});
