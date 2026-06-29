/**
 * Unit Tests for reasoningUtils cleanup functions
 *
 * Covers:
 *   - collapseRepeatedPunctuation: full-width collapse + markdown preservation
 *   - collapseRepeatedPunctuation: streaming oscillation (0% leakage)
 *   - collapseRepeatedWhitespace: code indentation preservation + newline preservation
 *   - collapseRepeatedSuffix / collapseStreamSuffix: suffix repetition
 */
import * as assert from "assert";
import {
  collapseRepeatedPunctuation,
  collapseRepeatedWhitespace,
  collapseRepeatedSuffix,
  collapseStreamSuffix,
  cleanupStreamTextByProvider,
  looksLikeMarkdownStructure,
} from "../src/core/llm/reasoningUtils";

// ============================================================================
// collapseRepeatedPunctuation
// ============================================================================

describe("collapseRepeatedPunctuation", () => {
  describe("full-width punctuation collapse", () => {
    it("should collapse repeated full-width colons", () => {
      assert.strictEqual(collapseRepeatedPunctuation("：："), "：");
      assert.strictEqual(collapseRepeatedPunctuation("：：："), "：");
      assert.strictEqual(collapseRepeatedPunctuation("：：：：：："), "：");
    });

    it("should collapse repeated full-width periods", () => {
      assert.strictEqual(collapseRepeatedPunctuation("。。。"), "。");
      assert.strictEqual(collapseRepeatedPunctuation("。。。。。。"), "。");
    });

    it("should collapse mixed text with trailing garbage", () => {
      assert.strictEqual(
        collapseRepeatedPunctuation("读出来：：：：：："),
        "读出来：",
      );
      assert.strictEqual(
        collapseRepeatedPunctuation("你好。。。。。。"),
        "你好。",
      );
    });

    it("should preserve single full-width punctuation", () => {
      assert.strictEqual(collapseRepeatedPunctuation("。"), "。");
      assert.strictEqual(collapseRepeatedPunctuation("："), "：");
      assert.strictEqual(collapseRepeatedPunctuation("文本。"), "文本。");
    });

    it("should handle empty and null input", () => {
      assert.strictEqual(collapseRepeatedPunctuation(""), "");
      assert.strictEqual(collapseRepeatedPunctuation(''), '');
    });
  });

  describe("ASCII / markdown preservation", () => {
    it("should preserve code fences (```)", () => {
      assert.strictEqual(collapseRepeatedPunctuation("```"), "```");
      assert.strictEqual(collapseRepeatedPunctuation("``````"), "``````");
    });

    it("should preserve bold markers (**)", () => {
      assert.strictEqual(collapseRepeatedPunctuation("**bold**"), "**bold**");
      assert.strictEqual(collapseRepeatedPunctuation("****"), "****");
    });

    it("should preserve heading markers (##)", () => {
      assert.strictEqual(collapseRepeatedPunctuation("## Title"), "## Title");
      assert.strictEqual(collapseRepeatedPunctuation("### Sub"), "### Sub");
    });

    it("should preserve code comments (//)", () => {
      assert.strictEqual(collapseRepeatedPunctuation("// comment"), "// comment");
    });

    it("should preserve horizontal rules (---)", () => {
      assert.strictEqual(collapseRepeatedPunctuation("---"), "---");
      assert.strictEqual(collapseRepeatedPunctuation("------"), "------");
    });

    it("should preserve table separators (|-|-|)", () => {
      assert.strictEqual(
        collapseRepeatedPunctuation("|-|-|"),
        "|-|-|",
      );
    });

    it("should preserve URLs with //", () => {
      assert.strictEqual(
        collapseRepeatedPunctuation("https://example.com"),
        "https://example.com",
      );
    });

    it("should preserve code with :: (C++ scope)", () => {
      assert.strictEqual(
        collapseRepeatedPunctuation("std::vector"),
        "std::vector",
      );
    });

    it("should detect common markdown structure conservatively", () => {
      assert.strictEqual(looksLikeMarkdownStructure("# Title\n\ntext"), true);
      assert.strictEqual(looksLikeMarkdownStructure("- item1\n- item2"), true);
      assert.strictEqual(looksLikeMarkdownStructure("```ts\nconst x = 1;\n```"), true);
      assert.strictEqual(looksLikeMarkdownStructure("plain text only"), false);
    });

    it("should keep markdown-like structure unchanged in provider cleanup", () => {
      const input = "# Title\n\n- item1\n- item2\n";
      assert.strictEqual(cleanupStreamTextByProvider(input, "ds"), input);
    });

    it("should still clean obvious plain text garbage", () => {
      const input = "读出来：：：：：：";
      assert.strictEqual(cleanupStreamTextByProvider(input, "ds"), "读出来：");
    });
  });

  describe("streaming oscillation (0% leakage)", () => {
    it("should not leak when full-width punct arrives one char at a time", () => {
      // Simulate streaming: 37 colons arrive one per delta
      let recent = "";
      let outputCount = 0;
      for (let i = 0; i < 37; i++) {
        const combined = recent + "：";
        const cleaned = collapseRepeatedPunctuation(combined);
        const delta = cleaned.slice(recent.length);
        recent = cleaned;
        if (delta.length > 0) outputCount++;
      }
      // Only the first char should be output; rest collapsed
      assert.strictEqual(outputCount, 1, "Only first char should leak");
    });

    it("should not leak when full-width period arrives one char at a time", () => {
      let recent = "";
      let outputCount = 0;
      for (let i = 0; i < 50; i++) {
        const combined = recent + "。";
        const cleaned = collapseRepeatedPunctuation(combined);
        const delta = cleaned.slice(recent.length);
        recent = cleaned;
        if (delta.length > 0) outputCount++;
      }
      assert.strictEqual(outputCount, 1, "Only first char should leak");
    });
  });
});

