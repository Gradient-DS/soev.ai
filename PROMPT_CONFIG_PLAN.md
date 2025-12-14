# Configurable Prompts Implementation Plan

This document outlines the implementation plan for making LLM prompts configurable via YAML, enabling soev.ai customizations while preserving LibreChat defaults.

## Goals

1. **Preserve upstream compatibility** - Keep original JS prompt files as the source of truth for LibreChat defaults
2. **Enable soev.ai customizations** - Allow overriding specific prompts via `prompts.yaml`
3. **Support user overrides** - Allow deployments to customize prompts via `PROMPTS_PATH` env var
4. **Type safety** - Validate prompt configuration with Zod schemas
5. **Minimal refactoring** - Gradually migrate consumers without breaking changes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PromptService                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Merged Prompts                     │   │
│  │  (defaults + soev overrides + user overrides)       │   │
│  └─────────────────────────────────────────────────────┘   │
│         ▲                    ▲                    ▲         │
│         │                    │                    │         │
│  ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐  │
│  │   Default   │     │  soev.ai    │     │    User     │  │
│  │  (JS files) │     │ prompts.yaml│     │ prompts.yaml│  │
│  │  Priority:1 │     │  Priority:2 │     │  Priority:3 │  │
│  └─────────────┘     └─────────────┘     └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Priority layering:** User overrides > soev.ai overrides > JS defaults

## Prompt Categories

Based on `prompts.md`, these are the prompt categories to support:

| Category | Key | Source File | Dynamic? |
|----------|-----|-------------|----------|
| Core Instructions | `core.instructions` | `instructions.js` | No |
| Core Instructions | `core.error` | `instructions.js` | No |
| Core Instructions | `core.image` | `instructions.js` | No |
| Core Instructions | `core.completion` | `instructions.js` | No |
| Artifacts | `artifacts.base` | `artifacts.js` | No |
| Artifacts | `artifacts.openai` | `artifacts.js` | No |
| Agent Coordination | `agents.taskManager` | `taskmanager.ts` | Yes (`{members}`) |
| Agent Coordination | `agents.supervisor` | `collab.ts` | Yes (`{members}`) |
| RAG Context | `context.ragFooter` | `createContextHandlers.js` | No |
| Vision | `vision.describe` | `createVisionPrompt.js` | No |
| Summary | `summary.default` | `summaryPrompts.js` | Yes (`{summary}`, `{new_lines}`) |
| Summary | `summary.cutoff` | `summaryPrompts.js` | Yes (`{new_lines}`) |
| Title | `title.structured` | `title.ts` | Yes (`{convo}`) |
| Title | `title.completion` | `title.ts` | Yes (`{convo}`) |
| Tools | `tools.webSearch` | `tool.ts` | No |
| Tools | `tools.fileSearch` | `fileSearch.js` | No |
| Tools | `tools.dalle.description` | `DALLE3.js` | No |
| Tools | `tools.dalle.system` | `DALLE3.js` | No |
| Tools | `tools.wolfram.description` | `Wolfram.js` | No |
| Tools | `tools.wolfram.system` | `Wolfram.js` | No |

---

## Phase 1: PromptService Abstraction

**Goal:** Create a centralized service for accessing prompts without changing behavior.

### 1.1 Create PromptService

**File:** `api/server/services/Prompts/PromptService.js`

