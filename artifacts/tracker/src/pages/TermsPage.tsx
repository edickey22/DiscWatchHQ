import { Link } from "wouter"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

const LAST_UPDATED = "July 23, 2026"

export default function TermsPage() {
  useDocumentHead({
    title:       "Terms of Service — DiscWatchHQ",
    description: "Terms of Service for DiscWatchHQ: what the site does, affiliate disclosures, accounts, accuracy disclaimers, trademark notices, and how to contact us.",
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
          <p className="text-base text-muted-foreground">Last updated: {LAST_UPDATED}</p>
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
              DiscWatchHQ is a physical video game search, price comparison, and release-tracking
              tool. We aggregate publicly available product listings from boutique game publishers
              (Limited Run Games, Strictly Limited Games, iam8bit, Super Rare Games, Fangamer,
              and others) and link to major retailers (GameStop, Amazon, eBay, Best Buy) to help
              you find physical game releases and check availability.
            </p>
            <p>
              <strong>DiscWatchHQ does not sell products directly.</strong> All purchases are
              completed on third-party retailer websites. We have no control over those
              transactions, pricing, inventory, shipping, or return policies. Always confirm
              details directly with the retailer before completing a purchase.
            </p>
            <p>
              We do our best to keep information accurate and up to date, but pricing,
              availability, and release status can change at any time. We make no guarantees
              about the accuracy, completeness, or timeliness of any information displayed on
              the Site.
            </p>
          </Section>

          <Section title="Affiliate Disclosure" id="affiliate-disclosure">
            <p>
              DiscWatchHQ participates in affiliate marketing programs. This means that when
              you click certain retailer links on the Site (GameStop, Amazon, eBay, Best Buy)
              and make a qualifying purchase, we may earn a commission. This comes at{" "}
              <strong>no additional cost to you</strong> — you pay the same price you would
              regardless of whether you arrived via our link.
            </p>
            <p>
              Our affiliate relationships do not influence which games are listed, how releases
              are ranked, or what stock status we report. We track and display releases based on
              publicly available data, not on commercial arrangements with publishers or
              retailers. Commission rates and retailer relationships do not affect the
              information or recommendations presented on the Site.
            </p>
          </Section>

          <Section title="Accounts">
            <p>
              DiscWatchHQ uses a passwordless "<strong>magic-link</strong>" login system. When
              you create an account or sign in, we send a one-time login link to the email
              address you provide. No password is stored or required. The link expires after
              a short window and can only be used once.
            </p>
            <p>
              You can permanently delete your account at any time from your Profile page.
              Deleting your account immediately and irreversibly removes your email address
              and all tracked items from our systems. We cannot recover deleted accounts.
            </p>
            <p>
              We reserve the right to suspend or terminate accounts that misuse the Site,
              including but not limited to automated scraping, spamming, or any activity that
              places unreasonable load on our infrastructure or violates these Terms.
            </p>
          </Section>

          <Section title="Accuracy Disclaimer">
            <p>
              Game pricing, availability, and release dates displayed on the Site are sourced
              from third-party retailers and publishers in real time or on a scheduled refresh
              cycle. This information can change without notice — items may sell out, prices
              may update, and release dates may shift. We make no warranty that any information
              displayed is current, complete, or accurate at the moment you view it.
            </p>
            <p>
              Always confirm pricing, availability, and any purchase terms directly on the
              retailer's website before completing a transaction. DiscWatchHQ is not responsible
              for any loss or inconvenience resulting from reliance on information displayed here.
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
              <li>
                Create accounts for the purpose of automated scraping, price monitoring at
                scale, or any commercial use not explicitly permitted by us.
              </li>
            </ul>
          </Section>

          <Section title="Trademark Disclaimer" id="trademarks">
            <p>
              The following are trademarks or registered trademarks of their respective owners,
              used on this Site solely for identification and informational purposes:
            </p>
            <ul>
              <li><strong>GameStop</strong> — GameStop Corp.</li>
              <li><strong>Amazon</strong> — Amazon.com, Inc.</li>
              <li><strong>eBay</strong> — eBay Inc.</li>
              <li><strong>Best Buy</strong> — Best Buy Co., Inc.</li>
              <li><strong>PlayStation, PS5, PS4, PS3, PS2, PS1</strong> — Sony Interactive Entertainment LLC</li>
              <li><strong>Xbox, Xbox Series X, Xbox 360</strong> — Microsoft Corporation</li>
              <li><strong>Nintendo Switch, Nintendo Switch 2, SNES, NES, Nintendo 64, Game Boy</strong> — Nintendo Co., Ltd.</li>
              <li><strong>SEGA, Sega Genesis, Sega Dreamcast</strong> — Sega Corporation</li>
              <li><strong>Limited Run Games</strong> — Limited Run Games, Inc.</li>
              <li><strong>Strictly Limited Games</strong> — Strictly Limited Games GmbH</li>
              <li><strong>iam8bit</strong> — iam8bit, Inc.</li>
              <li><strong>Super Rare Games</strong> — Super Rare Games Ltd.</li>
              <li><strong>Fangamer</strong> — Fangamer LLC</li>
            </ul>
            <p>
              DiscWatchHQ is an independent service and is <strong>not affiliated with,
              endorsed by, sponsored by, or officially connected</strong> to any of the above
              companies or any publisher, retailer, or platform holder, unless explicitly and
              specifically stated in writing.
            </p>
          </Section>

          <Section title="Intellectual Property">
            <p>
              Game titles, cover artwork, publisher names, and product images are the property
              of their respective owners. DiscWatchHQ does not claim ownership of any third-party
              content displayed on the Site. Game metadata and cover art are sourced from RAWG
              and TheGamesDB — see those services' terms for their respective licensing
              conditions. If you are a rights holder and believe content infringes your rights,
              please contact us and we will address it promptly.
            </p>
            <p>
              The DiscWatchHQ name, logo, and original site content (layout, copy, code) are
              owned by us. You may not reproduce or redistribute them without permission.
            </p>
          </Section>

          <Section title="No Warranties; Limitation of Liability">
            <p>
              The Site is provided <strong>"as is"</strong> and <strong>"as available"</strong>{" "}
              without any warranty of any kind, express or implied, including but not limited
              to warranties of merchantability, fitness for a particular purpose, or
              non-infringement. We do not warrant that the Site will be uninterrupted,
              error-free, or free of viruses or other harmful components.
            </p>
            <p>
              To the fullest extent permitted by law, DiscWatchHQ and its operators shall not
              be liable for any indirect, incidental, special, consequential, or punitive
              damages arising from your use of (or inability to use) the Site, including any
              reliance on pricing, availability, or release-date information displayed here.
            </p>
          </Section>

          <Section title="Third-Party Sites">
            <p>
              The Site contains links to external websites (retailers, publishers, affiliate
              networks). We do not control those sites and are not responsible for their content,
              privacy practices, or availability. Links are provided for your convenience only.
              Visiting a third-party site is at your own risk.
            </p>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              We may update these Terms of Service from time to time. When we do, we'll update
              the "Last updated" date at the top of this page. Your continued use of the Site
              after any revision constitutes acceptance of the updated Terms. If we make
              material changes, we will make reasonable efforts to notify users (e.g., via
              a notice on the Site).
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
                href="mailto:info@discwatchhq.com"
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
              >
                info@discwatchhq.com
              </a>
            </p>
          </Section>

          {/* ── Legal note ── */}
          <div className="mt-10 p-4 rounded-lg border border-border/40 bg-card/50">
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              <strong className="text-muted-foreground">Note:</strong> These Terms of Service
              were prepared in good faith to accurately describe how DiscWatchHQ operates. They
              are not a substitute for formal legal review. If you have specific legal compliance
              needs, consult a qualified attorney.
            </p>
          </div>

          {/* ── Related ── */}
          <div className="mt-8 pt-8 border-t border-border flex flex-wrap gap-4 text-sm">
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
