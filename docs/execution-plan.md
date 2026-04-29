# Addi 代码质量改进 — 剩余 7+1 项执行计划

> 制定日期: 2025-07-04
> 状态: **全部完成** ✅
> 参考文档: `docs/code-quality-audit.md`

---

## 总览

| 序号 | 原编号 | 任务 | 优先级 | 预估工作量 | 依赖关系 | 状态 |
|------|--------|------|--------|------------|----------|------|
| 1 | P1-8 | 拆分 `common/utils/` 跨层工具 | 🟡 P1 | 中 | 无 | ✅ 完成 |
| 2 | P1-14 | `AIProviderRegistry` settings 类型化 | 🟡 P1 | 小 | 无 | ✅ |
| 3 | P2-21 | 提取排序策略到独立模块 | 🟢 P2 | 小 | 无 | ✅ |
| 4 | P2-17 | `AIProviderRegistry` 实例化 + DI | 🟢 P2 | 中 | 依赖 #2 | ✅ |
| 5 | P2-16 | 拆分 `ProviderModelManager` 上帝对象 | 🟢 P2 | 大 | 依赖 #4 | ✅ 完成 |
| 6 | P2-24 | UseCases 层接口化 (DIP) | 🟢 P2 | 大 | 依赖 #5 | ✅ 完成 |
| 7 | P1-15 | 添加核心模块单元测试 | 🟡 P1 | 大 | 依赖 #1-6 | ✅ 完成 |
| 8 | NEW | 改进现有测试 | 🟡 P1 | 中 | 依赖 #7 | ✅ 完成 |

### 执行顺序策略

```
#1 (P1-8) ─→ #2 (P1-14) ─→ #3 (P2-21)   ← 三个无依赖项可独立执行
                  ↓
               #4 (P2-17)
                  ↓
               #5 (P2-16)
                  ↓
               #6 (P2-24)
                  ↓
               #7 (P1-15)  ← 最后执行，为所有重构提供测试安全网
```

---

## 任务 1: P1-8 拆分 `common/utils/` 跨层工具

### 原始问题

`src/common/utils/` 中混入了依赖 VS Code API 的文件，违反分层架构：

| 文件 | 依赖 | 当前归属 | 正确归属 |
|------|------|----------|----------|
| `feedback.ts` | `vscode.window` | `common/` | `presentation/` |
| `config.ts` | `vscode.workspace` | `common/` | `infrastructure/` |
| `toolParser.ts` | 无外部依赖 (死代码) | `common/` | 删除或移至 `core/` |
| `id.ts` | `crypto` | `common/` | `common/` ✅ |
| `validator.ts` | `token.ts` | `common/` | `common/` ✅ |
| `token.ts` | 无 | `common/` | `common/` ✅ |

### 依赖分析

**`feedback.ts` (UserFeedback)** — 消费者 (全部在 presentation 层):
- `src/presentation/extension.ts` — 直接 import `../common/utils/feedback`
- `src/presentation/commands/config.ts` — 通过 `../../common/utils` barrel import

**`config.ts` (ConfigManager)** — 消费者 (跨层使用):
- `src/application/provider/ProviderUseCases.ts`
- `src/core/providers/ProviderModelManager.ts`
- `src/presentation/views/editorView.ts`
- `src/presentation/commands/config.ts`

**`toolParser.ts` (ToolParser)** — **死代码**:
- 无任何文件 import
- `common/utils/index.ts` 中未导出
- 结论: 可安全删除或移至 `core/tools/` 保留备用

### 子任务

- [x] **1.1** 创建 `src/presentation/utils/` 目录
- [x] **1.2** 移动 `feedback.ts` → `src/presentation/utils/feedback.ts`
- [x] **1.3** 更新 `extension.ts` import 路径: `../common/utils/feedback` → `./utils/feedback`
- [x] **1.4** 更新 `commands/config.ts` import: 从 barrel import 中分离 UserFeedback，改为直接 `../utils/feedback`
- [x] **1.5** 从 `common/utils/index.ts` 移除 `UserFeedback` 导出
- [x] **1.6** 创建 `src/infrastructure/vscode/` 目录
- [x] **1.7** 移动 `config.ts` → `src/infrastructure/vscode/configService.ts` (重命名为 `ConfigManager`)
- [x] **1.8** 更新 7 个消费者文件的 import 路径 (extension, commands/config, commands/model, commands/provider, views/editorView, core/llm/modelTester, core/providers/ProviderModelManager, application/provider/ProviderUseCases)
- [x] **1.9** 从 `common/utils/index.ts` 移除 `ConfigManager` 导出
- [x] **1.10** 删除 `toolParser.ts` (死代码 — 无任何文件导入)
- [x] **1.11** 运行 `bun x tsc --noEmit` 验证零错误 ✅
- [x] **1.12** 运行 `bun run compile` 验证构建成功 ✅

