# Unified Citation System Architecture Plan

> **Purpose**: Refactor the citation system to use consistent components and behavior across all citation types (web_search, file_search, mcp, sharepoint).

---

## Goals

1. **Consistent behavior** - All citation types follow the same click/hover patterns
2. **Fix accumulation bug** - Second file_search no longer overwrites previous sources
3. **Single data model** - UnifiedCitation interface used everywhere
4. **New files only** - Keep original files, wire in new components at integration points
5. **Clean architecture** - Clear component hierarchy with single responsibilities

---

## Target Behavior

| Has URL? | Hover | Click | Visual Style |
|----------|-------|-------|--------------|
| **No** | Show CitationHoverCard | Does nothing | Neutral text, default cursor |
| **Yes** | Show CitationHoverCard | ExternalLinkConfirm → opens URL | Blue text, pointer cursor, external link icon |

All citation types (web_search, file_search, mcp, sharepoint) follow this same pattern.

---

## Current Issues Being Fixed

1. **web_search inline citations**: Opens links directly without confirmation
2. **web_search top cards**: Opens links directly without confirmation
3. **FileItem in Sources.tsx**: Missing hovercard, missing ExternalLinkDialog for files with URLs
4. **Inconsistent styling**: Some citations appear clickable when they shouldn't be
5. **Second file_search overwrites**: Frontend accumulation logic replaces instead of merges references
6. **Duplicate components**: Multiple implementations for same functionality

---

## New Architecture

### Unified Data Model

```typescript
// packages/api/src/citations/types.ts
// client/src/components/Citations/types.ts

export type CitationOrigin = 'web_search' | 'file_search' | 'mcp' | 'sharepoint';

export interface UnifiedCitation {
  // Identity
  id: string;                    // Unique ID: `${turn}_${sourceKey}_${index}`
  turn: number;                  // Conversation turn number
  index: number;                 // Index within turn's sources
  origin: CitationOrigin;
  sourceKey: string;             // For grouping (e.g., 'neo_nl', 'file_search')

  // Core display info
  title: string;
  snippet?: string;
  attribution?: string;          // Domain or source name

  // URL handling (determines click behavior)
  url?: string;                  // External URL - if present, citation is clickable

  // File-specific
  fileId?: string;               // For file identification
  fileName?: string;
  pages?: number[];              // Relevant page numbers
  pageRelevance?: Record<number, number>;

  // Metadata
  relevance?: number;
  metadata?: {
    year?: string;
    contentsubtype?: string;
    storageType?: 'local' | 'remote' | 'sharepoint';
    imageUrl?: string;           // For web results with thumbnails
    [key: string]: unknown;
  };
}

export interface CitationAttachment {
  type: 'citations';
  turn: number;
  sourceKey: string;
  sources: UnifiedCitation[];
}
```

---

## Component Architecture

### Directory Structure

```
client/src/components/Citations/     (NEW DIRECTORY)
├── index.ts                         # Barrel exports
├── types.ts                         # UnifiedCitation, props interfaces
├── utils.ts                         # Helper functions
├── styles.ts                        # Shared Tailwind classes
├── CitationProvider.tsx             # Context + state management
├── CitationInline.tsx               # Single inline citation pill
├── CitationInlineMultiple.tsx       # Grouped citations [Source +2]
├── CitationCard.tsx                 # Single card (file or web)
├── CitationCardList.tsx             # Tabbed card list with overflow
├── CitationHoverCard.tsx            # Hover content with optional carousel
├── ExternalLinkConfirm.tsx          # URL confirmation dialog
└── StackedIcons.tsx                 # Stacked favicon/paperclip icons for overflow

packages/api/src/citations/          (NEW DIRECTORY)
├── index.ts                         # Barrel exports
├── types.ts                         # Backend type definitions
├── processor.ts                     # Unified citation processing
├── accumulator.ts                   # Citation accumulation (fixes bug)
└── markers.ts                       # Citation marker generation
```

