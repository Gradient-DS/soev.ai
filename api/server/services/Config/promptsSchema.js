const { z } = require('zod');

/**
 * Schema for prompts configuration validation.
 * Uses .passthrough() to allow future prompt categories without schema updates.
 */
const promptsSchema = z
  .object({
    version: z.string().optional(),

    // Core Instructions
    core: z
      .object({
        instructions: z.string().optional(),
        errorInstructions: z.string().optional(),
        imageInstructions: z.string().optional(),
        completionInstructions: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // Agent Coordination
    agents: z
      .object({
        taskManager: z
          .object({
            prompt: z.string().optional(),
            assignTasksDescription: z.string().optional(),
            endProcessDescription: z.string().optional(),
          })
          .passthrough()
          .optional(),
        supervisor: z
          .object({
            prompt: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),

    // RAG Context
    rag: z
      .object({
        footer: z.string().optional(),
        fullContextHeader: z.string().optional(),
        semanticSearchHeader: z.string().optional(),
        semanticSearchNote: z.string().optional(),
        noResultsMessage: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // Summary
    summary: z
      .object({
        summaryPrompt: z.string().optional(),
        cutOffPrompt: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // Title Generation
    title: z
      .object({
        defaultPrompt: z.string().optional(),
        completionPrompt: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // Tools
    tools: z
      .object({
        webSearch: z
          .object({
            description: z.string().optional(),
            toolContext: z.string().optional(),
          })
          .passthrough()
          .optional(),
        fileSearch: z
          .object({
            description: z.string().optional(),
            citationInstructions: z.string().optional(),
            noFilesContext: z.string().optional(),
            filesAvailableContext: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),

    // MCP Citations
    mcp: z
      .object({
        citationMarkerFormat: z.string().optional(),
        citationItemFormat: z.string().optional(),
        multipleSourcesFormat: z.string().optional(),
      })
      .passthrough()
      .optional(),

    // Memory
    memory: z
      .object({
        instructions: z.string().optional(),
        defaultInstructions: z.string().optional(),
        validKeysTemplate: z.string().optional(),
        tokenLimitTemplate: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

module.exports = { promptsSchema };
