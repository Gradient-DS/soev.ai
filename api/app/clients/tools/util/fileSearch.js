const { z } = require('zod');
const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');
const { Tools, EToolResources } = require('librechat-data-provider');
const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
const { getFiles } = require('~/models/File');

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @param {string} [options.agentId] - The agent ID for file access control
 * @returns {Promise<{
 *   files: Array<{ file_id: string; filename: string }>,
 *   toolContext: string
 * }>}
 */
const primeFiles = async (options) => {
  const { tool_resources, req, agentId } = options;
  const file_ids = tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.file_search]?.files ?? [];

  // Get all files first
  const allFiles = (await getFiles({ file_id: { $in: file_ids } }, null, { text: 0 })) ?? [];

  // Filter by access if user and agent are provided
  let dbFiles;
  if (req?.user?.id && agentId) {
    dbFiles = await filterFilesByAgentAccess({
      files: allFiles,
      userId: req.user.id,
      role: req.user.role,
      agentId,
    });
  } else {
    dbFiles = allFiles;
  }

  dbFiles = dbFiles.concat(resourceFiles);

  let toolContext = `- Note: Semantic search is available through the ${Tools.file_search} tool but no files are currently loaded. Request the user to upload documents to search through.`;

  const files = [];
  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }
    if (i === 0) {
      toolContext = `- Note: Use the ${Tools.file_search} tool to find relevant information within:`;
    }
    toolContext += `\n\t- ${file.filename}${
      agentResourceIds.has(file.file_id) ? '' : ' (just attached by user)'
    }`;
    files.push({
      file_id: file.file_id,
      filename: file.filename,
    });
  }

  return { files, toolContext };
};

/**
 *
 * @param {Object} options
 * @param {string} options.userId
 * @param {Array<{ file_id: string; filename: string }>} options.files
 * @param {string} [options.entity_id]
 * @param {boolean} [options.fileCitations=false] - Whether to include citation instructions
 * @returns
 */
const createFileSearchTool = async ({ userId, files, entity_id, fileCitations = false }) => {
  return tool(
    async ({ query }, config) => {
      // Extract turn from tool call config for unique citation markers
      const turn = config?.toolCall?.turn ?? 0;
      if (files.length === 0) {
        return ['No files to search. Instruct the user to add files for the search.', undefined];
      }
      const jwtToken = generateShortLivedToken(userId);
      if (!jwtToken) {
        return ['There was an error authenticating the file search request.', undefined];
      }

      /**
       *
       * @param {import('librechat-data-provider').TFile} file
       * @returns {{ file_id: string, query: string, k: number, entity_id?: string }}
       */
      const createQueryBody = (file) => {
        const body = {
          file_id: file.file_id,
          query,
          k: 5,
        };
        if (!entity_id) {
          return body;
        }
        body.entity_id = entity_id;
        logger.debug(`[${Tools.file_search}] RAG API /query body`, body);
        return body;
      };

      const queryPromises = files.map((file) =>
        axios
          .post(`${process.env.RAG_API_URL}/query`, createQueryBody(file), {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          })
          .catch((error) => {
            logger.error('Error encountered in `file_search` while querying file:', error);
            return null;
          }),
      );

      const results = await Promise.all(queryPromises);
      const validResults = results.filter((result) => result !== null);

      if (validResults.length === 0) {
        return ['No results found or errors occurred while searching the files.', undefined];
      }

      const formattedResults = validResults
        .flatMap((result, fileIndex) =>
          result.data.map(([docInfo, distance]) => ({
            filename: docInfo.metadata.source.split('/').pop(),
            content: docInfo.page_content,
            distance,
            file_id: files[fileIndex]?.file_id,
            page: docInfo.metadata.page || null,
          })),
        )
        // TODO: results should be sorted by relevance, not distance
        .sort((a, b) => a.distance - b.distance)
        // TODO: make this configurable
        .slice(0, 10);

      // Use 'file_search' as sourceKey for server-name-based citation format
      const sourceKey = 'file_search';

      const formattedString = formattedResults
        .map(
          (result, index) =>
            `File: ${result.filename}${
              fileCitations ? `\nCite as: 【turn${turn}${sourceKey}${index}】` : ''
            }\nRelevance: ${(1.0 - result.distance).toFixed(4)}\nContent: ${result.content}\n`,
        )
        .join('\n---\n');

      const sources = formattedResults.map((result) => ({
        type: 'file',
        fileId: result.file_id,
        content: result.content,
        fileName: result.filename,
        relevance: 1.0 - result.distance,
        pages: result.page ? [result.page] : [],
        pageRelevance: result.page ? { [result.page]: 1.0 - result.distance } : {},
      }));

      // Include sourceKey and turn for frontend to correctly map citations to sources
      return [formattedString, { [Tools.file_search]: { sources, fileCitations, sourceKey, turn } }];
    },
    {
      name: Tools.file_search,
      responseFormat: 'content_and_artifact',
      description: `Performs semantic search across attached "${Tools.file_search}" documents using natural language queries. This tool analyzes the content of uploaded files to find relevant information, quotes, and passages that best match your query. Use this to extract specific information or find relevant sections within the available documents.${
        fileCitations
          ? `

**CITE FILE SEARCH RESULTS:**
Append bracket citations after text derived from file content:
- File citation: The document states that X is Y.【turn0file_search0】
- Multiple files: Multiple sources confirm this.【turn0file_search0,turn0file_search1】

**ALWAYS reference the filename in your text. NEVER use markdown links or footnotes.**`
          : ''
      }`,
      schema: z.object({
        query: z
          .string()
          .describe(
            "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching against the file contents.",
          ),
      }),
    },
  );
};

module.exports = { createFileSearchTool, primeFiles };