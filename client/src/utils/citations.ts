/**
 * OpenAI-Compatible Bracket Citation Regex Patterns
 *
 * Citation Format:
 * 【turn{N}{sourceKey}{index}】
 * 【turn0search0,turn0news1】
 *
 * Index Pattern: turn{N}{sourceKey}{index}
 * - N: Turn number (0-based)
 * - sourceKey: alphanumeric with underscores (e.g., search, news, file_search, neo_nl)
 * - index: Result index within that source (0-based)
 */

/**
 * Matches OpenAI-style bracket citations.
 * Captures: [1] = index content
 * Example: 【turn0search0】
 */
export const CITE_TAG_REGEX = /【([^】]+)】/g;

/**
 * Parses a single index from the index content.
 * Captures: [1] = turn, [2] = sourceKey, [3] = index
 */
export const INDEX_PATTERN = /^turn(\d+)([a-zA-Z][a-zA-Z0-9_]*)(\d+)$/;

/**
 * Parses comma-separated indices.
 * Returns array of { turn, sourceKey, index } objects or null if invalid.
 */
export function parseIndices(indexAttr: string): Array<{
  turn: number;
  sourceKey: string;
  index: number;
}> | null {
  const parts = indexAttr.split(',').map((s) => s.trim());
  const results: Array<{ turn: number; sourceKey: string; index: number }> = [];

  for (const part of parts) {
    const match = part.match(INDEX_PATTERN);
    if (!match) return null; // Invalid format
    results.push({
      turn: parseInt(match[1], 10),
      sourceKey: match[2],
      index: parseInt(match[3], 10),
    });
  }

  return results.length > 0 ? results : null;
}

/**
 * Cleanup regex to remove bracket citations from text.
 */
export const CLEANUP_REGEX = /【[^】]*】/g;