### Component Hierarchy

```
                    ┌───────────────────────────┐
                    │   CitationProvider.tsx    │
                    │   (Context + State Mgmt)  │
                    └─────────────┬─────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
  │ CitationInline  │   │CitationInline   │   │ CitationCardList│
  │     .tsx        │   │  Multiple.tsx   │   │     .tsx        │
  │ (single inline) │   │ (grouped [1,2]) │   │ (top-level tabs)│
  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                                 ▼
                    ┌───────────────────────────┐
                    │    CitationHoverCard.tsx  │
                    │   (shared hover content)  │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   CitationCard.tsx        │
                    │   (renders single card)   │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ ExternalLinkConfirm.tsx   │
                    │ (confirmation dialog)     │
                    └───────────────────────────┘
```

---

## Component Specifications

### 1. CitationProvider.tsx

**Purpose**: Central state management for citations with proper accumulation.

```typescript
interface CitationContextValue {
  // Citation data
  citationsMap: Map<string, UnifiedCitation[]>;  // by sourceKey_turn

  // Hover state
  hoveredCitationId: string | null;
  setHoveredCitationId: (id: string | null) => void;

  // Lookup methods
  getCitation(turn: number, sourceKey: string, index: number): UnifiedCitation | null;
  getCitations(turn: number, sourceKey: string): UnifiedCitation[];
  getAllCitations(): UnifiedCitation[];
  getCitationsByOrigin(origin: CitationOrigin): UnifiedCitation[];
}
```

**Key Features**:
- Uses composite key `${turn}_${sourceKey}` for storage
- Properly accumulates citations (fixes overwrite bug)
- Manages hover state for highlight coordination

---

### 2. CitationInline.tsx

**Purpose**: Single inline citation pill in message text.

**Props**:
```typescript
interface CitationInlineProps {
  citation: UnifiedCitation;
  citationId: string;
  page?: number;  // Optional page number to append
}
```

**Renders**:
```
[NEN EN ISO IEC 270... ↗]  (if has URL)
[NEN EN ISO IEC 270...]    (if no URL)
```

**Behavior**:
- `citation.url` present → Blue text, external link icon, clickable → ExternalLinkConfirm
- No URL → Neutral text, not clickable
- Hover → Always shows CitationHoverCard
- Updates hoveredCitationId on hover for text highlighting

---

### 3. CitationInlineMultiple.tsx

**Purpose**: Grouped inline citations displayed as "[Source +2]" with carousel in hovercard.

**Props**:
```typescript
interface CitationInlineMultipleProps {
  citations: UnifiedCitation[];
  citationId: string;
}
```

**Renders**:
```
[250828 - Meeting... +2 ↗]
```

**Behavior**:
- Shows first citation name with "+N" count
- External link icon if current citation has URL
- Click → If current citation has URL, ExternalLinkConfirm
- Hover → CitationHoverCard with ← → navigation arrows
- Carousel navigation within hovercard (1/3, 2/3, 3/3)

---

### 4. CitationCard.tsx

**Purpose**: Single source card for top-level display and expanded dialogs.

**Props**:
```typescript
interface CitationCardProps {
  citation: UnifiedCitation;
  variant: 'compact' | 'expanded';
  showHoverCard?: boolean;  // default: true for compact, false for expanded
}
```

**Renders (compact - top-level cards)**:
```
┌─────────────────────────────┐
│ 📎 Brondocument             │
│ 251204 - I&W.docx           │
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│ 🌐 werder.de                │
│ Das Weserstadion |          │
│ Zahlen, Daten & Fakten      │
└─────────────────────────────┘
```

**Renders (expanded - in dialog list)**:
```
┌──────────────────────────────────────────────────────────┐
│ 📎 Brondocument                                          │
│ 251204 - I&W.docx                                        │
│ Pages: 1, 3, 5                                           │
│ Snippet text preview here...                             │
└──────────────────────────────────────────────────────────┘
```

