/**
 * reasoningContentInjectMiddleware — AI SDK LanguageModelMiddleware
 *
 * 功能：在请求侧处理 reasoning_content 字段的多轮回传与 backfill。
 *
 * 核心逻辑：
 * - transformParams 直接操作 AI SDK 消息的 content 数组（parts array），
 *   而非设置私有标记（_reasoningContent）。因为 provider 的 convertTo*ChatMessages()
 *   只读取 msg.content 中的 type: "reasoning" parts，忽略 message 级别的任意属性。
 *
 * 适用场景：
 * - DeepSeek V4/R1（通过 openai-completions provider 访问）
 * - Xiaomi MiMo（mimo-v2* 系列）
 * - 任何使用 reasoning_content API 字段且需要多轮回传的模型
 *
 * 行为：
 * - 对所有 assistant 消息，如果缺少 type: "reasoning" part，注入
 *   { type: "reasoning", text: " " }，使 convertToOpenAICompatibleChatMessages
 *   的 case 'reasoning' 处理器输出 reasoning_content 字段（避免 400 错误）。
 * - 所有使用 reasoning_content API 字段的模型（DeepSeek V4/R1、MiMo v2 等）
 *   都兼容此行为——API 会忽略多余的 reasoning_content 字段，不会报错。
 *
 * 设计说明：
 * 此中间件为"实验性功能"，由用户在模型编辑页面手动启用
 * （ModelOptions.reasoningContentInject），而非自动检测。
 *
 * 注意：对于 deepseek 原生 provider，convertToDeepSeekChatMessages 已经内置了
 * V4 backfill (reasoning_content: reasoning ?? (isDeepSeekV4 ? '' : undefined))，
 * 此中间件对该 provider 是冗余的。
 */
import type { LanguageModelMiddleware } from "ai";

// ============================================================================
// 中间件工厂函数
// ============================================================================

/**
 * 创建 reasoning_content 注入中间件
 *
 * 此中间件在请求侧（transformParams）直接操作 AI SDK 消息的 content 数组，
 * 而非设置私有字段。这样 provider 的 convertTo*ChatMessages() 函数通过
 * case 'reasoning' 处理器能自然读取并转换为 API 的 reasoning_content 字段。
 *
 * 所有使用 reasoning_content API 字段的模型（DeepSeek V4/R1、MiMo v2 等）
 * 都适用同一逻辑——对所有缺少 type: "reasoning" part 的 assistant 消息注入
 * 占位 part，确保 converter 输出 reasoning_content 字段。
 *
 * 使用 AI SDK v3 中间件规范（LanguageModelV3Middleware ↔ LanguageModelMiddleware）。
 */
export function createReasoningContentInjectMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",

    // ======================================================================
    // 请求侧 — 参数转换
    //
    // 关键数据流：
    // 1. AI SDK prompt 中的每条消息包含 role + content (parts array)
    // 2. provider 的 convertTo*ChatMessages() 解构 { role, content, ...msg }
    //    并只读取 msg.content 中的 parts
    // 3. 对于 assistant 消息，case 'reasoning' 累加 reasoning += part.text
    //    然后输出 ...(reasoning.length > 0 ? { reasoning_content: reasoning } : {})
    // 4. 因此，要控制 reasoning_content 的输出，必须操作 content 数组本身
    // ======================================================================
    transformParams: async ({ params }) => {
      const messages = params.prompt as any[];

      // 对所有 assistant 消息 backfill reasoning_content
      // 如果 assistant 消息缺少 type: "reasoning" part，注入一个非空 part，
      // 确保 converter 输出 reasoning_content 字段（避免 400 错误）。
      // 所有使用 reasoning_content 的模型都兼容此行为。
      const transformedMessages = messages.map((msg: any) => {
        if (msg.role !== "assistant") return msg;

        const content: any[] = msg.content ?? [];
        const hasReasoningPart = content.some(
          (p: any) => p.type === "reasoning",
        );

        if (!hasReasoningPart) {
          return {
            ...msg,
            content: [
              ...content,
              { type: "reasoning", text: " " },
            ],
          };
        }

        return msg;
      });

      return { ...params, prompt: transformedMessages };
    },

  };
}
