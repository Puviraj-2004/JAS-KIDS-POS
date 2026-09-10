const QR_HASH_PATTERN = /^[A-Za-z0-9_-]{4,200}$/;

export function extractQrHash(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const candidate = url.searchParams.get("qr_hash") ?? url.searchParams.get("ref");
    const normalized = candidate?.trim() ?? "";
    return QR_HASH_PATTERN.test(normalized) ? normalized : null;
  } catch {
    return QR_HASH_PATTERN.test(value) ? value : null;
  }
}
