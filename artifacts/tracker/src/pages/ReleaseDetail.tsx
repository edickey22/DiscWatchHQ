import { useRoute, Link } from "wouter"
import { useGetRelease, ReleaseStatus } from "@workspace/api-client-react"
import { ArrowLeft, Clock, ExternalLink, Calendar, Package } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Skeleton } from "@/components/ui/skeleton"
import { daysUntil, formatDate } from "@/lib/utils"

export default function ReleaseDetail() {
  const [, params] = useRoute("/releases/:id")
  const id = params?.id ? parseInt(params.id, 10) : 0

  const { data: release, isLoading, isError } = useGetRelease(id, {
    query: {
      enabled: !!id,
    }
  })

  if (isError) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <h1 className="text-2xl font-bold font-display mb-2">Release not found</h1>
          <p className="text-muted-foreground mb-6">The release you're looking for doesn't exist or has been removed.</p>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back to Tracker
            </Link>
          </Button>
        </main>
        <Footer />
      </div>
    )
  }

  const isAvailable = release?.status === ReleaseStatus.available
  const isSoldOut = release?.status === ReleaseStatus.sold_out
  const isComingSoon = release?.status === ReleaseStatus.coming_soon

  const daysLeft = isAvailable ? daysUntil(release?.preorderCloseDate) : null
  const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />
      
      <main className="flex-1 pb-16">
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3 text-muted-foreground hover:text-foreground">
            <Link href="/">
              <ArrowLeft className="mr-2 w-4 h-4" /> Back to Tracker
            </Link>
          </Button>

          <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
            {/* Left: Artwork Hero */}
            <div className="relative">
              {isLoading ? (
                <Skeleton className="aspect-[3/4] w-full rounded-xl bg-muted/60" />
              ) : (
                <div className={`relative aspect-[3/4] w-full rounded-xl overflow-hidden shadow-2xl bg-muted ${isSoldOut ? 'opacity-70 grayscale-[30%]' : ''}`}>
                  {release?.coverImageUrl ? (
                    <img 
                      src={release.coverImageUrl} 
                      alt={`${release.title} cover`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <span className="text-muted-foreground font-mono">No cover art</span>
                    </div>
                  )}

                  {isSoldOut && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                      <span className="font-display text-3xl font-bold tracking-widest text-white border-y-4 border-white/50 py-3 px-8 rotate-[-12deg]">
                        SOLD OUT
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Info */}
            <div className="flex flex-col">
              {isLoading ? (
                <div className="space-y-6 mt-4">
                  <Skeleton className="h-8 w-1/4" />
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-16 w-full mt-8" />
                </div>
              ) : release && (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {isAvailable && (
                      <Badge variant="default" className="text-sm px-3 py-1 bg-primary text-primary-foreground border-transparent font-bold tracking-wide shadow-sm shadow-primary/20">
                        AVAILABLE NOW
                      </Badge>
                    )}
                    {isSoldOut && (
                      <Badge variant="secondary" className="text-sm px-3 py-1 opacity-70">
                        SOLD OUT
                      </Badge>
                    )}
                    {isComingSoon && (
                      <Badge variant="outline" className="text-sm px-3 py-1 border-foreground/20 text-foreground/80 font-semibold bg-background">
                        COMING SOON
                      </Badge>
                    )}
                  </div>

                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight mb-4 text-foreground leading-[1.1]">
                    {release.title}
                  </h1>
                  
                  <div className="flex items-center gap-3 text-lg font-mono mb-8">
                    <span className="text-muted-foreground font-medium">Published by</span>
                    <span className="text-foreground font-bold bg-secondary px-3 py-1 rounded-md">{release.publisherName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-6 py-6 border-y border-border/50 mb-8">
                    <div>
                      <h3 className="text-sm font-mono text-muted-foreground mb-2 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Platforms
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {release.platforms?.map(p => (
                          <span key={p} className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-mono text-muted-foreground mb-2 flex items-center gap-2">
                        Edition
                      </h3>
                      <p className="font-semibold text-foreground/90">
                        {release.editionType || "Standard Edition"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-mono text-muted-foreground mb-2 flex items-center gap-2">
                        Price
                      </h3>
                      <p className="text-2xl font-mono font-bold text-foreground">
                        {release.price || "TBA"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-mono text-muted-foreground mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Release Date
                      </h3>
                      <p className="font-semibold text-foreground/90">
                        {release.releaseDate ? formatDate(release.releaseDate) : "TBA"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 bg-card border shadow-sm rounded-xl p-6 mb-8 relative overflow-hidden">
                    {isAvailable && isClosingSoon && (
                      <div className="absolute top-0 right-0 left-0 h-1 bg-destructive animate-pulse" />
                    )}
                    
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h4 className="font-display font-bold text-lg">Preorder Window</h4>
                        {isAvailable && release.preorderCloseDate && (
                          <p className="text-sm font-mono text-muted-foreground mt-1 flex items-center gap-1">
                            Closes {formatDate(release.preorderCloseDate)}
                          </p>
                        )}
                        {isSoldOut && release.soldOutAt && (
                          <p className="text-sm font-mono text-muted-foreground mt-1 flex items-center gap-1">
                            Closed {formatDate(release.soldOutAt)}
                          </p>
                        )}
                        {isComingSoon && (
                          <p className="text-sm font-mono text-muted-foreground mt-1 flex items-center gap-1">
                            Opening date TBA
                          </p>
                        )}
                      </div>
                      
                      {isAvailable && daysLeft !== null && (
                        <div className={`text-right ${isClosingSoon ? 'text-destructive' : 'text-primary'}`}>
                          <div className="text-3xl font-mono font-bold leading-none">{daysLeft}</div>
                          <div className="text-xs uppercase font-bold tracking-wider opacity-80">Days Left</div>
                        </div>
                      )}
                    </div>

                    {isAvailable && (
                      <Button asChild size="lg" className="w-full text-base font-bold shadow-lg h-14 bg-primary hover:bg-primary/90">
                        <a href={release.productUrl} target="_blank" rel="noopener noreferrer">
                          Order from {release.publisherName} <ExternalLink className="ml-2 w-5 h-5" />
                        </a>
                      </Button>
                    )}
                    
                    {isComingSoon && (
                      <Button size="lg" variant="outline" className="w-full text-base font-bold h-14 border-primary/20 text-foreground" onClick={() => {
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
                      }}>
                        Notify Me
                      </Button>
                    )}

                    {isSoldOut && (
                      <Button asChild size="lg" variant="secondary" className="w-full text-base font-bold h-14 opacity-50 cursor-not-allowed">
                        <span className="flex items-center justify-center">
                          Sold Out <ExternalLink className="ml-2 w-5 h-5 opacity-50" />
                        </span>
                      </Button>
                    )}
                  </div>
                  
                  {isSoldOut && release.productUrl && (
                    <div className="text-center">
                      <a href={release.productUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-muted-foreground hover:text-foreground underline underline-offset-4">
                        View original listing on {release.publisherName}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  )
}