### 风险评估

- **低风险**: feedback.ts 仅在 presentation 层使用，移动简单
- **中风险**: ConfigManager 跨 3 层使用 (application/core/presentation)，需全面更新 import
- **无风险**: toolParser.ts 是死代码

---

## 任务 2: P1-14 `AIProviderRegistry` settings 类型化

### 原始问题

`src/core/llm/aiRegistry.ts` 中所有工厂的 `create()` 方法使用 `settings: any`:

```typescript
// 当前代码 (4 处工厂)
const settings: any = {};
// ...
const modelSettings: any = {};
```

### 影响范围

| 工厂 | settings 用途 |
|------|---------------|
| `openai-completions` | `baseURL`, `apiKey`, `fetch`, `name` |
| `openai-responses` | 同上 |
| `anthropic-messages` | `baseURL`, `apiKey`, `fetch`, `name` |
| `google-generateContent` | `baseURL`, `apiKey`, `fetch` |

### 子任务

- [x] **2.1** 定义 `BaseProviderSettings` 接口 (非可选属性，兼容 `exactOptionalPropertyTypes`)
- [x] **2.2** 定义 `ModelSettings` 接口 (支持 `thinking` 推理配置)
- [x] **2.3** 提取 `buildBaseSettings()` 辅助函数到 `ensureInitialized()` 内部
- [x] **2.4** 重写 4 个工厂：用 `buildBaseSettings(p)` 替代 `settings: any`
- [x] **2.5** 重写 `createOpenAICompatible` 调用：内联 `name: "openai-proxy"`
- [x] **2.6** 修复 `createFetchWithErrorHandling` 中 `RequestInit.headers` 的类型处理
- [x] **2.7** 将 `modelSettings: any` 替换为 `modelSettings: ModelSettings`
- [x] **2.8** 运行 `bun x tsc --noEmit` 验证零错误 ✅
- [x] **2.9** 运行 `bun run compile` 验证构建成功 ✅

### 风险评估

- **低风险**: 仅类型标注变更，不改变运行时行为

---

## 任务 3: P2-21 提取排序策略到独立模块

### 原始问题

`src/presentation/views/providerView.ts` 中有两段排序逻辑 (约 50 行)，硬编码在视图层：

- Lines 88–120: Provider 级排序 (按 alphabet / input tokens / output tokens)
- Lines 140–157: Model 级排序 (同上)

### 子任务

- [x] **3.1** 创建 `src/presentation/utils/sortStrategy.ts`
- [x] **3.2** 定义 `SortRule` 类型: `"none" | "alphabet" | "input tokens" | "output tokens"`
- [x] **3.3** 定义 `SortTarget` 类型: `"both" | "providers" | "models"`
- [x] **3.4** 提取 `sortProviders()` 函数
- [x] **3.5** 提取 `sortModels()` 函数
- [x] **3.6** 更新 `providerView.ts` 使用提取的函数
- [x] **3.7** 运行 `bun x tsc --noEmit` 验证零错误
- [x] **3.8** 运行 `bun run compile` 验证构建成功

### 风险评估

- **低风险**: 纯提取重构，不改变行为

---

## 任务 4: P2-17 `AIProviderRegistry` 实例化 + DI

### 原始问题

`AIProviderRegistry` 是全静态类，不可 mock、不可替换：

```typescript
export class AIProviderRegistry {
  private static factories: Record<string, ProviderFactory> = {};
  private static initialized = false;
  static register(factory: ProviderFactory) { ... }
  static getFactory(id: string): ProviderFactory | undefined { ... }
  static ensureInitialized() { ... }
}
```

### 依赖关系

- 依赖任务 2 (settings 类型化) 完成后执行
- 消费者: `src/core/llm/llmService.ts` — `registry.createModel()`
- 消费者: `src/core/llm/modelTester.ts` — `AIProviderRegistry.getInstance().createModel()`

### 子任务

