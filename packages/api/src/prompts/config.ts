/**
 * Prompts Configuration Accessor for TypeScript packages
 *
 * This module provides a typed interface to the prompts config service
 * from the main API. It allows TypeScript packages (like @librechat/agents)
 * to access configured prompts with proper fallbacks.
 *
 * Usage:
 * ```typescript
 * import { getPrompt } from '@librechat/api';
 *
 * const instructions = await getPrompt(['core', 'instructions'], 'default value');
 * ```
 */

import { logger } from '@librechat/data-schemas';

type PromptPath = string[];

// Cache the imported module to avoid repeated require() calls
let getPromptImpl: ((path: PromptPath, fallback: string) => Promise<string>) | null = null;

/**
 * Lazy load the getPrompt implementation from the API server.
 * This is done lazily to avoid circular dependencies and allow
 * the config system to initialize first.
 */
async function loadGetPromptImpl(): Promise<
  ((path: PromptPath, fallback: string) => Promise<string>) | null
> {
  if (getPromptImpl) {
    return getPromptImpl;
  }

  try {
    // Dynamic require to avoid bundling issues and circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const configModule = require('../../../../api/server/services/Config/getPromptsConfig');
    getPromptImpl = configModule.getPrompt;
    return getPromptImpl;
  } catch (error) {
    // This might happen during build or in environments where the API isn't available
    logger.debug('[getPrompt] Could not load config module, using fallbacks:', error);
    return null;
  }
}

/**
 * Get a configured prompt value with fallback.
 *
 * Navigates the prompts config using a path array and returns the fallback
 * if the path doesn't exist or config is not loaded.
 *
 * @param path - Path to the prompt value (e.g., ['core', 'instructions'])
 * @param fallback - Hardcoded fallback value to use if prompt not found
 * @returns The configured prompt or fallback value
 *
 * @example
 * ```typescript
 * // Get core instructions
 * const instructions = await getPrompt(['core', 'instructions'], 'Default instructions...');
 *
 * // Get task manager prompt
 * const taskManagerPrompt = await getPrompt(
 *   ['agents', 'taskManager', 'prompt'],
 *   FALLBACK_TASK_MANAGER_PROMPT
 * );
 *
 * // Get web search description
 * const searchDesc = await getPrompt(
 *   ['tools', 'webSearch', 'description'],
 *   DEFAULT_SEARCH_DESCRIPTION
 * );
 * ```
 */
export async function getPrompt(path: PromptPath, fallback: string): Promise<string> {
  try {
    const impl = await loadGetPromptImpl();
    if (impl) {
      return await impl(path, fallback);
    }
    return fallback;
  } catch (error) {
    logger.error('[getPrompt] Error retrieving prompt:', error);
    return fallback;
  }
}

/**
 * Synchronous version that returns a Promise.
 * Useful for backwards compatibility with code that expects sync exports.
 * The caller must await the result.
 *
 * @param path - Path to the prompt value
 * @param fallback - Fallback value
 * @returns Promise that resolves to prompt string
 */
export function getPromptSync(path: PromptPath, fallback: string): Promise<string> {
  return getPrompt(path, fallback);
}
