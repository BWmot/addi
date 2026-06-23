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
