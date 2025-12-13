/**
 * Unified Citation System - Backend Module
 *
 * Exports all citation-related types and utilities.
 */

// Types (CitationOrigin is exported from mcp/types, so we don't re-export it here)
export type {
  UnifiedCitation,
  CitationAttachment,
  SourceInput,
  FileSearchArtifact,
  CitationProcessOptions,
} from './types';

// Processor functions
export {
  determineOrigin,
  getCleanDomain,
  normalizeSource,
  processToolCitations,
  mergeCitations,
} from './processor';

// Marker generation
export {
  generateCitationMarkers,
  sanitizeSourceKey,
  parseCitationMarker,
} from './markers';

// Accumulator
export {
  CitationAccumulator,
  createCitationAccumulator,
} from './accumulator';
