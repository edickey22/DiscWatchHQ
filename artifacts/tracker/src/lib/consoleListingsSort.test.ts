import { describe, expect, it } from "vitest"
import { sortConsoleListings, type SortableListing } from "./consoleListingsSort"

interface TestListing extends SortableListing {
  id: string
}

const listing = (id: string, price: number, endsAt?: number | null): TestListing => ({
  id,
  price,
  endsAt,
})

describe("sortConsoleListings", () => {
  const listings: TestListing[] = [
    listing("c", 150, 5_000),   // ends soonest
    listing("a", 300, null),    // fixed price, no end time
    listing("d", 100, 20_000),  // ends later
    listing("b", 200),          // endsAt omitted entirely (fixed price)
  ]

  it("featured: preserves original order and returns the same array reference", () => {
    const result = sortConsoleListings(listings, "featured")
    expect(result).toBe(listings)
    expect(result.map(l => l.id)).toEqual(["c", "a", "d", "b"])
  })

  it("price-asc: sorts by price ascending", () => {
    const result = sortConsoleListings(listings, "price-asc")
    expect(result.map(l => l.id)).toEqual(["d", "c", "b", "a"])
    expect(result.map(l => l.price)).toEqual([100, 150, 200, 300])
  })

  it("price-desc: sorts by price descending", () => {
    const result = sortConsoleListings(listings, "price-desc")
    expect(result.map(l => l.id)).toEqual(["a", "b", "c", "d"])
    expect(result.map(l => l.price)).toEqual([300, 200, 150, 100])
  })

  it("ending-soon: sorts auctions by soonest endsAt first, sinks listings with no end time to the bottom", () => {
    const result = sortConsoleListings(listings, "ending-soon")
    // c (5000) then d (20000) — both have real endsAt, soonest first.
    // a (null) and b (undefined) have no urgency signal, so they land after,
    // in their original relative order (a before b).
    expect(result.map(l => l.id)).toEqual(["c", "d", "a", "b"])
  })

  it("ending-soon: all listings without an end time keep their relative order", () => {
    const noEndTimes = [listing("x", 10), listing("y", 20, null), listing("z", 5)]
    const result = sortConsoleListings(noEndTimes, "ending-soon")
    expect(result.map(l => l.id)).toEqual(["x", "y", "z"])
  })

  it("does not mutate the input array for any non-featured sort", () => {
    const original = [...listings]
    sortConsoleListings(listings, "price-asc")
    sortConsoleListings(listings, "price-desc")
    sortConsoleListings(listings, "ending-soon")
    expect(listings).toEqual(original)
  })

  it("handles an empty list without throwing", () => {
    expect(sortConsoleListings([], "price-asc")).toEqual([])
    expect(sortConsoleListings([], "ending-soon")).toEqual([])
  })
})
