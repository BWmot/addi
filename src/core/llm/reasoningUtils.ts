export function hasStreamPartVisibleContent(part: unknown): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }

  const candidate = part as Record<string, unknown>;

  switch (candidate["type"]) {
    case "text-delta":
      return typeof candidate["text"] === "string" && candidate["text"].length > 0;
    case "reasoning-delta":
      // fullStream emits 'reasoning-delta' with 'text' property (streamText pipeline
      // transforms delta→text), but some provider paths may emit raw 'delta'. Check both.
      return (typeof candidate["text"] === "string" && candidate["text"].length > 0)
        || (typeof candidate["delta"] === "string" && candidate["delta"].length > 0);
    case "reasoning":
      return (typeof candidate["text"] === "string" && candidate["text"].length > 0)
        || (typeof candidate["delta"] === "string" && candidate["delta"].length > 0);
    case "tool-call":
    case "tool-result":
      return true;
    default:
      return false;
  }
}

export function extractReasoningContentFromStep(step: unknown): string {
  if (!step || typeof step !== "object") {
    return "";
  }

  const candidate = step as Record<string, unknown>;

  if (typeof candidate["reasoningText"] === "string" && candidate["reasoningText"].length > 0) {
    return candidate["reasoningText"];
  }

  const reasoning = candidate["reasoning"];

  if (typeof reasoning === "string") {
    return reasoning;
  }

  if (!Array.isArray(reasoning)) {
    return "";
  }

  return reasoning
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (!item || typeof item !== "object") {
        return String(item ?? "");
      }

      const reasoningPart = item as Record<string, unknown>;
      if (typeof reasoningPart["text"] === "string") {
        return reasoningPart["text"];
      }
      if (typeof reasoningPart["content"] === "string") {
        return reasoningPart["content"];
      }

      return "";
    })
    .filter((item) => item.length > 0)
    .join("\n");
}

// ============================================================================
// Punctuation Cleanup
// ============================================================================

/**
 * Collapse runs of 2+ identical **full-width** punctuation characters into
 * a single character.  For example:
 *   "你好。。。。。。" → "你好。"
 *   "读出来：：：：：：" → "读出来："
 *
 * ⚠️ Only full-width CJK punctuation is processed — ASCII punctuation
 *    (`!#$%&*+,-./:;<=>?@[\]^_`{|}~`) is **never** touched.
 *    This protects markdown / code syntax that legitimately uses repeated
 *    ASCII punctuation: `` ``` `` (code fence), `**` (bold), `//` (comment),
 *    `##` (heading), `---` (horizontal rule), etc.
 *
 * ⚠️ No `length < N` guard — the guard caused streaming oscillation:
 *    when combined text was only 2 chars, the guard skipped cleanup →
 *    delta was output; next delta made it 3 chars → cleanup triggered →
 *    delta eaten; recent shrank back to 1 → next delta 2 chars → skipped…
 *    This 50% leakage pattern was the root cause of `：：：` residue.
 *    Without the guard, the regex `\1+` naturally won't match a single
 *    character (needs 1 capture + 1+ backreference = 2+ total), so the
 *    first occurrence is always preserved and subsequent ones collapsed.
 *
 * Verified: 37 streaming deltas of `：` → only 1 leaked (the first char).
 *
 * @param text - The raw text to clean.
 * @returns The cleaned text with spurious repeated full-width punctuation collapsed.
 */
export function collapseRepeatedPunctuation(text: string): string {
  if (!text) {
    return text;
  }
  // Only full-width CJK punctuation. ASCII punctuation is excluded to
  // protect markdown/code syntax.  \1+ matches 1+ repetitions (2+ total).
  return text.replace(
    /([。，、；：？！…—·])\1+/g,
    (match) => match.charAt(0),
  );
}

const MD_SAFE_CLEANUP_PROVIDER_TYPES = new Set(["openai-completions"]);

export function shouldUseMarkdownSafeCleanup(providerType?: string): boolean {
  return !!providerType && MD_SAFE_CLEANUP_PROVIDER_TYPES.has(providerType);
}

/**
 * Heuristic markdown detection for stream cleanup guards.
 *
 * The stream cleanup pipeline should avoid touching text when it looks like
 * markdown structure, because collapsing repeated punctuation / whitespace can
 * break fenced code blocks, tables and indentation-sensitive content.
 */
