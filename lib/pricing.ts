export type DiscountType = "NONE" | "PERCENTAGE" | "FIXED";
export type DiscountInput = { discount_type?: unknown; discount_value?: unknown; discount?: unknown };

// Parse decimal text before doing arithmetic; never multiply binary floats for money.
function scaled(value: unknown, places: number): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Enter a valid non-negative amount.");
  const text = String(value).trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text)) throw new Error(`Enter a non-negative value with at most ${places} decimal places.`);
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * BigInt(10 ** places) + BigInt(fraction.padEnd(places, "0"));
  if (result > BigInt("999999999999")) throw new Error("Amount is too large.");
  return result;
}

export function moneyAmount(value: unknown): number {
  return Number(scaled(value, 2)) / 100;
}

export function lineAmount(price: unknown, quantity: unknown): number {
  const cents = (scaled(price, 2) * scaled(quantity, 3) + BigInt(500)) / BigInt(1000);
  return moneyAmount((Number(cents) / 100).toFixed(2));
}

export function sumAmounts(values: number[]): number {
  return moneyAmount((Number(values.reduce((sum, value) => sum + scaled(value.toFixed(2), 2), BigInt(0))) / 100).toFixed(2));
}

export function calculatePricing(subtotalInput: unknown, input: DiscountInput = {}) {
  const subtotalCents = scaled(subtotalInput, 2);
  const explicit = input.discount_type !== undefined || input.discount_value !== undefined;
  if (explicit && input.discount !== undefined) throw new Error("Send discount type and value, or the legacy discount, not both.");
  const type = explicit ? input.discount_type : input.discount === undefined ? "NONE" : "FIXED";
  if (type !== "NONE" && type !== "PERCENTAGE" && type !== "FIXED") throw new Error("Choose a valid discount type.");
  const valueCents = scaled(explicit ? (input.discount_value === undefined && type === "NONE" ? 0 : input.discount_value) : (input.discount === undefined ? 0 : input.discount), 2);
  if (type === "NONE" && valueCents !== BigInt(0)) throw new Error("No discount must have a zero value.");
  if (type === "PERCENTAGE" && valueCents > BigInt(10000)) throw new Error("Percentage must be between 0 and 100.");
  const discountCents = type === "PERCENTAGE"
    ? (subtotalCents * valueCents + BigInt(5000)) / BigInt(10000)
    : type === "FIXED" ? valueCents : BigInt(0);
  if (discountCents > subtotalCents) throw new Error("Discount cannot exceed the subtotal.");
  return { subtotal: Number(subtotalCents) / 100, discount_type: type as DiscountType, discount_value: Number(valueCents) / 100, discount: Number(discountCents) / 100, total: Number(subtotalCents - discountCents) / 100 };
}

export function previewPricing(subtotal: number, type: DiscountType, value: string) {
  try { return { ...calculatePricing(subtotal.toFixed(2), { discount_type: type, discount_value: value }), error: "" }; }
  catch (error) { return { subtotal, discount_type: type, discount_value: 0, discount: 0, total: subtotal, error: error instanceof Error ? error.message : "Invalid discount." }; }
}

export function discountLabel(type?: string, value?: string | number) {
  return type === "PERCENTAGE" ? `Discount (${Number(value)}%)` : "Discount (LKR)";
}
