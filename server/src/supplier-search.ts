import { ApifyClient } from "apify-client";

export const GOOGLE_PLACES_ACTOR_ID = "compass/crawler-google-places";
export const MAX_SUPPLIERS_PER_SEARCH = 10;

export type SupplierSearchInput = {
  supplierType: string;
  location: string;
};

export type Supplier = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type SupplierSearchResult =
  | { status: "running" }
  | { status: "succeeded"; suppliers: Supplier[] }
  | { status: "failed" };

export type ApifyPlace = {
  placeId?: unknown;
  title?: unknown;
  address?: unknown;
  phone?: unknown;
  phoneUnformatted?: unknown;
  website?: unknown;
  totalScore?: unknown;
  reviewsCount?: unknown;
  url?: unknown;
  location?: { lat?: unknown; lng?: unknown } | null;
};

type ApifyRun = {
  id: string;
  status?: string | null;
  defaultDatasetId?: string | null;
};

export interface SupplierSearchClient {
  startSearch(input: {
    searchStringsArray: string[];
    locationQuery: string;
    maxCrawledPlacesPerSearch: number;
  }): Promise<ApifyRun>;
  getRun(runId: string): Promise<ApifyRun | null>;
  getDatasetItems(datasetId: string): Promise<ApifyPlace[]>;
}

export class SupplierSearchError extends Error {
  constructor(
    public readonly code: "CONFIGURATION_ERROR" | "NOT_FOUND" | "UPSTREAM_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "SupplierSearchError";
  }
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function normalizeSupplier(place: ApifyPlace): Supplier {
  return {
    id: asString(place.placeId) ?? asString(place.url) ?? "unknown",
    name: asString(place.title) ?? "Unnamed supplier",
    address: asString(place.address),
    phone: asString(place.phoneUnformatted) ?? asString(place.phone),
    website: asString(place.website),
    rating: asNumber(place.totalScore),
    reviewCount: asNumber(place.reviewsCount),
    mapsUrl: asString(place.url),
    latitude: asNumber(place.location?.lat),
    longitude: asNumber(place.location?.lng),
  };
}

export class SupplierSearchService {
  constructor(private readonly client: SupplierSearchClient) {}

  async start(input: SupplierSearchInput): Promise<{ runId: string; status: "running" }> {
    try {
      const run = await this.client.startSearch({
        searchStringsArray: [input.supplierType],
        locationQuery: input.location,
        maxCrawledPlacesPerSearch: MAX_SUPPLIERS_PER_SEARCH,
      });
      return { runId: run.id, status: "running" };
    } catch (error) {
      throw this.toServiceError(error);
    }
  }

  async get(runId: string): Promise<SupplierSearchResult> {
    let run: ApifyRun | null;
    try {
      run = await this.client.getRun(runId);
    } catch (error) {
      throw this.toServiceError(error);
    }

    if (!run) {
      throw new SupplierSearchError("NOT_FOUND", "Supplier search run was not found.");
    }
    if (run.status === "SUCCEEDED") {
      if (!run.defaultDatasetId) {
        throw new SupplierSearchError("UPSTREAM_ERROR", "Completed run did not provide a result dataset.");
      }
      try {
        const places = await this.client.getDatasetItems(run.defaultDatasetId);
        return { status: "succeeded", suppliers: places.slice(0, MAX_SUPPLIERS_PER_SEARCH).map(normalizeSupplier) };
      } catch (error) {
        throw this.toServiceError(error);
      }
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status ?? "")) {
      return { status: "failed" };
    }
    return { status: "running" };
  }

  private toServiceError(error: unknown): SupplierSearchError {
    if (error instanceof SupplierSearchError) return error;
    return new SupplierSearchError("UPSTREAM_ERROR", "Unable to communicate with Apify.");
  }
}

export class ApifySupplierSearchClient implements SupplierSearchClient {
  private readonly client: ApifyClient;

  constructor(token = process.env.APIFY_TOKEN) {
    if (!token) {
      throw new SupplierSearchError("CONFIGURATION_ERROR", "APIFY_TOKEN is not configured on the server.");
    }
    this.client = new ApifyClient({ token });
  }

  async startSearch(input: {
    searchStringsArray: string[];
    locationQuery: string;
    maxCrawledPlacesPerSearch: number;
  }): Promise<ApifyRun> {
    const run = await this.client.actor(GOOGLE_PLACES_ACTOR_ID).start(input);
    return { id: run.id, status: run.status, defaultDatasetId: run.defaultDatasetId };
  }

  async getRun(runId: string): Promise<ApifyRun | null> {
    const run = await this.client.run(runId).get();
    return run ? { id: run.id, status: run.status, defaultDatasetId: run.defaultDatasetId } : null;
  }

  async getDatasetItems(datasetId: string): Promise<ApifyPlace[]> {
    const { items } = await this.client.dataset(datasetId).listItems({ limit: MAX_SUPPLIERS_PER_SEARCH });
    return items as ApifyPlace[];
  }
}
