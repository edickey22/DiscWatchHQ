/**
 * useDocumentHead — injects dynamic <title>, <meta>, <link rel="canonical">,
 * and JSON-LD schema.org markup into document.head for each page/route.
 *
 * Approach: snapshot the entire head state before any mutations, then fully
 * restore it on unmount. This is more reliable than tracking individual tags
 * because it handles both "restore old value" and "remove newly added tag"
 * cases without per-tag bookkeeping.
 *
 * Googlebot executes JavaScript on React SPAs, so client-side head injection
 * is correctly indexed. Each page component calls this hook once to give every
 * URL unique, crawlable metadata rather than repeating the same index.html string.
 */

import { useEffect, useRef } from "react"

const SITE_NAME     = "DiscWatchHQ"
const DEFAULT_TITLE = "DiscWatchHQ — Limited-Run Game Tracker"
const DEFAULT_DESC  = "Track limited-run physical video games across boutique publishers. See what's available now, coming soon, and recently sold out."

export interface DocumentHeadOptions {
  title:       string
  description: string
  canonical?:  string
  jsonLd?:     Record<string, unknown> | null
  ogType?:     string
  ogImage?:    string | null
}

// ── Snapshot / restore helpers ────────────────────────────────────────────────

interface MetaSnapshot {
  selector:  string
  attrKey:   string
  attrVal:   string
  prevContent: string | null   // null = element didn't exist before
}

interface HeadSnapshot {
  title:     string
  metas:     MetaSnapshot[]
  canonical: string | null     // null = no canonical link existed
  jsonLd:    string | null     // null = no JSON-LD script existed
}

function snapshotMeta(selector: string): MetaSnapshot | null {
  const el = document.querySelector<HTMLMetaElement>(selector)
  if (!el) return null
  return { selector, attrKey: "", attrVal: "", prevContent: el.content }
}

function upsertMeta(nameAttr: string, nameVal: string, content: string): void {
  const selector = `meta[${nameAttr}="${nameVal}"]`
  let el = document.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement("meta") as HTMLMetaElement
    el.setAttribute(nameAttr, nameVal)
    document.head.appendChild(el)
  }
  el.content = content
}

function removeMeta(nameAttr: string, nameVal: string): void {
  document.querySelector(`meta[${nameAttr}="${nameVal}"]`)?.remove()
}

function getMetaContent(nameAttr: string, nameVal: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[${nameAttr}="${nameVal}"]`)?.content ?? null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDocumentHead({
  title,
  description,
  canonical,
  jsonLd,
  ogType  = "website",
  ogImage = null,
}: DocumentHeadOptions) {
  // Stable reference to the serialised options — prevents stale-closure bugs
  // in cleanup while avoiding expensive re-runs on object identity changes.
  const optsJson = JSON.stringify({ title, description, canonical, ogType, ogImage, jsonLd })

  // Snapshot captured once when the effect first fires (not on re-runs)
  const snapshot = useRef<HeadSnapshot | null>(null)

  useEffect(() => {
    // ── 1. Capture snapshot of current head state ──────────────────────────
    snapshot.current = {
      title:     document.title,
      canonical: document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ?? null,
      jsonLd:    (document.getElementById("json-ld-schema") as HTMLScriptElement | null)?.text ?? null,
      metas: [
        { selector: "name",     val: "description"            },
        { selector: "property", val: "og:title"               },
        { selector: "property", val: "og:description"         },
        { selector: "property", val: "og:type"                },
        { selector: "property", val: "og:site_name"           },
        { selector: "property", val: "og:url"                 },
        { selector: "property", val: "og:image"               },
        { selector: "name",     val: "twitter:title"          },
        { selector: "name",     val: "twitter:description"    },
        { selector: "name",     val: "twitter:image"          },
        { selector: "name",     val: "twitter:card"           },
      ].map(({ selector, val }) => ({
        selector, attrKey: selector, attrVal: val,
        prevContent: getMetaContent(selector, val),
      })),
    }

    // ── 2. Inject new values ───────────────────────────────────────────────
    const opts = JSON.parse(optsJson) as DocumentHeadOptions

    document.title = opts.title

    upsertMeta("name",     "description",         opts.description)
    upsertMeta("property", "og:title",             opts.title)
    upsertMeta("property", "og:description",       opts.description)
    upsertMeta("property", "og:type",              opts.ogType  ?? "website")
    upsertMeta("property", "og:site_name",         SITE_NAME)
    upsertMeta("name", "twitter:title",       opts.title)
    upsertMeta("name", "twitter:description", opts.description)
    // Only update twitter:card when we're injecting a custom ogImage.
    // When ogImage is null the page intentionally inherits the site-wide
    // default (summary_large_image + og-image.png set in index.html) — we
    // must not overwrite it with "summary" or the large-image preview breaks
    // on every non-release page.
    if (opts.ogImage) {
      upsertMeta("name", "twitter:card", "summary_large_image")
    }

    if (opts.canonical) {
      upsertMeta("property", "og:url", opts.canonical)
      let canonEl = document.querySelector<HTMLLinkElement>("link[rel='canonical']")
      if (!canonEl) {
        canonEl = document.createElement("link") as HTMLLinkElement
        canonEl.rel = "canonical"
        document.head.appendChild(canonEl)
      }
      canonEl.href = opts.canonical
    }

    if (opts.ogImage) {
      upsertMeta("property", "og:image",  opts.ogImage)
      upsertMeta("name",     "twitter:image", opts.ogImage)
    }

    // JSON-LD
    if (opts.jsonLd) {
      let el = document.getElementById("json-ld-schema") as HTMLScriptElement | null
      if (!el) {
        el = document.createElement("script") as HTMLScriptElement
        el.type = "application/ld+json"
        el.id   = "json-ld-schema"
        document.head.appendChild(el)
      }
      el.text = JSON.stringify(opts.jsonLd)
    } else {
      document.getElementById("json-ld-schema")?.remove()
    }

    // ── 3. Cleanup: fully restore snapshot ────────────────────────────────
    return () => {
      const snap = snapshot.current
      if (!snap) return

      document.title = snap.title

      // Restore each meta: set to previous value if it existed, else remove
      for (const m of snap.metas) {
        if (m.prevContent !== null) {
          upsertMeta(m.attrKey, m.attrVal, m.prevContent)
        } else {
          removeMeta(m.attrKey, m.attrVal)
        }
      }

      // Canonical
      const canonEl = document.querySelector<HTMLLinkElement>("link[rel='canonical']")
      if (snap.canonical) {
        if (canonEl) canonEl.href = snap.canonical
        else {
          const l = document.createElement("link") as HTMLLinkElement
          l.rel = "canonical"
          l.href = snap.canonical
          document.head.appendChild(l)
        }
      } else {
        canonEl?.remove()
      }

      // JSON-LD
      const jsonLdEl = document.getElementById("json-ld-schema")
      if (snap.jsonLd) {
        if (jsonLdEl) {
          (jsonLdEl as HTMLScriptElement).text = snap.jsonLd
        } else {
          const s = document.createElement("script") as HTMLScriptElement
          s.type = "application/ld+json"
          s.id   = "json-ld-schema"
          s.text = snap.jsonLd
          document.head.appendChild(s)
        }
      } else {
        jsonLdEl?.remove()
      }

      snapshot.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsJson])
}