```javascript
const Mustache = require('mustache');
const { logger } = require('@librechat/data-schemas');

// Import existing prompt defaults
const {
  instructions,
  errorInstructions,
  imageInstructions,
  completionInstructions,
} = require('~/app/clients/prompts/instructions');
const { SUMMARY_PROMPT, CUT_OFF_PROMPT } = require('~/app/clients/prompts/summaryPrompts');
const { createVisionPrompt } = require('~/app/clients/prompts/createVisionPrompt');
const { ragFooter } = require('~/app/clients/prompts/createContextHandlers');

// Disable Mustache's HTML escaping (we want raw text)
Mustache.escape = (text) => text;

/**
 * Default prompts from LibreChat JS files
 * These serve as the baseline that can be overridden
 */
const DEFAULT_PROMPTS = {
  core: {
    instructions,
    error: errorInstructions,
    image: imageInstructions,
    completion: completionInstructions,
  },
  context: {
    ragFooter,
  },
  summary: {
    default: SUMMARY_PROMPT,
    cutoff: CUT_OFF_PROMPT,
  },
  // Note: artifacts, agents, tools, title prompts are handled by their
  // respective modules and will be migrated incrementally
};

class PromptService {
  constructor() {
    this.defaults = DEFAULT_PROMPTS;
    this.overrides = {};
    this.merged = { ...this.defaults };
    this._initialized = false;
  }

  /**
   * Initialize with overrides from YAML config
   * @param {object} yamlOverrides - Parsed prompts.yaml content
   */
  initialize(yamlOverrides = {}) {
    if (this._initialized) {
      logger.warn('PromptService already initialized, skipping');
      return;
    }

    this.overrides = yamlOverrides;
    this.merged = this._deepMerge(this.defaults, this.overrides);
    this._initialized = true;

    logger.info('PromptService initialized', {
      defaultKeys: Object.keys(this.defaults),
      overrideKeys: Object.keys(this.overrides),
    });
  }

  /**
   * Get a prompt by dot-notation key
   * @param {string} key - Prompt key (e.g., 'core.instructions', 'summary.default')
   * @param {object} [variables] - Variables to interpolate (Mustache syntax)
   * @returns {string|null} The prompt text or null if not found
   */
  get(key, variables = {}) {
    const value = this._getByPath(this.merged, key);

    if (value === undefined || value === null) {
      logger.warn(`Prompt not found: ${key}`);
      return null;
    }

    if (typeof value !== 'string') {
      logger.warn(`Prompt ${key} is not a string:`, typeof value);
      return null;
    }

    // Interpolate variables if provided
    if (Object.keys(variables).length > 0) {
      return Mustache.render(value, variables);
    }

    return value;
  }

  /**
   * Check if a prompt exists
   * @param {string} key - Prompt key
   * @returns {boolean}
   */
  has(key) {
    return this._getByPath(this.merged, key) !== undefined;
  }

  /**
   * Get raw prompt without interpolation (for inspection)
   * @param {string} key - Prompt key
   * @returns {string|null}
   */
  getRaw(key) {
    return this._getByPath(this.merged, key) ?? null;
  }

  /**
   * Check if a prompt was overridden from defaults
   * @param {string} key - Prompt key
   * @returns {boolean}
   */
  isOverridden(key) {
    return this._getByPath(this.overrides, key) !== undefined;
  }

  /**
   * Deep merge objects, with source taking precedence
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get value by dot-notation path
   * @private
   */
  _getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}

// Singleton instance
const promptService = new PromptService();

module.exports = promptService;
module.exports.PromptService = PromptService;
```

### 1.2 Create Index File

**File:** `api/server/services/Prompts/index.js`

```javascript
const promptService = require('./PromptService');

module.exports = promptService;
module.exports.PromptService = require('./PromptService').PromptService;
```

### 1.3 Add Path Alias

**File:** Update `api/server/utils/index.js` or equivalent alias config

Ensure `~/server/services/Prompts` resolves correctly.

### 1.4 Unit Tests

**File:** `api/server/services/Prompts/PromptService.spec.js`

```javascript
const { PromptService } = require('./PromptService');

describe('PromptService', () => {
  let service;

  beforeEach(() => {
    service = new PromptService();
  });

  describe('get()', () => {
    it('should return default prompts', () => {
      const prompt = service.get('core.instructions');
      expect(prompt).toContain('all your responses MUST be in the format');
    });

    it('should return null for unknown keys', () => {
      expect(service.get('unknown.key')).toBeNull();
    });

    it('should interpolate variables', () => {
      service.initialize({
        test: {
          greeting: 'Hello, {{name}}!',
        },
      });
      expect(service.get('test.greeting', { name: 'World' })).toBe('Hello, World!');
    });
  });

  describe('initialize()', () => {
    it('should merge overrides with defaults', () => {
      service.initialize({
        core: {
          instructions: 'Custom instructions',
        },
      });
      expect(service.get('core.instructions')).toBe('Custom instructions');
      expect(service.get('core.error')).toContain('encountered an error'); // Default preserved
    });

    it('should only initialize once', () => {
      service.initialize({ core: { instructions: 'First' } });
      service.initialize({ core: { instructions: 'Second' } });
      expect(service.get('core.instructions')).toBe('First');
    });
  });

  describe('isOverridden()', () => {
    it('should detect overridden prompts', () => {
      service.initialize({
        core: { instructions: 'Custom' },
      });
      expect(service.isOverridden('core.instructions')).toBe(true);
      expect(service.isOverridden('core.error')).toBe(false);
    });
  });
});
```

