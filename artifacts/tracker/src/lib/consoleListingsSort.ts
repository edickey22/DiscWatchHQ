/**
 * Sorting for the Console detail page's live listing grid. Pure/stateless
 * so it's trivially unit-testable without spinning up React or the API.
 *
 * "Featured" is a no-op — it preserves whatever order the API returned
 * (eBay's own relevance ranking, passed through by the scheduler cache).
 */

export type ConsoleSortValue = "featured" | "price-asc" | "price-desc" | "ending-soon"

export const CONSOLE_SORT_OPTIONS: { value: ConsoleSortValue; label: string }[] = [
  { value: "featured",     label: "Featured" },
  { value: "price-asc",    label: "Price: Low to High" },
  { value: "price-desc",   label: "Price: High to Low" },
  { value: "ending-soon",  label: "Ending Soon" },
]

export interface SortableListing {
  price:   number
  endsAt?: number | null
}

/**
 * Returns a new sorted array — never mutates the input. "Featured" returns
 * the same array reference so callers can skip re-rendering when nothing
 * changed.
 *
 * "Ending soon" ranks by soonest `endsAt` first. Listings with no end time
 * (fixed-price/Buy-It-Now, non-auction) have no urgency signal, so they're
 * sunk to the bottom, in their original relative order.
 */
export function sortConsoleListings<T extends SortableListing>(
  listings: readonly T[],
  sortBy:   ConsoleSortValue,
): T[] {
  if (sortBy === "featured") return listings as T[]

  const copy = [...listings]

  switch (sortBy) {
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price)
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price)
    case "ending-soon":
      return copy.sort((a, b) => {
        const aEnds = a.endsAt ?? null
        const bEnds = b.endsAt ?? null
        if (aEnds == null && bEnds == null) return 0
        if (aEnds == null) return 1
        if (bEnds == null) return -1
        return aEnds - bEnds
      })
    default:
      return copy
  }
}
