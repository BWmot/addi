# Addi 配置加密导出/导入功能详细设计

## 1. 需求概述

### 1.1 功能目标

为 Addi 插件的配置导出/导入功能增加密码保护的 API Key 加密能力，确保用户在不同设备间同步配置时 API Key 的安全性。

### 1.2 核心需求

- **导出时**：用户可选择输入密码来加密 API Key，生成加密的 `encryptionApiKey` 字段
- **导入时**：检测配置文件中的 `encryptionApiKey` 字段，提示用户输入密码解密
- **加密算法**：采用 AES-256-GCM（Galois/Counter Mode）进行安全加密

---

## 2. 技术方案

### 2.1 加密算法选择：AES-256-GCM

**为什么选择 AES-256-GCM？**

- **安全性高**：256 位密钥提供企业级安全标准
- **完整性验证**：GCM 模式提供内置的认证标签，能检测密文是否被篡改
- **效率高**：加密和解密速度块，适合 API Key 这种小数据量
- **无需填充**：GCM 是 AEAD（Authenticated Encryption with Associated Data）模式，无需 PKCS#7 填充
- **Node.js 原生支持**：Node.js crypto 模块内置支持，无需额外依赖

### 2.2 密码处理

使用 PBKDF2（Password-Based Key Derivation Function 2）从用户密码派生密钥：

- **迭代次数**：100,000 次（平衡安全性与性能）
- **盐值（Salt）**：随机生成 16 字节，每次加密独立生成
- **哈希算法**：SHA-512

> **参考规范**：IANA 注册的 `application/vnd.aia` 媒体类型定义了成熟的二进制布局，本设计参考此规范：
>
> - **salt**: 16 字节
> - **iv**: 12 字节（IANA 推荐值，安全性与效率平衡）
> - **ciphertext**: 可变长度
> - **tag**: 16 字节（GCM 认证标签）
>
> 最终拼接顺序：`salt (16 bytes) || iv (12 bytes) || ciphertext (variable) || tag (16 bytes)`，然后进行 Base64 编码

### 2.3 数据结构设计

#### 导出配置 JSON 结构

```json
{
  "version": 1,
  "exportedAt": 1699900000000,
  "encryptionApiKey": "base64编码的完整加密数据(包含salt+iv+ciphertext+tag)"
}
```

#### encryptionApiKey 内部结构（IANA 规范顺序）

```
salt (16字节) + iv (12字节) + ciphertext (可变长度) + tag (16字节)
```

**各字段说明**：
| 字段 | 长度 | 说明 |
|------|------|------|
| salt | 16 字节 | PBKDF2 盐值 |
| iv | 12 字节 | AES-GCM 初始化向量（IANA 推荐值） |
| ciphertext | 可变 | 加密后的 API Key 数据 |
| tag | 16 字节 | GCM 认证标签 |

**拼接说明**：

- 先将 salt、iv、ciphertext、tag 按顺序拼接成二进制 buffer
- 再对该 buffer 进行 Base64 编码，生成单一的字符串存储在 `encryptionApiKey` 字段中

#### 完整加密数据示例

```json
{
  "version": 1,
  "exportedAt": 1699900000000,
  "encryptionApiKey": "base64编码的拼接数据(salt+iv+ciphertext+tag)",
  "providers": [
    {
      "id": "provider-123",
      "name": "OpenAI",
      "providerType": "openai-responses",
      "models": [...]
    }
  ]
}
```

---

## 3. 功能流程设计

### 3.1 导出流程

```
用户触发导出命令
       ↓
选择要导出的 Providers
       ↓
提示输入密码: "Enter a password to encrypt ApiKey (Empty to exclude ApiKey)"
       ↓
    ┌─────────────────────────────────────────┐
    │ 用户输入密码？                          │
    └─────────────────────────────────────────┘
         ↓                    ↓
        是                    否
         ↓                    ↓
   ┌──────────────┐    ┌──────────────────┐
   │ 加密 ApiKey  │    │ 不导出 ApiKey    │
   │              │    │ (仅导出配置结构)  │
   └──────────────┘    └──────────────────┘
         ↓
  选择导出目标（文件/剪贴板）
       ↓
  生成并保存配置
       ↓
  显示成功提示
```

### 3.2 导入流程

