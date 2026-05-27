export interface FoundLink {
  id: string;
  rawUrl: string;        // href or raw URL exactly as found
  displayText?: string;  // anchor text if from <a> tag
  sourceFile: 'html' | 'text';
  sourceType: 'anchor' | 'raw';
}

export interface UrlSegment {
  kind: 'handlebars' | 'queryParam';
  label: string;      // handlebars key name OR query param key
  isWildcard: boolean;
  value: string;      // match value (empty string if wildcard)
}

export interface OverridePattern {
  segments: UrlSegment[];
  summary: string; // human-readable pattern string for display
}

export interface Override {
  id: string;
  sourceUrl: string;        // original template URL (with {{...}} preserved)
  pattern: OverridePattern;
  destination: string;      // valid URL with protocol — the reroute target
  createdAt: number;
  matcherHash: string;      // djb2 hash of normalized pattern summary → DynamoDB sort key
  hasWildcards: boolean;    // true if any segment is a wildcard; drives evaluation path
}
