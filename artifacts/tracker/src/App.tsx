import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, type ReactNode, useEffect, lazy, Suspense } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

// ── Error boundary ─────────────────────────────────────────────────────────
// Catches lazy-chunk load failures (and any other render errors) so the page
// never goes permanently black. Must be a class component — React doesn't
// support error boundaries as function components.
interface EBState { hasError: boolean }
class ChunkErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  handleRetry = () => {
    // Force a full reload so the browser fetches fresh chunk URLs from the
    // CDN after a redeploy (stale chunk hash → 404 → load failure).
    window.location.reload();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center px-6 max-w-sm">
            <div className="text-4xl">⚠️</div>
            <div>
              <p className="font-display font-bold text-foreground text-lg mb-1">Something went wrong</p>
              <p className="text-sm text-muted-foreground">This page failed to load. It may have been updated — try refreshing.</p>
            </div>
            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Route-level code splitting ─────────────────────────────────────────────
// Each lazy() call becomes its own JS chunk; the browser only downloads the
// code for the page the user actually visits, rather than the entire app up-front.
const LandingPage    = lazy(() => import('@/pages/LandingPage'));
const Home           = lazy(() => import('@/pages/Home'));
const ReleaseDetail  = lazy(() => import('@/pages/ReleaseDetail'));
const GamesSearch    = lazy(() => import('@/pages/GamesSearch'));
const CatalogListPage = lazy(() => import('@/pages/CatalogListPage'));
const Consoles       = lazy(() => import('@/pages/Consoles'));
const ConsoleDetail  = lazy(() => import('@/pages/ConsoleDetail'));
const PrivacyPage    = lazy(() => import('@/pages/PrivacyPage'));
const TermsPage      = lazy(() => import('@/pages/TermsPage'));
const AboutPage      = lazy(() => import('@/pages/AboutPage'));
const NotFound       = lazy(() => import('@/pages/not-found'));

// Tells GA4 about every client-side navigation.
// gtag('config', ...) re-fires a page_view hit with the new path whenever
// the route changes — this is the standard SPA pattern for GA4.
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}
function GaPageView() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window.gtag !== 'function') return;
    window.gtag('config', 'G-S1861HDJE1', { page_path: location });
  }, [location]);
  return null;
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRouter() {
  return (
    <>
      <GaPageView />
      <ScrollToTop />
      {/* ErrorBoundary catches chunk load failures; Suspense shows a spinner
          while the chunk is downloading. Both are needed. */}
      <ChunkErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs font-mono text-muted-foreground/50 tracking-widest uppercase">Loading</span>
          </div>
        </div>
      }>
        <Switch>
          {/* Landing page — splashy entry point */}
          <Route path="/" component={LandingPage} />
          {/* Browse Games — full RAWG + TGDB catalog with pre-populated sections */}
          <Route path="/games" component={GamesSearch} />
          {/* "View all" listings — full paginated versions of the homepage sections */}
          <Route path="/games/popular">
            {() => <CatalogListPage kind="popular" />}
          </Route>
          <Route path="/games/new-releases">
            {() => <CatalogListPage kind="new-releases" />}
          </Route>
          <Route path="/games/upcoming">
            {() => <CatalogListPage kind="upcoming" />}
          </Route>
          {/* Boutique Tracker — scarcity-tracking for limited-run physical releases */}
          <Route path="/boutique" component={Home} />
          {/* Consoles — live eBay hardware listings, separate from games/boutique */}
          <Route path="/consoles" component={Consoles} />
          <Route path="/consoles/:slug" component={ConsoleDetail} />
          {/* Release detail pages */}
          <Route path="/releases/:id" component={ReleaseDetail} />
          {/* Legal */}
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/about" component={AboutPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      </ChunkErrorBoundary>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AppRouter />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
