/**
 * Indexing the /api/stack payload by layer key.
 *
 * The payload holds thirteen equity layers alongside four correlation fields
 * that are not equity rows: correlation, correlationCoeff, cegCorrelationCoeff
 * and correlationMeta. Layer config supplies its key as a plain string, so every
 * read site reached for `(data as any)[layer.key] as StockData[]`.
 *
 * That cast is not cosmetic. Indexed with "correlation" it hands back
 * CorrelationPoint[] typed as StockData[], and every field read off those rows
 * is undefined with nothing to catch it. Same failure as reading a cluster's
 * location as a string when it is an object.
 *
 * An unrecognised key returns no rows rather than whatever happens to sit at
 * that property.
 */

/** The keys that carry equity rows. Correlation fields are deliberately absent. */
export const STACK_LAYER_KEYS = [
  "compute",
  "nuclear",
  "uranium",
  "powerHardware",
  "utilities",
  "dataCenters",
  "construction",
  "rawMaterialsMining",
  "rawMaterialsNatGas",
  "renewableGeneration",
  "transmissionGrid",
  "cryptoAIDC",
  "etfsBenchmarks",
] as const;

export type StackLayerKey = (typeof STACK_LAYER_KEYS)[number];

export function isStackLayerKey(key: string): key is StackLayerKey {
  return (STACK_LAYER_KEYS as readonly string[]).includes(key);
}

/**
 * Equity rows for one layer. Empty when the payload has not arrived, when the
 * layer is absent, or when the key is not an equity layer at all.
 */
export function layerRows<T>(
  data: Partial<Record<StackLayerKey, T[]>> | undefined | null,
  key: string,
): T[] {
  if (!data || !isStackLayerKey(key)) return [];
  const rows = data[key];
  return Array.isArray(rows) ? rows : [];
}