**Behavior**:
- `citation.url` present → Clickable, hover shows pointer
- Click → ExternalLinkConfirm → opens URL
- No URL → Not clickable, neutral styling
- Compact variant → Shows CitationHoverCard on hover
- Expanded variant → No hovercard (already showing full details)

**Icon Logic**:
- `origin === 'web_search'` → Favicon from domain
- Other origins → Paperclip icon (📎)

---

### 5. CitationCardList.tsx

**Purpose**: Tabbed interface showing all citations grouped by origin.

**Props**:
```typescript
interface CitationCardListProps {
  citations: UnifiedCitation[];
  messageId: string;
}
```

**Renders**:
```
┌─────────────────────────────────────────────────────────────────┐
│  🌐 Web  │  ☁️ SharePoint  │  📁 Files  │  📰 News  │  🖼️ Images │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐             │
│ │ Card 1  │ │ Card 2  │ │ Card 3  │ │ +7 sources  │             │
│ │         │ │         │ │         │ │ [stacked]   │             │
│ └─────────┘ └─────────┘ └─────────┘ └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

**Tab Logic**:
- Groups citations by `origin`
- Only shows tabs with citations
- Web tab: `origin === 'web_search'`
- SharePoint tab: `origin === 'sharepoint'`
- Files tab: `origin === 'file_search' || origin === 'mcp'`
- (Optional) News/Images tabs for specific content types

**Overflow**:
- Shows 3-4 cards per tab
- "+N sources/files" button with StackedIcons
- Click opens expanded dialog with all items

**Expanded Dialog ("Agent Bestanden" / "Sources")**:
- Modal with scrollable list
- Uses CitationCard with `variant="expanded"`
- Close button in header

---

### 6. CitationHoverCard.tsx

**Purpose**: Shared hover content wrapper using Ariakit.

**Props**:
```typescript
interface CitationHoverCardProps {
  citation: UnifiedCitation;
  children: ReactNode;           // The trigger element

  // For carousel navigation (CitationInlineMultiple)
  showNav?: boolean;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}
```

**Renders**:
```
┌───────────────────────────────────────┐
│ ← 2/3 →                               │  (if showNav)
├───────────────────────────────────────┤
│ 📎 251204 - I&W.docx                  │
│                                       │
│ Snippet text from the document        │
│ showing relevant content...           │
│                                       │
│ [2023] [Report]                       │  (metadata badges)
│ Pages: 1, 3, 5                        │  (if pages present)
└───────────────────────────────────────┘
```

**Content**:
- Icon (favicon or paperclip based on origin)
- Title/Attribution (clickable if URL, opens ExternalLinkConfirm)
- Snippet
- Metadata badges (year, contentsubtype)
- Page numbers if present
- Navigation arrows if `showNav` (for carousel)

**Styling**:
- 300px width
- Portal-based (z-index 999)
- 150ms show/hide timeout
- ChevronDown disclosure button

---

### 7. ExternalLinkConfirm.tsx

**Purpose**: Confirmation dialog before opening external URLs.

**Props**:
```typescript
interface ExternalLinkConfirmProps {
  url: string;
  trigger: ReactNode;
}
```

**Renders**:
```
┌─────────────────────────────────────────────┐
│ ⚠️  External Link Warning                   │
│                                             │
│ You're about to leave soev.ai               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔗 https://sharepoint.com/doc/...       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│              [Cancel]  [Continue ↗]         │
└─────────────────────────────────────────────┘
```

**Behavior**:
- Clicking trigger opens dialog
- Cancel closes dialog
- Continue opens URL in new tab and closes dialog

---

### 8. StackedIcons.tsx

**Purpose**: Stacked favicon/paperclip icons for overflow indicators.

**Props**:
```typescript
interface StackedIconsProps {
  citations: UnifiedCitation[];
  maxIcons?: number;  // default: 3
}
```

**Renders**:
```
[🌐][🌐][🌐]  (stacked with -6px margin, web sources)
[📎][📎][📎]  (stacked with -6px margin, file sources)
```

**Logic**:
- Shows up to `maxIcons` icons
- Web sources: favicon from domain
- File sources: paperclip icon
- Icons overlap with negative margin

---

### 9. utils.ts

```typescript
// Normalize any source type to UnifiedCitation
export function normalizeSource(source: unknown, turn: number, sourceKey: string, index: number): UnifiedCitation;

