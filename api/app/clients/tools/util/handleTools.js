const { logger } = require('@librechat/data-schemas');
const { SerpAPI } = require('@langchain/community/tools/serpapi');
const { Calculator } = require('@langchain/community/tools/calculator');
const { patchAxiosForJina } = require('./jinaProxy');
const { EnvVar, createCodeExecutionTool, createSearchTool } = require('@librechat/agents');

// Patch axios to redirect Jina API calls to local proxy
patchAxiosForJina();
const {
  checkAccess,
  createSafeUser,
  mcpToolPattern,
  loadWebSearchAuth,
} = require('@librechat/api');
const {
  Tools,
  Constants,
  Permissions,
  EToolResources,
  PermissionTypes,
  replaceSpecialVars,
} = require('librechat-data-provider');
const {
  availableTools,
  manifestToolMap,
  // Basic Tools
  GoogleSearchAPI,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  TraversaalSearch,
  StructuredWolfram,
  createYouTubeTools,
  TavilySearchResults,
  createOpenAIImageTools,
} = require('../');
const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
const { createFileSearchTool, primeFiles: primeSearchFiles } = require('./fileSearch');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { createMCPTool, createMCPTools } = require('~/server/services/MCP');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getMCPServerTools } = require('~/server/services/Config');
const { getRoleByName } = require('~/models/Role');
const { wrapWebSearchTool } = require('./wrapWebSearchTool');

/**
 * Validates the availability and authentication of tools for a user based on environment variables or user-specific plugin authentication values.
 * Tools without required authentication or with valid authentication are considered valid.
 *
 * @param {Object} user The user object for whom to validate tool access.
 * @param {Array<string>} tools An array of tool identifiers to validate. Defaults to an empty array.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of valid tool identifiers.
 */
const validateTools = async (user, tools = []) => {
  try {
    const validToolsSet = new Set(tools);
    const availableToolsToValidate = availableTools.filter((tool) =>
      validToolsSet.has(tool.pluginKey),
    );

    /**
     * Validates the credentials for a given auth field or set of alternate auth fields for a tool.
     * If valid admin or user authentication is found, the function returns early. Otherwise, it removes the tool from the set of valid tools.
     *
     * @param {string} authField The authentication field or fields (separated by "||" for alternates) to validate.
     * @param {string} toolName The identifier of the tool being validated.
     */
    const validateCredentials = async (authField, toolName) => {
      const fields = authField.split('||');
      for (const field of fields) {
        const adminAuth = process.env[field];
        if (adminAuth && adminAuth.length > 0) {
          return;
        }

        let userAuth = null;
        try {
          userAuth = await getUserPluginAuthValue(user, field);
        } catch (err) {
          if (field === fields[fields.length - 1] && !userAuth) {
            throw err;
          }
        }
        if (userAuth && userAuth.length > 0) {
          return;
        }
      }

      validToolsSet.delete(toolName);
    };

    for (const tool of availableToolsToValidate) {
      if (!tool.authConfig || tool.authConfig.length === 0) {
        continue;
      }

      for (const auth of tool.authConfig) {
        await validateCredentials(auth.authField, tool.pluginKey);
      }
    }

    return Array.from(validToolsSet.values());
  } catch (err) {
    logger.error('[validateTools] There was a problem validating tools', err);
    throw new Error(err);
  }
};

/** @typedef {typeof import('@langchain/core/tools').Tool} ToolConstructor */
/** @typedef {import('@langchain/core/tools').Tool} Tool */

/**
 * Initializes a tool with authentication values for the given user, supporting alternate authentication fields.
 * Authentication fields can have alternates separated by "||", and the first defined variable will be used.
 *
 * @param {string} userId The user ID for which the tool is being loaded.
 * @param {Array<string>} authFields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
 * @param {ToolConstructor} ToolConstructor The constructor function for the tool to be initialized.
 * @param {Object} options Optional parameters to be passed to the tool constructor alongside authentication values.
 * @returns {() => Promise<Tool>} An Async function that, when called, asynchronously initializes and returns an instance of the tool with authentication.
 */
