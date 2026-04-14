import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number, 
  symbol: string = "৳", 
  position: "prefix" | "suffix" = "prefix",
  hasSpace: boolean = false,
  thousandSeparator: string = ",",
  decimalSeparator: string = ".",
  grouping: "standard" | "indian" | "none" = "standard",
  decimalPlaces: number = 2
) {
  const sign = amount < 0 ? "-" : "";
  const absAmount = Math.abs(amount);
  
  // Format the number part
  let parts = absAmount.toFixed(decimalPlaces).split(".");
  let integerPart = parts[0];
  let fractionalPart = parts[1] || "";

  let formattedInteger = "";
  if (grouping === "none") {
    formattedInteger = integerPart;
  } else if (grouping === "indian") {
    // Indian: last 3 digits, then groups of 2 (thousands, lakhs, crores)
    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherDigits = integerPart.substring(0, integerPart.length - 3);
    if (otherDigits !== "" && otherDigits !== "-") {
      lastThree = "," + lastThree;
    }
    const res = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
    formattedInteger = res;
  } else {
    // Standard: groups of 3
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Replace default comma with the chosen thousand separator
  if (thousandSeparator !== ",") {
    const sep = thousandSeparator === "none" ? "" : thousandSeparator;
    formattedInteger = formattedInteger.split(",").join(sep);
  }

  let result = formattedInteger;
  if (decimalPlaces > 0) {
    result += decimalSeparator + fractionalPart;
  }

  const space = hasSpace ? " " : "";

  if (position === "prefix") {
    return `${sign}${symbol}${space}${result}`;
  }
  return `${sign}${result}${space}${symbol}`;
}

/**
 * Coerce any date string to a plain YYYY-MM-DD (10 chars, no time component).
 * This ensures journals are grouped by calendar date, not by timestamp.
 */
export function normalizeDate(date: string): string {
  return date.slice(0, 10);
}

/**
 * Convert a decimal currency value (e.g. 12.50) to an integer minor-unit
 * (e.g. 1250 paisa/cents). Accepts both numbers and numeric strings.
 * Always returns a positive integer; callers set the sign for debit/credit.
 */
export function normalizeAmount(amount: number | string): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")     // Replace spaces with -
    .replace(/[^\w-]+/g, "")  // Remove all non-word chars
    .replace(/--+/g, "-")     // Replace multiple - with single -
    .replace(/^-+/, "")       // Trim - from start of text
    .replace(/-+$/, "");      // Trim - from end of text
}