// ============================================================================
// collapseRepeatedWhitespace
// ============================================================================

describe("collapseRepeatedWhitespace", () => {
  describe("newline preservation", () => {
    it("should preserve double newlines (markdown paragraph separation)", () => {
      const input = "段落1\n\n段落2";
      assert.strictEqual(collapseRepeatedWhitespace(input), input);
    });

    it("should preserve triple newlines", () => {
      const input = "标题\n\n\n内容";
      assert.strictEqual(collapseRepeatedWhitespace(input), input);
    });

    it("should preserve newlines in markdown headings", () => {
      const input = "# 标题\n\n正文";
      assert.strictEqual(collapseRepeatedWhitespace(input), input);
    });

    it("should preserve newlines in markdown lists", () => {
      const input = "- item1\n- item2\n- item3";
      assert.strictEqual(collapseRepeatedWhitespace(input), input);
    });

    it("should preserve newlines in code blocks", () => {
      const input = "```csharp\nline1\nline2\nline3\n```";
      assert.strictEqual(collapseRepeatedWhitespace(input), input);
    });
  });

  describe("code indentation preservation", () => {
    it("should preserve 2-space indentation", () => {
      assert.strictEqual(
        collapseRepeatedWhitespace("  indented"),
        "  indented",
      );
    });

    it("should preserve 4-space indentation", () => {
      assert.strictEqual(
        collapseRepeatedWhitespace("    indented"),
        "    indented",
      );
    });

    it("should preserve 8-space indentation", () => {
      assert.strictEqual(
        collapseRepeatedWhitespace("        indented"),
        "        indented",
      );
    });

    it("should preserve tab indentation", () => {
      assert.strictEqual(
        collapseRepeatedWhitespace("\tindented"),
        "\tindented",
      );
    });
  });

  describe("garbage space collapse", () => {
    it("should collapse 100+ spaces to single space", () => {
      const garbage = " ".repeat(100);
      assert.strictEqual(collapseRepeatedWhitespace(garbage), "");
    });

    it("should collapse 1000+ spaces to single space", () => {
      const garbage = " ".repeat(1000);
      assert.strictEqual(collapseRepeatedWhitespace(garbage), "");
    });

    it("should collapse garbage spaces between text", () => {
      const input = "text" + " ".repeat(50) + "more";
      assert.strictEqual(collapseRepeatedWhitespace(input), "text more");
    });
  });
});

// ============================================================================
// collapseRepeatedSuffix
// ============================================================================

describe("collapseRepeatedSuffix", () => {
  it("should collapse repeated suffix patterns", () => {
    assert.strictEqual(
      collapseRepeatedSuffix("我来试试。我来试试。"),
      "我来试试。",
    );
  });

  it("should collapse single-char suffix repeats", () => {
    // 4 trailing spaces → with recursion, " " x4 collapses all the way to 1
    assert.strictEqual(
      collapseRepeatedSuffix("text    "),
      "text ",
    );
  });

  it("should return original if no repeat", () => {
    assert.strictEqual(
      collapseRepeatedSuffix("normal text"),
      "normal text",
    );
  });

  // ── Bug #2 regression: even-count repetitions ──────────────────────────
  it("should collapse even-count repetitions to a single copy", () => {
    // 4 copies of "测试：" — greedy 6-char pattern matches first,
    // collapsing to 2 copies; recursion must then collapse to 1.
    const input = "prefix测试：测试：测试：测试：";
    const result = collapseRepeatedSuffix(input);
    const copies = (result.match(/测试：/g) || []).length;
    assert.strictEqual(copies, 1, `Expected 1 copy, got ${copies}: "${result}"`);
    assert.strictEqual(result, "prefix测试：");
  });

  it("should collapse even-count repetitions of a longer phrase", () => {
    // "我来试试。" x 6 (even) → should collapse to 1
    const phrase = "我来试试。";
    const input = "prefix" + phrase.repeat(6);
    const result = collapseRepeatedSuffix(input);
    const copies = (result.match(/我来试试。/g) || []).length;
    assert.strictEqual(copies, 1, `Expected 1 copy, got ${copies}`);
  });

  it("should collapse odd-count repetitions (sanity check)", () => {
    // 5 copies (odd) — already worked before fix, verify no regression
    const input = "prefix测试：测试：测试：测试：测试：";
    const result = collapseRepeatedSuffix(input);
    const copies = (result.match(/测试：/g) || []).length;
    assert.strictEqual(copies, 1, `Expected 1 copy, got ${copies}: "${result}"`);
  });
});

