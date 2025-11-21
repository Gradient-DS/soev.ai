const { nanoid } = require('nanoid');
const { sendEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { Tools, StepTypes, FileContext, ErrorTypes } = require('librechat-data-provider');
const {
  EnvVar,
  Providers,
  GraphEvents,
  getMessageId,
  ToolEndHandler,
  handleToolCalls,
  ChatModelStreamHandler,
} = require('@librechat/agents');
const { processFileCitations } = require('~/server/services/Files/Citations');
const { processCodeOutput } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { saveBase64Image } = require('~/server/services/Files/process');

class ModelEndHandler {
  /**
   * @param {Array<UsageMetadata>} collectedUsage
   */
  constructor(collectedUsage) {
    if (!Array.isArray(collectedUsage)) {
      throw new Error('collectedUsage must be an array');
    }
    this.collectedUsage = collectedUsage;
  }

  finalize(errorMessage) {
    if (!errorMessage) {
      return;
    }
    throw new Error(errorMessage);
  }

  /**
   * @param {string} event
   * @param {ModelEndData | undefined} data
   * @param {Record<string, unknown> | undefined} metadata
   * @param {StandardGraph} graph
   * @returns {Promise<void>}
   */
  async handle(event, data, metadata, graph) {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    /** @type {string | undefined} */
    let errorMessage;
    try {
      const agentContext = graph.getAgentContext(metadata);
      const isGoogle = agentContext.provider === Providers.GOOGLE;
      const streamingDisabled = !!agentContext.clientOptions?.disableStreaming;
      if (data?.output?.additional_kwargs?.stop_reason === 'refusal') {
        const info = { ...data.output.additional_kwargs };
        errorMessage = JSON.stringify({
          type: ErrorTypes.REFUSAL,
          info,
        });
        logger.debug(`[ModelEndHandler] Model refused to respond`, {
          ...info,
          userId: metadata.user_id,
          messageId: metadata.run_id,
          conversationId: metadata.thread_id,
        });
      }

      const toolCalls = data?.output?.tool_calls;
      let hasUnprocessedToolCalls = false;
      if (Array.isArray(toolCalls) && toolCalls.length > 0 && graph?.toolCallStepIds?.has) {
        try {
          hasUnprocessedToolCalls = toolCalls.some(
            (tc) => tc?.id && !graph.toolCallStepIds.has(tc.id),
          );
        } catch {
          hasUnprocessedToolCalls = false;
        }
      }
      if (isGoogle || streamingDisabled || hasUnprocessedToolCalls) {
        await handleToolCalls(toolCalls, metadata, graph);
      }

      const usage = data?.output?.usage_metadata;
      if (!usage) {
        return this.finalize(errorMessage);
      }
      const modelName = metadata?.ls_model_name || agentContext.clientOptions?.model;
      if (modelName) {
        usage.model = modelName;
      }

      this.collectedUsage.push(usage);
      if (!streamingDisabled) {
        return this.finalize(errorMessage);
      }
      if (!data.output.content) {
        return this.finalize(errorMessage);
      }
      const stepKey = graph.getStepKey(metadata);
      const message_id = getMessageId(stepKey, graph) ?? '';
      if (message_id) {
        await graph.dispatchRunStep(stepKey, {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id,
          },
        });
      }
      const stepId = graph.getStepIdByKey(stepKey);
      const content = data.output.content;
      if (typeof content === 'string') {
        await graph.dispatchMessageDelta(stepId, {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        });
      } else if (content.every((c) => c.type?.startsWith('text'))) {
        await graph.dispatchMessageDelta(stepId, {
          content,
        });
      }
    } catch (error) {
      logger.error('Error handling model end event:', error);
      return this.finalize(errorMessage);
    }
  }
}

/**
 * @deprecated Agent Chain helper
 * @param {string | undefined} [last_agent_id]
 * @param {string | undefined} [langgraph_node]
 * @returns {boolean}
 */
function checkIfLastAgent(last_agent_id, langgraph_node) {
  if (!last_agent_id || !langgraph_node) {
    return false;
  }
  return langgraph_node?.endsWith(last_agent_id);
}

