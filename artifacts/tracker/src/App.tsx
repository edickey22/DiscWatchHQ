import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import LandingPage from '@/pages/LandingPage';
import Home from '@/pages/Home';
import ReleaseDetail from '@/pages/ReleaseDetail';
import GamesSearch from '@/pages/GamesSearch';
import CatalogListPage from '@/pages/CatalogListPage';

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
      {/* Boutique Tracker — scarcity-tracking for limited-run physical releases */}
      <Route path="/boutique" component={Home} />
      {/* Release detail pages */}
      <Route path="/releases/:id" component={ReleaseDetail} />
      <Route component={NotFound} />
    </Switch>
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
