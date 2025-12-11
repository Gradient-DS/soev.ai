# MCP Citation Overwrite Issue - Findings

## Problem Summary

When multiple MCP tool calls (e.g., `search_document_mcp_NEO_NL`) are made in the same conversation turn, they all receive `turn: 0` in their artifacts. This causes citation markers to be identical (e.g., `\ue202turn0neo_nl0`), resulting in citations overwriting each other.

**Expected behavior:** Each tool call should have a unique turn value (0, 1, 2...) so citation markers are unique.

---

## Root Causes Identified

### 1. Per-Tool Turn Tracking (Not Global)

**File:** `packages/agents/src/tools/ToolNode.ts`

The original code tracks turn **per tool name**, not globally:

```typescript
const turn = this.toolUsageCount.get(call.name) ?? 0;
this.toolUsageCount.set(call.name, turn + 1);
```

**Result:** When different tools are called (e.g., `list_documents`, `search_collection`, `search_document`), each gets `turn: 0` on first use.

**Fix:** Use a global counter that increments for every tool call regardless of tool name:

```typescript
private globalTurnCounter: number = 0;

// In runTool method:
const turn = this.globalTurnCounter++;
```

### 2. Turn Not Propagated in Config

**File:** `packages/agents/src/tools/ToolNode.ts`

The `turn` value needs to be passed in `config.toolCall.turn` for the MCP service to receive it:

```typescript
const toolCallConfig = {
  ...config,
  toolCall: {
    ...(config.toolCall ?? {}),
    turn,
    stepId,
    id: call.id,
    name: call.name,
    args,
  },
};
const output = await tool.invoke(
  { ...call, args, type: 'tool_call', stepId, turn },
  toolCallConfig  // Pass turn in config
);
```

### 3. Stale Compiled Package

**File:** `packages/api/dist/index.js`

The compiled output of `packages/api` was missing the `turn` parameter in the `formatToolContent` call:

```javascript
// Compiled (stale):
return formatToolContent(result, provider, {
    serverName,
    fileCitations: rawConfig?.fileCitations,
});

// Source (correct):
return formatToolContent(result, provider, {
    serverName,
    fileCitations: serverConfig?.fileCitations,
    turn,
});
```

---

## Data Flow Trace

The turn value flows through:

1. **ToolNode.ts** → `this.globalTurnCounter++` → sets `turn`
2. **config.toolCall.turn** → passed to tool invoke
3. **MCP.js** → reads `config?.toolCall?.turn`
4. **manager.ts** → passes to `formatToolContent(result, provider, { serverName, fileCitations, turn })`
5. **parsers.ts** → uses `options.turn` for citation marker: `\ue202turn${turn}${sourceKey}${index}`

---

## Solution Steps

### Step 1: Modify ToolNode.ts

Add global turn counter:

```typescript
// In class properties:
private globalTurnCounter: number = 0;

// In runTool method:
const turn = this.globalTurnCounter++;
const toolCallConfig = {
  ...config,
  toolCall: {
    ...(config.toolCall ?? {}),
    turn,
    stepId,
    id: call.id,
    name: call.name,
    args,
  },
};
const output = await tool.invoke(
  { ...call, args, type: 'tool_call', stepId, turn },
  toolCallConfig
);
```

### Step 2: Rebuild Packages

```bash
# Rebuild agents package
npm run build:agents

# Rebuild api package
npm run build:api
```

### Step 3: Restart Docker

```bash
docker compose -f docker-compose.staging.yml restart api
```

---

## Debugging Notes

### Useful Log Locations

- **ToolNode.ts** - Add: `console.log(`[ToolNode] tool=${call.name}, turn=${turn}`)`
- **MCP.js** (~line 364) - Add: `console.log(`[MCP.js] Turn: ${config?.toolCall?.turn}`)`
- **parsers.ts** - Check `options` in `formatToolContent`

### Verification

After fix, logs should show incrementing turn values:

```
[ToolNode] runTool called: tool=list_documents_mcp_NEO_NL, globalTurn=0
[ToolNode] runTool called: tool=search_collection_mcp_NEO_NL, globalTurn=1
[ToolNode] runTool called: tool=search_document_mcp_NEO_NL, globalTurn=2
```

And artifacts should have unique turns:

```json
{
  "artifacts": {
    "file_search": {
      "turn": 0,  // First call
      "sources": [...]
    }
  }
}
// Next call:
{
  "artifacts": {
    "file_search": {
      "turn": 1,  // Second call - different!
      "sources": [...]
    }
  }
}
```

---

## Status

- [x] Root cause identified: per-tool tracking instead of global
- [x] Config propagation issue identified
- [x] Stale compiled package identified
- [ ] Fix applied and tested
- [ ] Packages rebuilt
- [ ] Docker restarted

---

## Related Files

| File | Purpose |
|------|---------|
| `packages/agents/src/tools/ToolNode.ts` | Tool execution, turn tracking |
| `api/server/services/MCP.js` | MCP entry point, reads config.toolCall.turn |
| `packages/api/src/mcp/manager.ts` | Calls formatToolContent with turn |
| `packages/api/src/mcp/parsers.ts` | Generates citation markers with turn |
| `packages/api/src/mcp/types/index.ts` | Type definitions |
