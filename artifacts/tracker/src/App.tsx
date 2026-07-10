import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import LandingPage from '@/pages/LandingPage';
import Home from '@/pages/Home';
import ReleaseDetail from '@/pages/ReleaseDetail';
import GamesSearch from '@/pages/GamesSearch';
import CatalogListPage from '@/pages/CatalogListPage';
import PrivacyPage from '@/pages/PrivacyPage';
import TermsPage from '@/pages/TermsPage';

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
      {/* Release detail pages */}
      <Route path="/releases/:id" component={ReleaseDetail} />
      {/* Legal */}
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route component={NotFound} />
      </Switch>
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
