# Citation Prompt System Overview

This document describes how citation instructions are injected into the model prompt across the soev.ai codebase.

## Citation Marker Format

Citations use Unicode markers that are parsed by the frontend and rendered as interactive "pill" components.

| Type | Format | Example |
|------|--------|---------|
| Basic file | `\ue202turn{N}file{index}` | `\ue202turn0file0` |
| Web search | `\ue202turn{N}search{index}` | `\ue202turn0search0` |
| Composite | `\ue200...\ue201` wrapper | `\ue200\ue202turn0file0\ue202turn0file1\ue201` |

---

## Injection Points

Citation instructions enter the model context at **four locations**:

### 1. Tool Description (`fileSearch.js`)

**File:** `api/app/clients/tools/util/fileSearch.js` (lines 167-179)
**Fork status:** Modified (relevance tuning)

When `fileCitations: true`, the file_search tool description includes:

```
**CITE FILE SEARCH RESULTS:**
Use anchor markers immediately after statements derived from file content. Reference the filename in your text:
- File citation: "The document.pdf states that... \ue202turn0file0"
- Multi-file: "Multiple sources confirm... \ue200\ue202turn0file0\ue202turn0file1\ue201"

**ALWAYS mention the filename in your text before the citation marker. NEVER use markdown links or footnotes.**
```

### 2. MCP Parser Injection (`parsers.ts`)

**File:** `packages/api/src/mcp/parsers.ts` (lines 220-250)
**Fork status:** Heavily modified (soev.ai custom citation system)

When processing `artifact://file_search` resources with `fileCitations: true`, injects into tool response:

```
**Available Citations (use these exact markers in your response):**
- filename.pdf [2024, Report]: \ue202turn0file0
- another.docx: \ue202turn0file1
```

### 3. Tool Response Anchors (`fileSearch.js`)

**File:** `api/app/clients/tools/util/fileSearch.js` (lines 143-162)
**Fork status:** Modified

Each search result includes an anchor hint:

```
File: document.pdf
Anchor: \ue202turn0file0 (document.pdf)
Relevance: 0.8750
Content: ...extracted text...
```

### 4. File Search Bias Prompt (`client.js`)

**File:** `api/server/controllers/agents/client.js` (lines 334-343)
**Fork status:** Modified

When files are attached, this system instruction is prepended:

```
When files are attached, ALWAYS call the file_search tool first to retrieve the most relevant passages.
Call file_search MULTIPLE times with different queries to gather comprehensive information from various sections.
Use the retrieved quotes to draft your answer and include citation anchors as instructed.
Provide rich citations: use multiple references per paragraph when information comes from different sources.
```

---

## Known Issues

The model sometimes outputs plain filenames with arrows (`→ filename.pdf`) instead of proper citation markers. Root causes:

| Issue | Description |
|-------|-------------|
| **Conflicting sources** | Instructions appear in 4 places with different wording |
| **Vague bias prompt** | Says "as instructed" but doesn't specify the exact format |
| **No system-level enforcement** | No top-level "MUST use `\ue202` markers" instruction |
| **Reactive injection** | MCP guide appears after tool response, may be truncated in long contexts |
| **Filename mention requirement** | Tool description says "mention filename in text" - model may do this literally |

---

## Configuration

Citation behavior is controlled by:

| Setting | Location | Default |
|---------|----------|---------|
| `fileCitations` permission | Role-based (`PermissionTypes.FILE_CITATIONS`) | Enabled |
| Config default | `packages/data-provider/src/config.ts:594` | `true` |
| Interface override | `appConfig.endpoints?.agents?.fileCitations` | - |
| Min relevance score | `api/server/services/Files/Citations/index.js:58` | `0.45` |

---

## File Modification Status

| File | Fork Status | Key Changes |
|------|-------------|-------------|
| `packages/api/src/mcp/parsers.ts` | Heavily modified | Citation guide injection, Airweave integration |
| `api/app/clients/tools/util/fileSearch.js` | Modified | Relevance tuning |
| `api/server/controllers/agents/client.js` | Modified | Relevance tuning |
| `api/app/clients/tools/util/handleTools.js` | Modified | Web search parameters |

---

## Improvement Opportunities

1. **Consolidate instructions** - Single authoritative location for citation format
2. **Stronger system prompt** - Explicit "MUST use exact marker format" at top level
3. **Remove filename requirement** - Citation pill already shows filename on hover
4. **Proactive injection** - Add format to system prompt upfront, not just in tool response
5. **Negative examples** - Show what NOT to do: `❌ → filename.pdf`

