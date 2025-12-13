/**
 * Citations Module
 *
 * Unified citation system components for consistent behavior across
 * web_search, file_search, mcp, and sharepoint citations.
 */

// Types
export type {
  CitationOrigin,
  UnifiedCitation,
  CitationAttachment,
  ParsedCitation,
  CitationInlineProps,
  CitationInlineMultipleProps,
  CitationCardProps,
  CitationCardListProps,
  CitationHoverCardProps,
  ExternalLinkConfirmProps,
  StackedIconsProps,
  HighlightedTextProps,
  CitationContextValue,
} from './types';

// Utilities
export type { SourceInput } from './utils';
export {
  getCleanDomain,
  getFaviconUrl,
  hasExternalUrl,
  getExternalUrl,
  getDisplayLabel,
  sortByRelevance,
  sortPagesByRelevance,
  groupByOrigin,
  determineOrigin,
  normalizeSource,
  searchResultsToCitations,
  parseCitationFromProps,
  parseCitationsFromProps,
} from './utils';

// Styles
export * from './styles';

// Components
export { CitationProvider, CitationContext } from './CitationProvider';
export { CitationInline } from './CitationInline';
export { CitationInlineMultiple } from './CitationInlineMultiple';
export { CitationCard } from './CitationCard';
export { CitationCardList } from './CitationCardList';
export { CitationHoverCard, FaviconImage, HoverCardContent, HovercardStoreContext, useHovercardStore } from './CitationHoverCard';
export { ExternalLinkConfirm } from './ExternalLinkConfirm';
export { StackedIcons } from './StackedIcons';
export { HighlightedText, useHighlightState } from './HighlightedText';
