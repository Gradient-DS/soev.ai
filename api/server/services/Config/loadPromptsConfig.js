const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const { loadYaml } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { extractEnvVariable } = require('librechat-data-provider');
const { promptsSchema } = require('./promptsSchema');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultPromptsPath = path.resolve(projectRoot, 'prompts.yml');

let i = 0;

/**
 * Check if value is a plain object (not array, null, etc.)
 * @param {any} item
 * @returns {boolean}
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deep merge two objects. Source overrides target for matching keys.
 * @param {Object} target - Base object
 * @param {Object} source - Object to merge in (takes priority)
 * @returns {Object} - Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

/**
 * Recursively apply extractEnvVariable to all string values in an object.
 * Handles nested objects and arrays.
 * @param {any} obj - Object to process
 * @returns {any} - Object with env variables resolved
 */
function applyEnvVariables(obj) {
  if (typeof obj === 'string') {
    return extractEnvVariable(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(applyEnvVariables);
  }

  if (isObject(obj)) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = applyEnvVariables(value);
    }
    return result;
  }

  return obj;
}

/**
 * Load a YAML config file from a path (local or remote).
 * @param {string} configPath - Path or URL to config file
 * @returns {Promise<Object|null>} - Parsed config or null on failure
 */
async function loadYamlConfig(configPath) {
  if (/^https?:\/\//.test(configPath)) {
    try {
      const response = await axios.get(configPath);
      let config = response.data;
      if (typeof config === 'string') {
        config = yaml.load(config);
      }
      return config;
    } catch (error) {
      logger.error(`Failed to fetch remote prompts config from ${configPath}:`, error.message);
      return null;
    }
  }

  const config = loadYaml(configPath);
  if (!config || config.reason || config.stack) {
    return null;
  }
  return config;
}

/**
 * Load prompts configuration with three-tier priority:
 * 1. Custom override (PROMPT_OVERRIDE_PATH env var) - deep merged into defaults
 * 2. Default prompts.yml in project root
 * 3. Hardcoded fallbacks (handled by consumers via getPrompt())
 *
 * Supports:
 * - Environment variable substitution via ${VAR_NAME} syntax
 * - Deep merging for partial overrides
 * - Validation via Zod schema
 *
 * @function loadPromptsConfig
 * @param {boolean} printConfig - Whether to log loaded config info
 * @returns {Promise<Object|null>} - Prompts config object or null if no config found
 */
async function loadPromptsConfig(printConfig = true) {
  let defaultConfig = null;
  let customConfig = null;

  // Load default prompts.yml from project root
  defaultConfig = await loadYamlConfig(defaultPromptsPath);
  if (!defaultConfig && i === 0) {
    logger.debug('Default prompts.yml not found or invalid. Using hardcoded fallbacks.');
  }

  // Load custom override if PROMPT_OVERRIDE_PATH is set
  const customPromptsPath = process.env.PROMPT_OVERRIDE_PATH;
  if (customPromptsPath) {
    customConfig = await loadYamlConfig(customPromptsPath);
    if (!customConfig && i === 0) {
      logger.warn(`Custom prompts config at ${customPromptsPath} not found or invalid.`);
    }
  }

  // If neither config loaded, return null (consumers will use hardcoded fallbacks)
  if (!defaultConfig && !customConfig) {
    i === 0 && i++;
    return null;
  }

  // Deep merge: custom overrides default
  let mergedConfig = defaultConfig || {};
  if (customConfig) {
    mergedConfig = deepMerge(mergedConfig, customConfig);
    if (printConfig) {
      logger.info('Custom prompts config loaded and merged from:', customPromptsPath);
    }
  } else if (printConfig && defaultConfig) {
    logger.info('Prompts config loaded from:', defaultPromptsPath);
  }

  // Apply environment variable substitution to all string values
  mergedConfig = applyEnvVariables(mergedConfig);

  // Validate with schema
  const result = promptsSchema.safeParse(mergedConfig);
  if (!result.success) {
    const errorMessage = `Invalid prompts configuration:
${JSON.stringify(result.error.errors, null, 2)}`;

    if (i === 0) {
      logger.error(errorMessage);
      i++;
    }

    return null;
  }

  if (printConfig) {
    logger.debug('Prompts config:', mergedConfig);
  }

  i === 0 && i++;
  return result.data;
}

module.exports = loadPromptsConfig;
