const appConfig = require('./app');
const mcpToolsCache = require('./mcp');
const { config } = require('./EndpointService');
const getCachedTools = require('./getCachedTools');
const loadCustomConfig = require('./loadCustomConfig');
const loadConfigModels = require('./loadConfigModels');
const loadDefaultModels = require('./loadDefaultModels');
const getEndpointsConfig = require('./getEndpointsConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const loadPromptsConfig = require('./loadPromptsConfig');
const { getPromptsConfig, getPrompt, getPromptSync } = require('./getPromptsConfig');

module.exports = {
  config,
  loadCustomConfig,
  loadConfigModels,
  loadDefaultModels,
  loadAsyncEndpoints,
  loadPromptsConfig,
  getPromptsConfig,
  getPrompt,
  getPromptSync,
  ...appConfig,
  ...getCachedTools,
  ...mcpToolsCache,
  ...getEndpointsConfig,
};
