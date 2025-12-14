const { PromptTemplate } = require('@langchain/core/prompts');
const { getPrompt } = require('~/server/services/Config');

/*
 * Without `{summary}` and `{new_lines}`, token count is 98
 * We are counting this towards the max context tokens for summaries, +3 for the assistant label (101)
 * If this prompt changes, use https://tiktokenizer.vercel.app/ to count the tokens
 */
const FALLBACK_SUMMARY_TEMPLATE = `Summarize the conversation by integrating new lines into the current summary.

EXAMPLE:
Current summary:
The human inquires about the AI's view on artificial intelligence. The AI believes it's beneficial.

New lines:
Human: Why is it beneficial?
AI: It helps humans achieve their potential.

New summary:
The human inquires about the AI's view on artificial intelligence. The AI believes it's beneficial because it helps humans achieve their potential.

Current summary:
{summary}

New lines:
{new_lines}

New summary:`;

/*
 * Without `{new_lines}`, token count is 27
 * We are counting this towards the max context tokens for summaries, rounded up to 30
 * If this prompt changes, use https://tiktokenizer.vercel.app/ to count the tokens
 */
const FALLBACK_CUTOFF_TEMPLATE = `The following text is cut-off:
{new_lines}

Summarize the content as best as you can, noting that it was cut-off.

Summary:`;

/**
 * Get summary prompt template (async)
 * @returns {Promise<PromptTemplate>}
 */
async function getSummaryPrompt() {
  const template = await getPrompt(['summary', 'summaryPrompt'], FALLBACK_SUMMARY_TEMPLATE);
  return new PromptTemplate({
    inputVariables: ['summary', 'new_lines'],
    template,
  });
}

/**
 * Get cut-off prompt template (async)
 * @returns {Promise<PromptTemplate>}
 */
async function getCutOffPrompt() {
  const template = await getPrompt(['summary', 'cutOffPrompt'], FALLBACK_CUTOFF_TEMPLATE);
  return new PromptTemplate({
    inputVariables: ['new_lines'],
    template,
  });
}

// Static fallback instances for backwards compatibility
const SUMMARY_PROMPT = new PromptTemplate({
  inputVariables: ['summary', 'new_lines'],
  template: FALLBACK_SUMMARY_TEMPLATE,
});

const CUT_OFF_PROMPT = new PromptTemplate({
  inputVariables: ['new_lines'],
  template: FALLBACK_CUTOFF_TEMPLATE,
});

module.exports = {
  // Async functions (preferred)
  getSummaryPrompt,
  getCutOffPrompt,
  // Static instances for backwards compatibility
  SUMMARY_PROMPT,
  CUT_OFF_PROMPT,
  // Expose fallback templates
  FALLBACK_SUMMARY_TEMPLATE,
  FALLBACK_CUTOFF_TEMPLATE,
};