```
用户触发导入命令
       ↓
选择导入来源（文件/剪贴板）
       ↓
解析配置文件
       ↓
┌─────────────────────────────────────────────────────┐
│ 检查 encryptionApiKey 字段是否存在？              │
└─────────────────────────────────────────────────────┘
         ↓                    ↓
        是                    否
         ↓                    ↓
┌──────────────────┐    ┌──────────────────────────┐
│ 提示输入密码     │    │ 原有导入流程              │
│ "Enter password  │    │ (是否包含明文 ApiKey)     │
│ to decrypt       │    └──────────────────────────┘
│ ApiKey"          │
└────────┬─────────┘
         ↓
    ┌──────────────┐
    │ 用户输入密码 │
    └──────┬───────┘
         ↓
    ┌──────────────┐
    │ 解密 ApiKey  │
    │ 验证 tag │
    └──────┬───────┘
         ↓
   ┌──────────────┐    ┌──────────────────────────────────────────┐
   │ 解密成功？    │    │ 失败                                     │
   └──────┬───────┘    │ 显示: "无法从配置解密ApiKey或许密码错误, │
         ↓            │        已导入配置结构忽略ApiKey"          │
   ┌──────┴───────┐    └──────────────────────────────────────────┘
   ↓              ↓
  是             否
   ↓              ↓
┌────────┐  ┌────────────────────────────────────┐
│ 继续   │  │ 显示错误提醒                       │
│ 导入   │  │ 导入配置但跳过 ApiKey              │
└────────┘  └────────────────────────────────────┘
```

---

## 4. UI/UX 设计

### 4.1 导出时

**第一步：选择 Providers**（保持现有逻辑）

**第二步：密码输入对话框**

```text
┌────────────────────────────────────────────────────────────┐
│  Export Configuration - API Key Security                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Enter a password to encrypt ApiKey                       │
│  (Leave empty to exclude ApiKey from export)             │
│                                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  [ Cancel ]                     [ Export ]                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**说明**：

- 密码输入框默认聚焦
- 密码最小长度：6 字符
- 输入密码：生成加密的 `encryptionApiKey` 字段
- 留空：不导出 ApiKey，配置中不包含任何 ApiKey 信息
- 取消则返回上一步或退出

**第三步：选择导出目标**（保持现有逻辑）

### 4.2 导入时

**第一步：选择导入来源**（保持现有逻辑）

**第二步：密码输入对话框**（仅当检测到 `encryptionApiKey` 时）

```text
┌────────────────────────────────────────────────────────────┐
│  Import Configuration - Decrypt API Key                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  This configuration contains encrypted API Keys.         │
│  Enter password to decrypt:                               │
│                                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  [ Cancel ]                     [ Import ]                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**错误提示**：

- 解密失败时显示：`无法从配置解密ApiKey或许密码错误，已导入配置结构忽略ApiKey`

---

## 5. 代码设计

### 5.1 新增加密服务模块

建议创建新文件：`src/infrastructure/crypto/cryptoService.ts`

```typescript
import * as crypto from 'crypto';

export interface ProviderApiKeys {
  [providerId: string]: string;
}

export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 12; // 96 bits (IANA recommended)
  private static readonly SALT_LENGTH = 16; // 128 bits
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly PBKDF2_DIGEST = 'sha512';

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
   */
  static encryptApiKeys(apiKeys: ProviderApiKeys, password: string): string {
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
    const combined = Buffer.concat([salt, iv, ciphertext, tag]);

    // 返回 base64 编码
    return combined.toString('base64');
  }

  /**
   * 解密 API Keys
   * @param encryptedBase64 拼接后的 base64 字符串
   * @param password 用户密码
   * @returns 解密后的数据，失败返回 null
   */
  static decryptApiKeys(encryptedBase64: string, password: string): ProviderApiKeys | null {
    try {
      // 解码 base64
      const combined = Buffer.from(encryptedBase64, 'base64');

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

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      // 解密失败（密码错误或数据被篡改）
      return null;
    }
  }
}
```

#### 派生规则汇总（加密/解密一致性保证）

| 阶段       | 参数/操作                                                   | 说明                              |
| ---------- | ----------------------------------------------------------- | --------------------------------- |
| **加密时** | 1. 生成随机 `salt` (16字节)                                 | 每次加密独立生成                  |
|            | 2. `deriveKey(password, salt)` → `key`                      | 使用 PBKDF2 派生 256 位密钥       |
|            | 3. 生成随机 `iv` (12字节)                                   | 每次加密独立生成                  |
|            | 4. `AES-256-GCM(key, iv)` 加密数据                          | 生成 ciphertext 和 tag            |
|            | 5. 拼接: `salt + iv + ciphertext + tag` (IANA 标准顺序)     | 二进制拼接                        |
|            | 6. Base64 编码 → `encryptionApiKey`                         | 存储到配置文件                    |
| **解密时** | 1. Base64 解码 → 二进制数据                                 | 从配置文件读取                    |
|            | 2. 解析: `salt=0:16, iv=16:28, ciphertext=28:-16, tag=-16:` | 固定偏移量解析                    |
|            | 3. `deriveKey(password, salt)` → `key`                      | **必须使用相同密码和提取的 salt** |
|            | 4. `AES-256-GCM(key, iv, tag)` 解密 ciphertext              | 验证完整性并解密                  |

