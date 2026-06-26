import type { Provider, Model } from "../../common/types";
import type { LanguageModelChatRequestMessage } from "vscode";
import { logger, LogScope } from "../../common/logger";

// ============================================================================
// Types
// ============================================================================

/** 路由策略 */
export type RouterStrategy = "largest-context" | "fastest" | "label-based";

/** 路由结果 */
export interface RouterDecision {
  provider: Provider;
  model: Model;
  /** 选择理由（可展示给用户） */
  reason: string;
}

// ============================================================================
// AutoRouter — 智能模型路由引擎
// ============================================================================

export class AutoRouter {
  /**
   * 分析请求并选择最佳模型。
   *
   * @param messages   - 用户消息列表
   * @param hasTools   - 是否需要 tool calling
   * @param hasImages  - 是否包含图片
   * @param candidates - 所有可用模型
   * @param strategy   - 路由策略（默认 largest-context）
   */
  static select(
    messages: readonly LanguageModelChatRequestMessage[],
    hasTools: boolean,
    hasImages: boolean,
    candidates: Array<{ provider: Provider; model: Model }>,
    strategy: RouterStrategy = "largest-context",
  ): RouterDecision | null {
    if (candidates.length === 0) return null;

    // 1) 按能力过滤
    let eligible = candidates.filter(({ model }) => {
      if (hasImages && !model.capabilities?.vision) return false;
      if (hasTools && model.capabilities?.toolCalling === false) return false;
      return true;
    });

    // 降级：如果无满足全部条件的模型，退回最宽松过滤
    if (eligible.length === 0) {
      logger.debug("AutoRouter: no perfect match, falling back to all candidates", undefined, LogScope.LLM_SERVICE);
      eligible = candidates;
    }

    // 2) 按策略排序 & 选最优
    switch (strategy) {
      case "fastest":
        eligible.sort((a, b) => (b.model.averageSpeed ?? 0) - (a.model.averageSpeed ?? 0));
        break;
      case "largest-context":
      default:
        eligible.sort((a, b) => (b.model.maxInputTokens ?? 0) - (a.model.maxInputTokens ?? 0));
        break;
    }

    const best = eligible[0]!;
    
    logger.info(
      "AutoRouter: selected model",
      {
        provider: best.provider.name,
        model: best.model.name,
        strategy,
        eligibleCount: eligible.length,
      },
      LogScope.LLM_SERVICE,
    );

    return {
      provider: best.provider,
      model: best.model,
      reason: `Auto: ${best.provider.name} / ${best.model.name} (${strategy})`,
    };
  }
}
