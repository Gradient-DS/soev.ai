const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const loadPromptsConfig = require('./loadPromptsConfig');
const getLogStores = require('~/cache/getLogStores');

/**
 * Retrieves the prompts configuration object from cache or loads it.
 * @function getPromptsConfig
 * @returns {Promise<Object|null>} - Prompts config object or null
 */
async function getPromptsConfig() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cached = await cache.get(CacheKeys.PROMPTS_CONFIG);

  if (cached) {
    return cached;
  }

  const config = await loadPromptsConfig();

  if (config) {
    await cache.set(CacheKeys.PROMPTS_CONFIG, config);
  }

  return config;
}

/**
 * Helper function to get a specific prompt value with fallback.
 * Navigates the prompts config using a path array and returns the fallback
 * if the path doesn't exist or config is not loaded.
 *
 * @param {string[]} path - Path to the prompt value (e.g., ['core', 'instructions'])
 * @param {string} fallback - Hardcoded fallback value to use if prompt not found
 * @returns {Promise<string>} - The configured prompt or fallback value
 *
 * @example
 * const instructions = await getPrompt(['core', 'instructions'], 'Default instructions...');
 * const taskManagerPrompt = await getPrompt(['agents', 'taskManager', 'prompt'], FALLBACK);
 */
async function getPrompt(path, fallback) {
  try {
    const config = await getPromptsConfig();

    if (!config) {
      return fallback;
    }

    let value = config;
    for (const key of path) {
      value = value?.[key];
      if (value === undefined) {
        return fallback;
      }
    }

    return typeof value === 'string' ? value : fallback;
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
 * @param {string[]} path - Path to the prompt value
 * @param {string} fallback - Fallback value
 * @returns {Promise<string>} - Promise that resolves to prompt string
 */
function getPromptSync(path, fallback) {
  return getPrompt(path, fallback);
}

module.exports = {
  getPromptsConfig,
  getPrompt,
  getPromptSync,
};