// Check if citation has external URL
export function hasExternalUrl(citation: UnifiedCitation): boolean;

// Get display label for citation
export function getDisplayLabel(citation: UnifiedCitation, maxLength?: number): string;

// Sort citations by relevance
export function sortByRelevance(citations: UnifiedCitation[]): UnifiedCitation[];

// Sort pages by relevance
export function sortPagesByRelevance(pages: number[], pageRelevance?: Record<number, number>): number[];

// Get clean domain from URL
export function getCleanDomain(url: string): string;

// Get favicon URL
export function getFaviconUrl(domain: string): string;

// Group citations by origin
export function groupByOrigin(citations: UnifiedCitation[]): Record<CitationOrigin, UnifiedCitation[]>;
```

---

### 10. styles.ts

```typescript
// Clickable citation (has URL)
export const clickableStyle = "text-blue-600 dark:text-blue-400 cursor-pointer hover:underline";

// Non-clickable citation (no URL)
export const neutralStyle = "text-text-primary cursor-default";

// Inline citation pill base
export const inlinePillBase = "ml-1 inline-flex h-5 max-w-36 items-center gap-1 rounded-xl border px-2 text-xs font-medium no-underline transition-colors";

// Inline pill clickable
export const inlinePillClickable = `${inlinePillBase} border-border-heavy bg-surface-secondary hover:bg-surface-hover dark:border-border-medium dark:hover:bg-surface-tertiary ${clickableStyle}`;

// Inline pill neutral
export const inlinePillNeutral = `${inlinePillBase} border-border-heavy bg-surface-secondary dark:border-border-medium ${neutralStyle}`;

// Card base
export const cardBase = "flex flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300";

// Card clickable
export const cardClickable = `${cardBase} hover:bg-surface-tertiary cursor-pointer`;

// Card neutral
export const cardNeutral = `${cardBase} cursor-default`;

// Hovercard container
export const hovercardContainer = "z-[999] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg dark:shadow-lg-dark";
```

---

## Backend Changes

### 1. packages/api/src/citations/processor.ts

```typescript
/**
 * Unified citation processor - handles all source types
 */
export function processToolCitations(params: {
  toolName: string;           // 'file_search', 'web_search', etc.
  toolOutput: unknown;        // Raw tool output
  turn: number;
  sourceKey: string;          // Server name or tool name
  messageId: string;
}): CitationAttachment;

// Internal normalizers
function normalizeWebSearchResult(result: unknown, turn: number, sourceKey: string, index: number): UnifiedCitation;
function normalizeFileSearchResult(result: unknown, turn: number, sourceKey: string, index: number): UnifiedCitation;
function normalizeMCPResult(result: unknown, turn: number, sourceKey: string, index: number): UnifiedCitation;

// Determine origin from metadata
function determineOrigin(metadata?: Record<string, unknown>): CitationOrigin;
```

---

### 2. packages/api/src/citations/accumulator.ts

```typescript
/**
 * Accumulates citations across multiple tool calls
 * FIXES: "second file_search overwrites" bug
 */
export class CitationAccumulator {
  private citationMap: Map<string, UnifiedCitation[]>;

  constructor();

