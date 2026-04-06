import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number, 
  symbol: string = "৳", 
  position: "prefix" | "suffix" = "prefix",
  hasSpace: boolean = false
) {
  // Use en-IN for Indian/Bengali number formatting (lakhs/crores) if needed, 
  // or en-US for standard. The project seems to use en-IN for Taka.
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  const sign = amount < 0 ? "-" : "";
  const space = hasSpace ? " " : "";

  if (position === "prefix") {
    // Result like: -$1,234.56 or -$ 1,234.56
    return `${sign}${symbol}${space}${formatted}`;
  }
  // Result like: -1,234.56৳ or -1,234.56 ৳
  return `${sign}${formatted}${space}${symbol}`;
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
