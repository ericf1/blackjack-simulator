/**
 * Money formatters (cents in, dollars out). Shared by the strip, the tray,
 * and the Session chart so every amount on the page reads the same.
 */
export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moneyWhole = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;