const loadToolWithAuth = (userId, authFields, ToolConstructor, options = {}) => {
  return async function () {
    const authValues = await loadAuthValues({ userId, authFields });
    return new ToolConstructor({ ...options, ...authValues, userId });
  };
};

/**
 * @param {string} toolKey
 * @returns {Array<string>}
 */
const getAuthFields = (toolKey) => {
  return manifestToolMap[toolKey]?.authConfig.map((auth) => auth.authField) ?? [];
};

/**
 *
 * @param {object} params
 * @param {string} params.user
 * @param {Record<string, Record<string, string>>} [object.userMCPAuthMap]
 * @param {AbortSignal} [object.signal]
 * @param {Pick<Agent, 'id' | 'provider' | 'model'>} [params.agent]
 * @param {string} [params.model]
 * @param {EModelEndpoint} [params.endpoint]
 * @param {LoadToolOptions} [params.options]
 * @param {boolean} [params.useSpecs]
 * @param {Array<string>} params.tools
 * @param {boolean} [params.functions]
 * @param {boolean} [params.returnMap]
 * @param {AppConfig['webSearch']} [params.webSearch]
 * @param {AppConfig['fileStrategy']} [params.fileStrategy]
 * @param {AppConfig['imageOutputType']} [params.imageOutputType]
 * @returns {Promise<{ loadedTools: Tool[], toolContextMap: Object<string, any> } | Record<string,Tool>>}
 */