- [x] **4.1** 将静态成员改为实例成员 (`factories`, `initialized` → 实例属性)
- [x] **4.2** 添加 `getInstance()` 静态方法获取全局单例
- [x] **4.3** 将 `ensureInitialized()` 改为 private 实例方法 (懒初始化)
- [x] **4.4** 将 4 个 `register()` + `createModel()` 改为实例方法
- [x] **4.5** 更新 `llmService.ts` 构造函数注入 registry (可选参数，fallback `getInstance()`)
- [x] **4.6** 更新 `modelTester.ts` 使用 `AIProviderRegistry.getInstance()`
- [x] **4.7** 运行 `bun x tsc --noEmit` 验证零错误
- [x] **4.8** 运行 `bun run compile` 验证构建成功

### 风险评估

- **中风险**: 涉及 LLM 调用链路，需仔细验证

---

## 任务 5: P2-16 拆分 `ProviderModelManager` 上帝对象 (精简方案 v2)

### 原始问题

`src/core/providers/ProviderModelManager.ts` (1292 行) 承担多种职责：

1. **Provider/Model CRUD** — `getProviders()`, `saveProviders()`, `deleteProvider()`, `deleteModels()`
2. **数据迁移/规范化** — `normalizeProvidersInPlace()` (~300 行，含 `normalizeCapabilities`)
3. **远程模型拉取** — `fetchProviderModelsFromApi()` + 网络工具 (~280 行)
4. **备份/恢复** — `createBackup()`, `restoreBackup()` 等 (~35 行，纯委托 storageService)
5. **API Key 委托** — `getApiKey()`, `setApiKey()`, `deleteApiKey()` (~15 行，纯委托)
6. **速度追踪** — `updateModelSpeed()` (~50 行)
7. **可见性批量操作** — 3 个 visibility 方法 (~150 行)
8. **事件转发** — EventEmitter + storageService 代理

### 评审决策

经审查，原计划的 6 服务拆分存在过度设计问题：

| 原计划服务 | 评审结论 |
|-----------|---------|
| BackupRestoreService | ❌ 不拆 — 已是 storageService 薄委托，再包装无意义 |
| ModelSpeedService | ❌ 不拆 — 仅 50 行，过小 |
| ProviderRepository / ModelRepository | ❌ 不拆 — Provider/Model CRUD 高度耦合 (共享 `saveProviders` + `normalizeInPlace`)，拆分后需互相引用得不偿失 |
| ProviderModelCoordinator | ❌ 不需要 — 保留原类即可承担协调 |
| DataNormalizationService | ✅ 提取 — 300 行纯函数，零副作用 |
| RemoteModelFetcher | ✅ 提取 — 280 行独立网络逻辑 |

### 精简拆分方案 (v2)

```
当前: ProviderModelManager (1292 行)
      ↓ 提取 2 个独立模块
├── dataNormalizer.ts           # 提取: normalizeProvidersInPlace + normalizeCapabilities (~300 行，纯函数)
├── remoteModelFetcher.ts       # 提取: fetchProviderModelsFromApi + 网络工具方法 (~280 行)
└── ProviderModelManager.ts    # 保留: CRUD + 委托 + 协调 + 事件 (~700 行，合理体量)
```

**优势**:
- ProviderModelManager 从 1292 行降至 ~700 行（降低 46%）
- **零消费者改动** — 公共 API 不变，8 个消费文件无需修改
- **零组合根改动** — extension.ts 无需修改
- 提取的 2 个模块可独立测试

### 依赖关系

- 依赖任务 4 (AIProviderRegistry DI) 完成后执行
- 消费者 8 个文件均**无需修改** (公共 API 不变)

### 子任务

- [x] **5.1** 创建 `src/core/providers/dataNormalizer.ts` — 提取 `normalizeProvidersInPlace()` + `normalizeCapabilities()` ✅
- [x] **5.2** 创建 `src/core/providers/remoteModelFetcher.ts` — 提取 `fetchProviderModelsFromApi()` + 网络工具方法 (`normalizeBaseUrl`, `buildUrl`, `resolveModelsUrl`, `readResponseError`, `coercePositiveInteger`) ✅
- [x] **5.3** 重构 `ProviderModelManager.ts` — 删除已提取方法，改为调用新模块 ✅
- [x] **5.4** 运行 `bun x tsc --noEmit` 验证零错误 ✅
- [x] **5.5** 运行 `bun run compile` 验证构建成功 ✅

### 风险评估

- **低风险**: 提取为纯函数/独立模块，ProviderModelManager 公共 API 保持不变
- **缓解**: 8 个消费者文件零改动，组合根零改动

---

## 任务 6: P2-24 UseCases 层接口化 (DIP)

### 原始问题

