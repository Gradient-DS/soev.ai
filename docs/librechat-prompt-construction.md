# LibreChat Prompt Construction Guide

This document details how LibreChat constructs prompts sent to LLM API endpoints. Use this as a reference for benchmarking with Ragas or replicating prompt behavior externally.

## Table of Contents

1. [Overview](#overview)
2. [Key Source Files](#key-source-files)
3. [Prompt Assembly Flow](#prompt-assembly-flow)
4. [Scenario 1: Attaching Files](#scenario-1-attaching-files)
5. [Scenario 2: MCP Tools](#scenario-2-mcp-tools)
6. [Scenario 3: Web Search](#scenario-3-web-search)
7. [Scenario 4: UI-Defined Agents](#scenario-4-ui-defined-agents)
8. [Server Instructions (librechat.yaml)](#server-instructions-librechatyaml)
9. [Example: MCP Prompt with 6 Tools](#example-mcp-prompt-with-6-tools)
10. [Placeholder Variables](#placeholder-variables)
11. [Tool Format (OpenAI Function Calling)](#tool-format-openai-function-calling)

---

## Overview

LibreChat assembles prompts through multiple layers before sending to the LLM API. The final system prompt combines:

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT                            │
├─────────────────────────────────────────────────────────────┤
│ 1. File Search Bias Instruction (if files + file_search)   │
│ 2. RAG Context (if embedded files via RAG API)             │
│ 3. Agent Instructions (with {{placeholders}} replaced)      │
│ 4. Additional Instructions (artifacts prompt, etc.)         │
│ 5. Tool Context Map (file_search, web_search, code, etc.)  │
│ 6. MCP Server Instructions (from config + server)          │
│ 7. Memory Instructions + Data (if memory enabled)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Source Files

| Component | File Path | Lines |
|-----------|-----------|-------|
| Main prompt assembly | `api/server/controllers/agents/client.js` | `buildMessages()` 282-470 |
| Agent initialization | `api/server/services/Endpoints/agents/agent.js` | `initializeAgent()` 43-224 |
| Run creation | `packages/api/src/agents/run.ts` | `createRun()` 64-171 |
| Tool context generation | `api/app/clients/tools/util/handleTools.js` | `loadTools()` 158-630 |
| MCP instructions format | `packages/api/src/mcp/MCPManager.ts` | `formatInstructionsForContext()` 134-158 |
| RAG context injection | `api/app/clients/prompts/createContextHandlers.js` | 1-160 |
| File search tool | `api/app/clients/tools/util/fileSearch.js` | 1-191 |
| Placeholder replacement | `packages/data-provider/src/parsers.ts` | `replaceSpecialVars()` 414-437 |
| Artifacts prompt | `api/app/clients/prompts/artifacts.js` | 1-537 |
| Memory instructions | `packages/api/src/agents/memory.ts` | 39-71 |
| Agent loading | `api/models/Agent.js` | `loadAgent()` 144-161 |

**External Package:**
- `@librechat/agents` (npm ^3.0.27) - Graph execution, LLM API calls, tool execution

---

## Prompt Assembly Flow

### Step 1: Agent Initialization (`initializeAgent`)

```javascript
// api/server/services/Endpoints/agents/agent.js

// Replace special variables in instructions
if (agent.instructions && agent.instructions !== '') {
  agent.instructions = replaceSpecialVars({
    text: agent.instructions,
    user: req.user,
  });
}

// Generate artifacts prompt if enabled
if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
  agent.additional_instructions = generateArtifactsPrompt({
    endpoint: agent.provider,
    artifacts: agent.artifacts,
  });
}

// Return agent with tools, toolContextMap, etc.
return {
  ...agent,
  tools,
  toolContextMap,  // Tool-specific context strings
  maxContextTokens,
};
```

### Step 2: Build Messages (`buildMessages`)

```javascript
// api/server/controllers/agents/client.js

async buildMessages(messages, parentMessageId, { instructions, additional_instructions }, opts) {
  // Start with base instructions
  let systemContent = [instructions ?? '', additional_instructions ?? '']
    .filter(Boolean)
    .join('\n')
    .trim();

  // [1] File search bias (if files attached + file_search tool)
  if (hasAttachedFiles && hasFileSearchTool) {
    const biasInstruction = [
      'When files are attached, ALWAYS call the file_search tool first...',
      'Call file_search MULTIPLE times with different queries...',
      'Use the retrieved quotes to draft your answer...',
      'Provide rich citations...',
    ].join(' ');
    systemContent = [biasInstruction, systemContent].filter(Boolean).join('\n');
  }

  // [2] RAG context (if contextHandlers exist)
  if (this.contextHandlers) {
    this.augmentedPrompt = await this.contextHandlers.createContext();
    systemContent = this.augmentedPrompt + systemContent;
  }

  // [3] MCP server instructions
  if (mcpServers.length > 0) {
    const mcpInstructions = await getMCPManager().formatInstructionsForContext(mcpServers);
    if (mcpInstructions) {
      systemContent = [systemContent, mcpInstructions].filter(Boolean).join('\n\n');
    }
  }

  // [4] Memory (if enabled)
  const withoutKeys = await this.useMemory();
  if (withoutKeys) {
    systemContent += `${memoryInstructions}\n\n# Existing memory about the user:\n${withoutKeys}`;
  }

  // Set final instructions
  this.options.agent.instructions = systemContent;
}
```

### Step 3: Create Run (`createRun`)

```typescript
// packages/api/src/agents/run.ts

const buildAgentContext = (agent: RunAgent) => {
  // Tool context from toolContextMap (file_search, web_search, etc.)
  const systemMessage = Object.values(agent.toolContextMap ?? {})
    .join('\n')
    .trim();

  // Final system content assembly
  const systemContent = [
    systemMessage,                    // Tool contexts
    agent.instructions ?? '',         // Main instructions
    agent.additional_instructions ?? '', // Artifacts, etc.
  ]
    .join('\n')
    .trim();

  const agentInput: AgentInputs = {
    provider,
    tools: agent.tools,
    clientOptions: llmConfig,
    instructions: systemContent,  // <-- This becomes the system prompt
    maxContextTokens: agent.maxContextTokens,
  };
};
```

---

## Scenario 1: Attaching Files

When files are attached to a conversation, two mechanisms inject context:

### A. RAG Context (Embedded Files)

For files processed through the RAG API (`RAG_API_URL`), context is injected via `createContextHandlers`:

```javascript
// api/app/clients/prompts/createContextHandlers.js

const createContext = async () => {
  const header = `The user has attached ${oneFile ? 'a' : processedFiles.length} file${!oneFile ? 's' : ''} to the conversation:`;

  const files = processedFiles.map(file => `
    <file>
      <filename>${file.filename}</filename>
      <type>${file.type}</type>
    </file>`).join('');

  const context = resolvedQueries.map((queryResult, index) => {
    const file = processedFiles[index];
    const contextItems = queryResult.data.map(item => `
      <contextItem>
        <![CDATA[${item[0].page_content?.trim()}]]>
      </contextItem>`).join('');
    
    return `
      <file>
        <filename>${file.filename}</filename>
        <context>${contextItems}</context>
      </file>`;
  }).join('');

  return `${header}
    ${files}
    
    A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.
    
    <context>${context}</context>
    
    Use the context as your learned knowledge to better answer the user.
    
    In your response, remember to follow these guidelines:
    - If you don't know the answer, simply say that you don't know.
    - If you are unsure how to answer, ask for clarification.
    - Avoid mentioning that you obtained the information from the context.`;
};
```

### B. File Search Tool Context

When `file_search` tool is enabled, a tool context is added:

```javascript
// api/app/clients/tools/util/fileSearch.js

let toolContext = `- Note: Use the file_search tool to find relevant information within:`;
for (const file of dbFiles) {
  toolContext += `\n\t- ${file.filename}${
    agentResourceIds.has(file.file_id) ? '' : ' (just attached by user)'
  }`;
}
```

### C. File Search Bias Instruction

When both files are attached AND `file_search` tool exists:

```
When files are attached, ALWAYS call the file_search tool first to retrieve the most relevant passages. Call file_search MULTIPLE times with different queries to gather comprehensive information from various sections. Use the retrieved quotes to draft your answer and include citation anchors as instructed. Provide rich citations: use multiple references per paragraph when information comes from different sources.
```

### Example: Files Attached System Prompt

```
When files are attached, ALWAYS call the file_search tool first to retrieve the most relevant passages. Call file_search MULTIPLE times with different queries to gather comprehensive information from various sections. Use the retrieved quotes to draft your answer and include citation anchors as instructed. Provide rich citations: use multiple references per paragraph when information comes from different sources.

The user has attached 2 files to the conversation:
<files>
  <file>
    <filename>report.pdf</filename>
    <type>application/pdf</type>
  </file>
  <file>
    <filename>data.xlsx</filename>
    <type>application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</type>
  </file>
</files>

A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

<context>
  <file>
    <filename>report.pdf</filename>
    <context>
      <contextItem>
        <![CDATA[The analysis shows that renewable energy adoption increased by 15% in 2024...]]>
      </contextItem>
      <contextItem>
        <![CDATA[Key factors include government subsidies and falling solar panel costs...]]>
      </contextItem>
    </context>
  </file>
</context>

Use the context as your learned knowledge to better answer the user.

[Agent Instructions Here]

- Note: Use the file_search tool to find relevant information within:
	- report.pdf
	- data.xlsx (just attached by user)
```

---

## Scenario 2: MCP Tools

MCP (Model Context Protocol) servers provide tools with optional server-specific instructions.

### MCP Configuration in librechat.yaml

```yaml
mcpServers:
  ANVS-IAEA-Wetten:
    type: streamable-http
    url: http://localhost:3434/mcp
    headers:
      Authorization: "Bearer ${MCP_KEY}"
    timeout: 60000
    chatMenu: true
    serverInstructions: |
      When using search tools, synthesize results into a clear answer in the user's language.
      
      **CITE SEARCH RESULTS:**
      Use EXACT anchor markers provided in results. Copy markers like \ue202turn0file0 
      into your response immediately after statements from that source:
      - Single source: "Statement here \ue202turn0file1."
      - Multiple sources: "Statement \ue200\ue202turn0file0\ue202turn0file1\ue201."
```

### MCP Instructions Formatting

```typescript
// packages/api/src/mcp/MCPManager.ts

public async formatInstructionsForContext(serverNames?: string[]): Promise<string> {
  const instructionsToInclude = await this.getInstructions(serverNames);

  if (Object.keys(instructionsToInclude).length === 0) {
    return '';
  }

  const formattedInstructions = Object.entries(instructionsToInclude)
    .map(([serverName, instructions]) => {
      return `## ${serverName} MCP Server Instructions

${instructions}`;
    })
    .join('\n\n');

  return `# MCP Server Instructions

The following MCP servers are available with their specific instructions:

${formattedInstructions}

Please follow these instructions when using tools from the respective MCP servers.`;
}
```

### MCP Tool Naming Convention

Tools from MCP servers are named: `{toolName}__mcp__{serverName}`

Example: `search_anvs__mcp__ANVS-IAEA-Wetten`

### Example: MCP System Prompt

```
[Agent Instructions]
You are a helpful assistant specialized in nuclear regulations.

# MCP Server Instructions

The following MCP servers are available with their specific instructions:

## ANVS-IAEA-Wetten MCP Server Instructions

When using search tools, synthesize results into a clear answer in the user's language.

**CITE SEARCH RESULTS:**
Use EXACT anchor markers provided in results. Copy markers like \ue202turn0file0 
into your response immediately after statements from that source:
- Single source: "Statement here \ue202turn0file1."
- Multiple sources: "Statement \ue200\ue202turn0file0\ue202turn0file1\ue201."

Please follow these instructions when using tools from the respective MCP servers.
```

---

## Scenario 3: Web Search

When `web_search` tool is enabled, a comprehensive tool context is injected.

### Web Search Tool Context

```javascript
// api/app/clients/tools/util/handleTools.js (lines 428-455)

toolContextMap[tool] = `# \`${tool}\` (WEB SEARCH) – RULES

YOU HAVE ACCESS TO A WEB SEARCH TOOL. FOLLOW THESE RULES STRICTLY:

1. CALL THE TOOL INSTEAD OF DESCRIBING A SEARCH.
   - Never write things like "let's search", "we should use web_search" or raw JSON such as {"query": "..."}.
   - When you decide that web search is needed, IMMEDIATELY call the \`${tool}\` tool.

2. HOW OFTEN TO USE IT
   - At most **one tool call per user question** (unless the user explicitly asks for more searches).
   - Do not call the tool again for the same question after you have results.

3. HOW TO WRITE THE QUERY
   - Use a short keyword query (3–6 words), not a full sentence.
   - Example good queries:
     - "Rotterdam weather now"
     - "Rotterdam hourly weather"
     - "Rotterdam weer komende 6 uur"
   - Avoid long natural language queries like
     - "Rotterdam hour by hour forecast November 5 2025 6 hour"

4. AFTER THE TOOL RETURNS
   - Read the provided "output" text and answer the user directly.
   - Start with a clear answer, then explain details.
   - Use citations that are already provided; do not invent new URLs.

ANSWER IN THE USER'S LANGUAGE (DUTCH IN YOUR CASE).`;
```

### Web Search Tool Schema

```json
{
  "type": "function",
  "function": {
    "name": "web_search",
    "description": "Search the web for current information. Returns relevant web pages with snippets.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The search query (3-6 keywords recommended)"
        }
      },
      "required": ["query"]
    }
  }
}
```

### Example: Web Search System Prompt

```
[Agent Instructions]
You are a helpful assistant.

# `web_search` (WEB SEARCH) – RULES

YOU HAVE ACCESS TO A WEB SEARCH TOOL. FOLLOW THESE RULES STRICTLY:

1. CALL THE TOOL INSTEAD OF DESCRIBING A SEARCH.
   - Never write things like "let's search", "we should use web_search" or raw JSON such as {"query": "..."}.
   - When you decide that web search is needed, IMMEDIATELY call the `web_search` tool.

2. HOW OFTEN TO USE IT
   - At most **one tool call per user question** (unless the user explicitly asks for more searches).
   - Do not call the tool again for the same question after you have results.

3. HOW TO WRITE THE QUERY
   - Use a short keyword query (3–6 words), not a full sentence.
   - Example good queries:
     - "Rotterdam weather now"
     - "Rotterdam hourly weather"
   - Avoid long natural language queries.

4. AFTER THE TOOL RETURNS
   - Read the provided "output" text and answer the user directly.
   - Start with a clear answer, then explain details.
   - Use citations that are already provided; do not invent new URLs.

ANSWER IN THE USER'S LANGUAGE.
```

---

## Scenario 4: UI-Defined Agents

Agents created through the LibreChat UI have configurable instructions, tools, and settings.

### Agent Schema (from MongoDB)

```javascript
{
  id: "agent_abc123",
  name: "Nuclear Regulations Expert",
  description: "Expert on ANVS, IAEA, and Dutch nuclear law",
  instructions: "You are an expert on nuclear regulations. Current date: {{current_date}}...",
  provider: "openai",
  model: "gpt-4",
  tools: ["file_search", "search_anvs__mcp__ANVS-IAEA-Wetten", ...],
  artifacts: "shadcnui",  // or null
  tool_resources: {
    file_search: {
      file_ids: ["file_123", "file_456"]
    }
  }
}
```

### Agent Loading Flow

```javascript
// api/models/Agent.js

const loadAgent = async ({ req, spec, agent_id, endpoint, model_parameters }) => {
  if (agent_id === EPHEMERAL_AGENT_ID) {
    return await loadEphemeralAgent({ req, spec, agent_id, endpoint, model_parameters });
  }
  
  const agent = await getAgent({ id: agent_id });
  return agent;
};

// api/server/services/Endpoints/agents/agent.js

const initializeAgent = async ({ req, res, agent, loadTools, ... }) => {
  // Apply special variable replacement
  if (agent.instructions && agent.instructions !== '') {
    agent.instructions = replaceSpecialVars({
      text: agent.instructions,
      user: req.user,
    });
  }

  // Generate artifacts prompt if enabled
  if (typeof agent.artifacts === 'string' && agent.artifacts !== '') {
    agent.additional_instructions = generateArtifactsPrompt({
      endpoint: agent.provider,
      artifacts: agent.artifacts,
    });
  }

  // Load and configure tools
  const { loadedTools, toolContextMap } = await loadTools({ ... });

  return {
    ...agent,
    tools: loadedTools,
    toolContextMap,
  };
};
```

### Example: UI Agent System Prompt

```
[Tool Contexts]
- Note: Use the file_search tool to find relevant information within:
	- anvs-regulations.pdf
	- iaea-safety-standards.pdf

[Agent Instructions - with placeholders replaced]
You are an expert on nuclear regulations. Current date: 2025-11-25 (2).

When answering questions:
1. Always cite specific regulation sections
2. Distinguish between Dutch (ANVS) and international (IAEA) standards
3. Use formal, precise language

# MCP Server Instructions

The following MCP servers are available with their specific instructions:

## ANVS-IAEA-Wetten MCP Server Instructions

When using search tools, synthesize results into a clear answer...

Please follow these instructions when using tools from the respective MCP servers.

[Artifacts Prompt - if enabled]
The assistant can create and reference artifacts during conversations...
```

---

## Server Instructions (librechat.yaml)

MCP server instructions can be configured in `librechat.yaml`:

```yaml
mcpServers:
  # Server with custom instructions
  "Landbouw & Natuur":
    type: streamable-http
    url: http://localhost:3434/mcp
    headers:
      Authorization: "Bearer ${GKN_MCP_KEY}"
    timeout: 60000
    chatMenu: true
    serverInstructions: |
      When using the gkn_search tool, synthesize the results into a clear, 
      comprehensive answer in the language of the question.
      
      **CITE SEARCH RESULTS:**
      Use the EXACT anchor markers provided in the search results. 
      The results include citation markers like \ue202turn0file0.
      Copy these markers into your response immediately after statements 
      derived from that source:
      - Single source: "Veenweidegebieden zijn weidegebieden met een hoge waterstand \ue202turn0file1."
      - Multiple sources: "Dit wordt ondersteund door meerdere studies \ue200\ue202turn0file0\ue202turn0file1\ue201."
      
      **Critical rules:**
      - Copy the \ue202turn0file{number} markers EXACTLY as shown in the search results
      - Place markers immediately after sentences (with a space before)
      - Mention the source title/filename in your text before the citation marker
      - Do NOT use brackets 【】, markdown links, or footnotes
      
      Synthesize information naturally while preserving these citation markers.

  # Server using its own instructions (from server)
  "NEO NL":
    type: streamable-http
    url: http://host.docker.internal:3435/mcp
    headers:
      Authorization: Bearer ${NEONL_MCP_KEY}
    timeout: 60000
    serverInstructions: true  # Use instructions from MCP server
    chatMenu: true
```

### Instruction Source Priority

1. `serverInstructions: |` (string) - Use this exact text
2. `serverInstructions: true` - Fetch from MCP server
3. No `serverInstructions` - No instructions injected

---

## Example: MCP Prompt with 6 Tools (NEO Search Server)

The NEO MCP Server provides a 2-step search pattern for three document collections:
- **Wetten (Dutch Legislation)** - Kernenergiewet, Besluit Stralingsbescherming, etc.
- **IAEA** - International Atomic Energy Agency safety standards
- **ANVS** - Dutch Authority for Nuclear Safety and Radiation Protection

### Tool Pattern: 2-Step Search

Each collection has two tools:
1. **STEP 1 (Discovery)**: `zoek_documenten_*` - Find relevant documents, get Document IDs
2. **STEP 2 (Focused)**: `zoek_in_specifieke_*` - Search within specific documents by ID

### Configuration

```yaml
mcpServers:
  neo-search-server:
    type: streamable-http
    url: http://localhost:8000/mcp
    timeout: 60000
    chatMenu: true
    serverInstructions: |
      You have access to search tools for nuclear regulation documents using a 2-STEP process.
      
      **STEP 1 - DOCUMENT DISCOVERY:**
      Use 'zoek_documenten_*' tools FIRST to identify relevant documents.
      Results show "📄 Document ID: [number]" for each document.
      Check the SUMMARY at the end for all unique Document IDs.
      
      **STEP 2 - FOCUSED SEARCH:**
      Use 'zoek_in_specifieke_*' tools with the Document IDs from Step 1.
      Pass doc_ids as a list of integers: [39248184, 12345]
      NOT [0, 1, 2] - use the actual Document ID numbers!
      
      **AVAILABLE COLLECTIONS:**
      - Nederlandse wetgeving: zoek_documenten_nederlandse_wetgeving → zoek_in_specifieke_wetgeving
      - IAEA documenten: zoek_documenten_iaea_kennis → zoek_in_specifieke_iaea_documenten
      - ANVS documenten: zoek_documenten_anvs_kennis → zoek_in_specifieke_anvs_documenten
      
      **CITATION FORMAT:**
      Use citation markers exactly as provided in search results: \ue202turn0file{n}
      Place markers immediately after sentences derived from that source.
      
      Always answer in the user's language (Dutch).
```

### Complete System Prompt

```
You are a nuclear regulations expert assistant. Current date: 2025-11-25 (2).

Help users understand nuclear safety regulations, radiation protection requirements, 
and compliance obligations. Be precise and cite specific regulation sections.

# MCP Server Instructions

The following MCP servers are available with their specific instructions:

## neo-search-server MCP Server Instructions

You have access to search tools for nuclear regulation documents using a 2-STEP process.

**STEP 1 - DOCUMENT DISCOVERY:**
Use 'zoek_documenten_*' tools FIRST to identify relevant documents.
Results show "📄 Document ID: [number]" for each document.
Check the SUMMARY at the end for all unique Document IDs.

**STEP 2 - FOCUSED SEARCH:**
Use 'zoek_in_specifieke_*' tools with the Document IDs from Step 1.
Pass doc_ids as a list of integers: [39248184, 12345]
NOT [0, 1, 2] - use the actual Document ID numbers!

**AVAILABLE COLLECTIONS:**
- Nederlandse wetgeving: zoek_documenten_nederlandse_wetgeving → zoek_in_specifieke_wetgeving
- IAEA documenten: zoek_documenten_iaea_kennis → zoek_in_specifieke_iaea_documenten
- ANVS documenten: zoek_documenten_anvs_kennis → zoek_in_specifieke_anvs_documenten

**CITATION FORMAT:**
Use citation markers exactly as provided in search results: \ue202turn0file{n}
Place markers immediately after sentences derived from that source.

Always answer in the user's language (Dutch).

Please follow these instructions when using tools from the respective MCP servers.
```

### Tools Array (OpenAI Function Calling Format)

```json
[
  {
    "type": "function",
    "function": {
      "name": "zoek_documenten_nederlandse_wetgeving__mcp__neo-search-server",
      "description": "STEP 1: Search Dutch legislation database to discover which documents are relevant to your query. Use this tool FIRST to identify relevant documents. Each result displays '📄 Document ID: [number]' - these are the IDs you need for step 2. After reviewing results, use 'zoek_in_specifieke_wetgeving' with the document IDs from the summary for focused search.",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of results to return (1-10, default: 5)"
          }
        },
        "required": ["question"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "zoek_in_specifieke_wetgeving__mcp__neo-search-server",
      "description": "STEP 2: Search within specific Dutch legislation documents that you've already identified. Use this tool AFTER 'zoek_documenten_nederlandse_wetgeving'. IMPORTANT: doc_ids requires actual Document ID numbers from step 1 (e.g., [39248184, 12345], NOT [0, 1, 2]).",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "doc_ids": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "List of document IDs to search within (from step 1 SUMMARY)"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of chunks to return (1-20, default: 10)"
          }
        },
        "required": ["question", "doc_ids"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "zoek_documenten_iaea_kennis__mcp__neo-search-server",
      "description": "STEP 1: Search IAEA nuclear safety database to discover which documents are relevant to your query. Use this tool FIRST to identify relevant IAEA documents. After reviewing results, use 'zoek_in_specifieke_iaea_documenten' with the document IDs for focused search.",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of results to return (1-10, default: 5)"
          }
        },
        "required": ["question"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "zoek_in_specifieke_iaea_documenten__mcp__neo-search-server",
      "description": "STEP 2: Search within specific IAEA nuclear safety documents that you've already identified. Use this tool AFTER 'zoek_documenten_iaea_kennis'. IMPORTANT: doc_ids requires actual Document ID numbers from step 1.",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "doc_ids": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "List of document IDs to search within (from step 1 SUMMARY)"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of chunks to return (1-20, default: 10)"
          }
        },
        "required": ["question", "doc_ids"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "zoek_documenten_anvs_kennis__mcp__neo-search-server",
      "description": "STEP 1: Search ANVS nuclear safety database to discover which documents are relevant to your query. Use this tool FIRST to identify relevant ANVS documents. After reviewing results, use 'zoek_in_specifieke_anvs_documenten' with the document IDs for focused search.",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of results to return (1-10, default: 5)"
          }
        },
        "required": ["question"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "zoek_in_specifieke_anvs_documenten__mcp__neo-search-server",
      "description": "STEP 2: Search within specific ANVS nuclear safety documents that you've already identified. Use this tool AFTER 'zoek_documenten_anvs_kennis'. IMPORTANT: doc_ids requires actual Document ID numbers from step 1.",
      "parameters": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The search query or question"
          },
          "doc_ids": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "List of document IDs to search within (from step 1 SUMMARY)"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of chunks to return (1-20, default: 10)"
          }
        },
        "required": ["question", "doc_ids"]
      }
    }
  }
]
```

### Complete API Request Example

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a nuclear regulations expert assistant. Current date: 2025-11-25 (2).\n\nHelp users understand nuclear safety regulations...\n\n# MCP Server Instructions\n\nThe following MCP servers are available with their specific instructions:\n\n## neo-search-server MCP Server Instructions\n\nYou have access to search tools for nuclear regulation documents using a 2-STEP process...\n\nPlease follow these instructions when using tools from the respective MCP servers."
    },
    {
      "role": "user",
      "content": "Wat zijn de eisen voor stralingsbescherming bij nucleaire installaties in Nederland?"
    }
  ],
  "tools": [
    {"type": "function", "function": {"name": "zoek_documenten_nederlandse_wetgeving__mcp__neo-search-server", ...}},
    {"type": "function", "function": {"name": "zoek_in_specifieke_wetgeving__mcp__neo-search-server", ...}},
    {"type": "function", "function": {"name": "zoek_documenten_iaea_kennis__mcp__neo-search-server", ...}},
    {"type": "function", "function": {"name": "zoek_in_specifieke_iaea_documenten__mcp__neo-search-server", ...}},
    {"type": "function", "function": {"name": "zoek_documenten_anvs_kennis__mcp__neo-search-server", ...}},
    {"type": "function", "function": {"name": "zoek_in_specifieke_anvs_documenten__mcp__neo-search-server", ...}}
  ],
  "tool_choice": "auto",
  "temperature": 0.7
}
```

