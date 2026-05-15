/**
 * reasoningContentAdaptMiddleware — AI SDK LanguageModelMiddleware
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 双向 reasoning_content 适配中间件
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 设计目标：
 *   对使用 reasoning_content API 字段的模型（如 DeepSeek V4/R1、MiMo v2 等），
 *   在请求侧和响应侧进行双向格式适配，确保 reasoning/thinking 内容能正确
 *   在 VS Code Copilot 中识别为思考数据（LanguageModelThinkingPart）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 职责范围
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. 请求侧（transformParams）—— 多轮回传 backfill
 *    对 history 中缺少 type: "reasoning" part 的 assistant 消息，
 *    注入 { type: "reasoning", text: " " } 占位 part。
 *    这使得 provider 的 convertTo*ChatMessages() 通过 case 'reasoning'
 *    处理器输出 reasoning_content 字段，确保 API 请求中包含该字段
 *   （避免 400 错误，如 DeepSeek 要求多轮消息中必须包含 reasoning_content）。
 *
 * 2. 响应侧（wrapStream / wrapGenerate）—— 格式适配保障
 *    对流式响应中的 reasoning-delta 和非流式响应中的 reasoning 内容
 *    进行透传与格式保障。对于已正确处理的 provider（如 @ai-sdk/openai-compatible
 *    已内置 reasoning_content → reasoning-delta 转换），直接透传；
 *    对于 @ai-sdk/openai（官方端点）当前版本存在 schema 缺失导致
 *    reasoning_content 被静默丢弃的问题，设定了框架层面的扩展点
 *   （详见下方已知局限说明）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 适用模型
 * ────────────────────────────────────────────────────────────────────────────
 *
 * - DeepSeek V4/R1（通过 openai-completions provider + 自定义端点访问）
 * - Xiaomi MiMo（mimo-v2* 系列）
 * - 任何使用 reasoning_content API 字段且需要多轮回传与响应适配的模型
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 数据流
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ┌──────────────┐    reasoning-delta     ┌──────────────────┐
 * │  AI SDK      │ ◄──────────────────── │  Provider SDK    │
 * │  streamText  │    (已含 reasoning)   │  (doStream)      │
 * │  /fullStream │                       │                  │
 * │              │    wrapStream 透传     │  openai-compat:  │
 * │  fullStream  │ ──────────────────►  │  ✅ 已正确处理   │
 * │  consumer    │                       │  openai:         │
 * │  (llmService)│                       │  ❌ schema 缺失  │
 * └──────┬───────┘                       └──────────────────┘
 *        │
 *        │ LanguageModelThinkingPart
 *        ▼
 * ┌──────────────┐
 * │  VS Code     │
 * │  Copilot     │
 * │  (progress)  │
 * └──────────────┘
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 已知局限
 * ────────────────────────────────────────────────────────────────────────────
 *
 * @ai-sdk/openai（v3.0.63）的 openaiChatChunkSchema 未定义 reasoning_content
 * 字段，导致 delta.reasoning_content 在 doStream 的 zod 解析中被静默丢弃。
 * 该 provider 用于官方 OpenAI 端点（api.openai.com），当用户直接使用
 * 官方端点访问 o1/o3/o4-mini 等推理模型时，思考内容无法通过中间件恢复。
 *
 * 建议：使用官方 OpenAI 推理模型的用户应使用 openai-responses 类型，
 * 其 reasoningEffort 机制能正确处理思考过程。
 *
 * 对于自定义端点（如 DeepSeek），aiRegistry.ts 会使用 @ai-sdk/openai-compatible
 * 替代 @ai-sdk/openai，后者已正确处理 reasoning_content。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 启用方式
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 此中间件为"实验性功能"，由用户在模型编辑页面手动启用
 * （ModelOptions.reasoningContentAdapt），而非自动检测。
 * 详见 docs/reasoning-support-plan.md。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 版本历史
 * ────────────────────────────────────────────────────────────────────────────
 *
 * - v1 (reasoningContentInjectMiddleware): 仅请求侧 backfill
 * - v2 (reasoningContentAdaptMiddleware):  新增响应侧 wrapStream/wrapGenerate，
 *   改为双向适配，更名以反映增强范围
 */
