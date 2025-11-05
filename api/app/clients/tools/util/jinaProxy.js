/**
 * Monkey-patch axios to redirect Jina API requests to local proxy
 * This intercepts requests to https://api.jina.ai and redirects them to localhost:8001
 */
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

const JINA_API_URL = process.env.JINA_API_URL || 'http://localhost:8001/v1/rerank';
const JINA_PRODUCTION_URL = 'https://api.jina.ai/v1/rerank';

let isPatched = false;

function patchAxiosForJina() {
  if (isPatched) {
    return;
  }

  const originalRequest = axios.request;
  
  axios.request = function (config) {
    if (config && config.url && config.url.includes('api.jina.ai/v1/rerank')) {
      logger.debug(`[Jina Proxy] Intercepting request to ${config.url}`);
      logger.debug(`[Jina Proxy] Redirecting to ${JINA_API_URL}`);
      config.url = JINA_API_URL;
    }
    
    return originalRequest.call(this, config);
  };
  
  const originalPost = axios.post;
  
  axios.post = function (url, data, config) {
    if (url && url.includes('api.jina.ai/v1/rerank')) {
      logger.debug(`[Jina Proxy] Intercepting POST to ${url}`);
      logger.debug(`[Jina Proxy] Redirecting to ${JINA_API_URL}`);
      url = JINA_API_URL;
    }
    
    return originalPost.call(this, url, data, config);
  };
  
  isPatched = true;
  logger.info(`[Jina Proxy] Successfully patched axios to redirect Jina API calls to ${JINA_API_URL}`);
}

module.exports = {
  patchAxiosForJina,
};

