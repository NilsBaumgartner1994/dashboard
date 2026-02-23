import { StringHelper } from './StringHelper';

export class NumberHelper {
  // Improved version of toFixedNoRounding
  static toFixedNoRounding(number: number, fractions: number): string {
    const strNumber = number.toString();
    const dotIndex = strNumber.indexOf('.');
    if (dotIndex === -1) {
      // integer, insert decimal dot and pad up zeros
      return strNumber + '.' + '0'.repeat(fractions);
    }
    const integerPart = strNumber.slice(0, dotIndex);
    const fractionalPart = strNumber.slice(dotIndex + 1);
    const truncatedFraction = fractionalPart.slice(0, fractions); // truncate to the required fractions
    const additionalZeros = '0'.repeat(fractions - truncatedFraction.length);
    return `${integerPart}.${truncatedFraction}${additionalZeros}`;
  }

  // Improved version of formatNumber with clear logic and less redundancy
  static formatNumber(value: number | null | undefined, unit: string | null | undefined, roundUpOrDown: boolean, fractionsSeparator: string = ',', thousandsSeparator: string | null = null, amountDecimals: number = 2): string {
    // Return early if value is null or undefined
    if (value == null) {
      return `?${unit ? StringHelper.NONBREAKING_SPACE + unit : ''}`;
    }

    // Handle rounding based on roundUpOrDown flag
    let formattedValue = roundUpOrDown ? value.toFixed(amountDecimals) : NumberHelper.toFixedNoRounding(value, amountDecimals);

    // Replace dot with fractions separator
    formattedValue = formattedValue.replace('.', fractionsSeparator);

    // Format thousands separators if necessary
    if (thousandsSeparator) {
      const [integerPart, fractionPart] = formattedValue.split(fractionsSeparator);
      if (!integerPart) {
        formattedValue = `0${fractionsSeparator}${fractionPart || ''}`;
      } else {
        const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
        formattedValue = fractionPart ? `${formattedInteger}${fractionsSeparator}${fractionPart}` : formattedInteger;
      }
    }

    // Add unit suffix if provided
    const suffix = unit ? StringHelper.NONBREAKING_SPACE + unit : '';
    return formattedValue + suffix;
  }
}
