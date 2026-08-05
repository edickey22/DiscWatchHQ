import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-8xl font-display font-bold text-primary/20 select-none mb-6">404</p>
        <h1 className="text-2xl font-display font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-xs">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/boutique"
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Home size={15} /> Go to Boutique
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <ArrowLeft size={15} /> Go back
          </button>
        </div>
      </div>
    </div>
  );
}
