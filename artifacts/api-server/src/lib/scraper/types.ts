export type ReleaseStatus = "available" | "sold_out" | "coming_soon";

export interface ScrapedRelease {
  /** Publisher-specific unique ID (e.g. slug or product ID from their URL) */
  externalId: string;
  title: string;
  platforms: string[];
  status: ReleaseStatus;
  coverImageUrl?: string | null;
  productUrl: string;
  price?: string | null;
  editionType?: string | null;
  /** YYYY-MM-DD */
  preorderCloseDate?: string | null;
  /** YYYY-MM-DD */
  releaseDate?: string | null;
  /** Direct Amazon product URL, if the publisher links to one (used for affiliate links) */
  amazonUrl?: string | null;
}

export interface PublisherScraper {
  /** Must match the slug in the publishers table */
  slug: string;
  scrape(): Promise<ScrapedRelease[]>;
}