**关键点**：

- **Salt 存储在密文中**：解密时从 `encryptionApiKey` 提取，用于派生密钥
- **IV 存储在密文中**：解密时从 `encryptionApiKey` 提取，用于解密
- **Tag 存储在密文中**：解密时验证数据完整性
- 加密/解密使用**相同的派生函数**和**固定的偏移量**，确保只要密码一致就能正确解密

### 5.2 修改现有代码

#### 5.2.1 修改 `src/presentation/commands/config.ts`

**修改 `exportConfig` 方法**：

1. 将 "Include API Keys" 快速选择替换为密码输入对话框
2. 调用加密服务处理 API Key

**修改 `importConfig` 方法**：

1. 检测 `encryptionApiKey` 字段
2. 如存在，弹出密码输入框
3. 调用解密服务

#### 5.2.2 类型定义更新

在 `src/common/types/config.ts`：

```typescript
export interface ExportConfig {
  version: number;
  exportedAt: number;
  /** 加密的 API Keys (base64 编码的 salt+iv+ciphertext+tag) */
  encryptionApiKey?: string;
  providers: Provider[];
}
```

> 注：`Provider` 类型定义在 `src/common/types/provider.ts`

---

## 6. 错误处理

### 6.1 导出时

| 场景               | 处理                             |
| ------------------ | -------------------------------- |
| 密码过短 (< 8字符) | 提示"密码至少需要8个字符"        |
| 获取 API Key 失败  | 跳过该 Provider 的 Key，记录日志 |
| 加密失败           | 显示错误，终止导出               |

### 6.2 导入时

| 场景                      | 处理                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| 密码错误                  | 显示"无法从配置解密ApiKey或许密码错误，已导入配置结构忽略ApiKey"，继续导入配置但跳过 ApiKey |
| 密文被篡改 (tag 验证失败) | 同上                                                                                        |
| 配置文件格式错误          | 显示解析错误，终止导入                                                                      |
| 密码输入取消              | 返回上一步或退出导入                                                                        |

---

## 7. 安全考量

### 7.1 已实现的安全措施

- **AES-256-GCM**：提供加密和完整性验证
- **PBKDF2**：防止暴力破解，100,000 次迭代
- **随机盐值**：每次加密使用不同的盐
- **随机 IV**：防止已知明文攻击

### 7.2 用户教育

- 建议用户在安全环境下导出配置
- 提醒用户不要将加密配置文件分享给不受信任的人
- 建议导出密码通过其他安全渠道传递（如单独发送）

---

## 8. 导出/导入格式说明

### 8.1 配置格式规则

- 导入时检测到 `encryptionApiKey` 字段，输入密码解密
- 导入时无 `encryptionApiKey` 字段，则配置中不包含 ApiKey
- 导出时输入密码，生成加密格式（`encryptionApiKey`）
- 导出时留空，不导出 ApiKey（配置中不包含 ApiKey 信息）

### 8.2 版本号

- 当前版本：1
- 如未来加密算法变更，增加 version 字段值

---

## 9. 测试计划建议

### 9.1 单元测试

- `CryptoService.encryptApiKeys()` 加密/解密一致性
- 空密码处理
- 特殊字符密码
- 超长密码

### 9.2 集成测试

- 完整导出/导入流程
- 密码错误场景
- 文件损坏/篡改场景

---

## 10. 替代方案考虑

### 方案 A（推荐）：AES-256-GCM + PBKDF2

- ✅ 原生支持，无需依赖
- ✅ 高安全性
- ✅ 适合小数据量

### 方案 B：使用 VSCode SecretStorage 导出

- ❌ SecretStorage 只能在当前机器解密
- ❌ 无法跨设备

### 方案 C：使用外部加密工具

- ❌ 用户体验差
- ❌ 不够便捷

---

## 11. 实施步骤

1. **Phase 1：加密服务开发**
   - 创建 `src/infrastructure/crypto/cryptoService.ts`
   - 实现 AES-256-GCM 加密/解密
   - 单元测试

2. **Phase 2：导出功能改造**
   - 修改 `config.ts` 的 `exportConfig` 方法
   - 添加密码输入 UI
   - 集成加密服务

3. **Phase 3：导入功能改造**
   - 修改 `config.ts` 的 `importConfig` 方法
   - 添加解密 UI
   - 错误处理

4. **Phase 4：测试与文档**
   - E2E 测试
   - 更新用户文档

---

## 12. 总结

本设计采用业界标准的 AES-256-GCM 加密算法，配合 PBKDF2 密码派生，既保证了安全性，又保持了良好的用户体验。加密数据以 Base64 编码存储在配置文件的 `encryptionApiKey` 字段中，实现了对现有配置格式的最小侵入性扩展。
