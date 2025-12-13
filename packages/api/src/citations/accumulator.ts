/**
 * Citation Accumulator
 *
 * Properly accumulates citations across multiple tool calls,
 * fixing the bug where second file_search from same MCP server
 * would overwrite previous sources.
 */

import type { UnifiedCitation, CitationAttachment, SourceInput } from './types';
import { normalizeSource, mergeCitations } from './processor';

/**
 * Accumulates citations from multiple tool calls with proper merging
 *
 * Key features:
 * - Uses composite key (turn_sourceKey) for storage
 * - Properly merges citations instead of overwriting
 * - Maintains correct indices across accumulations
 */
export class CitationAccumulator {
  private citationMap: Map<string, UnifiedCitation[]>;

  constructor() {
    this.citationMap = new Map();
  }

  /**
   * Generate composite key for storage
   */
  private getKey(turn: number, sourceKey: string): string {
    return `${turn}_${sourceKey}`;
  }

  /**
   * Add citations - ACCUMULATES instead of replacing
   *
   * This fixes the overwrite bug by:
   * 1. Looking up existing citations for the same turn/sourceKey
   * 2. Starting new indices after existing citations
   * 3. Merging arrays instead of replacing
   */
  addCitations(attachment: CitationAttachment): void {
    const key = this.getKey(attachment.turn, attachment.sourceKey);
    const existing = this.citationMap.get(key) || [];

    // Update indices for new sources to continue after existing
    const startIndex = existing.length;
    const newSources = attachment.sources.map((source, i) => ({
      ...source,
      index: startIndex + i,
      id: `${attachment.turn}_${attachment.sourceKey}_${startIndex + i}`,
    }));

    // Merge using mergeCitations to handle potential duplicates
    const merged = mergeCitations(existing, newSources);
    this.citationMap.set(key, merged);
  }

  /**
   * Add raw sources directly (for use in parsers.ts context)
   */
  addSources(
    sources: SourceInput[],
    turn: number,
    sourceKey: string,
  ): UnifiedCitation[] {
    const key = this.getKey(turn, sourceKey);
    const existing = this.citationMap.get(key) || [];
    const startIndex = existing.length;

    const normalized = sources.map((source, i) =>
      normalizeSource(source, turn, sourceKey, startIndex + i),
    );

    const merged = mergeCitations(existing, normalized);
    this.citationMap.set(key, merged);

    return merged;
  }

  /**
   * Get citations for a specific turn and sourceKey
   */
  getCitations(turn: number, sourceKey: string): UnifiedCitation[] {
    const key = this.getKey(turn, sourceKey);
    return this.citationMap.get(key) || [];
  }

  /**
   * Get all citations across all turns/sources
   */
  getAllCitations(): UnifiedCitation[] {
    const all: UnifiedCitation[] = [];
    for (const citations of this.citationMap.values()) {
      all.push(...citations);
    }
    return all;
  }

  /**
   * Get citations grouped by turn
   */
  getCitationsByTurn(turn: number): CitationAttachment[] {
    const attachments: CitationAttachment[] = [];

    for (const [key, citations] of this.citationMap.entries()) {
      const [turnStr, ...sourceKeyParts] = key.split('_');
      const keyTurn = parseInt(turnStr, 10);

      if (keyTurn === turn && citations.length > 0) {
        attachments.push({
          type: 'file_search',
          turn: keyTurn,
          sourceKey: sourceKeyParts.join('_'),
          sources: citations,
        });
      }
    }

    return attachments;
  }

  /**
   * Get all attachments
   */
  getAllAttachments(): CitationAttachment[] {
    const attachments: CitationAttachment[] = [];

    for (const [key, citations] of this.citationMap.entries()) {
      if (citations.length === 0) continue;

      // Parse the key to extract turn and sourceKey
      const underscoreIndex = key.indexOf('_');
      if (underscoreIndex === -1) continue;

      const turnStr = key.substring(0, underscoreIndex);
      const sourceKey = key.substring(underscoreIndex + 1);
      const turn = parseInt(turnStr, 10);

      if (isNaN(turn)) continue;

      attachments.push({
        type: 'file_search',
        turn,
        sourceKey,
        sources: citations,
      });
    }

    return attachments;
  }

  /**
   * Check if accumulator has any citations
   */
  isEmpty(): boolean {
    return this.citationMap.size === 0;
  }

  /**
   * Get count of all citations
   */
  count(): number {
    let total = 0;
    for (const citations of this.citationMap.values()) {
      total += citations.length;
    }
    return total;
  }

  /**
   * Clear all accumulated citations
   */
  clear(): void {
    this.citationMap.clear();
  }
}

/**
 * Create a new CitationAccumulator instance
 */
export function createCitationAccumulator(): CitationAccumulator {
  return new CitationAccumulator();
}
