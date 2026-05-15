# Webview UI 迁移至 React 前端架构计划

## 1. 背景与动机

随着为各个模型和供应商（尤其是推理思维链、高级 Provider Options 注入等）添加了越来越复杂的配置选项，当前的 Webview UI 实现 (`resources/editor.html`) 已经膨胀到约 1500 行，面临着以下严重的可维护性挑战：

- **手动 DOM 操作频繁**：通过 `getElementById` 和 `addEventListener` 频繁读写 DOM 节点，容易遗漏和出错。
- **作用域风险**：单文件内的 JavaScript 作用域混乱（如近期因为 JS 声明顺序问题导致的执行中断和白屏），难以进行静态检查。
- **状态难以同步**：接收到 `updateContent` 或 `updateFields` 消息时，需要手动将海量字段一一映射到表单中；当用户修改时又需要手动组装巨大的 JSON Payload 发送给插件本体。

因此，为了保证 Addi 未来的可扩展性，我们计划将 Webview UI 迁移至模块化、现代化的 **React 18 + TypeScript + Vite** 前端生态中。

## 2. 技术架构选型

- **框架**: `React 18` + `TypeScript`
- **构建工具**: `Vite`
- **UI 组件库方案**: **原生 HTML 组件 + VS Code 全局 CSS 变量**
  - _注：我们已明确放弃 `@vscode/webview-ui-toolkit`（官方库已于2025年初归档，陷入停止维护状态，且封装存在较多受限黑盒）。_
  - Addi 现存的 CSS 已经是一套完全符合 VS Code Token 规范的样式库，Webview 运行时 VS Code 会自动将所有 CSS 变量（如 `var(--vscode-button-background)`）注入 `<html>`。直接复用现在的 CSS 类名加标准 HTML 标签，包体积最小、性能最好。
- **状态及通信管理**: 基于 `React Hooks` 再次封装 `acquireVsCodeApi()` 实现基于数驱动的双向互通。
- **打包策略**: 通过 Vite 配置去除文件哈希后缀，构建产出固定的 `index.js` 和 `index.css` 以便宿主无缝加载。

## 3. 分段落地实施计划 (Phases)

### Phase 1: 基础设施搭建 (Scaffolding & Setup)

在项目根目录新建内嵌前端工程。

1. 使用 `bun create vite webview-ui --template react-ts` 初始化前端项目。
2. 修改 `webview-ui/vite.config.ts`：
   - 禁用文件名哈希（`entryFileNames: 'assets/index.js'`）。
   - 将输出目录直接定位到 `../resources/webview`。
3. 清理不需要的模板代码，配置 TypeScript 支持。

### Phase 2: VS Code 桥接层封装 (State & Message Bridge)

抽象 Webview 与 VS Code Extension 后台的通信逻辑。

1. 创建 `src/hooks/useVscode.ts` 通信拦截层。
2. 封装 `postMessage` 向插件侧发送保存/校验事件。
3. 封装 `useVscodeMessage<T>` 监听插件载入/更新事件。使得各级子组件能像 Redux 一样随时订阅最新 Payload 不必层层传递 Props。

### Phase 3: UI 拆分与迁移 (Component Migration)

彻底搬迁现在的 `editor.html`。

1. 将 `resources/editor.html` 中的 600 余行 CSS 迁移至 `webview-ui/src/index.css`。
2. 将原本复杂的 HTML 表块拆解至不同组件：
   - `App.tsx`: 顶级路由守卫，控制空态、Provider 态还是 Model 态展现。
   - `components/ProviderForm.tsx`: 供应商的专门设置表单。
   - `components/ModelForm.tsx`: 模型的专门表单及其内部复杂的 Reasoning、Vision 联动。
   - `components/FormItems.tsx`: 复用性极高的带有 Info Tooltip 的 Input/Checkbox 组合组件。

### Phase 4: 宿主 Extension 侧整合 (Extension Integration)

调整 Node.js 工程侧相关逻辑，指向新产物。

1. 修改 `src/presentation/views/editorView.ts`：
   - 删减原本巨量内联的 HTML 字符串。
   - 利用 `webview.asWebviewUri` 注入 `resources/webview/assets/index.js` 和 `index.css`。
   - 设置严格的 `Content-Security-Policy (CSP)` 保障扩展安全，仅放行指定 script 并阻止 `unsafe-inline`。
2. 调整顶层 `scripts/build.ts`：
   - 完善统一构建流：在执行 `vsce package` 前，自动下沉至 `webview-ui/` 执行 `bunx vite build`。

## 4. 预期收益

- **开发降本增效**：JSX 数据驱动，双向绑定极大地简化表单存储及更新逻辑。
- **高稳定与强类型**：得益于 TypeScript 支持，与后端保持类型一致（直接 Import `ProviderConfig` 和 `ModelConfig` 定义），避免运行时因为取错属性导致的致命报错白屏。
- **扩展性增强**：后续面对例如 Function Calls 自定义插件配置、更多的 Reasoning UI 定制场景时，只需引入更清晰细粒度的可复用 React Components。
