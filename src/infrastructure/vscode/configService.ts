import * as vscode from "vscode";

/**
 * VS Code 配置管理器
 */
export class ConfigManager {
  static getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("addi");
  }

  static getDefaultMaxInputTokens(): number {
    return ConfigManager.getConfiguration().get<number>(
      "defaultMaxInputTokens",
      80000,
    );
  }

  static getDefaultMaxOutputTokens(): number {
    return ConfigManager.getConfiguration().get<number>(
      "defaultMaxOutputTokens",
      4096,
    );
  }

  static getDefaultModelFamily(): string {
    return "addi"; // 目前默认值写死为 'addi'，但不允许用户设置中编辑
  }

  static getDefaultModelVersion(): string {
    return "1.0.0"; // 目前默认值写死为 '1.0.0'，后续可以改为从配置项获取
  }

  static getConfirmDelete(): boolean {
    return ConfigManager.getConfiguration().get<boolean>("confirmDelete", true);
  }
}
