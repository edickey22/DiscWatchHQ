import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { trackSearchEvent } from "./analytics"

describe("trackSearchEvent", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete window.gtag
    // @ts-expect-error test cleanup
    delete (globalThis as Record<string, unknown>).gtag
    vi.restoreAllMocks()
  })

  it("calls window.gtag with the actual search term when exposed as window.gtag", () => {
    const spy = vi.fn()
    // @ts-expect-error assigning test double
    window.gtag = spy

    trackSearchEvent("zelda")

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("event", "search", { search_term: "zelda" })
  })

  it("calls gtag with the actual search term when only exposed as a bare global", () => {
    const spy = vi.fn()
    ;(globalThis as Record<string, unknown>).gtag = spy

    trackSearchEvent("mario kart")

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith("event", "search", { search_term: "mario kart" })
  })

  it("trims the search term before sending", () => {
    const spy = vi.fn()
    // @ts-expect-error assigning test double
    window.gtag = spy

    trackSearchEvent("  final fantasy  ")

    expect(spy).toHaveBeenCalledWith("event", "search", { search_term: "final fantasy" })
  })

  it("does not send an event for a blank search term", () => {
    const spy = vi.fn()
    // @ts-expect-error assigning test double
    window.gtag = spy

    trackSearchEvent("")
    trackSearchEvent("   ")

    expect(spy).not.toHaveBeenCalled()
  })

  it("does not throw when gtag is unavailable", () => {
    expect(() => trackSearchEvent("zelda")).not.toThrow()
  })
})