export function looksLikeMarkdownStructure(text: string): boolean {
  if (!text) {
    return false;
  }

  const hasFence = /```/.test(text);
  const hasInlineCode = /`[^`\n]+`/.test(text);
  const hasTable = /(^|\n)\s*\|.*\|\s*(\n|$)/.test(text) && /(^|\n)\s*\|(?:\s*:?-+:?\s*\|)+\s*(\n|$)/.test(text);
  const hasList = /(^|\n)\s{0,3}[-*+]\s+\S/.test(text) || /(^|\n)\s{0,3}\d+\.\s+\S/.test(text);
  const hasQuote = /(^|\n)\s{0,3}>\s?\S/.test(text);
  const hasIndentedCode = /(^|\n)(?: {4}|\t)\S/.test(text);
  const hasHeading = /(^|\n)\s{0,3}#{1,6}\s+\S/.test(text);
  const hasHorizontalRule = /(^|\n)\s{0,3}(?:[-*_]\s?){3,}\s*(\n|$)/.test(text);
  const hasLinkOrImage = /!?\[[^\]]+\]\([^\)\n]+\)/.test(text);

  return hasFence || hasInlineCode || hasTable || hasList || hasQuote || hasIndentedCode || hasHeading || hasHorizontalRule || hasLinkOrImage;
}

/**
 * Apply stream cleanup only when the text does not look like markdown.
 * This keeps markdown syntax intact while still removing model garbage from
 * plain prose.
 */
export function cleanupPlainStreamText(text: string): string {
  if (!text) {
    return text;
  }

  // 只在“明显是纯文本”的情况下清洗。任何 Markdown 结构信号都直接跳过，
  // 避免把列表、引用、表格、代码块、链接等内容误改坏。
  if (looksLikeMarkdownStructure(text)) {
    return text;
  }

  const cleaned = collapseRepeatedWhitespace(
    collapseRepeatedSuffix(
      collapseRepeatedPunctuation(text),
    ),
  );

  // 纯文本清洗也尽量保守：如果清洗后只减少了很少内容，说明原文可能
  // 是正常表达（例如少量重复标点或空格），保留原文更安全。
  return cleaned.length + 2 < text.length ? cleaned : text;
}

export function cleanupStreamTextByProvider(text: string, providerType?: string): string {
  if (shouldUseMarkdownSafeCleanup(providerType)) {
    return cleanupPlainStreamText(text);
  }

  // 默认路径也收紧：先判定是否具有 Markdown/结构特征；有结构时完全不清洗。
  if (looksLikeMarkdownStructure(text)) {
    return text;
  }

  const cleaned = collapseRepeatedWhitespace(collapseRepeatedSuffix(collapseRepeatedPunctuation(text)));
  return cleaned.length + 2 < text.length ? cleaned : text;
}

// ============================================================================
// Repeated Text Suffix Cleanup (e.g. Ali DS looping)
// ============================================================================

/**
 * Detect and collapse a suffix pattern that repeats at least `minRepeat` times.
 *
 * For example (minRepeat=2):
 *   "我来试试。我来试试。" → "我来试试。"
 *   "check check check"  → "check "
 *   "Let me see...Let me see..." → "Let me see..." (2 reps, min=2 → collapse)
 *
 * Threshold is ≥ 2 — this is critical in streaming where single-delta
 * oscillation causes ~33% of repeated text to leak through when minRepeat=3
 * (same root cause as the punctuation oscillation fix).
 *
 * The algorithm tries pattern lengths from longest to shortest (greedy) so
 * that multi-character patterns like "我来试试。" are preferred over single-char
 * matches like "。" at the tail.
 *
 * @param text  - The full text to inspect.
 * @param minRepeat - Minimum number of consecutive identical suffix occurrences
 *                    required to trigger collapse (default 2).
 * @returns The text with the repeating suffix collapsed to a single occurrence.
 */
export function collapseRepeatedSuffix(
  text: string,
  minRepeat: number = 2,
): string {
  if (!text || text.length < minRepeat * 2) {
    return text;
  }

  // Max possible pattern length = text.length / minRepeat (need at least
  // minRepeat copies of the pattern to form a suffix).
  const maxPat = Math.floor(text.length / minRepeat);

  // Greedy: try longest patterns first so we collapse "我来试试。" rather
  // than matching "。" alone.  Allow patLen=1 so single-char repeats
  // (spaces, letters from model garbage) are also detected.
  for (let patLen = maxPat; patLen >= 1; patLen--) {
    const pattern = text.slice(-patLen);
    let count = 1;
    let pos = text.length - patLen;

    while (pos >= patLen && text.slice(pos - patLen, pos) === pattern) {
      count++;
      pos -= patLen;
    }

    if (count >= minRepeat) {
      const collapsed = text.slice(0, pos + patLen);
      // ⚠️ Recurse to handle even-count repetitions: when a pattern of
      // length 2L matches (e.g. "测试：测试："), it collapses N copies to
      // 2 — but the shorter L-length pattern ("测试：") would have
      // collapsed to 1.  Without recursion, even-count repeats leak a
      // residual duplicate to the UI.  Each recursion strictly shortens
      // the text (count≥2 → at least one copy removed), so it always
      // terminates at the base-case length guard above.
      return collapseRepeatedSuffix(collapsed, minRepeat);
    }
  }

  return text;
}

