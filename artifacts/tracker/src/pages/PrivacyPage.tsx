import { Link } from "wouter"
import { ExternalLink } from "lucide-react"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { useDocumentHead } from "@/hooks/useDocumentHead"
import { buildCanonicalUrl } from "@/lib/seo"

const LAST_UPDATED = "July 10, 2026"

export default function PrivacyPage() {
  useDocumentHead({
    title:       "Privacy Policy — DiscWatchHQ",
    description: "How DiscWatchHQ collects and uses data: Google Analytics, Google AdSense, affiliate links to GameStop, Amazon, eBay, and Best Buy, and cookie usage.",
    canonical:   buildCanonicalUrl("/privacy"),
    jsonLd:      null,
  })

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-3xl px-4 py-12">
        {/* ── Heading ── */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground mb-3">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-legal">

          <Section title="Overview">
            <p>
              DiscWatchHQ ("<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>")
              operates discwatchhq.com (the "<strong>Site</strong>"). This Privacy Policy explains
              what information we collect, how we use it, and the choices you have. We've written
              it in plain language — if anything is unclear, feel free to reach out.
            </p>
            <p>
              By using the Site you agree to the practices described here. If you do not agree,
              please do not use the Site.
            </p>
          </Section>

          <Section title="Information We Collect">
            <p>We do not require you to create an account or log in. We collect:</p>
            <ul>
              <li>
                <strong>Usage data</strong> — pages visited, time on page, referring URL, browser
                type, operating system, and general geographic region (country/city level). This
                data is collected automatically by Google Analytics when you visit the Site.
              </li>
              <li>
                <strong>Cookies and similar technologies</strong> — small files stored in your
                browser by us or our third-party partners (Google Analytics, Google AdSense) to
                recognize returning visitors and serve relevant ads. See the{" "}
                <a href="#cookies">Cookies</a> section below.
              </li>
              <li>
                <strong>Click data</strong> — when you click a retailer link (GameStop, Amazon,
                eBay, Best Buy), that retailer may record your visit. We do not personally
                identify you from affiliate click data.
              </li>
            </ul>
            <p>
              We do <strong>not</strong> collect your name, email address, payment information,
              or any other personally identifying information as part of normal site operation.
            </p>
          </Section>

          <Section title="Google Analytics">
            <p>
              We use <strong>Google Analytics 4 (GA4)</strong> to understand how visitors use the
              Site — which pages are popular, how users navigate between sections, and how long
              sessions last. This helps us improve the Site.
            </p>
            <p>
              Google Analytics sets cookies in your browser and sends usage data to Google's
              servers. The data is aggregated and does not personally identify you to us. Google
              may use this data in accordance with its own privacy policy.
            </p>
            <p>
              You can opt out of Google Analytics tracking by installing the{" "}
              <ExtLink href="https://tools.google.com/dlpage/gaoptout">
                Google Analytics Opt-out Browser Add-on
              </ExtLink>
              , or by enabling "Do Not Track" in your browser (though not all browsers or
              analytics implementations honor that signal).
            </p>
          </Section>

          <Section title="Advertising (Google AdSense)" id="advertising">
            <p>
              We plan to display advertisements on the Site served by{" "}
              <strong>Google AdSense</strong>. Google and its partners use cookies to serve ads
              based on your prior visits to this Site and other sites on the web. This is
              sometimes called <em>interest-based</em> or <em>personalized</em> advertising.
            </p>
            <p>
              You can review and manage Google's ad personalization settings, or opt out of
              personalized ads, at any time:
            </p>
            <ul>
              <li>
                <ExtLink href="https://adssettings.google.com">
                  Google Ads Settings
                </ExtLink>
              </li>
              <li>
                <ExtLink href="https://www.aboutads.info/choices/">
                  Digital Advertising Alliance — opt-out tool
                </ExtLink>
              </li>
              <li>
                <ExtLink href="https://policies.google.com/technologies/ads">
                  Google's advertising privacy information
                </ExtLink>
              </li>
            </ul>
            <p>
              Opting out of personalized ads does not remove ads from the page — you may still
              see ads, but they will be less relevant to your interests.
            </p>
          </Section>

          <Section title="Affiliate Links" id="affiliate">
            <p>
              DiscWatchHQ participates in affiliate programs with the following retailers:
            </p>
            <ul>
              <li><strong>Amazon Associates</strong> — amazon.com affiliate program</li>
              <li><strong>eBay Partner Network</strong> — eBay affiliate program</li>
              <li><strong>GameStop</strong> — via the Rakuten affiliate network</li>
              <li><strong>Best Buy</strong> — via the Impact affiliate network</li>
            </ul>
            <p>
              When you click a retailer link on the Site and make a qualifying purchase, we may
              earn a small commission at <strong>no additional cost to you</strong>. The price
              you pay is exactly the same whether you click through our link or navigate to the
              retailer directly.
            </p>
            <p>
              Affiliate links are how we keep the Site free. We only link to products that are
              genuinely relevant to the game releases we track — affiliate relationships do not
              influence which games or prices are shown.
            </p>
          </Section>

          <Section title="Cookies" id="cookies">
            <p>
              Cookies are small text files stored in your browser. The Site uses cookies for:
            </p>
            <ul>
              <li>
                <strong>Analytics</strong> — Google Analytics sets cookies (e.g.,{" "}
                <code>_ga</code>, <code>_ga_*</code>) to distinguish visitors and sessions.
                These cookies expire after 2 years.
              </li>
              <li>
                <strong>Advertising</strong> — Google AdSense and its partners may set cookies
                to serve and measure ads (e.g., <code>IDE</code>, <code>NID</code>). Expiry
                varies by cookie.
              </li>
            </ul>
            <p>
              You can control or delete cookies through your browser settings. Note that
              disabling cookies may affect how some parts of the Site function. Most browsers
              also let you block third-party cookies specifically, which limits ad tracking
              without affecting core site functionality.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              The Site is not directed at children under 13 years of age. We do not knowingly
              collect personal information from children under 13. If you believe a child under
              13 has submitted personal information to us, please contact us (see below) and we
              will promptly delete it.
            </p>
          </Section>

          <Section title="Third-Party Links">
            <p>
              The Site contains links to external retailer and publisher websites. Once you leave
              the Site, this Privacy Policy no longer applies. We encourage you to review the
              privacy policies of any third-party sites you visit.
            </p>
          </Section>

          <Section title="Data Retention &amp; Security">
            <p>
              We do not maintain our own database of user personal information. Analytics data
              is retained by Google according to your Google Analytics data retention settings
              (default: 14 months for event-level data). We take reasonable precautions to
              protect the Site, but no internet transmission is 100% secure.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we'll update the
              "Last updated" date at the top of this page. Continued use of the Site after any
              change constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              If you have questions about this Privacy Policy, you can reach us at:
            </p>
            <p>
              <a
                href="mailto:support@discwatchhq.com"
                className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
              >
                support@discwatchhq.com
              </a>
            </p>
          </Section>

          {/* ── Related ── */}
          <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-4 text-sm">
            <Link
              href="/terms"
              className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
            >
              Terms of Service →
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

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80 underline underline-offset-2 transition-colors font-medium"
    >
      {children}
      <ExternalLink size={11} className="shrink-0" />
    </a>
  )
}
