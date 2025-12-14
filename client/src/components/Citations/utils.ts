/**
 * Citation Utility Functions
 *
 * Helper functions for processing and displaying citations.
 */

import type { ResultReference, SearchResultData, ValidSource } from 'librechat-data-provider';
import type { UnifiedCitation, CitationOrigin, ParsedCitation } from './types';

/**
 * Source input type - covers all the various source formats we might receive
 */
export type SourceInput = ResultReference | ValidSource | Record<string, unknown>;

/**
 * Get clean domain from URL (removes protocol and www.)
 */
export function getCleanDomain(url: string): string {
  if (!url) return '';
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

/**
 * Get Google favicon URL for a domain
 */
export function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/**
 * Check if citation has an external URL that should be clickable
 */
export function hasExternalUrl(citation: UnifiedCitation): boolean {
  const url = citation.url || citation.link || citation.metadata?.url;
  return !!url && typeof url === 'string' && url.startsWith('http');
}

/**
 * Get the external URL from a citation (checks multiple fields)
 */
export function getExternalUrl(citation: UnifiedCitation): string | undefined {
  const url = citation.url || citation.metadata?.url || citation.link;
  if (url && typeof url === 'string' && url.startsWith('http')) {
    return url;
  }
  return undefined;
}

/**
 * Get display label for a citation (truncated if needed)
 */
export function getDisplayLabel(
  citation: UnifiedCitation,
  maxLength: number = 30,
  page?: number,
): string {
  let label =
    citation.attribution ||
    citation.title ||
    citation.fileName ||
    getCleanDomain(citation.url || citation.link || '') ||
    'Source';

  // Truncate if too long
  if (label.length > maxLength) {
    label = label.substring(0, maxLength - 3) + '...';
  }

  // Add page number if present
  if (page !== undefined) {
    label = `${label}, p.${page}`;
  }

  return label;
}

/**
 * Sort citations by relevance (highest first)
 */
export function sortByRelevance(citations: UnifiedCitation[]): UnifiedCitation[] {
  return [...citations].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

/**
 * Sort page numbers by relevance
 */
export function sortPagesByRelevance(
  pages: number[],
  pageRelevance?: Record<number, number>,
): number[] {
  if (!pageRelevance) return [...pages].sort((a, b) => a - b);
  return [...pages].sort((a, b) => (pageRelevance[b] ?? 0) - (pageRelevance[a] ?? 0));
}

/**
 * Group citations by origin
 */
export function groupByOrigin(
  citations: UnifiedCitation[],
): Record<CitationOrigin, UnifiedCitation[]> {
  const groups: Record<CitationOrigin, UnifiedCitation[]> = {
    web_search: [],
    file_search: [],
    mcp: [],
    sharepoint: [],
  };

  for (const citation of citations) {
    const origin = citation.origin || 'file_search';
    groups[origin].push(citation);
  }

  return groups;
}

/**
 * Determine citation origin from metadata
 */
export function determineOrigin(source: Record<string, unknown>): CitationOrigin {
  // Check explicit origin field
  if (source.origin) {
    return source.origin as CitationOrigin;
  }

  // Check metadata for storage type
  const metadata = source.metadata as Record<string, unknown> | undefined;
  if (metadata?.storageType === 'sharepoint') {
    return 'sharepoint';
  }

  // Check if it's a web result (has URL but no fileId)
  if (source.link && !source.fileId) {
    return 'web_search';
  }

  // Check sourceType field
  if (source.sourceType === 'mcp') {
    return 'mcp';
  }

  // Default to file_search
  return 'file_search';
}

/**
 * Normalize a source reference to UnifiedCitation format.
 * Accepts various source types from useCitation, useCompositeCitations, and search results.
 */
export function normalizeSource(
  source: SourceInput,
  turn: number,
  sourceKey: string,
  index: number,
): UnifiedCitation {
  // Use indexed access since we're dealing with multiple possible types
  const anySource = source as SourceInput & Record<string, unknown>;
  const metadata = (anySource.metadata as Record<string, unknown>) || {};

  return {
    id: `${turn}_${sourceKey}_${index}`,
    turn,
    index,
    sourceKey,
    origin: determineOrigin(anySource),
    title: (anySource.title as string) || (anySource.fileName as string) || '',
    snippet: anySource.snippet as string | undefined,
    attribution: anySource.attribution as string | undefined,
    url: (metadata.url as string) || (anySource.link as string) || undefined,
    link: anySource.link as string | undefined,
    fileId: anySource.fileId as string | undefined,
    fileName: anySource.fileName as string | undefined,
    pages: anySource.pages as number[] | undefined,
    pageRelevance: anySource.pageRelevance as Record<number, number> | undefined,
    relevance: anySource.relevance as number | undefined,
    metadata: {
      year: metadata.year as string | undefined,
      contentsubtype: metadata.contentsubtype as string | undefined,
      storageType: metadata.storageType as 'local' | 'remote' | 'sharepoint' | undefined,
      imageUrl: metadata.imageUrl as string | undefined,
      ...metadata,
    },
  };
}

/**
 * Convert search results to unified citations
 */
export function searchResultsToCitations(
  searchResults: { [key: string]: SearchResultData } | undefined,
): UnifiedCitation[] {
  if (!searchResults) return [];

  const citations: UnifiedCitation[] = [];

  for (const [key, resultData] of Object.entries(searchResults)) {
    // Handle numeric keys (legacy turn-based format)
    if (/^\d+$/.test(key)) {
      const turn = parseInt(key, 10);
      // Handle legacy organic results (web search)
      if (resultData.organic) {
        for (let i = 0; i < resultData.organic.length; i++) {
          const source = resultData.organic[i];
          // ProcessedOrganic has title, link, snippet but may have extra fields
          // Access additional fields via indexed access
          const sourceRecord = source as typeof source & { source?: string; imageUrl?: string };
          citations.push({
            id: `${turn}_organic_${i}`,
            turn,
            index: i,
            sourceKey: 'organic',
            origin: 'web_search',
            title: source.title || '',
            snippet: source.snippet,
            attribution: sourceRecord.source || getCleanDomain(source.link || ''),
            url: source.link,
            link: source.link,
            metadata: {
              imageUrl: sourceRecord.imageUrl,
            },
          });
        }
      }
      // Also process references for numeric keys (file_search, MCP, etc.)
      if (resultData.references) {
        for (let i = 0; i < resultData.references.length; i++) {
          const source = resultData.references[i];
          citations.push(normalizeSource(source, turn, 'references', i));
        }
      }
      continue;
    }

    // Handle composite key format: sourceKey_turn or sourceKey only
    const parts = key.split('_');
    const lastPart = parts[parts.length - 1];
    const isCompositeKey = parts.length > 1 && /^\d+$/.test(lastPart);

    const sourceKey = isCompositeKey ? parts.slice(0, -1).join('_') : key;
    const turn = isCompositeKey ? parseInt(lastPart, 10) : resultData.turn ?? -1;

    // Skip accumulated entries (turn=-1) to avoid duplicates
    if (turn === -1 && !isCompositeKey) continue;

    // Process references
    if (resultData.references) {
      for (let i = 0; i < resultData.references.length; i++) {
        const source = resultData.references[i];
        citations.push(normalizeSource(source, turn, sourceKey, i));
      }
    }
  }

  return citations;
}

/**
 * Parse citation data from component props
 */
export function parseCitationFromProps(props: {
  'data-citation'?: string;
  node?: { properties?: { citation?: ParsedCitation | string } };
}): ParsedCitation | undefined {
  console.log('[parseCitationFromProps] Input:', {
    hasDataCitation: !!props['data-citation'],
    dataCitationValue: props['data-citation'],
    hasNodeProperties: !!props.node?.properties,
    nodePropertiesCitation: props.node?.properties?.citation,
  });

  // Try new data-* format first (survives rehype-raw)
  if (props['data-citation']) {
    try {
      return JSON.parse(props['data-citation']) as ParsedCitation;
    } catch (e) {
      console.error('[Citations] Failed to parse data-citation:', e);
    }
  }

  // Fall back to old format
  const propCitation = props.node?.properties?.citation;
  if (!propCitation) return undefined;

  if (typeof propCitation === 'string' && propCitation !== '[object Object]') {
    try {
      return JSON.parse(propCitation) as ParsedCitation;
    } catch {
      return undefined;
    }
  }

  if (typeof propCitation === 'object') {
    return propCitation as ParsedCitation;
  }

  return undefined;
}

/**
 * Parse multiple citations from component props
 */
export function parseCitationsFromProps(props: {
  'data-citations'?: string;
  node?: { properties?: { citations?: ParsedCitation[] } };
}): ParsedCitation[] | undefined {
  // Try new data-* format first
  if (props['data-citations']) {
    try {
      return JSON.parse(props['data-citations']) as ParsedCitation[];
    } catch (e) {
      console.error('[Citations] Failed to parse data-citations:', e);
    }
  }

  // Fall back to old format
  return props.node?.properties?.citations;
}
