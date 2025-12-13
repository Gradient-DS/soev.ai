/**
 * Citation Marker Generation
 *
 * Generates citation markers that LLMs can use in their responses.
 * Extracted from packages/api/src/mcp/parsers.ts for reusability.
 */

import type { SourceInput } from './types';

/**
 * Generate citation markers for LLM output
 *
 * Creates a formatted guide that tells the LLM how to cite sources.
 * Format: \ue202turn{N}{sourceKey}{index} for document-level
 *         \ue202turn{N}{sourceKey}{index}p{page} for page-level
 *
 * @param sources - Array of source inputs
 * @param turn - Conversation turn number
 * @param sourceKey - Sanitized source key for markers
 * @param serverName - Optional display name for the server
 * @returns Formatted citation guide string
 */
export function generateCitationMarkers(
  sources: SourceInput[],
  turn: number,
  sourceKey: string,
  serverName?: string,
): string {
  if (!sources || sources.length === 0) {
    return '';
  }

  let citationGuide = `\n\n**Available Citations from ${serverName || 'MCP'} (use these exact markers in your response):**\n`;

  sources.forEach((source, index) => {
    const fileName = source.fileName || `Source ${index}`;
    const metadata: string[] = [];

    if (source.metadata?.year) {
      metadata.push(source.metadata.year);
    }
    if (source.metadata?.contentsubtype) {
      metadata.push(source.metadata.contentsubtype);
    }

    const metadataStr = metadata.length > 0 ? ` [${metadata.join(', ')}]` : '';

    // Server-name-based citation marker: \ue202turn{N}{sourceKey}{index}
    citationGuide += `- ${fileName}${metadataStr}: \\ue202turn${turn}${sourceKey}${index}\n`;

    // Page-level citation markers when pages are available
    if (source.pages && source.pages.length > 0) {
      citationGuide += `  Page-level citations:\n`;
      source.pages.forEach((page) => {
        citationGuide += `  - Page ${page}: \\ue202turn${turn}${sourceKey}${index}p${page}\n`;
      });
    }
  });

  return citationGuide;
}

/**
 * Sanitize a server name into a valid source key
 *
 * Converts server names like "Neo NL" into safe keys like "neo_nl"
 * that can be used in citation markers.
 *
 * @param serverName - The server/source name to sanitize
 * @returns Sanitized source key
 */
export function sanitizeSourceKey(serverName: string): string {
  return serverName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') // trim leading/trailing underscores
    .replace(/_+/g, '_'); // collapse multiple underscores
}

/**
 * Parse a citation marker to extract its components
 *
 * @param marker - The citation marker (e.g., "turn0neo_nl0p3")
 * @returns Parsed marker components or null if invalid
 */
export function parseCitationMarker(marker: string): {
  turn: number;
  sourceKey: string;
  index: number;
  page?: number;
} | null {
  // Match format: turn{N}{sourceKey}{index}[p{page}]
  const match = marker.match(/^turn(\d+)([a-z_]+)(\d+)(?:p(\d+))?$/);
  if (!match) {
    return null;
  }

  return {
    turn: parseInt(match[1], 10),
    sourceKey: match[2],
    index: parseInt(match[3], 10),
    page: match[4] ? parseInt(match[4], 10) : undefined,
  };
}
