const { getPrompt } = require('~/server/services/Config');

// Hardcoded fallback values (original LibreChat values)
const FALLBACKS = {
  instructions:
    'Remember, all your responses MUST be in the format described. Do not respond unless it\'s in the format described, using the structure of Action, Action Input, etc.',
  errorInstructions:
    '\nYou encountered an error in attempting a response. The user is not aware of the error so you shouldn\'t mention it.\nReview the actions taken carefully in case there is a partial or complete answer within them.\nError Message:',
  imageInstructions:
    'You must include the exact image paths from above, formatted in Markdown syntax: ![alt-text](URL)',
  completionInstructions:
    'Instructions:\nYou are ChatGPT, a large language model trained by OpenAI. Respond conversationally.\nCurrent date:',
};

/**
 * Get instructions prompt (async)
 * @returns {Promise<string>}
 */
async function getInstructions() {
  return getPrompt(['core', 'instructions'], FALLBACKS.instructions);
}

/**
 * Get error instructions prompt (async)
 * @returns {Promise<string>}
 */
async function getErrorInstructions() {
  return getPrompt(['core', 'errorInstructions'], FALLBACKS.errorInstructions);
}

/**
 * Get image instructions prompt (async)
 * @returns {Promise<string>}
 */
async function getImageInstructions() {
  return getPrompt(['core', 'imageInstructions'], FALLBACKS.imageInstructions);
}

/**
 * Get completion instructions prompt (async)
 * @returns {Promise<string>}
 */
async function getCompletionInstructions() {
  return getPrompt(['core', 'completionInstructions'], FALLBACKS.completionInstructions);
}

// Export both async functions and sync fallbacks for backwards compatibility
module.exports = {
  // Async functions (preferred)
  getInstructions,
  getErrorInstructions,
  getImageInstructions,
  getCompletionInstructions,
  // Sync fallbacks (for backwards compatibility with existing code)
  instructions: FALLBACKS.instructions,
  errorInstructions: FALLBACKS.errorInstructions,
  imageInstructions: FALLBACKS.imageInstructions,
  completionInstructions: FALLBACKS.completionInstructions,
  // Expose fallbacks for reference
  FALLBACKS,
};