const loadTools = async ({
  user,
  agent,
  model,
  signal,
  endpoint,
  userMCPAuthMap,
  tools = [],
  options = {},
  functions = true,
  returnMap = false,
  webSearch,
  fileStrategy,
  imageOutputType,
}) => {
  const toolConstructors = {
    flux: FluxAPI,
    calculator: Calculator,
    google: GoogleSearchAPI,
    open_weather: OpenWeather,
    wolfram: StructuredWolfram,
    'stable-diffusion': StructuredSD,
    'azure-ai-search': StructuredACS,
    traversaal_search: TraversaalSearch,
    tavily_search_results_json: TavilySearchResults,
  };

  const customConstructors = {
    serpapi: async (_toolContextMap) => {
      const authFields = getAuthFields('serpapi');
      let envVar = authFields[0] ?? '';
      let apiKey = process.env[envVar];
      if (!apiKey) {
        apiKey = await getUserPluginAuthValue(user, envVar);
      }
      return new SerpAPI(apiKey, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
      });
    },
    youtube: async (_toolContextMap) => {
      const authFields = getAuthFields('youtube');
      const authValues = await loadAuthValues({ userId: user, authFields });
      return createYouTubeTools(authValues);
    },
    image_gen_oai: async (toolContextMap) => {
      const authFields = getAuthFields('image_gen_oai');
      const authValues = await loadAuthValues({ userId: user, authFields });
      const imageFiles = options.tool_resources?.[EToolResources.image_edit]?.files ?? [];
      let toolContext = '';
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file) {
          continue;
        }
        if (i === 0) {
          toolContext =
            'Image files provided in this request (their image IDs listed in order of appearance) available for image editing:';
        }
        toolContext += `\n\t- ${file.file_id}`;
        if (i === imageFiles.length - 1) {
          toolContext += `\n\nInclude any you need in the \`image_ids\` array when calling \`${EToolResources.image_edit}_oai\`. You may also include previously referenced or generated image IDs.`;
        }
      }
      if (toolContext) {
        toolContextMap.image_edit_oai = toolContext;
      }
      return createOpenAIImageTools({
        ...authValues,
        isAgent: !!agent,
        req: options.req,
        imageOutputType,
        fileStrategy,
        imageFiles,
      });
    },
  };

  const requestedTools = {};

  if (functions === true) {
    toolConstructors.dalle = DALLE3;
  }

  /** @type {ImageGenOptions} */
  const imageGenOptions = {
    isAgent: !!agent,
    req: options.req,
    fileStrategy,
    processFileURL: options.processFileURL,
    returnMetadata: options.returnMetadata,
    uploadImageBuffer: options.uploadImageBuffer,
  };

  const toolOptions = {
    flux: imageGenOptions,
    dalle: imageGenOptions,
    'stable-diffusion': imageGenOptions,
    serpapi: { location: 'Austin,Texas,United States', hl: 'en', gl: 'us' },
  };

  /** @type {Record<string, string>} */
  const toolContextMap = {};
  const requestedMCPTools = {};

  for (const tool of tools) {
    if (tool === Tools.execute_code) {
      requestedTools[tool] = async () => {
        const authValues = await loadAuthValues({
          userId: user,
          authFields: [EnvVar.CODE_API_KEY],
        });
        const codeApiKey = authValues[EnvVar.CODE_API_KEY];
        const { files, toolContext } = await primeCodeFiles(
          {
            ...options,
            agentId: agent?.id,
          },
          codeApiKey,
        );
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }
        const CodeExecutionTool = createCodeExecutionTool({
          user_id: user,
          files,
          ...authValues,
        });
        CodeExecutionTool.apiKey = codeApiKey;
        return CodeExecutionTool;
      };
      continue;
    } else if (tool === Tools.file_search) {
      requestedTools[tool] = async () => {
        const { files, toolContext } = await primeSearchFiles({
          ...options,
          agentId: agent?.id,
        });
        if (toolContext) {
          toolContextMap[tool] = toolContext;
        }

        /** @type {boolean | undefined} Check if user has FILE_CITATIONS permission */
        let fileCitations;
        if (fileCitations == null && options.req?.user != null) {
          try {
            fileCitations = await checkAccess({
              user: options.req.user,
              permissionType: PermissionTypes.FILE_CITATIONS,
              permissions: [Permissions.USE],
              getRoleByName,
            });
          } catch (error) {
            logger.error('[handleTools] FILE_CITATIONS permission check failed:', error);
            fileCitations = false;
          }
        }

        return createFileSearchTool({
          userId: user,
          files,
          entity_id: agent?.id,
          fileCitations,
        });
      };
      continue;
    } else if (tool === Tools.web_search) {
      const result = await loadWebSearchAuth({
        userId: user,
        loadAuthValues,
        webSearchConfig: webSearch,
      });
      console.log('[WEB SEARCH CONFIG - handleTools] Full auth result:', JSON.stringify(result.authResult, null, 2));
      
      const { onSearchResults, onGetHighlights } = options?.[Tools.web_search] ?? {};
      
      const wrappedOnSearchResults = onSearchResults ? (searchResult, runnableConfig) => {
        console.log('\n========== WEB SEARCH DEBUG - handleTools wrappedOnSearchResults START ==========');
        console.log('[BEFORE SLICE] Search result received:', {
          success: searchResult.success,
          hasData: !!searchResult.data,
          hasSuccess: searchResult.success,
        });
        
        if (searchResult.data) {
          console.log('[BEFORE SLICE] Counts:', {
            organicCount: searchResult.data.organic?.length,
            topStoriesCount: searchResult.data.topStories?.length,
            imagesCount: searchResult.data.images?.length,
            videosCount: searchResult.data.videos?.length,
            referencesCount: searchResult.data.references?.length,
            shoppingCount: searchResult.data.shopping?.length,
            relatedSearchesCount: searchResult.data.relatedSearches?.length,
            TOTAL: (searchResult.data.organic?.length || 0) + (searchResult.data.topStories?.length || 0) + 
                   (searchResult.data.images?.length || 0) + (searchResult.data.videos?.length || 0),
          });
        }
        
        // WORKAROUND: Slice results to match our configured numResults
        // IMPORTANT: Modify searchResult.data directly (not searchResult.data.organic)
        // because onSearchResults gets { success, data } but processSources uses searchResult.data
        if (searchResult.success && searchResult.data) {
          const configuredNumResults = result.authResult.numResults || 4;
          const configuredTopResults = result.authResult.topResults || 2;
          
          // Slice organic results
          if (searchResult.data.organic && searchResult.data.organic.length > configuredNumResults) {
            console.log(`[WORKAROUND] Slicing organic from ${searchResult.data.organic.length} to ${configuredNumResults}`);
            searchResult.data.organic = searchResult.data.organic.slice(0, configuredNumResults);
          }
          
          // Slice topStories
          if (searchResult.data.topStories && searchResult.data.topStories.length > configuredNumResults) {
            console.log(`[WORKAROUND] Slicing topStories from ${searchResult.data.topStories.length} to ${configuredNumResults}`);
            searchResult.data.topStories = searchResult.data.topStories.slice(0, configuredNumResults);
          }
          
          // Clear other result types
          if (searchResult.data.images && searchResult.data.images.length > 0) {
            console.log(`[WORKAROUND] Removing ${searchResult.data.images.length} images`);
            searchResult.data.images = [];
          }
          
          if (searchResult.data.videos && searchResult.data.videos.length > 0) {
            console.log(`[WORKAROUND] Removing ${searchResult.data.videos.length} videos`);
            searchResult.data.videos = [];
          }
          
          if (searchResult.data.relatedSearches && searchResult.data.relatedSearches.length > 0) {
            console.log(`[WORKAROUND] Removing ${searchResult.data.relatedSearches.length} related searches`);
            searchResult.data.relatedSearches = [];
          }
          
          if (searchResult.data.shopping && searchResult.data.shopping.length > 0) {
            console.log(`[WORKAROUND] Removing ${searchResult.data.shopping.length} shopping results`);
            searchResult.data.shopping = [];
          }
          
          // CRITICAL: Also check and handle references if they already exist
          if (searchResult.data.references && searchResult.data.references.length > 0) {
            console.log(`[WORKAROUND] References already exist with ${searchResult.data.references.length} items - CLEARING THEM`);
            searchResult.data.references = [];
          }
          
          console.log('[AFTER SLICE] Counts:', {
            organicCount: searchResult.data.organic?.length,
            topStoriesCount: searchResult.data.topStories?.length,
            imagesCount: searchResult.data.images?.length,
            videosCount: searchResult.data.videos?.length,
            referencesCount: searchResult.data.references?.length,
            shoppingCount: searchResult.data.shopping?.length,
            relatedSearchesCount: searchResult.data.relatedSearches?.length,
            TOTAL: (searchResult.data.organic?.length || 0) + (searchResult.data.topStories?.length || 0),
          });
          
          console.log('[AFTER SLICE] Organic URLs:', 
            searchResult.data.organic?.map(s => s.link));
        }
        
        console.log('[CALLING ORIGINAL] About to call original onSearchResults...');
        const returnValue = onSearchResults(searchResult, runnableConfig);
        
        console.log('[AFTER ORIGINAL] Original onSearchResults returned, searchResult now:', {
          organicCount: searchResult.data?.organic?.length,
          topStoriesCount: searchResult.data?.topStories?.length,
          referencesCount: searchResult.data?.references?.length,
        });
        
        console.log('========== WEB SEARCH DEBUG - handleTools wrappedOnSearchResults END ==========\n');
        
        return returnValue;
      } : undefined;

      const wrappedOnGetHighlights = onGetHighlights ? async (...args) => {
        console.log('[WEB SEARCH DEBUG - onGetHighlights] Getting highlights for:', args[0]);
        const result = await onGetHighlights(...args);
        console.log('[WEB SEARCH DEBUG - onGetHighlights] Highlights result:', {
          highlightsCount: result?.length,
        });
        return result;
      } : undefined;

      requestedTools[tool] = async () => {
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
        
        ANSWER IN THE USER'S LANGUAGE (DUTCH IN YOUR CASE).
`.trim();

        const toolConfig = {
          ...result.authResult,
          onSearchResults: wrappedOnSearchResults,
          onGetHighlights: wrappedOnGetHighlights,
          logger,
        };
        
        console.log('[WEB SEARCH DEBUG - handleTools] Creating search tool with config:', {
          topResults: toolConfig.topResults,
          numResults: toolConfig.numResults,
          searchProvider: toolConfig.searchProvider,
          scraperProvider: toolConfig.scraperProvider,
          rerankerType: toolConfig.rerankerType,
          safeSearch: toolConfig.safeSearch,
        });
        
        const searchTool = createSearchTool(toolConfig);
        
        // Wrap the tool to filter results at source (before LangChain/database)
        // This ensures both streaming AND database have filtered results
        const wrappedSearchTool = wrapWebSearchTool(searchTool, {
          numResults: result.authResult.numResults,
          topResults: result.authResult.topResults,
        });
        
        console.log('[WEB SEARCH DEBUG - handleTools] ✅ Tool wrapped with result filtering');
        
        return wrappedSearchTool;
      };
      continue;
    } else if (tool && mcpToolPattern.test(tool)) {
      const [toolName, serverName] = tool.split(Constants.mcp_delimiter);
      if (toolName === Constants.mcp_server) {
        /** Placeholder used for UI purposes */
        continue;
      }
      if (serverName && options.req?.config?.mcpConfig?.[serverName] == null) {
        logger.warn(
          `MCP server "${serverName}" for "${toolName}" tool is not configured${agent?.id != null && agent.id ? ` but attached to "${agent.id}"` : ''}`,
        );
        continue;
      }
      if (toolName === Constants.mcp_all) {
        requestedMCPTools[serverName] = [
          {
            type: 'all',
            serverName,
          },
        ];
        continue;
      }

      requestedMCPTools[serverName] = requestedMCPTools[serverName] || [];
      requestedMCPTools[serverName].push({
        type: 'single',
        toolKey: tool,
        serverName,
      });
      continue;
    }

    if (customConstructors[tool]) {
      requestedTools[tool] = async () => customConstructors[tool](toolContextMap);
      continue;
    }

    if (toolConstructors[tool]) {
      const options = toolOptions[tool] || {};
      const toolInstance = loadToolWithAuth(
        user,
        getAuthFields(tool),
        toolConstructors[tool],
        options,
      );
      requestedTools[tool] = toolInstance;
      continue;
    }
  }

  if (returnMap) {
    return requestedTools;
  }

  const toolPromises = [];
  for (const tool of tools) {
    const validTool = requestedTools[tool];
    if (validTool) {
      toolPromises.push(
        validTool().catch((error) => {
          logger.error(`Error loading tool ${tool}:`, error);
          return null;
        }),
      );
    }
  }

  const loadedTools = (await Promise.all(toolPromises)).flatMap((plugin) => plugin || []);
  const mcpToolPromises = [];
  /** MCP server tools are initialized sequentially by server */
  let index = -1;
  const failedMCPServers = new Set();
  const safeUser = createSafeUser(options.req?.user);
  for (const [serverName, toolConfigs] of Object.entries(requestedMCPTools)) {
    index++;
    /** @type {LCAvailableTools} */
    let availableTools;
    for (const config of toolConfigs) {
      try {
        if (failedMCPServers.has(serverName)) {
          continue;
        }
        const mcpParams = {
          index,
          signal,
          user: safeUser,
          userMCPAuthMap,
          res: options.res,
          model: agent?.model ?? model,
          serverName: config.serverName,
          provider: agent?.provider ?? endpoint,
        };

        if (config.type === 'all' && toolConfigs.length === 1) {
          /** Handle async loading for single 'all' tool config */
          mcpToolPromises.push(
            createMCPTools(mcpParams).catch((error) => {
              logger.error(`Error loading ${serverName} tools:`, error);
              return null;
            }),
          );
          continue;
        }
        if (!availableTools) {
          try {
            availableTools = await getMCPServerTools(serverName);
          } catch (error) {
            logger.error(`Error fetching available tools for MCP server ${serverName}:`, error);
          }
        }

        /** Handle synchronous loading */
        const mcpTool =
          config.type === 'all'
            ? await createMCPTools(mcpParams)
            : await createMCPTool({
                ...mcpParams,
                availableTools,
                toolKey: config.toolKey,
              });

        if (Array.isArray(mcpTool)) {
          loadedTools.push(...mcpTool);
        } else if (mcpTool) {
          loadedTools.push(mcpTool);
        } else {
          failedMCPServers.add(serverName);
          logger.warn(
            `MCP tool creation failed for "${config.toolKey}", server may be unavailable or unauthenticated.`,
          );
        }
      } catch (error) {
        logger.error(`Error loading MCP tool for server ${serverName}:`, error);
      }
    }
  }
  loadedTools.push(...(await Promise.all(mcpToolPromises)).flatMap((plugin) => plugin || []));
  return { loadedTools, toolContextMap };
};

module.exports = {
  loadToolWithAuth,
  validateTools,
  loadTools,
};