### 1.5 Migration Example

**Before (direct import):**
```javascript
const { instructions } = require('~/app/clients/prompts/instructions');
// Use instructions directly
```

**After (via service):**
```javascript
const promptService = require('~/server/services/Prompts');
const instructions = promptService.get('core.instructions');
```

### 1.6 Deliverables

- [ ] `api/server/services/Prompts/PromptService.js`
- [ ] `api/server/services/Prompts/index.js`
- [ ] `api/server/services/Prompts/PromptService.spec.js`
- [ ] Update path aliases if needed

---

## Phase 2: YAML Loading

**Goal:** Load `prompts.yaml` and merge with defaults at startup.

### 2.1 Create prompts.yaml Schema

**File:** `packages/data-provider/src/prompts.ts`

```typescript
import { z } from 'zod';

/**
 * Schema for individual prompt entries
 * Supports either a string or an object with text + metadata
 */
const promptEntrySchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    description: z.string().optional(),
    variables: z.array(z.string()).optional(),
    deprecated: z.boolean().optional(),
  }),
]);

/**
 * Schema for prompts.yaml configuration
 */
export const promptsConfigSchema = z.object({
  version: z.number().default(1),

  core: z.object({
    instructions: promptEntrySchema.optional(),
    error: promptEntrySchema.optional(),
    image: promptEntrySchema.optional(),
    completion: promptEntrySchema.optional(),
  }).optional(),

  artifacts: z.object({
    base: promptEntrySchema.optional(),
    openai: promptEntrySchema.optional(),
    anthropic: promptEntrySchema.optional(),
  }).optional(),

  agents: z.object({
    taskManager: promptEntrySchema.optional(),
    supervisor: promptEntrySchema.optional(),
    assignTasks: promptEntrySchema.optional(),
    endProcess: promptEntrySchema.optional(),
  }).optional(),

  context: z.object({
    ragFooter: promptEntrySchema.optional(),
    fullContextTemplate: promptEntrySchema.optional(),
    semanticSearchTemplate: promptEntrySchema.optional(),
  }).optional(),

  vision: z.object({
    describe: promptEntrySchema.optional(),
  }).optional(),

  summary: z.object({
    default: promptEntrySchema.optional(),
    cutoff: promptEntrySchema.optional(),
  }).optional(),

  title: z.object({
    structured: promptEntrySchema.optional(),
    completion: promptEntrySchema.optional(),
  }).optional(),

  tools: z.object({
    webSearch: z.object({
      description: promptEntrySchema.optional(),
      citationInstructions: promptEntrySchema.optional(),
    }).optional(),
    fileSearch: z.object({
      description: promptEntrySchema.optional(),
      citationInstructions: promptEntrySchema.optional(),
    }).optional(),
    dalle: z.object({
      description: promptEntrySchema.optional(),
      system: promptEntrySchema.optional(),
      displayMessage: promptEntrySchema.optional(),
    }).optional(),
    wolfram: z.object({
      description: promptEntrySchema.optional(),
      system: promptEntrySchema.optional(),
    }).optional(),
  }).optional(),

  // Allow custom prompts not in the schema
  custom: z.record(z.string(), promptEntrySchema).optional(),
});

export type TPromptsConfig = z.infer<typeof promptsConfigSchema>;
export type TPromptEntry = z.infer<typeof promptEntrySchema>;

/**
 * Normalize prompt entry to string
 * Handles both string and object formats
 */
export function normalizePromptEntry(entry: TPromptEntry | undefined): string | undefined {
  if (entry === undefined) return undefined;
  if (typeof entry === 'string') return entry;
  return entry.text;
}

/**
 * Recursively normalize all prompt entries in a config object
 */
export function normalizePromptsConfig(config: TPromptsConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key === 'version') continue;

    if (typeof value === 'string') {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      if ('text' in value && typeof value.text === 'string') {
        // It's a prompt entry object
        result[key] = value.text;
      } else {
        // It's a nested object, recurse
        result[key] = normalizePromptsConfig(value as TPromptsConfig);
      }
    }
  }

  return result;
}
```