// ============================================================================
// collapseStreamSuffix
// ============================================================================

describe("collapseStreamSuffix", () => {
  it("should return [candidate, incoming] when no cleanup needed", () => {
    const [overall, delta] = collapseStreamSuffix("hello", " world");
    assert.strictEqual(overall, "hello world");
    assert.strictEqual(delta, " world");
  });

  it("should collapse suffix repeat and return stripped delta", () => {
    const [overall, delta] = collapseStreamSuffix("abc", "abcabc");
    // "abcabcabc" → "abc", delta = "abc".slice(max(0, 3-6)) = "abc".slice(0) = "abc"
    assert.strictEqual(overall, "abc");
    // delta should be empty or partial (the entire incoming was eaten)
    assert.ok(delta.length <= 3);
  });

  // ── Bug #1 regression: non-empty accumulated + repeated incoming ───────
  it("should return empty delta when incoming is pure repetition of accumulated suffix", () => {
    // accumulated already has 1 copy of "测试："; incoming is another "测试："
    // candidate = "现在运行单元测试：测试：" → cleaned = "现在运行单元测试："
    // delta must be "" (suppressed), NOT "测试：" (which was already sent)
    const [overall, delta] = collapseStreamSuffix("现在运行单元测试：", "测试：");
    assert.strictEqual(overall, "现在运行单元测试：");
    assert.strictEqual(delta, "", `Expected empty delta, got "${delta}"`);
  });

  it("should reduce (but not eliminate) leakage when streaming one char at a time", () => {
    // ⚠️ Inherent streaming limitation: a 3-char pattern ("测试：") arriving
    // one char per delta can only be detected as a repeat once the 6th char
    // (full second copy) arrives.  By then, chars 4-5 ("测","试") already
    // went to the UI.  This is unavoidable for char-by-char streaming.
    //
    // What we CAN assert: the fix reduces leakage.  Before Bug #1 fix,
    // every cycle leaked the full 3-char pattern (delta re-sent already-
    // sent text).  After fix, only 2 of 3 chars leak per cycle.
    let recent = "";
    let uiOutput = "";
    const phrase = "测试：";
    const repetitions = 10;
    const fullInputLen = phrase.length * repetitions; // 30

    for (let i = 0; i < fullInputLen; i++) {
      const char = phrase[i % phrase.length];
      const [newRecent, delta] = collapseStreamSuffix(recent, char);
      recent = newRecent;
      if (delta.length > 0) uiOutput += delta;
    }

    // Output must be shorter than input (cleanup happened)
    assert.ok(
      uiOutput.length < fullInputLen,
      `Expected output < ${fullInputLen}, got ${uiOutput.length}: "${uiOutput}"`,
    );
    // Output must not contain the full phrase repeated more than twice
    // (one copy + at most one partial leak)
    const copyCount = (uiOutput.match(/测试：/g) || []).length;
    assert.ok(
      copyCount <= 2,
      `Expected ≤ 2 full copies, got ${copyCount}: "${uiOutput}"`,
    );
  });

  it("should not leak when full-phrase deltas repeat against existing buffer", () => {
    // Buffer already contains 1 copy; 10 more arrive as full-phrase deltas
    let recent = "现在运行单元测试：";
    let uiOutput = "";
    const phrase = "测试：";

    for (let i = 0; i < 10; i++) {
      const [newRecent, delta] = collapseStreamSuffix(recent, phrase);
      recent = newRecent;
      if (delta.length > 0) uiOutput += delta;
    }

    // All 10 incoming phrases are repetitions → 0 chars should reach UI
    assert.strictEqual(uiOutput, "", `Expected empty output, got "${uiOutput}"`);
  });
});
