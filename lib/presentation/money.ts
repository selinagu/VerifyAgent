export function formatMoney(priceCents: number | null | undefined, currency = "USD"): string {
  if (!Number.isInteger(priceCents) || priceCents === null || priceCents === undefined || priceCents < 0) return "Not priced";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
}