### 2.2 Export from data-provider

**File:** Update `packages/data-provider/src/index.ts`

```typescript
// Add to exports
export {
  promptsConfigSchema,
  normalizePromptEntry,
  normalizePromptsConfig,
  type TPromptsConfig,
  type TPromptEntry,
} from './prompts';
```

### 2.3 Create Prompt Config Loader

**File:** `api/server/services/Prompts/loadPromptsConfig.js`

```javascript
const path = require('path');
const { loadYaml } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  promptsConfigSchema,
  normalizePromptsConfig,
} = require('librechat-data-provider');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultPromptsPath = path.resolve(projectRoot, 'prompts.yaml');

/**
 * Load and validate prompts configuration from YAML
 * Supports layered loading: default file + user override via PROMPTS_PATH
 *
 * @returns {object|null} Normalized prompts config or null if no config found
 */
function loadPromptsConfig() {
  const configs = [];

  // Layer 1: Default prompts.yaml in project root
  const defaultConfig = loadAndValidate(defaultPromptsPath, 'default');
  if (defaultConfig) {
    configs.push(defaultConfig);
  }

  // Layer 2: User override via PROMPTS_PATH environment variable
  const userPromptsPath = process.env.PROMPTS_PATH;
  if (userPromptsPath) {
    const userConfig = loadAndValidate(userPromptsPath, 'user');
    if (userConfig) {
      configs.push(userConfig);
    }
  }

  if (configs.length === 0) {
    logger.info('No prompts.yaml found, using defaults from JS files');
    return null;
  }

  // Merge configs (later configs override earlier ones)
  const merged = configs.reduce((acc, config) => deepMerge(acc, config), {});

  logger.info('Prompts configuration loaded', {
    sources: configs.length,
    hasUserOverride: !!userPromptsPath,
  });

  return merged;
}

/**
 * Load and validate a single prompts config file
 * @private
 */
function loadAndValidate(filePath, source) {
  const rawConfig = loadYaml(filePath);

  if (!rawConfig || rawConfig.reason || rawConfig.stack) {
    // File not found or parse error
    if (source === 'user') {
      logger.warn(`User prompts config not found or invalid: ${filePath}`);
    }
    return null;
  }

  // Validate with Zod schema
  const result = promptsConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    logger.error(`Invalid prompts config at ${filePath}:`, result.error.errors);
    return null;
  }

  // Normalize to flat string values
  const normalized = normalizePromptsConfig(result.data);

  logger.debug(`Loaded prompts from ${source}:`, Object.keys(normalized));

  return normalized;
}

/**
 * Deep merge objects
 * @private
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}

module.exports = loadPromptsConfig;
```

### 2.4 Initialize PromptService at Startup

**File:** Update `api/server/index.js`

Add near the top of the initialization sequence, after config loading:

```javascript
const promptService = require('~/server/services/Prompts');
const loadPromptsConfig = require('~/server/services/Prompts/loadPromptsConfig');

// ... existing code ...

// Initialize prompts configuration
const promptsConfig = loadPromptsConfig();
if (promptsConfig) {
  promptService.initialize(promptsConfig);
}
```

### 2.5 Create Default prompts.yaml

**File:** `prompts.yaml` (project root)

```yaml
# soev.ai Prompts Configuration
# This file overrides LibreChat's default prompts
# See prompts.md for full documentation of available prompts
#
# Usage:
#   - Edit prompts here to customize LLM behavior
#   - Set PROMPTS_PATH env var to load additional overrides
#   - Use {{variable}} syntax for dynamic values (Mustache)

version: 1

# Example: Override artifact instructions
# artifacts:
#   base: |
#     Custom artifact instructions for soev.ai...

# Example: Override task manager prompt
# agents:
#   taskManager: |
#     You are a Task Manager for soev.ai...
#     Team members: {{members}}

# Example: Custom RAG context footer
# context:
#   ragFooter: |
#     Use the retrieved context to answer the user's question.
#     Always cite your sources.
```

### 2.6 Update .gitignore

Add to `.gitignore`:
```
# User prompt overrides (not the default prompts.yaml)
prompts.local.yaml
prompts.*.yaml
!prompts.yaml
```

### 2.7 Deliverables

