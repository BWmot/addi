import { TokenFormatter } from "./token";

/**
 * 输入验证器
 *
 * Validation methods return `null` when valid, or an error message string when invalid.
 * Use `if (InputValidator.validateName(name))` to check for errors (truthy = error).
 */
export class InputValidator {
  /**
   * Validate a name field. Returns error message if invalid, null if valid.
   * @deprecated Use `getNameError` for clearer intent
   */
  static validateName(name: string): string | null {
    return InputValidator.getNameError(name);
  }

  /**
   * Validate a version field. Returns error message if invalid, null if valid.
   * @deprecated Use `getVersionError` for clearer intent
   */
  static validateVersion(version: string): string | null {
    return InputValidator.getVersionError(version);
  }

  /**
   * Validate a token count field. Returns error message if invalid, null if valid.
   * @deprecated Use `getTokensError` for clearer intent
   */
  static validateTokens(value: string): string | null {
    return InputValidator.getTokensError(value);
  }

  /** Returns an error message if name is invalid, null if valid. */
  static getNameError(name: string): string | null {
    return name.trim().length > 0 ? null : "Name cannot be empty";
  }

  /** Returns an error message if version is invalid, null if valid. */
  static getVersionError(version: string): string | null {
    return /^\d+(\.\d+){0,2}$/.test(version)
      ? null
      : "Version format is invalid, it should consist of numbers and dots";
  }

  /** Returns an error message if token value is invalid, null if valid. */
  static getTokensError(value: string): string | null {
    return TokenFormatter.parse(value)
      ? null
      : "Token count must be a positive integer";
  }
}