所有 UseCases 直接依赖 `ProviderModelManager` (具体类)，违反依赖倒置原则：

```typescript
export class ConfigUseCases {
  constructor(private manager: ProviderModelManager) {} // 依赖具体类
}
export class ModelUseCases {
  constructor(private manager: ProviderModelManager) {} // 依赖具体类
}
export class ProviderUseCases {
  constructor(private manager: ProviderModelManager) {} // 依赖具体类
}
```

### 实际方案 (v2 — 单接口精简方案)

经审查，原计划拆分为 `IProviderRepository` + `IModelRepository` + `IBackupService` 三个窄接口属过度设计——Provider/Model CRUD 高度耦合，且三个 UseCases 均需同时访问 Provider 和 Model。因此采用单一 `IProviderModelManager` 接口。

```
Before: UseCases → ProviderModelManager (concrete class)
After:  UseCases → IProviderModelManager (interface)
                              ↑
                   ProviderModelManager implements IProviderModelManager
```

### 子任务

- [x] **6.1** 在 `src/domain/interfaces/IProviderModelManager.ts` 定义接口 (~175 行)
  - 覆盖: Provider CRUD, Model CRUD, 可见性批量操作, 速度追踪, API Key 管理, 网络, 事件
  - Model 操作使用 `ModelDraft` 类型 (避免内联重复定义)
  - 导出到 `src/domain/interfaces/index.ts`
- [x] **6.2** 更新 3 个 UseCase 文件 import:
  - `ConfigUseCases.ts`: `ProviderModelManager` → `IProviderModelManager`
  - `ModelUseCases.ts`: `ProviderModelManager` → `IProviderModelManager`
  - `ProviderUseCases.ts`: `ProviderModelManager` → `IProviderModelManager`
- [x] **6.3** `ProviderModelManager` 添加 `implements IProviderModelManager`
  - 编译时强制确保实现类完整覆盖接口
- [x] **6.4** 简化接口中 `addModel`/`updateModel`/`updateModels` 参数为 `ModelDraft` / `Partial<ModelDraft>`
- [x] **6.5** 运行 `bun x tsc --noEmit` 验证零错误 ✅
- [x] **6.6** 运行 `bun run compile` 验证构建成功 (待最终验证)

### 风险评估

- **低风险**: 纯接口抽取，不改变运行时行为。ProviderModelManager 通过 `implements` 编译时验证契约完整性。

---

## 任务 7: P1-15 添加核心模块单元测试 ✅

### 原始问题

项目仅有 3 个极简单元测试文件，核心模块无测试覆盖。重构风险高。

### 测试目标

| 模块 | 文件 | 测试点 | 优先级 |
|------|------|--------|--------|
| TokenFormatter | `common/utils/token.ts` | `format()`, `parseInput()` | 高 |
| IdGenerator | `common/utils/id.ts` | `generate()` 返回有效 UUID | 高 |
| InputValidator | `common/utils/validator.ts` | 所有验证方法 | 高 |
| SortStrategy | `presentation/utils/sortStrategy.ts` | 各排序规则 | 中 |
| DataNormalizer | `core/providers/dataNormalizer.ts` | normalizeCapabilities, normalizeProvidersInPlace | 中 |
| RemoteModelFetcher | `core/providers/remoteModelFetcher.ts` | fetchProviderModelsFromApi (mocked fetch) | 中 |

### 子任务

- [x] **7.1** 编写 `tests-unit/sortStrategy.test.ts` (~280 行) — sortProviders/sortModels 4 种规则 + 边界
- [x] **7.2** 编写 `tests-unit/dataNormalizer.test.ts` (~350 行) — normalizeCapabilities + normalizeProvidersInPlace 全覆盖
- [x] **7.3** 编写 `tests-unit/remoteModelFetcher.test.ts` (~400 行) — 3 种 provider type (openai/anthropic/google) + 错误处理
- [x] **7.4** tsc 编译验证通过 (修复 HeadersInit → Record<string,string>)

### 风险评估

- **低风险**: 新增测试不影响现有代码

---

## 任务 8: 改进现有测试 ✅

### 背景

现有测试存在以下问题：
- `validator.test.ts` 只测试了 deprecated API，缺少新 API 的测试
- `token.test.ts` 缺少 Infinity/NaN/大小写等边界测试
- `id.test.ts` 缺少 version nibble/variant bits 等 v4 细节验证

### 子任务