/**
 * Get default handlers for stream events.
 * @param {Object} options - The options object.
 * @param {ServerResponse} options.res - The options object.
 * @param {ContentAggregator} options.aggregateContent - The options object.
 * @param {ToolEndCallback} options.toolEndCallback - Callback to use when tool ends.
 * @param {Array<UsageMetadata>} options.collectedUsage - The list of collected usage metadata.
 * @returns {Record<string, t.EventHandler>} The default handlers.
 * @throws {Error} If the request is not found.
 */
function getDefaultHandlers({ res, aggregateContent, toolEndCallback, collectedUsage }) {
  if (!res || !aggregateContent) {
    throw new Error(
      `[getDefaultHandlers] Missing required options: res: ${!res}, aggregateContent: ${!aggregateContent}`,
    );
  }
  const handlers = {
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(collectedUsage),
    [GraphEvents.TOOL_END]: new ToolEndHandler(toolEndCallback, logger),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP]: {
      /**
       * Handle ON_RUN_STEP event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.stepDetails.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        } else {
          const agentName = metadata?.name ?? 'Agent';
          const isToolCall = data?.stepDetails.type === StepTypes.TOOL_CALLS;
          const action = isToolCall ? 'performing a task...' : 'thinking...';
          sendEvent(res, {
            event: 'on_agent_update',
            data: {
              runId: metadata?.run_id,
              message: `${agentName} is ${action}`,
            },
          });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      /**
       * Handle ON_RUN_STEP_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (data?.delta.type === StepTypes.TOOL_CALLS) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      /**
       * Handle ON_RUN_STEP_COMPLETED event.
       * @param {string} event - The event name.
       * @param {StreamEventData & { result: ToolEndData }} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        // CRITICAL: Log EVERY ON_RUN_STEP_COMPLETED event to see if this fires at all
        console.log('[ON_RUN_STEP_COMPLETED] Event fired:', {
          hasData: !!data,
          hasStepDetails: !!data?.stepDetails,
          stepDetailsType: data?.stepDetails?.type,
          hasResult: !!data?.result,
          metadataRunId: metadata?.run_id,
        });
        
        // DEBUG: Log what we're receiving to understand the structure
        if (data?.stepDetails?.type === StepTypes.TOOL_CALLS) {
          console.log('[ON_RUN_STEP_COMPLETED DEBUG] Received tool call completion:', {
            hasResult: !!data.result,
            hasToolCalls: !!data.stepDetails?.tool_calls,
            toolCallsCount: data.stepDetails?.tool_calls?.length,
          });
          
          // Check tool calls in stepDetails
          if (data.stepDetails?.tool_calls) {
            data.stepDetails.tool_calls.forEach((toolCall, idx) => {
              console.log(`[ON_RUN_STEP_COMPLETED DEBUG] Tool call ${idx}:`, {
                id: toolCall.id,
                name: toolCall.function?.name,
                hasOutput: !!toolCall.output,
              });
              
              // CRITICAL: Check if this is web_search and log the output structure
              if (toolCall.function?.name === Tools.web_search) {
                console.log(`[ON_RUN_STEP_COMPLETED DEBUG] Web search output type:`, typeof toolCall.output);
                if (typeof toolCall.output === 'string') {
                  try {
                    const parsed = JSON.parse(toolCall.output);
                    console.log('[ON_RUN_STEP_COMPLETED DEBUG] Parsed output has artifact:', !!parsed.artifact);
                    if (parsed.artifact?.web_search) {
                      console.log('[ON_RUN_STEP_COMPLETED DEBUG] Tool call output web_search data:', {
                        organicCount: parsed.artifact.web_search.organic?.length,
                        referencesCount: parsed.artifact.web_search.references?.length,
                      });
                    }
                  } catch (e) {
                    console.log('[ON_RUN_STEP_COMPLETED DEBUG] Failed to parse output:', e.message);
                  }
                }
              }
            });
          }
          
          // CRITICAL: Also check data.result structure!
          if (data.result) {
            console.log('[ON_RUN_STEP_COMPLETED DEBUG] data.result exists:', {
              resultType: typeof data.result,
              resultKeys: typeof data.result === 'object' ? Object.keys(data.result) : 'N/A',
            });
            
            // Check if result contains web_search artifact
            if (data.result.artifact?.[Tools.web_search]) {
              console.log('[ON_RUN_STEP_COMPLETED DEBUG] data.result has web_search artifact:', {
                organicCount: data.result.artifact[Tools.web_search].organic?.length,
                referencesCount: data.result.artifact[Tools.web_search].references?.length,
              });
            }
          }
        }
        
        // FAILSAFE: Filter web_search tool results before they go into contentData
        // We need to filter BOTH stepDetails.tool_calls AND data.result
        // because different code paths may use different structures
        
        // Helper function to filter web search data
        const filterWebSearchData = (wsData, location) => {
          if (!wsData) return;
          
          console.log(`[FAILSAFE ${location}] Found web_search data:`, {
            organicCount: wsData.organic?.length,
            referencesCount: wsData.references?.length,
          });
          
          // Clear references
          if (wsData.references && wsData.references.length > 0) {
            console.log(`[FAILSAFE ${location}] Clearing ${wsData.references.length} references`);
            wsData.references = [];
          }
          
          // Clear inline references from sources
          if (wsData.organic) {
            wsData.organic.forEach((source, idx) => {
              if (source.references) {
                console.log(`[FAILSAFE ${location}] Removing inline references from organic source ${idx}`);
                delete source.references;
              }
            });
          }
          
          if (wsData.topStories) {
            wsData.topStories.forEach((source, idx) => {
              if (source.references) {
                console.log(`[FAILSAFE ${location}] Removing inline references from topStories source ${idx}`);
                delete source.references;
              }
            });
          }
        };
        
        if (data?.stepDetails?.type === StepTypes.TOOL_CALLS) {
          // Filter in stepDetails.tool_calls
          if (data.stepDetails.tool_calls) {
            data.stepDetails.tool_calls.forEach((toolCall) => {
              if (toolCall.function?.name === Tools.web_search && toolCall.output) {
                console.log('[FAILSAFE] Found web_search tool call in stepDetails');
                
                // Try to parse the output if it's a string
                let outputData = toolCall.output;
                if (typeof outputData === 'string') {
                  try {
                    outputData = JSON.parse(outputData);
                  } catch (e) {
                    // Not JSON, skip
                    return;
                  }
                }
                
                // Look for the artifact in the output
                if (outputData?.artifact?.[Tools.web_search]) {
                  filterWebSearchData(outputData.artifact[Tools.web_search], 'stepDetails');
                  
                  // Update the tool call output if it was a string
                  if (typeof toolCall.output === 'string') {
                    toolCall.output = JSON.stringify(outputData);
                  }
                }
              }
            });
          }
          
          // CRITICAL: Also filter data.result if it exists
          // This is what gets saved to the database!
          if (data.result?.artifact?.[Tools.web_search]) {
            console.log('[FAILSAFE] Filtering data.result (THIS GOES TO DATABASE!)');
            filterWebSearchData(data.result.artifact[Tools.web_search], 'data.result');
          }
        }
        
        if (data?.result != null) {
          sendEvent(res, { event, data });
        } else if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      /**
       * Handle ON_MESSAGE_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_REASONING_DELTA]: {
      /**
       * Handle ON_REASONING_DELTA event.
       * @param {string} event - The event name.
       * @param {StreamEventData} data - The event data.
       * @param {GraphRunnableConfig['configurable']} [metadata] The runnable metadata.
       */
      handle: (event, data, metadata) => {
        if (checkIfLastAgent(metadata?.last_agent_id, metadata?.langgraph_node)) {
          sendEvent(res, { event, data });
        } else if (!metadata?.hide_sequential_outputs) {
          sendEvent(res, { event, data });
        }
        aggregateContent({ event, data });
      },
    },
  };

  return handlers;
}

