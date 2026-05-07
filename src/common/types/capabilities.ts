/**
 * Model Capabilities - AI 模型能力定义
 */

export interface ModelCapabilities {
  vision?: boolean;
  toolCalling?: boolean | number;
  reasoning?: boolean;
}
