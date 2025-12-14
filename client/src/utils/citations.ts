/**
 * Citation Regex Patterns
 *
 * These patterns handle two formats that LLMs may output:
 * 1. Literal escape sequences: "\ue202turn0search0" (backslash + "ue202" = 6 chars)
 * 2. Actual Unicode characters: "turn0search0" (U+E202 = 1 char, private use area)
 *
 * The system instructs LLMs to output literal escape sequences, but some models
 * may convert them to actual Unicode characters or strip them entirely.
 * These dual-format patterns ensure robust citation handling regardless of output format.
 *
 * Citation Format:
 * - \ue202 / U+E202: Standalone citation marker (before each anchor)
 * - \ue200 / U+E200: Composite group start
 * - \ue201 / U+E201: Composite group end
 * - \ue203 / U+E203: Highlight span start
 * - \ue204 / U+E204: Highlight span end
 *
 * Anchor Pattern: turn{N}{type}{index}
 * - N: Turn number (0-based)
 * - type: alphanumeric with underscores (e.g., neo_nl, file_search, sharepoint)
 * - index: Result index within that type (0-based)
 */

/** Matches highlighted text spans in both literal and Unicode formats */
export const SPAN_REGEX = /((?:\\ue203|\ue203).*?(?:\\ue204|\ue204))/g;

/** Matches composite citation blocks (multiple citations grouped together) */
export const COMPOSITE_REGEX = /((?:\\ue200|\ue200).*?(?:\\ue201|\ue201))/g;

/** Matches standalone citation anchors with turn, type, and index capture groups */
export const STANDALONE_PATTERN =
  /(?:\\ue202|\ue202)turn(\d+)([a-zA-Z][a-zA-Z0-9_]*)(\d+)/g;

/** Removes all citation marker characters from text for clean display */
export const CLEANUP_REGEX =
  /\\ue200|\\ue201|\\ue202|\\ue203|\\ue204|\\ue206|\ue200|\ue201|\ue202|\ue203|\ue204|\ue206/g;

/** Matches invalid/orphaned citations (with leading whitespace) for removal */
export const INVALID_CITATION_REGEX =
  /\s*(?:\\ue202|\ue202)turn\d+[a-zA-Z][a-zA-Z0-9_]*\d+/g;

/**
 * Fallback patterns for LLMs that strip the Unicode prefix entirely.
 * These match plain turn{N}{type}{index} markers without any prefix.
 * Use negative lookbehind to avoid matching within words or escaped sequences.
 */
export const FALLBACK_STANDALONE_PATTERN =
  /(?<![a-zA-Z0-9\\])turn(\d+)([a-zA-Z][a-zA-Z0-9_]*)(\d+)/g;
