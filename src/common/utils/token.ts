/**
 * Token 格式化工具
 */
export class TokenFormatter {
  private static readonly LIMIT = 1000 * 1000 * 4;
  private static readonly MULTIPLIERS: Record<string, number> = {
    k: 1000,
  };

  static parse(input: string | number | undefined | null): number | undefined {
    if (input === undefined || input === null) {
      return undefined;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input) || input <= 0) {
        return undefined;
      }
      return Math.floor(input);
    }
    const trimmed = input
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '');
    if (!trimmed) {
      return undefined;
    }
    const match = /^([0-9]+(?:\.[0-9]+)?)([k]?)$/.exec(trimmed);
    if (!match) {
      return undefined;
    }
    const base = Number(match[1]);
    if (!Number.isFinite(base) || base <= 0) {
      return undefined;
    }
    const suffix = match[2];
    if (suffix && !(suffix in this.MULTIPLIERS)) {
      return undefined;
    }
    const multiplier = suffix ? this.MULTIPLIERS[suffix]! : 1;
    const value = Math.round(base * multiplier);
    if (!Number.isFinite(value) || value <= 0) {
      return undefined;
    }
    return Math.min(value, this.LIMIT);
  }

  static format(value: number | undefined): string {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
      return '';
    }
    const formatNum = (n: number) => {
      return Number.isInteger(n)
        ? n.toString()
        : n
            .toFixed(n >= 10 ? 1 : 2)
            .replace(/\.0+$/, '')
            .replace(/\.([0-9]*[1-9])0+$/, '.$1');
    };

    if (value >= 1000) {
      return `${formatNum(value / 1000)}k`;
    }
    return Math.floor(value).toString();
  }

  static formatDetailed(value: number | undefined): string {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
      return '';
    }
    const raw = Math.floor(value).toString();
    const friendly = this.format(value);
    if (!friendly || friendly === raw) {
      return raw;
    }
    return `${raw} (${friendly})`;
  }
}