import type { LanguageModelMiddleware } from "ai";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3ReasoningPart,
} from "@ai-sdk/provider";

// ============================================================================
// 中间件工厂函数
// ============================================================================

/**
 * 创建 reasoning_content 双向适配中间件
 *
 * 返回的中间件对象包含三个钩子：
 * - transformParams（请求侧）：注入 type: "reasoning" part 实现多轮回传 backfill
 * - wrapStream（响应侧）：透传流式响应，保障 reasoning-delta 格式正确
 * - wrapGenerate（响应侧）：透传非流式响应，保障 reasoning 内容传递
 */
export function createReasoningContentAdaptMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",

    // middlewareName 用于 aiRegistry.ts 调试日志（通过索引签名访问），
    // LanguageModelV3Middleware 类型未声明此属性，故使用 as 断言抑制检查。
    middlewareName: "reasoningContentAdapt" as string | undefined,

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
    transformParams: async ({
      params,
    }: {
      type: "generate" | "stream";
      params: LanguageModelV3CallOptions;
    }) => {
      const messages = params.prompt;

      // 对所有 assistant 消息 backfill reasoning_content
      // 如果 assistant 消息缺少 type: "reasoning" part，注入一个非空 part，
      // 确保 converter 输出 reasoning_content 字段（避免 400 错误）。
      // 所有使用 reasoning_content 的模型都兼容此行为。
      const transformedMessages = messages.map((msg) => {
        if (msg.role !== "assistant") return msg;

        const hasReasoningPart = msg.content.some(
          (p) => p.type === "reasoning",
        );

        if (!hasReasoningPart) {
          const reasoningPart: LanguageModelV3ReasoningPart = {
            type: "reasoning",
            text: " ",
          };

          return {
            ...msg,
            content: [...msg.content, reasoningPart],
          };
        }

        return msg;
      }) satisfies LanguageModelV3Prompt;

      return { ...params, prompt: transformedMessages };
    },

    // ======================================================================
    // 响应侧 — 流式响应适配
    //
    // wrapStream 钩子用于透传流式响应。对于已正确包含 reasoning-delta 的流
    // （如 @ai-sdk/openai-compatible），直接透传给 llmService 的
    // processResponsePart 处理（handleThinkingDelta → LanguageModelThinkingPart）。
    //
    // 当前实现为透传（pass-through），但作为框架级扩展点，
    // 便于后续 AI SDK 版本更新或 provider 变更时在此处添加适配逻辑。
    //
    // @ai-sdk/openai-compatible 已经正确处理：
    //   doStream 中 delta.reasoning_content → { type: "reasoning-delta", delta: text }
    //
    // @ai-sdk/openai 的已知局限：
    //   由于 schema 缺失，delta.reasoning_content 在 zod 解析中被丢弃。
    //   详细说明见文件顶部"已知局限"章节。
    // ======================================================================
    wrapStream: async ({
      doStream,
    }: {
      doStream: () => PromiseLike<unknown>;
    }) => {
      return doStream();
    },

    // ======================================================================
    // 响应侧 — 非流式响应适配
    //
    // wrapGenerate 钩子用于透传非流式响应。对于已正确包含 reasoning 的响应
    // （如 @ai-sdk/openai-compatible 的 doGenerate 已将 reasoning_content 赋值给
    // result.reasoning），直接透传，llmService 会通过 result.reasoning 提取思考内容。
    //
    // 当前实现为透传，作为框架级扩展点。
    // ======================================================================
    wrapGenerate: async ({
      doGenerate,
    }: {
      doGenerate: () => PromiseLike<unknown>;
    }) => {
      return doGenerate();
    },
  } as LanguageModelMiddleware;
}
