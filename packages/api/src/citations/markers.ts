/**
 * Citation Marker Generation
 *
 * Generates citation markers that LLMs can use in their responses.
 * Extracted from packages/api/src/mcp/parsers.ts for reusability.
 */

import type { SourceInput } from './types';
import { getPrompt } from '../prompts/config';

// Default templates for citation markers
const DEFAULT_CITATION_HEADER = '**Available Citations from {serverName}:**';
const DEFAULT_CITATION_ITEM = '- {fileName}{metadataStr}: 【turn{turn}{sourceKey}{index}】';
const DEFAULT_MULTIPLE_FORMAT = 'For multiple sources: 【turn{turn}{sourceKey}0,turn{turn}{sourceKey}1】';

/**
 * Generate citation markers for LLM output (sync version)
 *
 * Creates a formatted guide that tells the LLM how to cite sources.
 * Format: 【turn{N}{sourceKey}{index}】
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

  let citationGuide = `\n\n**Available Citations from ${serverName || 'MCP'}:**\n`;

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

    // Bracket citation format: 【turn{N}{sourceKey}{index}】
    citationGuide += `- ${fileName}${metadataStr}: 【turn${turn}${sourceKey}${index}】\n`;
  });

  citationGuide += `\nFor multiple sources: 【turn${turn}${sourceKey}0,turn${turn}${sourceKey}1】\n`;

  return citationGuide;
}

/**
 * Generate citation markers for LLM output (async version with configurable templates)
 *
 * Creates a formatted guide that tells the LLM how to cite sources.
 * Loads templates from prompts config with fallback to defaults.
 *
 * @param sources - Array of source inputs
 * @param turn - Conversation turn number
 * @param sourceKey - Sanitized source key for markers
 * @param serverName - Optional display name for the server
 * @returns Formatted citation guide string
 */
export async function generateCitationMarkersAsync(
  sources: SourceInput[],
  turn: number,
  sourceKey: string,
  serverName?: string,
): Promise<string> {
  if (!sources || sources.length === 0) {
    return '';
  }

  // Load templates from config
  const headerFormat = await getPrompt(
    ['mcp', 'citationMarkerFormat'],
    DEFAULT_CITATION_HEADER
  );
  const itemFormat = await getPrompt(
    ['mcp', 'citationItemFormat'],
    DEFAULT_CITATION_ITEM
  );
  const multipleFormat = await getPrompt(
    ['mcp', 'multipleSourcesFormat'],
    DEFAULT_MULTIPLE_FORMAT
  );

  // Build header with server name
  const header = headerFormat.replace('{serverName}', serverName || 'MCP');
  let citationGuide = `\n\n${header}\n`;

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

    // Apply item template
    const item = itemFormat
      .replace('{fileName}', fileName)
      .replace('{metadataStr}', metadataStr)
      .replace('{turn}', String(turn))
      .replace('{sourceKey}', sourceKey)
      .replace('{index}', String(index));

    citationGuide += `${item}\n`;
  });

  // Apply multiple sources template
  const multipleExample = multipleFormat
    .replace(/{turn}/g, String(turn))
    .replace(/{sourceKey}/g, sourceKey);

  citationGuide += `\n${multipleExample}\n`;

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
 * @param marker - The citation marker (e.g., "turn0neo_nl0")
 * @returns Parsed marker components or null if invalid
 */
export function parseCitationMarker(marker: string): {
  turn: number;
  sourceKey: string;
  index: number;
} | null {
  // Match format: turn{N}{sourceKey}{index}
  const match = marker.match(/^turn(\d+)([a-z_]+)(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    turn: parseInt(match[1], 10),
    sourceKey: match[2],
    index: parseInt(match[3], 10),
  };
}
