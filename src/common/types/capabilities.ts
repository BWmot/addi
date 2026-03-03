/**
 * Model Capabilities - AI 模型能力定义
 */

export interface ModelCapabilities {
  imageInput?: boolean;
  audioInput?: boolean;
  videoInput?: boolean;
  toolCalling?: boolean | number;
  reasoning?: boolean;
}
