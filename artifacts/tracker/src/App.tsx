import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, type ReactNode, useEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import LandingPage    from '@/pages/LandingPage';
import Home           from '@/pages/Home';
import ReleaseDetail  from '@/pages/ReleaseDetail';
import GamesSearch    from '@/pages/GamesSearch';
import CatalogListPage from '@/pages/CatalogListPage';
import Consoles       from '@/pages/Consoles';
import ConsoleDetail  from '@/pages/ConsoleDetail';
import PrivacyPage    from '@/pages/PrivacyPage';
import TermsPage      from '@/pages/TermsPage';
import AboutPage      from '@/pages/AboutPage';
import NotFound       from '@/pages/not-found';

// ── Error boundary ─────────────────────────────────────────────────────────
// Catches any render error so the page never goes permanently black.
interface EBState { hasError: boolean }
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center px-6 max-w-sm">
            <div className="text-4xl">⚠️</div>
            <div>
              <p className="font-display font-bold text-foreground text-lg mb-1">Something went wrong</p>
              <p className="text-sm text-muted-foreground">Try refreshing the page.</p>
            </div>
            <button
              onClick={() => window.location.reload()}
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

// Tells GA4 about every client-side navigation.
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
    <AppErrorBoundary>
      <GaPageView />
      <ScrollToTop />
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/games" component={GamesSearch} />
        <Route path="/games/popular">
          {() => <CatalogListPage kind="popular" />}
        </Route>
        <Route path="/games/new-releases">
          {() => <CatalogListPage kind="new-releases" />}
        </Route>
        <Route path="/games/upcoming">
          {() => <CatalogListPage kind="upcoming" />}
        </Route>
        <Route path="/boutique" component={Home} />
        <Route path="/consoles" component={Consoles} />
        <Route path="/consoles/:slug" component={ConsoleDetail} />
        <Route path="/releases/:id" component={ReleaseDetail} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/about" component={AboutPage} />
        <Route component={NotFound} />
      </Switch>
    </AppErrorBoundary>
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
