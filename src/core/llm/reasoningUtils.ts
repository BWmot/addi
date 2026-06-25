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
 * Collapse runs of 3 or more identical punctuation characters into a single
 * character.  For example:
 *   "text::::::::" → "text:"
 *   "你好。。。。。。" → "你好。"
 *   "done!!!"  → "done!" (3+ → 1)
 *   "done!!"   → "done!!" (2 is left as-is)
 *
 * This is designed to clean up trailing-punctuation artifacts that some
 * DeepSeek-family models emit at the end of tool-only or mixed responses.
 *
 * @param text - The raw text to clean.
 * @returns The cleaned text with spurious repeated punctuation collapsed.
 */
export function collapseRepeatedPunctuation(text: string): string {
  if (!text || text.length < 3) {
    return text;
  }
  // Use \1+ to match the ENTIRE run of identical punctuation (not just
  // exactly 3), so that 100 dots → 1 dot rather than ~33 dots.
  // Threshold is ≥ 2 so that even "：：" or "。。" is collapsed — this is
  // critical in streaming where single-char deltas cause oscillation
  // (":"→"::"→":"→"::"→…) leaking ~50% of repeated punctuation.
  return text.replace(
    /([!\"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~。，、；：？！…—·])\1+/g,
    (match) => (match.length >= 2 ? match.charAt(0) : match),
  );
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
      return text.slice(0, pos + patLen);
    }
  }

  return text;
}

/**
 * Stream-safe wrapper: maintains a rolling suffix buffer and applies
 * `collapseRepeatedSuffix` only to the tail so that the per-delta cost
 * stays bounded.
 *
 * @param accumulated - Previously accumulated clean text (may be "").
 * @param incoming    - The new raw text delta just received from the stream.
 * @returns A tuple [cleanedOverallText, cleanedDeltaForReporting]
 *   where `cleanedDeltaForReporting` is what should be sent to the UI.
 */
export function collapseStreamSuffix(
  accumulated: string,
  incoming: string,
  minRepeat: number = 2,
): [/* overall */ string, /* delta to report */ string] {
  const candidate = accumulated + incoming;
  const cleaned = collapseRepeatedSuffix(candidate, minRepeat);
  // If cleaning shortened the text, the delta for reporting is the
  // non-overlapping tail of `cleaned`.
  if (cleaned.length < candidate.length) {
    const strippedDelta = cleaned.slice(Math.max(0, cleaned.length - incoming.length));
    // Only report non-empty delta; stripped may be "" if the entire incoming
    // chunk was eaten by suffix collapse.
    return [cleaned, strippedDelta];
  }
  return [candidate, incoming];
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
  const collapsed = text.replace(/[ \t]{10,}/g, " ");
  // Trim trailing horizontal whitespace only (preserve trailing newlines)
  return collapsed.replace(/[ \t]+$/, "");
}
