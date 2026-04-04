import { TokenFormatter } from './token';

/**
 * 输入验证器
 */
export class InputValidator {
  static validateName(name: string): string | null {
    return name.trim().length > 0 ? null : 'Name cannot be empty';
  }

  static validateVersion(version: string): string | null {
    // Match semantic version format: major.minor.patch (max 3 parts)
    return /^\d+(\.\d+){0,2}$/.test(version)
      ? null
      : 'Version format is invalid, it should consist of numbers and dots';
  }

  static validateTokens(value: string): string | null {
    return TokenFormatter.parse(value) ? null : 'Token count must be a positive integer';
  }
}