### Example Multi-Turn Tool Usage

**Turn 1 - User asks about radiation protection:**
```
User: Wat zijn de eisen voor stralingsbescherming?
```

**Turn 2 - LLM calls STEP 1 tool:**
```json
{
  "tool_calls": [{
    "function": {
      "name": "zoek_documenten_nederlandse_wetgeving__mcp__neo-search-server",
      "arguments": "{\"question\": \"stralingsbescherming eisen\", \"num_results\": 5}"
    }
  }]
}
```

**Turn 3 - Tool returns document metadata:**
```
📚 DOCUMENT DISCOVERY - Relevant Documents Found:
================================================================================

📄 **Document ID: 39248184**
   Title: Besluit stralingsbescherming
   Relevance Score: 0.8542
   Matching Chunks: 3
   ...

📋 **SUMMARY: Found 3 unique document(s)**
**Document IDs for STEP 2:** [39248184, 39248190, 39248195]

💡 **Next Step:** Use 'zoek_in_specifieke_wetgeving' with the document IDs above.
```

**Turn 4 - LLM calls STEP 2 tool with Document IDs:**
```json
{
  "tool_calls": [{
    "function": {
      "name": "zoek_in_specifieke_wetgeving__mcp__neo-search-server",
      "arguments": "{\"question\": \"stralingsbescherming eisen dosislimieten\", \"doc_ids\": [39248184, 39248190], \"num_results\": 10}"
    }
  }]
}
```

