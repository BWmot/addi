/**
 * Unit Tests for TokenFormatter
 */
import * as assert from "assert";
import { TokenFormatter } from "../src/common/utils/token";

describe("TokenFormatter", () => {
  // ==================== parse() Tests ====================

  describe("parse()", () => {
    it("should parse valid number", () => {
      assert.strictEqual(TokenFormatter.parse(1000), 1000);
      assert.strictEqual(TokenFormatter.parse(0), undefined);
      assert.strictEqual(TokenFormatter.parse(-1), undefined);
    });

    it("should parse valid string integers", () => {
      assert.strictEqual(TokenFormatter.parse("1000"), 1000);
      assert.strictEqual(TokenFormatter.parse(" 1000 "), 1000);
      assert.strictEqual(TokenFormatter.parse("128000"), 128000);
    });

    it("should parse string with k suffix", () => {
      assert.strictEqual(TokenFormatter.parse("1k"), 1000);
      assert.strictEqual(TokenFormatter.parse("128k"), 128000);
      assert.strictEqual(TokenFormatter.parse("1.5k"), 1500);
    });

    it("should handle whitespace and underscores", () => {
      assert.strictEqual(TokenFormatter.parse("1_000"), 1000);
      assert.strictEqual(TokenFormatter.parse("1 000"), 1000);
      assert.strictEqual(TokenFormatter.parse("  1k  "), 1000);
    });

    it("should return undefined for invalid input", () => {
      assert.strictEqual(TokenFormatter.parse(undefined), undefined);
      assert.strictEqual(TokenFormatter.parse(null), undefined);
      assert.strictEqual(TokenFormatter.parse(""), undefined);
      assert.strictEqual(TokenFormatter.parse("abc"), undefined);
      assert.strictEqual(TokenFormatter.parse("1m"), undefined); // m not supported
    });

    it("should enforce upper limit (4M)", () => {
      assert.strictEqual(TokenFormatter.parse(4000000), 4000000); // At limit
      assert.strictEqual(TokenFormatter.parse(5000000), 4000000); // Over limit, clamped
      assert.strictEqual(TokenFormatter.parse(4000001), 4000000); // Over limit, clamped
      assert.strictEqual(TokenFormatter.parse(9999000), 4000000); // Way over, clamped
    });
  });

  // ==================== format() Tests ====================

  describe("format()", () => {
    it("should format numbers under 1000 as-is", () => {
      assert.strictEqual(TokenFormatter.format(100), "100");
      assert.strictEqual(TokenFormatter.format(999), "999");
    });

    it("should format thousands with k suffix", () => {
      assert.strictEqual(TokenFormatter.format(1000), "1k");
      assert.strictEqual(TokenFormatter.format(1500), "1.5k");
      assert.strictEqual(TokenFormatter.format(100000), "100k");
    });

    it("should handle edge cases", () => {
      assert.strictEqual(TokenFormatter.format(0), "");
      assert.strictEqual(TokenFormatter.format(-1), "");
      assert.strictEqual(TokenFormatter.format(undefined), "");
    });

    it("should format decimals correctly", () => {
      assert.strictEqual(TokenFormatter.format(2500), "2.5k");
      assert.strictEqual(TokenFormatter.format(3333), "3.33k"); // 2 decimal places
      assert.strictEqual(TokenFormatter.format(10500), "10.5k");
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
    });
  });
});
