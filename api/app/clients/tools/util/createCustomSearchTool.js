const { Tools } = require('librechat-data-provider');
const { createSearchTool } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');

/**
 * Filters search result data to limit sources and remove unnecessary fields.
 * @param {Object} data - The search result data object
 * @param {number} numResults - Max number of organic/topStories results
 * @returns {Object} The filtered data
 */
function filterSearchData(data, numResults) {
  if (!data) {
    return data;
  }

  const organicCount = data.organic?.length ?? 0;
  const topStoriesCount = data.topStories?.length ?? 0;
  const totalSources = organicCount + topStoriesCount;

  if (totalSources > numResults) {
    const organicSlice = Math.min(organicCount, numResults);
    const topStoriesSlice = Math.max(0, numResults - organicSlice);

    if (data.organic) {
      data.organic = data.organic.slice(0, organicSlice);
    }
    if (data.topStories) {
      data.topStories = data.topStories.slice(0, topStoriesSlice);
    }
  }

  if (data.images) {
    data.images = [];
  }

  if (data.videos) {
    data.videos = [];
  }

  if (data.shopping) {
    data.shopping = [];
  }

  if (data.relatedSearches) {
    data.relatedSearches = [];
  }

  if (data.organic) {
    for (const source of data.organic) {
      if (source.references) {
        delete source.references;
      }
    }
  }

  if (data.topStories) {
    for (const source of data.topStories) {
      if (source.references) {
        delete source.references;
      }
    }
  }

  if (data.references && data.references.length > 0) {
    data.references = [];
  }

  return data;
}

/**
 * Creates a custom web search tool that wraps the upstream createSearchTool
 * and filters results to respect numResults/topResults config values.
 *
 * @param {Object} config - Search tool configuration
 * @param {number} [config.numResults=4] - Max number of organic/topStories results
 * @param {number} [config.topResults=5] - Max number of highlight chunks per source
 * @param {Function} [config.onSearchResults] - Callback for search results
 * @param {Function} [config.onGetHighlights] - Callback for highlights
 * @param {Object} [config.logger] - Logger instance
 * @returns {Object} The wrapped search tool with filtered results
 */
function createCustomSearchTool(config) {
  const { numResults = 4, topResults = 5, onSearchResults, ...restConfig } = config;

  logger.debug(
    `[createCustomSearchTool] Initializing with numResults=${numResults}, topResults=${topResults}`,
  );

  const wrappedOnSearchResults = onSearchResults
    ? (results, runnableConfig) => {
        logger.debug(
          `[createCustomSearchTool] onSearchResults called - filtering to ${numResults} results`,
        );

        if (results.success && results.data) {
          filterSearchData(results.data, numResults);
        }

        return onSearchResults(results, runnableConfig);
      }
    : undefined;

  const baseTool = createSearchTool({
    ...restConfig,
    topResults,
    onSearchResults: wrappedOnSearchResults,
  });

  const originalInvoke = baseTool.invoke.bind(baseTool);

  baseTool.invoke = async function filteredInvoke(input, options) {
    logger.debug(`[createCustomSearchTool] invoke called with query: ${input?.query}`);

    const result = await originalInvoke(input, options);

    if (!result || !result.artifact) {
      return result;
    }

    const artifact = result.artifact;
    const wsData = artifact[Tools.web_search];

    if (!wsData) {
      return result;
    }

    logger.debug(
      `[createCustomSearchTool] Filtering artifact - organic: ${wsData.organic?.length}, topStories: ${wsData.topStories?.length}`,
    );

    filterSearchData(wsData, numResults);

    logger.debug(
      `[createCustomSearchTool] After filter - organic: ${wsData.organic?.length}, topStories: ${wsData.topStories?.length}`,
    );

    return result;
  };

  return baseTool;
}

module.exports = {
  createCustomSearchTool,
};
