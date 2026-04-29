import type * as vscode from "vscode";
import { logger } from "../../common/logger";

/**
 * ApiKeyService - 专门负责 API Key 的存储和检索
 *
 * 职责:
 * - 从 SecretStorage 获取 API Key
 * - 存储 API Key 到 SecretStorage
 * - 删除 API Key (SecretStorage)
 */
export class ApiKeyService {
  // 设计文档标准: addi.local.apikeys.{id}
  private static readonly SECRET_PREFIX = "addi.local.apikeys.";

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * 获取 API Key (从 SecretStorage)
   *
   * @param providerId Provider ID
   * @returns API Key 或 undefined
   */
  async getApiKey(providerId: string): Promise<string | undefined> {
    try {
      const secretKey = ApiKeyService.SECRET_PREFIX + providerId;
      const secret = await this.context.secrets.get(secretKey);
      if (secret && secret.trim()) {
        logger.debug(
          `ApiKeyService.getApiKey: found in SecretStorage for ${providerId}`,
        );
        return secret;
      }
    } catch (error) {
      logger.error(
        `ApiKeyService.getApiKey: failed to get from SecretStorage for ${providerId}`,
        error,
      );
    }

    return undefined;
  }

  /**
   * 设置 API Key (存储到 SecretStorage)
   *
   * @param providerId Provider ID
   * @param apiKey 明文 API Key
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        `ApiKeyService.setApiKey: apiKey cannot be empty for ${providerId}. Use deleteApiKey() to remove a key.`,
      );
    }

    try {
      const secretKey = ApiKeyService.SECRET_PREFIX + providerId;
      await this.context.secrets.store(secretKey, apiKey.trim());
      logger.info(`ApiKeyService.setApiKey: stored for ${providerId}`);
    } catch (error) {
      logger.error(
        `ApiKeyService.setApiKey: failed to store for ${providerId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * 删除 API Key (从 SecretStorage)
   *
   * @param providerId Provider ID
   */
  async deleteApiKey(providerId: string): Promise<void> {
    try {
      const secretKey = ApiKeyService.SECRET_PREFIX + providerId;
      await this.context.secrets.delete(secretKey);
      logger.info(`ApiKeyService.deleteApiKey: deleted for ${providerId}`);
    } catch (error) {
      // SecretStorage.delete 即使 key 不存在也不会报错
      logger.debug(
        `ApiKeyService.deleteApiKey: failed or key not exists for ${providerId}`,
        error,
      );
    }
  }

  /**
   * Fallback: 删除所有已知的 API Keys (当 secrets.keys() 不可用时)
   * 需要配合 globalState 中的 provider IDs 使用
   */
  async deleteAllApiKeys(): Promise<void> {
    try {
      // 从 globalState 获取 provider IDs
      const providers = this.context.globalState.get<{ id: string }[]>(
        "addi.config",
        [],
      );
      for (const provider of providers) {
        await this.deleteApiKey(provider.id);
      }
      logger.info(`Deleted ${providers.length} API keys via fallback method`);
    } catch (error) {
      logger.error("ApiKeyService.deleteAllApiKeys: fallback failed", error);
    }
  }

  /**
   * 检查 SecretStorage 中是否存在 API Key
   *
   * @param providerId Provider ID
   */
  async hasApiKey(providerId: string): Promise<boolean> {
    try {
      const secretKey = ApiKeyService.SECRET_PREFIX + providerId;
      const secret = await this.context.secrets.get(secretKey);
      return !!secret && secret.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 监听 SecretStorage 变化 (用于多窗口同步)
   */
  onDidChangeSecrets(
    callback: (providerId: string, apiKey: string | undefined) => void,
  ): vscode.Disposable {
    return this.context.secrets.onDidChange(async (e) => {
      if (e.key.startsWith(ApiKeyService.SECRET_PREFIX)) {
        const providerId = e.key.replace(ApiKeyService.SECRET_PREFIX, "");
        const secret = await this.context.secrets.get(e.key);
        callback(providerId, secret);
      }
    });
  }
}