**Turn 5 - Tool returns detailed content with citations:**
```
Retrieved context:

📄 Document ID: 39248184
Besluit stralingsbescherming (Pages: 12, 15, 18)
URL: https://wetten.overheid.nl/...

Artikel 4.1 - Dosislimieten voor werknemers...
===============================
...
```

---

## Placeholder Variables

LibreChat supports these placeholders in agent instructions:

| Placeholder | Example Output | Description |
|-------------|----------------|-------------|
| `{{current_date}}` | `2025-11-25 (2)` | YYYY-MM-DD (weekday: 0=Sun, 1=Mon, ...) |
| `{{current_datetime}}` | `2025-11-25 14:30:45 (2)` | YYYY-MM-DD HH:mm:ss (weekday) |
| `{{iso_datetime}}` | `2025-11-25T14:30:45.123Z` | ISO 8601 timestamp |
| `{{current_user}}` | `John Doe` | User's display name |

### Implementation

```typescript
// packages/data-provider/src/parsers.ts

export function replaceSpecialVars({ text, user }: { text: string; user?: TUser | null }) {
  let result = text;
  if (!result) return result;

  const currentDate = dayjs().format('YYYY-MM-DD');
  const dayNumber = dayjs().day();
  const combinedDate = `${currentDate} (${dayNumber})`;
  result = result.replace(/{{current_date}}/gi, combinedDate);

  const currentDatetime = dayjs().format('YYYY-MM-DD HH:mm:ss');
  result = result.replace(/{{current_datetime}}/gi, `${currentDatetime} (${dayNumber})`);

  const isoDatetime = dayjs().toISOString();
  result = result.replace(/{{iso_datetime}}/gi, isoDatetime);

  if (user && user.name) {
    result = result.replace(/{{current_user}}/gi, user.name);
  }

  return result;
}
```

