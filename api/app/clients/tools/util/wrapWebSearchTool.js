const { Tools } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');

/**
 * Wraps the web search tool to filter results before they reach LangChain/Database.
 * This ensures both SSE streaming AND database storage have the correct filtered results.
 * 
 * @param {Object} tool - The original web search tool from createSearchTool
 * @param {Object} config - Configuration with numResults and topResults
 * @returns {Object} The wrapped tool with filtered results
 */
function wrapWebSearchTool(tool, config) {
  const { numResults = 4, topResults = 2 } = config;
  
  const originalInvoke = tool.invoke.bind(tool);
  
  tool.invoke = async function wrappedInvoke(input) {
    const result = await originalInvoke(input);
    
    if (!result || !result.artifact) {
      return result;
    }
    
    const artifact = result.artifact;
    const wsData = artifact[Tools.web_search];
    
    if (!wsData) {
      return result;
    }
    
    if (wsData.organic && wsData.organic.length > numResults) {
      wsData.organic = wsData.organic.slice(0, numResults);
    }
    
    if (wsData.topStories && wsData.topStories.length > numResults) {
      wsData.topStories = wsData.topStories.slice(0, numResults);
    }
    
    if (wsData.images && wsData.images.length > 0) {
      wsData.images = [];
    }
    
    if (wsData.videos && wsData.videos.length > 0) {
      wsData.videos = [];
    }
    
    if (wsData.shopping && wsData.shopping.length > 0) {
      wsData.shopping = [];
    }
    
    if (wsData.relatedSearches && wsData.relatedSearches.length > 0) {
      wsData.relatedSearches = [];
    }
    
    if (wsData.references && wsData.references.length > 0) {
      wsData.references = [];
    }
    
    if (wsData.organic) {
      for (const source of wsData.organic) {
        if (source.references) {
          delete source.references;
        }
      }
    }
    
    if (wsData.topStories) {
      for (const source of wsData.topStories) {
        if (source.references) {
          delete source.references;
        }
      }
    }
    
    return result;
  };
  
  return tool;
}

module.exports = {
  wrapWebSearchTool,
};

