import { ProviderConfig } from './provider';

/**
 * AddiConfig - 同步配置 (存储于 Memento，键: addi.config)
 * 设计文档标准格式
 */
export interface AddiConfig {
  /** 最后修改时间戳 */
  modifiedAt: number;
  /** Provider 配置列表 */
  providers: ProviderConfig[];
}

/**
 * LocalData - 本地数据 (存储于 SecretStorage，键: addi.local.*)
 * 设计文档标准格式
 */
export interface LocalData {
  /** 本地最后同步时间 */
  modifiedAt: number;
}