- [ ] `packages/data-provider/src/prompts.ts` - Zod schema
- [ ] Update `packages/data-provider/src/index.ts` - Export schema
- [ ] `api/server/services/Prompts/loadPromptsConfig.js` - YAML loader
- [ ] `prompts.yaml` - Default config file (mostly comments/examples)
- [ ] Update `api/server/index.js` - Initialize at startup
- [ ] Update `.gitignore`

---

## Phase 3: Migrate Prompt Consumers

**Goal:** Gradually migrate code that uses prompts to go through PromptService.

### 3.1 Migration Priority

Migrate in this order (lowest risk first):

1. **Low risk** - Simple string prompts with no logic
   - `core.instructions`, `core.error`, `core.image`
   - `context.ragFooter`
   - `vision.describe`

2. **Medium risk** - Prompts with variable interpolation
   - `summary.default`, `summary.cutoff`
   - `title.structured`, `title.completion`
   - `agents.taskManager`, `agents.supervisor`

3. **Higher risk** - Provider-specific prompts
   - `artifacts.base`, `artifacts.openai`

4. **Complex** - Tool prompts with special formatting
   - `tools.webSearch`, `tools.fileSearch`
   - `tools.dalle`, `tools.wolfram`

### 3.2 Migration Pattern

For each prompt, follow this pattern:

**Step 1: Add to DEFAULT_PROMPTS in PromptService**

```javascript
// In PromptService.js
const DEFAULT_PROMPTS = {
  // ... existing ...
  vision: {
    describe: require('~/app/clients/prompts/createVisionPrompt').defaultVisionPrompt,
  },
};
```

**Step 2: Update consumer to use PromptService**

```javascript
// Before
const { defaultVisionPrompt } = require('~/app/clients/prompts/createVisionPrompt');
const prompt = defaultVisionPrompt;

// After
const promptService = require('~/server/services/Prompts');
const prompt = promptService.get('vision.describe');
```

**Step 3: Add YAML override capability**

```yaml
# prompts.yaml
vision:
  describe: |
    Custom vision description prompt...
```

### 3.3 Specific Migration: instructions.js

**File:** `api/app/clients/prompts/instructions.js`

Current:
```javascript
const instructions = `Remember, all your responses MUST be in the format described...`;
const errorInstructions = `You encountered an error...`;
// etc.

module.exports = {
  instructions,
  errorInstructions,
  imageInstructions,
  completionInstructions,
};
```

