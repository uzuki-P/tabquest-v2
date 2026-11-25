/**
 * Cloudflare D1 query safety helpers.
 *
 * Cloudflare D1 enforces a hard limit of 100 bound SQL parameters per query
 * (much lower than desktop SQLite's 32,766). Leaving headroom at 80 ensures
 * extra WHERE/LIMIT parameters never push a chunked query over the limit.
 */
export const D1_MAX_BIND_PARAMS = 80

/**
 * Splits a list of items into chunks that stay within D1's bound-parameter
 * limit. Pass `paramsPerItem` > 1 for multi-column bulk INSERTs.
 */
export function chunkForD1<T>(
  items: readonly T[],
  paramsPerItem = 1,
  maxBindParams = D1_MAX_BIND_PARAMS
): T[][] {
  if (items.length === 0) return []
  const perItem = Math.max(1, Math.floor(paramsPerItem))
  const chunkSize = Math.max(1, Math.floor(maxBindParams / perItem))
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}
