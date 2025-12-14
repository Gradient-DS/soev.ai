import { createContext, useContext } from 'react';
import type { SearchRefType, ValidSource, ResultReference } from 'librechat-data-provider';
import type * as t from './types';
import { useSearchContext } from '~/Providers';

export interface CitationContextType {
  hoveredCitationId: string | null;
  setHoveredCitationId: (id: string | null) => void;
}

export const CitationContext = createContext<CitationContextType>({
  hoveredCitationId: null,
  setHoveredCitationId: () => {},
});

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
}

export type CitationSource = (ValidSource | ResultReference) & {
  turn: number;
  refType: string | SearchRefType;
  index: number;
};

const refTypeMap: Record<string | SearchRefType, string> = {
  search: 'organic',
  ref: 'references',
  news: 'topStories',
  file: 'references',
};

// Known legacy refTypes that map to array properties within a turn's SearchResultData
const LEGACY_REF_TYPES = new Set(['search', 'ref', 'news', 'file', 'image', 'video', 'organic', 'references', 'topStories', 'images', 'videos']);

export function useCitation({
  turn,
  index,
  refType: _refType,
  page,
}: {
  turn: number;
  index: number;
  refType?: SearchRefType | string;
  page?: number;
}): (t.Citation & t.Reference & { page?: number }) | undefined {
  const { searchResults } = useSearchContext();

  console.log('[useCitation] Called with:', { turn, index, refType: _refType });
  console.log('[useCitation] searchResults available:', {
    keys: Object.keys(searchResults || {}),
    hasSearchResults: !!searchResults,
  });

  if (!_refType) {
    return undefined;
  }

  const refTypeLower = _refType.toLowerCase();
  let source: CitationSource | undefined;

  // Check if this is a server-name-based key (e.g., 'sharepoint', 'file_search', 'airweave')
  // Server-name-based keys use composite key format: {sourceKey}_{turn}
  if (!LEGACY_REF_TYPES.has(refTypeLower) && searchResults) {
    // Try composite key first: searchResults['neo_nl_0'].references[index]
    const compositeKey = `${refTypeLower}_${turn}`;
    console.log('[useCitation] Composite key lookup:', {
      compositeKey,
      found: !!searchResults?.[compositeKey]?.references?.[index],
      referencesCount: searchResults?.[compositeKey]?.references?.length,
    });
    if (searchResults[compositeKey]?.references?.[index]) {
      source = searchResults[compositeKey].references[index] as CitationSource;
    } else if (searchResults[refTypeLower]?.references?.[index]) {
      // Fallback to sourceKey-only for legacy compatibility
      source = searchResults[refTypeLower].references[index] as CitationSource;
    }
  }

  if (!source) {
    // Legacy format: searchResults[turn][refType][index]
    const refType = refTypeMap[refTypeLower] ? refTypeMap[refTypeLower] : refTypeLower;

    if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
      return undefined;
    }

    source = searchResults[turn][refType][index];
  }

  if (!source) {
    return undefined;
  }

  // Get base snippet
  let snippet = source['snippet'] ?? '';

  // If page is specified and source has pages, add page context
  if (page !== undefined) {
    const sourceAny = source as Record<string, unknown>;
    const pages = sourceAny.pages as number[] | undefined;
    if (pages?.includes(page)) {
      snippet = `Page ${page}: ${snippet}`;
    }
  }

  return {
    ...source,
    turn,
    refType: _refType.toLowerCase(),
    index,
    page,
    link: source.link ?? '',
    title: source.title ?? '',
    snippet,
    attribution: source.attribution ?? '',
  };
}

export function useCompositeCitations(
  citations: Array<{ turn: number; refType: SearchRefType | string; index: number }>,
): Array<t.Citation & t.Reference> {
  const { searchResults } = useSearchContext();

  const result: Array<t.Citation & t.Reference> = [];

  for (const { turn, refType: _refType, index } of citations) {
    const refTypeLower = _refType.toLowerCase();
    let source: CitationSource | undefined;

    // Check if this is a server-name-based key (e.g., 'sharepoint', 'file_search', 'airweave')
    // Server-name-based keys use composite key format: {sourceKey}_{turn}
    if (!LEGACY_REF_TYPES.has(refTypeLower) && searchResults) {
      // Try composite key first: searchResults['neo_nl_0'].references[index]
      const compositeKey = `${refTypeLower}_${turn}`;
      if (searchResults[compositeKey]?.references?.[index]) {
        source = searchResults[compositeKey].references[index] as CitationSource;
      } else if (searchResults[refTypeLower]?.references?.[index]) {
        // Fallback to sourceKey-only for legacy compatibility
        source = searchResults[refTypeLower].references[index] as CitationSource;
      }
    }

    if (!source) {
      // Legacy format: searchResults[turn][refType][index]
      const refType = refTypeMap[refTypeLower] ? refTypeMap[refTypeLower] : refTypeLower;

      if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
        continue;
      }
      source = searchResults[turn][refType][index];
    }

    if (!source) {
      continue;
    }

    result.push({
      ...source,
      turn,
      refType: refTypeLower,
      index,
      link: source.link ?? '',
      title: source.title ?? '',
      snippet: source['snippet'] ?? '',
      attribution: source.attribution ?? '',
    });
  }

  return result;
}
