import * as vscode from 'vscode';

/**
 * VS Code 配置管理器
 */
export class ConfigManager {
  static getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('addi');
  }

  static getDefaultMaxInputTokens(): number {
    return this.getConfiguration().get<number>('defaultMaxInputTokens', 60000);
  }

  static getDefaultMaxOutputTokens(): number {
    return this.getConfiguration().get<number>('defaultMaxOutputTokens', 80000);
  }

  static getDefaultModelFamily(): string {
    return 'Addi';
  }

  static getDefaultModelVersion(): string {
    return '';
  }

  static getConfirmDelete(): boolean {
    return this.getConfiguration().get<boolean>('confirmDelete', true);
  }
}