Keep this file unchanged (it's the source of defaults). Update consumers:

**File:** `api/app/clients/output_parsers/handleOutputs.js`

```javascript
// Before
const { instructions, imageInstructions, errorInstructions } = require('../prompts');

// After
const promptService = require('~/server/services/Prompts');

function getInstructions() {
  return promptService.get('core.instructions');
}

function getErrorInstructions() {
  return promptService.get('core.error');
}

function getImageInstructions() {
  return promptService.get('core.image');
}
```

### 3.4 Specific Migration: artifacts.js

This is more complex because of provider-specific logic.

**Option A: Keep logic in JS, make text configurable**

```javascript
// artifacts.js - updated
const promptService = require('~/server/services/Prompts');

const generateArtifactsPrompt = ({ endpoint, artifacts }) => {
  if (artifacts === ArtifactModes.CUSTOM) {
    return null;
  }

  // Get base prompt from service (allows override)
  let prompt;
  if (endpoint === EModelEndpoint.anthropic) {
    prompt = promptService.get('artifacts.anthropic')
          ?? promptService.get('artifacts.base');
  } else {
    prompt = promptService.get('artifacts.openai')
          ?? promptService.get('artifacts.base');
  }

  if (artifacts === ArtifactModes.SHADCNUI) {
    prompt += generateShadcnPrompt({ components, useXML: endpoint === EModelEndpoint.anthropic });
  }

  return prompt;
};
```

**Option B: Full override in YAML**

```yaml
# prompts.yaml
artifacts:
  # Base prompt used for all providers unless variant specified
  base: |
    The assistant can create and reference artifacts...

  # Anthropic-specific (uses XML tags)
  anthropic: |
    The assistant can create and reference artifacts...
    <artifact_instructions>
    ...
    </artifact_instructions>

  # OpenAI-specific (uses markdown)
  openai: |
    The assistant can create and reference artifacts...
    ## Artifact Instructions
    ...
```

### 3.5 Specific Migration: Agent Prompts (TypeScript)

**File:** `packages/agents/src/prompts/taskmanager.ts`

```typescript
// Before
export const taskManagerPrompt = `You are a Task Manager responsible for efficiently coordinating a team of specialized workers: {members}...`;

// After - export default but allow override
import { getPromptService } from '../utils/prompts';

const defaultTaskManagerPrompt = `You are a Task Manager...`;

export function getTaskManagerPrompt(members: string): string {
  const promptService = getPromptService();
  const template = promptService?.get('agents.taskManager') ?? defaultTaskManagerPrompt;
  return template.replace(/\{members\}|\{\{members\}\}/g, members);
}

// Keep original export for backwards compatibility
export const taskManagerPrompt = defaultTaskManagerPrompt;
```

### 3.6 Migration Checklist

#### Phase 3a: Core Instructions
- [ ] `api/app/clients/output_parsers/handleOutputs.js` - uses `instructions`, `errorInstructions`, `imageInstructions`
- [ ] `api/app/clients/BaseClient.js` - uses `truncateToolCallOutputs`

#### Phase 3b: Context/RAG
- [ ] `api/app/clients/prompts/createContextHandlers.js` - export `ragFooter`
- [ ] Consumers of `createContextHandlers`

#### Phase 3c: Summary
- [ ] `api/app/clients/prompts/summaryPrompts.js` - `SUMMARY_PROMPT`, `CUT_OFF_PROMPT`
- [ ] Consumers in context management

#### Phase 3d: Vision
- [ ] `api/app/clients/prompts/createVisionPrompt.js`

#### Phase 3e: Title
- [ ] `packages/agents/src/utils/title.ts`

#### Phase 3f: Artifacts
- [ ] `api/app/clients/prompts/artifacts.js`
- [ ] All consumers via `generateArtifactsPrompt`

#### Phase 3g: Agents
- [ ] `packages/agents/src/prompts/taskmanager.ts`
- [ ] `packages/agents/src/prompts/collab.ts`

#### Phase 3h: Tools
- [ ] `packages/agents/src/tools/search/tool.ts` - web search
- [ ] `api/app/clients/tools/util/fileSearch.js`
- [ ] `api/app/clients/tools/structured/DALLE3.js`
- [ ] `api/app/clients/tools/structured/Wolfram.js`

### 3.7 Deliverables

- [ ] Updated `PromptService.js` with all default prompts
- [ ] Migrated consumers (per checklist above)
- [ ] Unit tests for each migrated module
- [ ] Updated `prompts.yaml` with documented override options

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROMPTS_PATH` | Path to user prompts.yaml override | (none) |

---

## Testing Strategy

### Unit Tests
- `PromptService` initialization and merging
- Zod schema validation
- Variable interpolation
- Override detection

### Integration Tests
- Startup with valid `prompts.yaml`
- Startup with invalid `prompts.yaml` (should fall back to defaults)
- Startup with `PROMPTS_PATH` set
- Verify prompts appear correctly in LLM requests

### Manual Testing
1. Start server without `prompts.yaml` - verify defaults work
2. Add `prompts.yaml` with one override - verify it takes effect
3. Set `PROMPTS_PATH` to custom file - verify user override works
4. Test provider-specific prompts (Anthropic vs OpenAI)

---

## Future Considerations (Out of Scope)

- **Hot-reload**: File watcher for development
- **Admin UI**: Database-backed prompts with version history
- **A/B testing**: Multiple prompt versions with analytics
- **Prompt templates**: Shared fragments and includes
- **i18n**: Localized prompts

---

## Files Changed Summary

### New Files
```
api/server/services/Prompts/
├── PromptService.js
├── PromptService.spec.js
├── loadPromptsConfig.js
└── index.js

packages/data-provider/src/prompts.ts

prompts.yaml
```

### Modified Files
```
api/server/index.js                    # Initialize PromptService
packages/data-provider/src/index.ts    # Export prompts schema
.gitignore                             # Ignore local prompt overrides

# Phase 3 migrations (incremental):
api/app/clients/output_parsers/handleOutputs.js
api/app/clients/prompts/artifacts.js
packages/agents/src/prompts/taskmanager.ts
packages/agents/src/prompts/collab.ts
# ... etc
```
