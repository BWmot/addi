import { TokenFormatter } from "./token";

/**
 * Input Validator
 *
 * Validation methods return `null` when valid, or an error message string when invalid.
 * Use `if (InputValidator.getNameError(name))` to check for errors (truthy = error).
 */
export class InputValidator {
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
    return TokenFormatter.parse(value) ? null : "Token count must be a positive integer";
  }
}
