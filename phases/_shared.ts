/**
 * Shared domain types for AUREUS phases.
 */
import { z } from "zod";

/**
 * Raw business row as it comes from an Apify Google Maps scraper.
 * Field names vary by actor; this schema accepts the common fields and
 * ignores the rest (`.passthrough()`).
 */
export const ApifyBusinessSchema = z
  .object({
    title: z.string().nullish(),
    name: z.string().nullish(),
    displayName: z.string().nullish(),
    categories: z.array(z.string()).nullish(),
    categoryName: z.string().nullish(),
    phone: z.string().nullish(),
    website: z.string().nullish(),
    url: z.string().nullish(),
    address: z.string().nullish(),
    fullAddress: z.string().nullish(),
    streetAddress: z.string().nullish(),
    city: z.string().nullish(),
    postalCode: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    countryCode: z.string().nullish(),
    location: z.object({ lat: z.number().nullish(), lng: z.number().nullish() }).nullish(),
    googleMapsUrl: z.string().nullish(),
    placeId: z.string().nullish(),
    cid: z.string().nullish(),
    rating: z.number().nullish(),
    /** Google Places / Apify Maps actors use totalScore, not `rating`. */
    totalScore: z.number().nullish(),
    reviewsCount: z.number().nullish(),
    reviews: z.array(z.any()).nullish(),
    imageUrl: z.string().nullish(),
    openingHours: z.array(z.any()).nullish(),
    instagram: z.string().nullish(),
    facebook: z.string().nullish(),
    twitter: z.string().nullish(),
    linkedin: z.string().nullish(),
    tiktok: z.string().nullish(),
    permanentlyClosed: z.boolean().nullish(),
    temporarilyClosed: z.boolean().nullish(),
    claimed: z.boolean().nullish(),
  })
  .passthrough();

export type ApifyBusiness = z.infer<typeof ApifyBusinessSchema>;

/** Normalized business record used internally and passed to workers. */
export interface Business {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  googleMapsUrl: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviewsCount: number | null;
  permanentlyClosed: boolean;
  raw: Record<string, unknown>;
}

/** Deterministic business id from name + city. */
export function businessIdFor(name: string, city: string | null): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return city ? `${norm(name)}__${norm(city)}` : norm(name);
}

/** Filename for a stage artifact: STAGE_<businessId>.<ext> */
export function stageFilename(businessId: string, stage: string, ext: string): string {
  return `${stage}_${businessId}.${ext}`;
}

/** Pipeline error with retryable flag. */
export class PipelineError extends Error {
  retryable: boolean;
  stage: string;
  businessId?: string;
  constructor(
    message: string,
    opts: { stage: string; retryable?: boolean; businessId?: string; cause?: Error },
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "PipelineError";
    this.stage = opts.stage;
    this.businessId = opts.businessId;
    this.retryable = opts.retryable ?? true;
  }
}
