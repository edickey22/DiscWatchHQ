import { Link } from "wouter"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

const LAST_UPDATED = "July 10, 2026"

export default function TermsPage() {
  useDocumentHead({
    title:       "Terms of Service — DiscWatchHQ",
    description: "Terms of Service for DiscWatchHQ: acceptable use, affiliate disclosures, disclaimers, and how to contact us.",
    canonical:   buildCanonicalUrl("/terms"),
    jsonLd:      null,
  })

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-3xl px-4 py-12">
        {/* ── Heading ── */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-legal">

          <Section title="Acceptance of Terms">
            <p>
              By accessing or using discwatchhq.com (the "<strong>Site</strong>"), you agree to
              these Terms of Service. If you do not agree, please do not use the Site. We may
              update these Terms from time to time; continued use after any change means you
              accept the revised Terms.
            </p>
          </Section>

          <Section title="What the Site Does">
            <p>
              DiscWatchHQ is a game price comparison and release-tracking tool. We aggregate
              publicly available product listings from boutique game publishers (Limited Run
              Games, Strictly Limited Games, iam8bit, Super Rare Games, Fangamer, and others)
              and link to major retailers (GameStop, Amazon, eBay, Best Buy) to help you find
              physical game releases and check availability.
            </p>
            <p>
              We do our best to keep information accurate and up to date, but we make no
              guarantees about the accuracy, completeness, or timeliness of pricing, stock
              status, or release information. Always confirm details directly with the retailer
              before making a purchase.
            </p>
          </Section>

          <Section title="Affiliate Disclosure" id="affiliate-disclosure">
            <p>
              DiscWatchHQ participates in affiliate marketing programs. This means that when
              you click certain retailer links on the Site (GameStop, Amazon, eBay, Best Buy)
              and make a qualifying purchase, we may earn a commission. This comes at{" "}
              <strong>no additional cost to you</strong> — you pay the same price you would
              regardless.
            </p>
            <p>
              Our affiliate relationships do not influence which games are listed, how releases
              are ranked, or what stock status we report. We track and display releases based on
              publicly available data, not on commercial arrangements with publishers or
              retailers.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>You agree not to:</p>
            <ul>
              <li>
                Use the Site for any unlawful purpose or in violation of any applicable law or
                regulation.
              </li>
              <li>
                Scrape, crawl, or otherwise extract data from the Site in a way that places
                unreasonable load on our servers or bypasses our intended user interface, without
                prior written permission.
              </li>
              <li>
                Attempt to interfere with, disrupt, or gain unauthorized access to the Site or
                its underlying systems.
              </li>
              <li>
                Use the Site to transmit spam, malware, or any other harmful or deceptive
                content.
              </li>
            </ul>
          </Section>

          <Section title="Intellectual Property">
            <p>
              Game titles, cover artwork, publisher names, and product images are the property
              of their respective owners. DiscWatchHQ does not claim ownership of any third-party
              content displayed on the Site. If you are a rights holder and believe content
              infringes your rights, please contact us and we will address it promptly.
            </p>
            <p>
              The DiscWatchHQ name, logo, and original site content (layout, copy, code) are
              owned by us. You may not reproduce or redistribute them without permission.
            </p>
          </Section>

          <Section title="No Warranties; Limitation of Liability">
            <p>
              The Site is provided <strong>"as is"</strong> and <strong>"as available"</strong>{" "}
              without any warranty of any kind, express or implied. We do not warrant that the
              Site will be uninterrupted, error-free, or free of viruses or other harmful
              components.
            </p>
            <p>
              To the fullest extent permitted by law, DiscWatchHQ and its operators shall not
              be liable for any indirect, incidental, special, consequential, or punitive
              damages arising from your use of (or inability to use) the Site, including any
              reliance on pricing or availability information displayed here.
            </p>
          </Section>

          <Section title="Third-Party Sites">
            <p>
              The Site contains links to external websites (retailers, publishers, affiliate
              networks). We do not control those sites and are not responsible for their content,
              privacy practices, or availability. Links are provided for your convenience only.
            </p>
          </Section>

          <Section title="Governing Law">
            <p>
              These Terms are governed by and construed in accordance with the laws of the
              United States, without regard to conflict-of-law principles. Any disputes arising
              under these Terms shall be resolved in the applicable courts of the United States.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these Terms? Reach us at:
            </p>
            <p>
              <a
                href="mailto:privacy@discwatchhq.com"
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
              >
                privacy@discwatchhq.com
              </a>
            </p>
          </Section>

          {/* ── Related ── */}
          <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
            >
              Privacy Policy →
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  )
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function Section({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-4 text-muted-foreground leading-relaxed text-[15px]">
        {children}
      </div>
    </section>
  )
}
