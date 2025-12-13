/**
 * Unified Citation System Types (Backend)
 *
 * These types define the unified data model for all citation types
 * (web_search, file_search, mcp, sharepoint).
 *
 * Mirrors frontend types in client/src/components/Citations/types.ts
 */

// Import and re-export CitationOrigin from mcp/types to avoid duplicate definitions
import type { CitationOrigin as MCPCitationOrigin } from '../mcp/types';
export type CitationOrigin = MCPCitationOrigin;

/**
 * Unified citation interface used across all citation processing
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
    storageType?: 'local' | 'remote' | 'sharepoint' | string;
    imageUrl?: string; // For web results with thumbnails
    url?: string; // External URL in metadata (especially for SharePoint sources)
    path?: string;
    [key: string]: unknown;
  };
}

/**
 * Citation attachment format for message attachments
 */
export interface CitationAttachment {
  type: 'citations' | 'file_search' | 'web_search';
  turn: number;
  sourceKey: string;
  sources: UnifiedCitation[];
  toolCallId?: string;
  messageId?: string;
  conversationId?: string;
  name?: string;
}

/**
 * Known metadata properties for source inputs
 */
export interface SourceMetadata {
  url?: string;
  year?: string;
  contentsubtype?: string;
  storageType?: string;
  path?: string;
  imageUrl?: string;
}

/**
 * Input source type - covers various source formats from tools
 */
export interface SourceInput {
  fileId?: string;
  fileName?: string;
  relevance?: number;
  snippet?: string;
  title?: string;
  link?: string;
  attribution?: string;
  origin?: CitationOrigin;
  sourceType?: string;
  pages?: number[];
  pageRelevance?: Record<number, number>;
  metadata?: SourceMetadata & Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * File search artifact structure from MCP tools
 */
export interface FileSearchArtifact {
  sources: SourceInput[];
  fileCitations?: boolean;
  sourceKey?: string;
  turn?: number;
}

/**
 * Options for citation processing
 */
export interface CitationProcessOptions {
  toolName: string;
  toolOutput: unknown;
  turn: number;
  sourceKey: string;
  messageId?: string;
  toolCallId?: string;
  conversationId?: string;
}
