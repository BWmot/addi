/**
 * Unit Tests for TokenFormatter
 *
 * Tests parse(), format(), and formatDetailed() with comprehensive edge cases.
 * Covers: valid inputs, suffix parsing, upper limit clamping, invalid inputs,
 * and boundary conditions.
 */
import * as assert from "assert";
import { TokenFormatter } from "../src/common/utils/token";

describe("TokenFormatter", () => {
  // ==================== parse() Tests ====================

  describe("parse()", () => {
    it("should parse valid numbers", () => {
      assert.strictEqual(TokenFormatter.parse(1000), 1000);
      assert.strictEqual(TokenFormatter.parse(1), 1);
      assert.strictEqual(TokenFormatter.parse(128000), 128000);
    });

    it("should return undefined for zero and negative numbers", () => {
      assert.strictEqual(TokenFormatter.parse(0), undefined);
      assert.strictEqual(TokenFormatter.parse(-1), undefined);
      assert.strictEqual(TokenFormatter.parse(-1000), undefined);
    });

    it("should return undefined for non-finite numbers", () => {
      assert.strictEqual(TokenFormatter.parse(Infinity), undefined);
      assert.strictEqual(TokenFormatter.parse(-Infinity), undefined);
      assert.strictEqual(TokenFormatter.parse(NaN), undefined);
    });

    it("should floor decimal numbers", () => {
      assert.strictEqual(TokenFormatter.parse(1000.9), 1000);
      assert.strictEqual(TokenFormatter.parse(999.1), 999);
    });

    it("should parse valid string integers", () => {
      assert.strictEqual(TokenFormatter.parse("1000"), 1000);
      assert.strictEqual(TokenFormatter.parse(" 1000 "), 1000);
      assert.strictEqual(TokenFormatter.parse("128000"), 128000);
      assert.strictEqual(TokenFormatter.parse("1"), 1);
    });

    it("should parse string with k suffix", () => {
      assert.strictEqual(TokenFormatter.parse("1k"), 1000);
      assert.strictEqual(TokenFormatter.parse("128k"), 128000);
      assert.strictEqual(TokenFormatter.parse("1.5k"), 1500);
      assert.strictEqual(TokenFormatter.parse("0.5k"), 500);
    });

    it("should handle whitespace and underscores", () => {
      assert.strictEqual(TokenFormatter.parse("1_000"), 1000);
      assert.strictEqual(TokenFormatter.parse("1 000"), 1000);
      assert.strictEqual(TokenFormatter.parse("  1k  "), 1000);
      assert.strictEqual(TokenFormatter.parse("1_000_000"), 1000000);
    });

    it("should be case insensitive for k suffix", () => {
      assert.strictEqual(TokenFormatter.parse("1K"), 1000);
      assert.strictEqual(TokenFormatter.parse("128K"), 128000);
    });

    it("should return undefined for invalid input", () => {
      assert.strictEqual(TokenFormatter.parse(undefined), undefined);
      assert.strictEqual(TokenFormatter.parse(null), undefined);
      assert.strictEqual(TokenFormatter.parse(""), undefined);
      assert.strictEqual(TokenFormatter.parse("   "), undefined);
      assert.strictEqual(TokenFormatter.parse("abc"), undefined);
      assert.strictEqual(TokenFormatter.parse("1m"), undefined); // m not supported
      assert.strictEqual(TokenFormatter.parse("1g"), undefined);
      assert.strictEqual(TokenFormatter.parse("-100"), undefined);
      assert.strictEqual(TokenFormatter.parse("0"), undefined);
      assert.strictEqual(TokenFormatter.parse("1.2.3k"), undefined);
    });

    it("should enforce upper limit (4M)", () => {
      assert.strictEqual(TokenFormatter.parse(4000000), 4000000); // At limit
      assert.strictEqual(TokenFormatter.parse(5000000), 4000000); // Over limit, clamped
      assert.strictEqual(TokenFormatter.parse(4000001), 4000000); // Over limit, clamped
      assert.strictEqual(TokenFormatter.parse(9999000), 4000000); // Way over, clamped
    });

    it("should enforce upper limit for string input", () => {
      assert.strictEqual(TokenFormatter.parse("5000k"), 4000000); // 5M → clamped to 4M
      assert.strictEqual(TokenFormatter.parse("4000001"), 4000000);
    });

    it("should handle large k values", () => {
      assert.strictEqual(TokenFormatter.parse("100k"), 100000);
      assert.strictEqual(TokenFormatter.parse("1000k"), 1000000);
    });
  });

  // ==================== format() Tests ====================

  describe("format()", () => {
    it("should format numbers under 1000 as-is", () => {
      assert.strictEqual(TokenFormatter.format(100), "100");
      assert.strictEqual(TokenFormatter.format(999), "999");
      assert.strictEqual(TokenFormatter.format(1), "1");
    });

    it("should format thousands with k suffix", () => {
      assert.strictEqual(TokenFormatter.format(1000), "1k");
      assert.strictEqual(TokenFormatter.format(1500), "1.5k");
      assert.strictEqual(TokenFormatter.format(100000), "100k");
    });

    it("should format millions correctly", () => {
      assert.strictEqual(TokenFormatter.format(1000000), "1000k");
      assert.strictEqual(TokenFormatter.format(2500000), "2500k");
    });

    it("should handle edge cases", () => {
      assert.strictEqual(TokenFormatter.format(0), "");
      assert.strictEqual(TokenFormatter.format(-1), "");
      assert.strictEqual(TokenFormatter.format(undefined), "");
      assert.strictEqual(TokenFormatter.format(NaN), "");
      assert.strictEqual(TokenFormatter.format(Infinity), "");
    });

    it("should format decimals correctly", () => {
      assert.strictEqual(TokenFormatter.format(2500), "2.5k");
      assert.strictEqual(TokenFormatter.format(3333), "3.33k"); // 2 decimal places
      assert.strictEqual(TokenFormatter.format(10500), "10.5k");
    });

    it("should floor small numbers", () => {
      assert.strictEqual(TokenFormatter.format(100.9), "100");
      assert.strictEqual(TokenFormatter.format(999.9), "999");
    });
  });

  // ==================== formatDetailed() Tests ====================

  describe("formatDetailed()", () => {
    it("should show both raw and formatted for thousands", () => {
      assert.strictEqual(TokenFormatter.formatDetailed(1000), "1000 (1k)");
      assert.strictEqual(TokenFormatter.formatDetailed(1500), "1500 (1.5k)");
    });

    it("should show only raw for small numbers", () => {
      assert.strictEqual(TokenFormatter.formatDetailed(100), "100");
      assert.strictEqual(TokenFormatter.formatDetailed(999), "999");
    });

    it("should handle edge cases", () => {
      assert.strictEqual(TokenFormatter.formatDetailed(0), "");
      assert.strictEqual(TokenFormatter.formatDetailed(-1), "");
      assert.strictEqual(TokenFormatter.formatDetailed(undefined), "");
      assert.strictEqual(TokenFormatter.formatDetailed(NaN), "");
      assert.strictEqual(TokenFormatter.formatDetailed(Infinity), "");
    });

    it("should floor decimal raw values", () => {
      assert.strictEqual(TokenFormatter.formatDetailed(1000.5), "1000 (1k)");
      assert.strictEqual(TokenFormatter.formatDetailed(999.9), "999");
    });
  });
});
