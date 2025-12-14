/**
 * Unified Citation Types
 * Local type definitions for citation system - avoids modifying librechat-data-provider
 */

/**
 * Origin type for citations - identifies the source system
 */
export type CitationOrigin =
  | 'file_search' // Agent file_search tool (local RAG)
  | 'web_search' // Web search tool
  | 'mcp' // Generic MCP server
  | 'sharepoint' // SharePoint/OneDrive via Airweave

/**
 * Enhanced fields added to sources at runtime
 * These augment the core ResultReference type without modifying it
 */
export interface EnhancedSourceFields {
  origin?: CitationOrigin;
  metadata?: {
    url?: string; // External URL for click-to-open
    year?: string;
    contentsubtype?: string;
    storageType?: string;
    [key: string]: unknown;
  };
}

/**
 * Extended citation type
 */
export interface ExtendedCitation {
  turn: number;
  refType: string;
  index: number;
  origin?: CitationOrigin;
}