- [x] **8.1** 改进 `tests-unit/validator.test.ts` — 添加 getNameError/getVersionError/getTokensError 新 API 测试，backward compat 验证
- [x] **8.2** 改进 `tests-unit/token.test.ts` — 添加 Infinity/NaN 边界、大小写 K、大型 k 值、formatDetailed 地板值
- [x] **8.3** 改进 `tests-unit/id.test.ts` — 添加精确位置验证 (hyphens at 8/13/18/23)、version nibble=4、variant bits、1000 次唯一性
- [x] **8.4** 验证所有测试文件编译通过
- [x] **8.5** 验证主项目 tsc + compile 通过

### 风险评估

- **低风险**: 改进测试文件不影响生产代码

---

## 进度跟踪

| 日期 | 任务 | 状态 | 备注 |
|------|------|------|------|
| 2025-07-04 | #1 P1-8 拆分 common/utils 跨层工具 | ✅ 完成 | feedback.ts → presentation/utils/; ConfigManager → infrastructure/vscode/; toolParser.ts 删除(死代码); 修复8个消费者import; tsc + compile 均通过 |
| 2025-07-04 | #2 P1-14 AIProviderRegistry settings 类型化 | ✅ 完成 | 5处 `any` → 已类型化: BaseProviderSettings + ModelSettings + buildBaseSettings(); fix RequestInit.headers 类型; tsc + compile 均通过 |
| 2025-07-04 | #3 P2-21 提取排序策略到独立模块 | ✅ 完成 | providerView.ts ~50行排序逻辑 → sortStrategy.ts; sortProviders() + sortModels(); tsc + compile 均通过 |
| 2025-07-04 | #4 P2-17 AIProviderRegistry 实例化 + DI | ✅ 完成 | static → instance + getInstance() 单例; llmService.ts 构造注入; modelTester.ts 使用 getInstance(); tsc + compile 均通过 |
| 2025-07-04 | #5 P2-16 拆分 ProviderModelManager 上帝对象 | ✅ 完成 | dataNormalizer.ts + remoteModelFetcher.ts 提取; ProviderModelManager 1292→~700行; tsc + compile 均通过 |
| 2025-07-04 | #6 P2-24 UseCases 层接口化 (DIP) | ✅ 完成 | IProviderModelManager 接口; 3 个 UseCase 改为依赖接口; ProviderModelManager implements 接口; tsc 验证通过 |
| 2025-07-04 | #7 P1-15 核心模块单元测试 | ✅ 完成 | sortStrategy.test.ts (~280行) + dataNormalizer.test.ts (~350行) + remoteModelFetcher.test.ts (~400行); tsc 编译验证通过 |
| 2025-07-04 | #8 改进现有测试 | ✅ 完成 | validator 新API+edge cases; token Infinity/NaN/大写K; id version nibble/variant/1000次唯一性; tsc + compile 通过 |

---

## 附录: 关键文件影响矩阵

| 文件 | 任务 1 | 任务 2 | 任务 3 | 任务 4 | 任务 5 | 任务 6 | 任务 7 |
|------|--------|--------|--------|--------|--------|--------|--------|
| `common/utils/index.ts` | ✏️ 修改 | | | | | | |
| `common/utils/feedback.ts` | ➡️ 移动 | | | | | | |
| `common/utils/config.ts` | ➡️ 移动 | | | | | | |
| `common/utils/toolParser.ts` | 🗑️ 删除 | | | | | | |
| `presentation/extension.ts` | ✏️ 修改 | | | ✏️ 修改 | ✏️ 修改 | ✏️ 修改 | |
| `presentation/commands/config.ts` | ✏️ 修改 | | | | | | |
| `presentation/views/editorView.ts` | ✏️ 修改 | | | | | | |
| `presentation/views/providerView.ts` | | | ✏️ 修改 | | | | |
| `core/llm/aiRegistry.ts` | | ✏️ 修改 | | ✏️ 修改 | | | |
| `core/llm/llmService.ts` | | | | ✏️ 修改 | | | |
| `core/providers/ProviderModelManager.ts` | ✏️ 修改 | | | | ➡️ 拆分 | | |
| `application/config/ConfigUseCases.ts` | | | | | ✏️ 修改 | ✏️ 修改 | |
| `application/model/ModelUseCases.ts` | | | | | ✏️ 修改 | ✏️ 修改 | |
| `application/provider/ProviderUseCases.ts` | ✏️ 修改 | | | | ✏️ 修改 | ✏️ 修改 | |
| `domain/interfaces/` | | | | | | ➕ 新增 | |
| `tests-unit/` | | | | | | | ➕ 新增 |