/**
 *
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @param {Promise<MongoFile | { filename: string; filepath: string; expires: number;} | null>[]} params.artifactPromises
 * @returns {ToolEndCallback} The tool end callback.
 */
function createToolEndCallback({ req, res, artifactPromises }) {
  /**
   * @type {ToolEndCallback}
   */
  return async (data, metadata) => {
    const output = data?.output;
    if (!output) {
      return;
    }

    if (!output.artifact) {
      return;
    }

    if (output.artifact[Tools.file_search]) {
      artifactPromises.push(
        (async () => {
          const user = req.user;
          const attachment = await processFileCitations({
            user,
            metadata,
            appConfig: req.config,
            toolArtifact: output.artifact,
            toolCallId: output.tool_call_id,
          });
          if (!attachment) {
            return null;
          }
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing file citations:', error);
          return null;
        }),
      );
    }

    // TODO: a lot of duplicated code in createToolEndCallback
    // we should refactor this to use a helper function in a follow-up PR
    if (output.artifact[Tools.ui_resources]) {
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.ui_resources,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.ui_resources]: output.artifact[Tools.ui_resources].data,
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact[Tools.web_search]) {
      console.log('[TOOL_END_CALLBACK] Processing web_search artifact BEFORE database storage');
      
      // CRITICAL: Filter references before creating attachment (which goes to database!)
      const wsData = output.artifact[Tools.web_search];
      console.log('[TOOL_END_CALLBACK] web_search data BEFORE filtering:', {
        organicCount: wsData.organic?.length,
        topStoriesCount: wsData.topStories?.length,
        referencesCount: wsData.references?.length,
      });
      
      // Clear references array
      if (wsData.references && wsData.references.length > 0) {
        console.log(`[TOOL_END_CALLBACK] Clearing ${wsData.references.length} references`);
        wsData.references = [];
      }
      
      // Clear inline references from sources
      if (wsData.organic) {
        wsData.organic.forEach((source, idx) => {
          if (source.references) {
            console.log(`[TOOL_END_CALLBACK] Removing inline references from organic[${idx}]`);
            delete source.references;
          }
        });
      }
      
      if (wsData.topStories) {
        wsData.topStories.forEach((source, idx) => {
          if (source.references) {
            console.log(`[TOOL_END_CALLBACK] Removing inline references from topStories[${idx}]`);
            delete source.references;
          }
        });
      }
      
      console.log('[TOOL_END_CALLBACK] web_search data AFTER filtering:', {
        organicCount: wsData.organic?.length,
        topStoriesCount: wsData.topStories?.length,
        referencesCount: wsData.references?.length,
      });
      console.log('[TOOL_END_CALLBACK] ✅ Filtered artifact will be stored in database');
      
      artifactPromises.push(
        (async () => {
          const attachment = {
            type: Tools.web_search,
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            [Tools.web_search]: { ...output.artifact[Tools.web_search] },
          };
          if (!res.headersSent) {
            return attachment;
          }
          res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
          return attachment;
        })().catch((error) => {
          logger.error('Error processing artifact content:', error);
          return null;
        }),
      );
    }

    if (output.artifact.content) {
      /** @type {FormattedContent[]} */
      const content = output.artifact.content;
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (!part) {
          continue;
        }
        if (part.type !== 'image_url') {
          continue;
        }
        const { url } = part.image_url;
        artifactPromises.push(
          (async () => {
            const filename = `${output.name}_${output.tool_call_id}_img_${nanoid()}`;
            const file_id = output.artifact.file_ids?.[i];
            const file = await saveBase64Image(url, {
              req,
              file_id,
              filename,
              endpoint: metadata.provider,
              context: FileContext.image_generation,
            });
            const fileMetadata = Object.assign(file, {
              messageId: metadata.run_id,
              toolCallId: output.tool_call_id,
              conversationId: metadata.thread_id,
            });
            if (!res.headersSent) {
              return fileMetadata;
            }

            if (!fileMetadata) {
              return null;
            }

            res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
            return fileMetadata;
          })().catch((error) => {
            logger.error('Error processing artifact content:', error);
            return null;
          }),
        );
      }
      return;
    }

    {
      if (output.name !== Tools.execute_code) {
        return;
      }
    }

    if (!output.artifact.files) {
      return;
    }

    for (const file of output.artifact.files) {
      const { id, name } = file;
      artifactPromises.push(
        (async () => {
          const result = await loadAuthValues({
            userId: req.user.id,
            authFields: [EnvVar.CODE_API_KEY],
          });
          const fileMetadata = await processCodeOutput({
            req,
            id,
            name,
            apiKey: result[EnvVar.CODE_API_KEY],
            messageId: metadata.run_id,
            toolCallId: output.tool_call_id,
            conversationId: metadata.thread_id,
            session_id: output.artifact.session_id,
          });
          if (!res.headersSent) {
            return fileMetadata;
          }

          if (!fileMetadata) {
            return null;
          }

          res.write(`event: attachment\ndata: ${JSON.stringify(fileMetadata)}\n\n`);
          return fileMetadata;
        })().catch((error) => {
          logger.error('Error processing code output:', error);
          return null;
        }),
      );
    }
  };
}

module.exports = {
  getDefaultHandlers,
  createToolEndCallback,
};
