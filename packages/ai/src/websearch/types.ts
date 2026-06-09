export interface WebSearchRequest {
  query: string;
  maxResults?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
}

export interface WebSearchProvider {
  search(request: WebSearchRequest): Promise<WebSearchResponse>;
}
