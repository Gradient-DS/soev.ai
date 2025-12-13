/**
 * Unified Citation Processor
 *
 * Handles normalization and processing of citations from various tool outputs.
 */

import type {
  CitationOrigin,
  UnifiedCitation,
  SourceInput,
  CitationProcessOptions,
  CitationAttachment,
} from './types';

/**
 * Determine citation origin from source metadata
 */
export function determineOrigin(source: SourceInput): CitationOrigin {
  // Check explicit origin field
  if (source.origin) {
    return source.origin;
  }

  // Check metadata for storage type
  const metadata = source.metadata;
  if (metadata?.storageType === 'sharepoint' || metadata?.url?.includes('sharepoint')) {
    return 'sharepoint';
  }

  // Check if it's a web result (has URL/link but no fileId)
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
 * Get clean domain from URL (removes protocol and www.)
 */
export function getCleanDomain(url: string): string {
  if (!url) return '';
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

/**
 * Normalize a source input to UnifiedCitation format
 */
export function normalizeSource(
  source: SourceInput,
  turn: number,
  sourceKey: string,
  index: number,
): UnifiedCitation {
  const metadata = source.metadata;
  const url = metadata?.url ?? source.link;

  // Extract known metadata properties with proper types
  // The rest (...rest) contains any additional unknown properties
  const {
    year,
    contentsubtype,
    storageType,
    imageUrl,
    url: metaUrl,
    path,
    ...rest
  } = metadata ?? {};

  return {
    id: `${turn}_${sourceKey}_${index}`,
    turn,
    index,
    sourceKey,
    origin: determineOrigin(source),
    title: source.title || source.fileName || '',
    snippet: source.snippet,
    attribution: source.attribution || (url ? getCleanDomain(url) : undefined),
    url,
    fileId: source.fileId,
    fileName: source.fileName,
    pages: source.pages,
    pageRelevance: source.pageRelevance,
    relevance: source.relevance,
    metadata: {
      year,
      contentsubtype,
      storageType,
      imageUrl,
      url: metaUrl,
      path,
      ...rest,
    },
  };
}

/**
 * Process tool citations from tool output
 *
 * Main entry point for converting tool outputs to citation attachments.
 */
export function processToolCitations(options: CitationProcessOptions): CitationAttachment | null {
  const { toolName, toolOutput, turn, sourceKey, messageId, toolCallId, conversationId } = options;

  // Handle file_search artifact format
  if (
    toolOutput &&
    typeof toolOutput === 'object' &&
    'sources' in toolOutput &&
    Array.isArray((toolOutput as { sources: unknown }).sources)
  ) {
    const artifact = toolOutput as { sources: SourceInput[]; fileCitations?: boolean };
    const sources = artifact.sources
      .filter(isValidSource)
      .map((source, index) => normalizeSource(source, turn, sourceKey, index));

    if (sources.length === 0) {
      return null;
    }

    return {
      type: 'file_search',
      turn,
      sourceKey,
      sources,
      toolCallId,
      messageId,
      conversationId,
      name: `${toolName}_results_${Date.now()}`,
    };
  }

  return null;
}

/**
 * Check if a source has required fields
 */
function isValidSource(source: unknown): source is SourceInput {
  return (
    source !== null &&
    typeof source === 'object' &&
    'fileId' in source &&
    'relevance' in source
  );
}

/**
 * Merge two arrays of citations, avoiding duplicates by fileId
 */
export function mergeCitations(
  existing: UnifiedCitation[],
  incoming: UnifiedCitation[],
): UnifiedCitation[] {
  const seen = new Set(existing.map((c) => c.fileId || c.id));
  const merged = [...existing];

  for (const citation of incoming) {
    const key = citation.fileId || citation.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        ...citation,
        index: merged.length,
        id: `${citation.turn}_${citation.sourceKey}_${merged.length}`,
      });
    }
  }

  return merged;
}
