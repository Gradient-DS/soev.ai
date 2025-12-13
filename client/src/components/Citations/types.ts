/**
 * Unified Citation System Types
 *
 * These types define the unified data model for all citation types
 * (web_search, file_search, mcp, sharepoint).
 */

import type { ReactNode } from 'react';

/**
 * Origin type for citations - identifies the source system
 */
export type CitationOrigin = 'web_search' | 'file_search' | 'mcp' | 'sharepoint';

/**
 * Unified citation interface used by all citation components
 */
export interface UnifiedCitation {
  // Identity
  id: string; // Unique ID: `${turn}_${sourceKey}_${index}`
  turn: number; // Conversation turn number
  index: number; // Index within turn's sources
  origin: CitationOrigin;
  sourceKey: string; // For grouping (e.g., 'neo_nl', 'file_search')

  // Core display info
  title: string;
  snippet?: string;
  attribution?: string; // Domain or source name

  // URL handling (determines click behavior)
  url?: string; // External URL - if present, citation is clickable
  link?: string; // Legacy link field

  // File-specific
  fileId?: string; // For file identification
  fileName?: string;
  pages?: number[]; // Relevant page numbers
  pageRelevance?: Record<number, number>;

  // Metadata
  relevance?: number;
  metadata?: {
    year?: string;
    contentsubtype?: string;
    storageType?: 'local' | 'remote' | 'sharepoint';
    imageUrl?: string; // For web results with thumbnails
    url?: string; // External URL in metadata (especially for SharePoint sources)
    [key: string]: unknown;
  };
}

/**
 * Citation attachment format sent from backend
 */
export interface CitationAttachment {
  type: 'citations' | 'file_search' | 'web_search';
  turn: number;
  sourceKey: string;
  sources: UnifiedCitation[];
}

/**
 * Parsed citation data from markdown (matches existing format)
 */
export interface ParsedCitation {
  turn: number;
  refType: string;
  index: number;
  page?: number;
}

/**
 * Props for CitationInline component
 */
export interface CitationInlineProps {
  // New data-* attributes that survive rehype-raw
  'data-citation'?: string;
  'data-citation-type'?: string;
  'data-citation-id'?: string;
  // Legacy format
  node?: {
    properties?: {
      citation?: ParsedCitation | string;
      citationId?: string;
      citationType?: string;
    };
  };
}

/**
 * Props for CitationInlineMultiple component
 */
export interface CitationInlineMultipleProps {
  // New data-* attributes that survive rehype-raw
  'data-citations'?: string;
  'data-citation-id'?: string;
  // Legacy format
  node?: {
    properties?: {
      citations?: ParsedCitation[];
      citationId?: string;
    };
  };
}

/**
 * Props for CitationCard component
 */
export interface CitationCardProps {
  citation: UnifiedCitation;
  variant: 'compact' | 'expanded';
  showHoverCard?: boolean; // default: true for compact, false for expanded
}

/**
 * Props for CitationCardList component
 */
export interface CitationCardListProps {
  searchResults?: { [key: string]: import('librechat-data-provider').SearchResultData };
  messageId: string;
}

/**
 * Props for CitationHoverCard component
 */
export interface CitationHoverCardProps {
  citation: UnifiedCitation;
  children: ReactNode; // The trigger element

  // For carousel navigation (CitationInlineMultiple)
  showNav?: boolean;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * Props for ExternalLinkConfirm component
 */
export interface ExternalLinkConfirmProps {
  url: string;
  trigger: ReactNode;
  children?: ReactNode;
}

/**
 * Props for StackedIcons component
 */
export interface StackedIconsProps {
  citations: UnifiedCitation[];
  maxIcons?: number; // default: 3
}

/**
 * Props for HighlightedText component
 */
export interface HighlightedTextProps {
  children: ReactNode;
  citationId?: string;
  'data-citation-id'?: string;
}

/**
 * Citation context value type
 */
export interface CitationContextValue {
  hoveredCitationId: string | null;
  setHoveredCitationId: (id: string | null) => void;
}