/**
 * Stream-safe wrapper: maintains a rolling suffix buffer and applies
 * `collapseRepeatedSuffix` only to the tail so that the per-delta cost
 * stays bounded.
 *
 * Enhanced to track detected patterns for hard-stop circuit breaker:
 * Returns third element [pattern] which is the repeating suffix that was
 * collapsed (empty string if no repetition detected).
 *
 * @param accumulated - Previously accumulated clean text (may be "").
 * @param incoming    - The new raw text delta just received from the stream.
 * @returns A tuple [cleanedOverallText, cleanedDeltaForReporting, detectedPattern]
 *   where `cleanedDeltaForReporting` is what should be sent to the UI,
 *   and `detectedPattern` is the repeating suffix that was removed (for tracking).
 */
export function collapseStreamSuffix(
  accumulated: string,
  incoming: string,
  minRepeat: number = 2,
): [/* overall */ string, /* delta to report */ string, /* detected pattern */ string] {
  const candidate = accumulated + incoming;
  const cleaned = collapseRepeatedSuffix(candidate, minRepeat);
  
  // Track which pattern was detected and removed for hard-stop mechanism
  let detectedPattern = "";
  if (cleaned.length < candidate.length) {
    // Extract the removed portion
    const removedLength = candidate.length - cleaned.length;
    const removed = candidate.slice(cleaned.length);
    
    // Heuristic: find the repeating unit in removed text
    // For "调用。调用。调用。" → pattern is "调用。"
    for (let len = 1; len <= Math.floor(removedLength / 2); len++) {
      const pattern = removed.slice(0, len);
      const repetitions = Math.floor(removedLength / len);
      if (removed.slice(0, repetitions * len) === pattern.repeat(repetitions)) {
        detectedPattern = pattern;
        break;
      }
    }
  }
  
  // If cleaning shortened the text, the delta for reporting is the
  // portion of `cleaned` that extends *beyond* `accumulated` — i.e. text
  // not already sent to the UI in previous deltas.
  //
  // ⚠️ BUG FIX (was: `cleaned.slice(max(0, cleaned.length - incoming.length))`):
  // When the incoming chunk is entirely a repetition, `cleaned` collapses
  // back to `accumulated` (same length).  The old formula then took the last
  // `incoming.length` chars of `accumulated` — already-sent text — and
  // re-sent it to the UI, causing the exact repetition we were trying to
  // suppress.  Example: accumulated="现在运行单元测试："(9), incoming="测试："(3)
  //   candidate="现在运行单元测试：测试："(12) → cleaned="现在运行单元测试："(9)
  //   OLD delta = cleaned.slice(6) = "测试："  ← LEAKS (already sent)
  //   NEW delta = cleaned.slice(9) = ""        ← correctly suppressed
  if (cleaned.length < candidate.length) {
    const strippedDelta = cleaned.length > accumulated.length
      ? cleaned.slice(accumulated.length)
      : "";
    return [cleaned, strippedDelta, detectedPattern];
  }
  return [candidate, incoming, ""];
}

// ============================================================================
// Whitespace Cleanup (DeepSeek model garbage)
// ============================================================================

/**
 * Collapse excessive horizontal whitespace runs (spaces, tabs) into a single space.
 * Also trims trailing horizontal whitespace.
 *
 * Some DeepSeek-family models occasionally emit streams consisting entirely
 * of space characters (thousands of them).  This function prevents those
 * garbage runs from being passed to the UI.
 *
 * Strategy:
 *   1. Collapse runs of 10+ consecutive spaces/tabs → single space
 *   2. Trim trailing spaces/tabs
 *
 * ⚠️ Threshold of 10 is intentional:
 *   - Code indentation (2-8 spaces) is preserved unchanged.
 *   - DeepSeek garbage (100s–1000s of spaces) is collapsed.
 *   - Newlines are preserved for markdown structure.
 *
 * @param text - The text to clean.
 * @returns The cleaned text with excessive horizontal whitespace collapsed.
 */
export function collapseRepeatedWhitespace(text: string): string {
  if (!text || text.length < 10) {
    return text;
  }
  // Collapse runs of 10+ horizontal whitespace chars (spaces/tabs) to a single space.
  // ≤9 consecutive spaces (normal code indentation) are preserved.
  // Newlines are preserved — markdown structure depends on consecutive \n.
  //
  // ⚠️ Do NOT trim trailing spaces here — Markdown hard-line-break syntax is
  //    two trailing spaces before \n ("  \n").  Stripping them would break <br>
  //    rendering in the Copilot chat panel.  DeepSeek space-garbage is always
  //    10+ consecutive spaces and is already handled by the regex above.
  //
  // After collapsing, if the entire delta is now a lone space with no real content
  // (i.e. the input was pure spaces/tabs), drop it entirely.  This handles the
  // "pure garbage space" case (100+ spaces → "") while keeping "text   text" → "text text".
  const collapsed = text.replace(/[ \t]{10,}/g, " ");
  return /^[ \t]+$/.test(collapsed) ? "" : collapsed;
}