  /**
   * Add citations - ACCUMULATES instead of replacing
   */
  addCitations(attachment: CitationAttachment): void {
    const key = `${attachment.turn}_${attachment.sourceKey}`;
    const existing = this.citationMap.get(key) || [];

    // Start indices after existing citations
    const startIndex = existing.length;
    const newSources = attachment.sources.map((s, i) => ({
      ...s,
      index: startIndex + i,
      id: `${key}_${startIndex + i}`
    }));

    this.citationMap.set(key, [...existing, ...newSources]);
  }

  getAllCitations(): CitationAttachment[];
  getCitationsByTurn(turn: number): CitationAttachment[];
  clear(): void;
}
```

---

### 3. packages/api/src/citations/markers.ts

```typescript
/**
 * Generate citation markers for LLM output
 */
export function generateCitationMarkers(
  sources: UnifiedCitation[],
  turn: number,
  sourceKey: string
): string;

// Output format:
// Available Citations:
// - Document Name (2023, Report): \ue202turn0neo_nl0
//   - Page 1: \ue202turn0neo_nl0p1
//   - Page 3: \ue202turn0neo_nl0p3
```

---

## Integration Points

### Frontend Wiring

1. **Markdown.tsx** (`client/src/components/Chat/Messages/Content/Markdown.tsx`)
   ```typescript
   // Update component mappings
   components: {
     'citation': CitationInline,           // was: Citation
     'composite-citation': CitationInlineMultiple,  // was: CompositeCitation
     'highlighted-text': HighlightedText,  // unchanged
   }
   ```

2. **SearchContent.tsx** (`client/src/components/Chat/Messages/Content/SearchContent.tsx`)
   ```typescript
   // Replace Sources with CitationCardList
   // Wrap with CitationProvider
   <CitationProvider attachments={message.attachments}>
     <CitationCardList
       citations={allCitations}
       messageId={message.messageId}
     />
     {/* ... message content ... */}
   </CitationProvider>
   ```

3. **useSearchResultsByTurn.ts** (`client/src/hooks/Messages/useSearchResultsByTurn.ts`)
   - Replace with CitationProvider's data
   - Or refactor to use normalizeSource() utility

### Backend Wiring

1. **parsers.ts** (`packages/api/src/mcp/parsers.ts`)
   ```typescript
   import { processToolCitations } from '../citations';

   // Replace inline citation logic with:
   const attachment = processToolCitations({
     toolName: 'file_search',
     toolOutput: sources,
     turn,
     sourceKey: sanitizedServerName,
     messageId
   });
   ```

2. **callbacks.js** (`api/server/controllers/agents/callbacks.js`)
   ```typescript
   import { CitationAccumulator } from '@librechat/api/citations';

   // In agent run, use accumulator:
   const citationAccumulator = new CitationAccumulator();

   // On tool end:
   const attachment = processToolCitations({...});
   citationAccumulator.addCitations(attachment);

   // When finalizing:
   responseMessage.attachments = citationAccumulator.getAllCitations();
   ```

3. **Citations/index.js** (`api/server/services/Files/Citations/index.js`)
   ```typescript
   import { processToolCitations } from '@librechat/api/citations';

   // Use unified processor instead of custom logic
   ```

---

## Implementation Order

### Phase 1: Shared Types (1-2 files)
1. Create `packages/api/src/citations/types.ts`
2. Create `client/src/components/Citations/types.ts`

### Phase 2: Backend Citation Logic (3-4 files)
3. Create `packages/api/src/citations/processor.ts`
4. Create `packages/api/src/citations/accumulator.ts`
5. Create `packages/api/src/citations/markers.ts`
6. Create `packages/api/src/citations/index.ts`

### Phase 3: Frontend Utilities (2-3 files)
7. Create `client/src/components/Citations/utils.ts`
8. Create `client/src/components/Citations/styles.ts`

### Phase 4: Frontend Components (8 files)
9. Create `CitationProvider.tsx`
10. Create `ExternalLinkConfirm.tsx`
11. Create `StackedIcons.tsx`
12. Create `CitationHoverCard.tsx`
13. Create `CitationCard.tsx`
14. Create `CitationInline.tsx`
15. Create `CitationInlineMultiple.tsx`
16. Create `CitationCardList.tsx`
17. Create `client/src/components/Citations/index.ts`

### Phase 5: Wire In (3-4 files)
18. Update `Markdown.tsx` to use new inline components
19. Update `SearchContent.tsx` to use CitationCardList + CitationProvider
20. Update `callbacks.js` to use CitationAccumulator
21. Update `parsers.ts` to use processToolCitations()

### Phase 6: Testing & Cleanup (ongoing)
22. Test all citation scenarios
23. Remove old components once verified working
24. Clean up unused imports and code

---

## Testing Checklist

### Inline Citations
- [ ] Single web_search citation: hover shows card, click opens confirmation
- [ ] Single file_search citation with URL: hover shows card, click opens confirmation
- [ ] Single file_search citation without URL: hover shows card, click does nothing, neutral style
- [ ] Single mcp citation with URL: hover shows card, click opens confirmation
- [ ] Single mcp citation without URL: hover shows card, click does nothing
- [ ] Single sharepoint citation with URL: hover shows card, click opens confirmation
- [ ] Multiple citations grouped: shows "[Source +2]" format
- [ ] Multiple citations: carousel navigation works in hovercard
- [ ] Page-level citation: shows "p.3" suffix in label

### Top-Level Cards
- [ ] Web tab: shows web search results with favicons
- [ ] SharePoint tab: shows SharePoint files with paperclip
- [ ] Files tab: shows file_search and mcp files
- [ ] Cards with URL: clickable, shows confirmation on click
- [ ] Cards without URL: not clickable, neutral styling
- [ ] Overflow "+N sources": shows stacked icons
- [ ] Overflow click: opens expanded dialog
- [ ] Expanded dialog: scrollable list with full details

### Accumulation Bug Fix
- [ ] First file_search: citations appear correctly
- [ ] Second file_search (same turn): citations ADDED, not replaced
- [ ] All citations visible in expanded dialog
- [ ] No duplicate entries unless actually duplicate sources

### External Link Confirmation
- [ ] Dialog appears on click
- [ ] Shows correct URL
- [ ] Cancel closes dialog
- [ ] Continue opens URL in new tab

---

## Files Summary

### New Files to Create

**Frontend (11 files)**:
```
client/src/components/Citations/
├── index.ts
├── types.ts
├── utils.ts
├── styles.ts
├── CitationProvider.tsx
├── CitationInline.tsx
├── CitationInlineMultiple.tsx
├── CitationCard.tsx
├── CitationCardList.tsx
├── CitationHoverCard.tsx
├── ExternalLinkConfirm.tsx
└── StackedIcons.tsx
```

**Backend (5 files)**:
```
packages/api/src/citations/
├── index.ts
├── types.ts
├── processor.ts
├── accumulator.ts
└── markers.ts
```

### Files to Modify (Wire In)

```
client/src/components/Chat/Messages/Content/Markdown.tsx
client/src/components/Chat/Messages/Content/SearchContent.tsx
packages/api/src/mcp/parsers.ts
api/server/controllers/agents/callbacks.js
```

### Files to Eventually Remove (After Verification)

```
client/src/components/Web/Citation.tsx
client/src/components/Web/SourceHovercard.tsx
client/src/components/Web/FileSourceCitation.tsx
client/src/components/Web/Sources.tsx
client/src/components/Web/MCPFileItem.tsx
client/src/components/Web/ExternalLinkDialog.tsx
client/src/components/Web/Context.tsx
```

---

## Notes

- Keep all original files until new system is fully tested
- New components should be drop-in replacements
- Use same localization keys where possible
- Maintain backwards compatibility with existing attachment format during transition