---

## Tool Format (OpenAI Function Calling)

All tools are converted to OpenAI function calling format:

```json
{
  "type": "function",
  "function": {
    "name": "tool_name",
    "description": "What the tool does",
    "parameters": {
      "type": "object",
      "properties": {
        "param1": {
          "type": "string",
          "description": "Parameter description"
        }
      },
      "required": ["param1"]
    }
  }
}
```

### Tool Name Conventions

| Tool Type | Name Format | Example |
|-----------|-------------|---------|
| Built-in | `{tool_name}` | `file_search`, `web_search`, `execute_code` |
| MCP | `{tool}__mcp__{server}` | `search_anvs__mcp__ANVS-IAEA-Wetten` |
| Tavily | `tavily_search_results_json` | - |
| Google Search | `google` | - |

---

## Debugging: Capturing Actual Prompts

To see what LibreChat actually sends to the LLM API, add logging in:

```javascript
// api/server/controllers/agents/client.js - around line 945

run = await createRun({
  agents,
  indexTokenCountMap,
  runId: this.responseMessageId,
  signal: abortController.signal,
  customHandlers: this.options.eventHandlers,
  requestBody: config.configurable.requestBody,
  tokenCounter: createTokenCounter(this.getEncoding()),
});

// Add logging here:
console.log('=== LLM REQUEST ===');
console.log('System Prompt:', this.options.agent.instructions);
console.log('Tools:', JSON.stringify(this.options.agent.tools?.map(t => t.name), null, 2));
console.log('Messages:', JSON.stringify(initialMessages.slice(-1), null, 2));
```

---

## Summary

LibreChat's prompt construction follows this order:

1. **Tool Contexts** - From `toolContextMap` (file_search listing, web_search rules, etc.)
2. **File Search Bias** - If files attached + file_search tool
3. **RAG Context** - If embedded files exist
4. **Agent Instructions** - With `{{placeholders}}` replaced
5. **Additional Instructions** - Artifacts prompt if enabled
6. **MCP Instructions** - Formatted server instructions
7. **Memory** - If memory feature enabled

For single-turn Q&A benchmarking with Ragas, focus on capturing:
- System prompt (all components above combined)
- User message
- Tools array (OpenAI function format)
- Model parameters (temperature, etc.)

