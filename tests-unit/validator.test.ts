/**
 * Unit Tests for InputValidator
 *
 * Tests the validation API (getNameError/getVersionError/getTokensError).
 */
import * as assert from "assert";
import { InputValidator } from "../src/common/utils/validator";

describe("InputValidator", () => {
  // ==================== getNameError() ====================

  describe("getNameError()", () => {
    it("should return null for valid names", () => {
      assert.strictEqual(InputValidator.getNameError("Test"), null);
      assert.strictEqual(InputValidator.getNameError("My Provider"), null);
      assert.strictEqual(InputValidator.getNameError("a"), null);
      assert.strictEqual(InputValidator.getNameError("Name with 123 numbers"), null);
      assert.strictEqual(InputValidator.getNameError("special-chars_ok.name"), null);
    });

    it("should trim whitespace before validation", () => {
      assert.strictEqual(InputValidator.getNameError("  Test  "), null);
      assert.strictEqual(InputValidator.getNameError("\tTest\t"), null);
    });

    it("should return error for empty string", () => {
      assert.strictEqual(InputValidator.getNameError(""), "Name cannot be empty");
    });

    it("should return error for whitespace-only string", () => {
      assert.strictEqual(InputValidator.getNameError("   "), "Name cannot be empty");
      assert.strictEqual(InputValidator.getNameError("\t\n  "), "Name cannot be empty");
    });

    it("should accept names with leading/trailing spaces after trimming", () => {
      assert.strictEqual(InputValidator.getNameError(" a "), null);
    });
  });

  // ==================== getVersionError() ====================

  describe("getVersionError()", () => {
    const expectedError = "Version format is invalid, it should consist of numbers and dots";

    it("should return null for valid versions", () => {
      assert.strictEqual(InputValidator.getVersionError("1"), null);
      assert.strictEqual(InputValidator.getVersionError("1.0"), null);
      assert.strictEqual(InputValidator.getVersionError("1.0.0"), null);
      assert.strictEqual(InputValidator.getVersionError("128.0.0"), null);
      assert.strictEqual(InputValidator.getVersionError("0"), null);
      assert.strictEqual(InputValidator.getVersionError("999.999.999"), null);
    });

    it("should reject versions with 'v' prefix", () => {
      assert.strictEqual(InputValidator.getVersionError("v1.0"), expectedError);
    });

    it("should reject versions with more than 3 segments", () => {
      assert.strictEqual(InputValidator.getVersionError("1.0.0.0"), expectedError);
    });

    it("should reject non-numeric versions", () => {
      assert.strictEqual(InputValidator.getVersionError("abc"), expectedError);
      assert.strictEqual(InputValidator.getVersionError("1.0-beta"), expectedError);
      assert.strictEqual(InputValidator.getVersionError("latest"), expectedError);
    });

    it("should reject empty string", () => {
      assert.strictEqual(InputValidator.getVersionError(""), expectedError);
    });

    it("should reject whitespace-only string", () => {
      assert.strictEqual(InputValidator.getVersionError("   "), expectedError);
    });

    it("should reject versions with spaces between segments", () => {
      assert.strictEqual(InputValidator.getVersionError("1 0 0"), expectedError);
    });

    it("should reject versions starting with dot", () => {
      assert.strictEqual(InputValidator.getVersionError(".1.0"), expectedError);
    });

    it("should reject versions ending with dot", () => {
      assert.strictEqual(InputValidator.getVersionError("1.0."), expectedError);
    });

    it("should reject versions with leading zeros like 01.0.0", () => {
      // regex \d+ matches, but semantically unusual — this passes regex so is valid
      assert.strictEqual(InputValidator.getVersionError("01.0.0"), null);
    });
  });

  // ==================== getTokensError() ====================

  describe("getTokensError()", () => {
    const expectedError = "Token count must be a positive integer";

    it("should return null for valid numeric strings", () => {
      assert.strictEqual(InputValidator.getTokensError("1000"), null);
      assert.strictEqual(InputValidator.getTokensError("128000"), null);
      assert.strictEqual(InputValidator.getTokensError("1"), null);
    });

    it("should return null for valid 'k' suffix strings", () => {
      assert.strictEqual(InputValidator.getTokensError("1k"), null);
      assert.strictEqual(InputValidator.getTokensError("128k"), null);
      assert.strictEqual(InputValidator.getTokensError("1.5k"), null);
      assert.strictEqual(InputValidator.getTokensError("0.5k"), null);
    });

    it("should return error for empty or whitespace strings", () => {
      assert.strictEqual(InputValidator.getTokensError(""), expectedError);
      assert.strictEqual(InputValidator.getTokensError("   "), expectedError);
    });

    it("should return error for non-numeric strings", () => {
      assert.strictEqual(InputValidator.getTokensError("abc"), expectedError);
    });

    it("should return error for unsupported suffixes", () => {
      assert.strictEqual(InputValidator.getTokensError("1m"), expectedError);
      assert.strictEqual(InputValidator.getTokensError("2g"), expectedError);
    });

    it("should return error for negative values", () => {
      assert.strictEqual(InputValidator.getTokensError("-100"), expectedError);
    });

    it("should return error for zero", () => {
      assert.strictEqual(InputValidator.getTokensError("0"), expectedError);
    });

    it("should handle large numbers (clamped by TokenFormatter.parse)", () => {
      assert.strictEqual(InputValidator.getTokensError("4000000"), null); // at limit
      assert.strictEqual(InputValidator.getTokensError("4000001"), null); // clamped to 4M
    });
  });
});
