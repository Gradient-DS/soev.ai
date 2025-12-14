# External Link Confirm Feature

This document describes the implementation of the configurable `externalLinkConfirm` setting, which controls whether users see a confirmation dialog before opening external links from citations.

## Overview

By default, LibreChat shows a confirmation dialog when users click external links in citations (web search results, file sources, etc.). This feature adds a YAML configuration option to disable this dialog, allowing direct navigation to external URLs.

## Configuration

### YAML Setting

Add to your `librechat.yaml` configuration file:

```yaml
interface:
  externalLinkConfirm: true  # Show confirmation dialog (default)
  # externalLinkConfirm: false  # Direct link without confirmation
```

### Behavior

| Setting | Behavior |
|---------|----------|
| `true` (default) | Shows `ExternalLinkConfirm` / `ExternalLinkDialog` modal before opening URL |
| `false` | Opens external URL directly in new tab (`target="_blank"`) |

## Implementation Details

### Files Modified

#### 1. Schema Definition
**File:** `packages/data-provider/src/config.ts`

Added `externalLinkConfirm` to the `interfaceSchema` Zod schema:

```typescript
export const interfaceSchema = z
  .object({
    // ... other settings
    externalLinkConfirm: z.boolean().optional(),
  })
  .default({
    // ... other defaults
    externalLinkConfirm: true,
  });
```

**File:** `packages/data-schemas/src/app/interface.ts`

Added `externalLinkConfirm` to the interface configuration loader:

```typescript
export async function loadDefaultInterface({
  // ...
}) {
  return cleanObject({
    // ... other settings
    externalLinkConfirm: interfaceConfig?.externalLinkConfirm,
    // ...
  });
}
```

#### 2. YAML Configuration
**File:** `librechat.soev.ai.yaml`

```yaml
interface:
  externalLinkConfirm: true
```

#### 3. Citation Components (6 files)

Each citation component was modified with the same pattern:

1. Import the startup config hook
2. Read the `externalLinkConfirm` setting (defaulting to `true`)
3. Conditionally render either the confirmation dialog or a direct link

**Pattern applied:**

```tsx
import { useGetStartupConfig } from '~/data-provider';

// Inside component:
const { data: startupConfig } = useGetStartupConfig();
const showExternalLinkConfirm = startupConfig?.interface?.externalLinkConfirm !== false;

// In render:
if (hasUrl && externalUrl) {
  if (showExternalLinkConfirm) {
    return <ExternalLinkConfirm url={externalUrl} trigger={content} />;
  }
  // Direct link without confirmation dialog
  return (
    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="contents">
      {content}
    </a>
  );
}
```

**Components modified:**

| Component | File Path |
|-----------|-----------|
| CitationCard | `client/src/components/Citations/CitationCard.tsx` |
| CitationHoverCard | `client/src/components/Citations/CitationHoverCard.tsx` |
| CitationInline | `client/src/components/Citations/CitationInline.tsx` |
| CitationInlineMultiple | `client/src/components/Citations/CitationInlineMultiple.tsx` |
| FileSourceCitation | `client/src/components/Web/FileSourceCitation.tsx` |
| MCPFileItem | `client/src/components/Web/MCPFileItem.tsx` |

## Security Considerations

- When `externalLinkConfirm: false`, users are not warned before leaving the application
- External links always use `rel="noopener noreferrer"` for security
- Links open in a new tab (`target="_blank"`)
- Consider your use case before disabling the confirmation dialog

## Testing

1. Set `externalLinkConfirm: true` in YAML, verify confirmation dialog appears
2. Set `externalLinkConfirm: false` in YAML, verify direct navigation works
3. Test all citation types:
   - Web search result citations
   - File search citations (MCP)
   - Inline citations
   - Hover card citations
   - Composite/multiple citations
