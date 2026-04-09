export type CurrencyGrouping = "standard" | "indian" | "none";
export type ThousandSeparator = "," | "." | " " | "'" | "none";
export type DecimalSeparator = "." | ",";
export type CurrencyPosition = "prefix" | "suffix";

export interface CurrencyPreset {
  symbol: string;
  position: CurrencyPosition;
  hasSpace: boolean;
  thousandSeparator: ThousandSeparator;
  decimalSeparator: DecimalSeparator;
  grouping: CurrencyGrouping;
  decimalPlaces: number;
}

export const CURRENCY_PRESETS: Record<string, CurrencyPreset> = {
  "$": {
    symbol: "$",
    position: "prefix",
    hasSpace: false,
    thousandSeparator: ",",
    decimalSeparator: ".",
    grouping: "standard",
    decimalPlaces: 2,
  },
  "€": {
    symbol: "€",
    position: "prefix",
    hasSpace: true,
    thousandSeparator: ".",
    decimalSeparator: ",",
    grouping: "standard",
    decimalPlaces: 2,
  },
  "£": {
    symbol: "£",
    position: "prefix",
    hasSpace: false,
    thousandSeparator: ",",
    decimalSeparator: ".",
    grouping: "standard",
    decimalPlaces: 2,
  },
  "₹": {
    symbol: "₹",
    position: "prefix",
    hasSpace: false,
    thousandSeparator: ",",
    decimalSeparator: ".",
    grouping: "indian",
    decimalPlaces: 2,
  },
  "৳": {
    symbol: "৳",
    position: "prefix",
    hasSpace: false,
    thousandSeparator: ",",
    decimalSeparator: ".",
    grouping: "indian",
    decimalPlaces: 2,
  },
  "¥": {
    symbol: "¥",
    position: "prefix",
    hasSpace: false,
    thousandSeparator: ",",
    decimalSeparator: ".",
    grouping: "standard",
    decimalPlaces: 0,
  },
  "₽": {
    symbol: "₽",
    position: "suffix",
    hasSpace: true,
    thousandSeparator: " ",
    decimalSeparator: ",",
    grouping: "standard",
    decimalPlaces: 2,
  },
  "CHF": {
    symbol: "CHF",
    position: "prefix",
    hasSpace: true,
    thousandSeparator: "'",
    decimalSeparator: ".",
    grouping: "standard",
    decimalPlaces: 2,
  },
};

export const COMMON_SYMBOLS = ["$", "€", "£", "¥", "₹", "৳", "₽", "CHF", "د.إ", "kr"];
