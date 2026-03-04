import * as crypto from 'crypto';
import { logger } from '../../common/logger';

/**
 * Provider ID 到 API Key 的映射
 */
export interface ProviderApiKeys {
  [providerId: string]: string;
}

/**
 * CryptoService - 负责 API Key 的加密和解密
 *
 * 使用 AES-256-GCM + PBKDF2 进行安全加密
 * 参考 IANA application/vnd.aia 规范
 */
export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 12; // 96 bits (IANA recommended)
  private static readonly SALT_LENGTH = 16; // 128 bits
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly PBKDF2_DIGEST = 'sha512';
  private static readonly MIN_PASSWORD_LENGTH = 8;

  /**
   * 验证密码长度
   */
  static isValidPassword(password: string | undefined): boolean {
    return !!password && password.length >= this.MIN_PASSWORD_LENGTH;
  }

  /**
   * 从密码派生加密密钥
   */
  private static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      this.PBKDF2_DIGEST
    );
  }

  /**
   * 加密 API Keys
   * @param apiKeys providerId -> apiKey 的映射
   * @param password 用户密码
   * @returns 拼接后的 base64 字符串 (salt + iv + ciphertext + tag)
   * @throws 加密失败时抛出错误
   */
  static encryptApiKeys(apiKeys: ProviderApiKeys, password: string): string {
    if (!this.isValidPassword(password)) {
      throw new Error(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters`);
    }

    try {
      // 生成随机盐值
      const salt = crypto.randomBytes(this.SALT_LENGTH);

      // 从密码派生密钥
      const key = this.deriveKey(password, salt);

      // 生成随机 IV (12 bytes per IANA recommendation)
      const iv = crypto.randomBytes(this.IV_LENGTH);

      // 创建加密器
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      // 加密数据
      const data = JSON.stringify(apiKeys);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

      // 获取认证标签
      const tag = cipher.getAuthTag();

      // 拼接: salt (16) + iv (12) + ciphertext (可变) + tag (16) - IANA 标准顺序
      const combined = Buffer.concat([salt, iv, encrypted, tag]);

      // 返回 base64 编码
      const result = combined.toString('base64');
      logger.debug('CryptoService.encryptApiKeys: encryption successful');
      return result;
    } catch (error) {
      logger.error('CryptoService.encryptApiKeys: encryption failed', error);
      throw new Error('Failed to encrypt API keys');
    }
  }

  /**
   * 解密 API Keys
   * @param encryptedBase64 拼接后的 base64 字符串
   * @param password 用户密码
   * @returns 解密后的数据，失败返回 null
   */
  static decryptApiKeys(encryptedBase64: string, password: string): ProviderApiKeys | null {
    if (!password) {
      logger.warn('CryptoService.decryptApiKeys: password is empty');
      return null;
    }

    try {
      // 解码 base64
      const combined = Buffer.from(encryptedBase64, 'base64');

      // 验证最小长度: salt(16) + iv(12) + tag(16) = 44 字节
      if (combined.length < 44) {
        logger.warn('CryptoService.decryptApiKeys: encrypted data too short');
        return null;
      }

      // 解析各部分 (salt:16, iv:12, ciphertext:可变, tag:16) - IANA 标准顺序
      const salt = combined.subarray(0, 16);
      const iv = combined.subarray(16, 28); // 12 bytes
      const ciphertext = combined.subarray(28, -16); // 从第28字节到倒数第16字节
      const tag = combined.subarray(-16); // 最后16字节

      // 从密码派生密钥
      const key = this.deriveKey(password, salt);

      // 创建解密器
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // 解密数据
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      const result = JSON.parse(decrypted.toString('utf8'));
      logger.debug('CryptoService.decryptApiKeys: decryption successful');
      return result;
    } catch (error) {
      // 解密失败（密码错误或数据被篡改）
      logger.warn('CryptoService.decryptApiKeys: decryption failed', error);
      return null;
    }
  }
}
