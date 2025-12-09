export const SPAN_REGEX = /(\\ue203.*?\\ue204)/g;
export const COMPOSITE_REGEX = /(\\ue200.*?\\ue201)/g;
// Standalone pattern supports both legacy types (search|image|etc) and server-name-based (file_search|sharepoint|etc)
// Format: \ue202turn{N}{source_type}{index} where source_type can be alphanumeric with underscores
export const STANDALONE_PATTERN = /\\ue202turn(\d+)([a-zA-Z][a-zA-Z0-9_]*)(\d+)/g;
// Page-level citation pattern: \ue202turn{N}{source_type}{index}p{page}
export const PAGE_CITATION_PATTERN =
  /\\ue202turn(\d+)([a-zA-Z][a-zA-Z0-9_]*)(\d+)p(\d+)/g;
export const CLEANUP_REGEX = /\\ue200|\\ue201|\\ue202|\\ue203|\\ue204|\\ue206/g;
export const INVALID_CITATION_REGEX = /\s*\\ue202turn\d+[a-zA-Z][a-zA-Z0-9_]*\d+/g;
