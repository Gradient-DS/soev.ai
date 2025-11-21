const { nanoid } = require('nanoid');
const { Tools } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');

/**
 * Creates a function to handle search results and stream them as attachments
 * @param {import('http').ServerResponse} res - The HTTP server response object
 * @returns {{ onSearchResults: function(SearchResult, GraphRunnableConfig): void; onGetHighlights: function(string): void}} - Function that takes search results and returns or streams an attachment
 */
function createOnSearchResults(res) {
  const context = {
    sourceMap: new Map(),
    searchResultData: undefined,
    toolCallId: undefined,
    attachmentName: undefined,
    messageId: undefined,
    conversationId: undefined,
  };

  /**
   * @param {SearchResult} results
   * @param {GraphRunnableConfig} runnableConfig
   */
  function onSearchResults(results, runnableConfig) {
    console.log('\n========== WEB SEARCH DEBUG - search.js onSearchResults START ==========');
    console.log('[PHASE 1] Raw results received:', {
      success: results.success,
      hasData: !!results.data,
      dataKeys: results.data ? Object.keys(results.data) : [],
    });
    
    if (results.data) {
      console.log('[PHASE 1] Results.data counts:', {
        organicCount: results.data.organic?.length,
        topStoriesCount: results.data.topStories?.length,
        imagesCount: results.data.images?.length,
        videosCount: results.data.videos?.length,
        referencesCount: results.data.references?.length,
        shoppingCount: results.data.shopping?.length,
        relatedSearchesCount: results.data.relatedSearches?.length,
      });
      
      console.log('[PHASE 1] Organic URLs:', results.data.organic?.map(s => s.link));
    }
    
    logger.info(
      `[onSearchResults] user: ${runnableConfig.metadata.user_id} | thread_id: ${runnableConfig.metadata.thread_id} | run_id: ${runnableConfig.metadata.run_id}`,
      results,
    );

    if (!results.success) {
      logger.error(
        `[onSearchResults] user: ${runnableConfig.metadata.user_id} | thread_id: ${runnableConfig.metadata.thread_id} | run_id: ${runnableConfig.metadata.run_id} | error: ${results.error}`,
      );
      return;
    }

    const turn = runnableConfig.toolCall?.turn ?? 0;
    const data = { turn, ...structuredClone(results.data ?? {}) };
    
    console.log('[PHASE 2] Data after structuredClone:', {
      organicCount: data.organic?.length,
      topStoriesCount: data.topStories?.length,
      imagesCount: data.images?.length,
      videosCount: data.videos?.length,
      referencesCount: data.references?.length,
      shoppingCount: data.shopping?.length,
      relatedSearchesCount: data.relatedSearches?.length,
      TOTAL: (data.organic?.length || 0) + (data.topStories?.length || 0) + (data.images?.length || 0) + (data.videos?.length || 0) + (data.references?.length || 0),
    });
    
    // WORKAROUND: Also clear unwanted arrays in the initial attachment
    // Even though we sliced in handleTools, make absolutely sure here
    if (data.images && data.images.length > 0) {
      console.log(`[PHASE 2 WORKAROUND] Clearing ${data.images.length} images from initial attachment`);
      data.images = [];
    }
    
    if (data.videos && data.videos.length > 0) {
      console.log(`[PHASE 2 WORKAROUND] Clearing ${data.videos.length} videos from initial attachment`);
      data.videos = [];
    }
    
    if (data.shopping && data.shopping.length > 0) {
      console.log(`[PHASE 2 WORKAROUND] Clearing ${data.shopping.length} shopping from initial attachment`);
      data.shopping = [];
    }
    
    if (data.relatedSearches && data.relatedSearches.length > 0) {
      console.log(`[PHASE 2 WORKAROUND] Clearing ${data.relatedSearches.length} related searches from initial attachment`);
      data.relatedSearches = [];
    }
    
    console.log('[PHASE 2] Organic source links:', data.organic?.map(s => s.link));
    
    context.searchResultData = data;

    // Map sources to links
    for (let i = 0; i < data.organic.length; i++) {
      const source = data.organic[i];
      if (source.link) {
        context.sourceMap.set(source.link, {
          type: 'organic',
          index: i,
          turn,
        });
      }
    }
    for (let i = 0; i < data.topStories.length; i++) {
      const source = data.topStories[i];
      if (source.link) {
        context.sourceMap.set(source.link, {
          type: 'topStories',
          index: i,
          turn,
        });
      }
    }

    context.toolCallId = runnableConfig.toolCall.id;
    context.messageId = runnableConfig.metadata.run_id;
    context.conversationId = runnableConfig.metadata.thread_id;
    context.attachmentName = `${runnableConfig.toolCall.name}_${context.toolCallId}_${nanoid()}`;

    const attachment = buildAttachment(context);
    
    console.log('[PHASE 3] Built attachment data (FINAL TO UI):', {
      organicCount: attachment[Tools.web_search]?.organic?.length,
      topStoriesCount: attachment[Tools.web_search]?.topStories?.length,
      imagesCount: attachment[Tools.web_search]?.images?.length,
      videosCount: attachment[Tools.web_search]?.videos?.length,
      referencesCount: attachment[Tools.web_search]?.references?.length,
      shoppingCount: attachment[Tools.web_search]?.shopping?.length,
      relatedSearchesCount: attachment[Tools.web_search]?.relatedSearches?.length,
      TOTAL_SOURCES: (attachment[Tools.web_search]?.organic?.length || 0) + 
                     (attachment[Tools.web_search]?.topStories?.length || 0) + 
                     (attachment[Tools.web_search]?.images?.length || 0) + 
                     (attachment[Tools.web_search]?.videos?.length || 0) + 
                     (attachment[Tools.web_search]?.references?.length || 0) +
                     (attachment[Tools.web_search]?.shopping?.length || 0) +
                     (attachment[Tools.web_search]?.relatedSearches?.length || 0),
    });
    
    console.log('[PHASE 3] Organic URLs being sent:', 
      attachment[Tools.web_search]?.organic?.map(s => s.link)
    );
    
    if (attachment[Tools.web_search]?.images && attachment[Tools.web_search].images.length > 0) {
      console.log('[PHASE 3] WARNING: Images array still has items!', attachment[Tools.web_search].images.length);
    }
    
    if (attachment[Tools.web_search]?.references) {
      console.log('[PHASE 3] References array preview (first 5):', 
        attachment[Tools.web_search].references.slice(0, 5).map(r => ({ type: r.type, link: r.link }))
      );
      console.log('[PHASE 3] References total:', attachment[Tools.web_search].references.length);
    }
    
    console.log('========== WEB SEARCH DEBUG - search.js onSearchResults END ==========\n');

    if (!res.headersSent) {
      return attachment;
    }
    
    // CRITICAL: Log the EXACT JSON being sent to UI
    const jsonPayload = JSON.stringify(attachment);
    console.log('\n========== CRITICAL: EXACT ATTACHMENT SENT TO UI (onSearchResults) ==========');
    console.log('[ATTACHMENT SIZE]:', jsonPayload.length, 'characters');
    console.log('[ATTACHMENT KEYS]:', Object.keys(attachment));
    console.log('[WEB_SEARCH DATA KEYS]:', Object.keys(attachment[Tools.web_search] || {}));
    
    // Parse it back to see what UI will receive
    const parsed = JSON.parse(jsonPayload);
    const wsData = parsed[Tools.web_search];
    console.log('[PARSED COUNTS]:', {
      organic: wsData?.organic?.length,
      topStories: wsData?.topStories?.length,
      images: wsData?.images?.length,
      videos: wsData?.videos?.length,
      references: wsData?.references?.length,
      shopping: wsData?.shopping?.length,
    });
    
    // Check each organic source for embedded references
    if (wsData?.organic) {
      console.log('[ORGANIC SOURCES DETAIL]:');
      wsData.organic.forEach((source, idx) => {
        console.log(`  Source ${idx}:`, {
          link: source.link?.substring(0, 60),
          hasReferences: !!source.references,
          referencesCount: source.references?.links?.length || 0,
          hasHighlights: !!source.highlights,
          highlightsCount: source.highlights?.length || 0,
          otherKeys: Object.keys(source).filter(k => !['link', 'title', 'snippet'].includes(k)),
        });
      });
    }
    
    console.log('========== END EXACT ATTACHMENT ==========\n');
    
    res.write(`event: attachment\ndata: ${jsonPayload}\n\n`);
  }

  /**
   * @param {string} link
   * @returns {void}
   */
  function onGetHighlights(link) {
    console.log('\n========== WEB SEARCH DEBUG - search.js onGetHighlights START ==========');
    console.log('[onGetHighlights] Called for link:', link);
    
    const source = context.sourceMap.get(link);
    if (!source) {
      console.log('[onGetHighlights] No source found in sourceMap for link:', link);
      console.log('========== WEB SEARCH DEBUG - search.js onGetHighlights END ==========\n');
      return;
    }
    
    const { type, index } = source;
    console.log('[onGetHighlights] Found source:', { type, index });
    
    const data = context.searchResultData;
    if (!data) {
      console.log('[onGetHighlights] No searchResultData in context');
      console.log('========== WEB SEARCH DEBUG - search.js onGetHighlights END ==========\n');
      return;
    }
    
    console.log('[onGetHighlights] Current data BEFORE marking processed:', {
      organicCount: data.organic?.length,
      topStoriesCount: data.topStories?.length,
      referencesCount: data.references?.length,
    });
    
    // DEEP INSPECTION: Check for references in sources
    console.log('[onGetHighlights DEEP INSPECTION] Checking for references...');
    if (data.organic) {
      data.organic.forEach((source, idx) => {
        if (source.references) {
          console.log(`  → Organic[${idx}] HAS references:`, {
            link: source.link?.substring(0, 50),
            referencesType: typeof source.references,
            referencesKeys: Object.keys(source.references),
            linksCount: source.references.links?.length,
            firstThreeLinks: source.references.links?.slice(0, 3).map(l => l.substring(0, 40)),
          });
        }
      });
    }
    if (data.topStories) {
      data.topStories.forEach((source, idx) => {
        if (source.references) {
          console.log(`  → TopStories[${idx}] HAS references:`, {
            link: source.link?.substring(0, 50),
            referencesType: typeof source.references,
            linksCount: source.references.links?.length,
          });
        }
      });
    }
    if (data.references && data.references.length > 0) {
      console.log(`  → Top-level references array:`, {
        count: data.references.length,
        firstThree: data.references.slice(0, 3).map(r => ({
          type: r.type,
          link: r.link?.substring(0, 40),
        })),
      });
    }
    
    
    if (data[type][index] != null) {
      console.log('[onGetHighlights] Marking source as processed:', {
        type,
        index,
        hasReferences: !!data[type][index].references,
        referencesCount: data[type][index].references?.links?.length || 0,
      });
      data[type][index].processed = true;
    }

    console.log('[onGetHighlights] Current data AFTER marking processed:', {
      organicCount: data.organic?.length,
      topStoriesCount: data.topStories?.length,
      referencesCount: data.references?.length,
      totalReferencesInOrganic: data.organic?.reduce((acc, s) => acc + (s.references?.links?.length || 0), 0),
    });
    
    // WORKAROUND: Remove inline references from organic/topStories sources
    // These are link#1, link#2, image#1 etc. extracted from scraped content
    // We only want the main 4 source links, not every link from the scraped pages
    if (data.organic) {
      for (const source of data.organic) {
        if (source.references) {
          console.log(`[onGetHighlights] Removing references from organic source: ${source.link?.substring(0, 50)}`);
          delete source.references;
        }
      }
    }
    if (data.topStories) {
      for (const source of data.topStories) {
        if (source.references) {
          console.log(`[onGetHighlights] Removing references from topStories source: ${source.link?.substring(0, 50)}`);
          delete source.references;
        }
      }
    }
    
    // Also clear the top-level references array if it exists
    if (data.references) {
      console.log(`[onGetHighlights] Clearing top-level references array (${data.references.length} items)`);
      data.references = [];
    }

    const attachment = buildAttachment(context);
    
    console.log('[onGetHighlights] Built attachment (being sent to UI):', {
      organicCount: attachment[Tools.web_search]?.organic?.length,
      topStoriesCount: attachment[Tools.web_search]?.topStories?.length,
      referencesCount: attachment[Tools.web_search]?.references?.length,
      TOTAL_SOURCES: (attachment[Tools.web_search]?.organic?.length || 0) + 
                     (attachment[Tools.web_search]?.topStories?.length || 0) + 
                     (attachment[Tools.web_search]?.references?.length || 0),
    });
    
    if (attachment[Tools.web_search]?.references && attachment[Tools.web_search].references.length > 0) {
      console.log('[onGetHighlights] References in attachment (first 10):', 
        attachment[Tools.web_search].references.slice(0, 10).map(r => ({ 
          type: r.type, 
          title: r.title?.substring(0, 50),
          link: r.link 
        }))
      );
    }
    
    console.log('========== WEB SEARCH DEBUG - search.js onGetHighlights END ==========\n');
    
    // CRITICAL: Log the EXACT JSON being sent to UI
    const jsonPayload = JSON.stringify(attachment);
    console.log('\n========== CRITICAL: EXACT ATTACHMENT SENT TO UI (onGetHighlights) ==========');
    console.log('[FOR LINK]:', link?.substring(0, 60));
    console.log('[ATTACHMENT SIZE]:', jsonPayload.length, 'characters');
    
    // Parse it back to see what UI will receive
    const parsed = JSON.parse(jsonPayload);
    const wsData = parsed[Tools.web_search];
    console.log('[PARSED COUNTS]:', {
      organic: wsData?.organic?.length,
      topStories: wsData?.topStories?.length,
      references: wsData?.references?.length,
    });
    
    // Check each organic source for embedded references
    if (wsData?.organic) {
      console.log('[ORGANIC SOURCES IN ATTACHMENT]:');
      wsData.organic.forEach((source, idx) => {
        const details = {
          link: source.link?.substring(0, 50),
          hasReferences: !!source.references,
          referencesCount: source.references?.links?.length || 0,
        };
        if (source.references) {
          details.referencesSample = source.references.links?.slice(0, 2);
        }
        console.log(`  Source ${idx}:`, details);
      });
    }
    
    // Count all possible sources
    let totalSourcesBeingSent = 0;
    if (wsData?.organic) totalSourcesBeingSent += wsData.organic.length;
    if (wsData?.topStories) totalSourcesBeingSent += wsData.topStories.length;
    if (wsData?.references) totalSourcesBeingSent += wsData.references.length;
    if (wsData?.organic) {
      wsData.organic.forEach(s => {
        if (s.references?.links) totalSourcesBeingSent += s.references.links.length;
      });
    }
    console.log('[TOTAL SOURCES UI WILL COUNT]:', totalSourcesBeingSent);
    console.log('========== END EXACT ATTACHMENT (onGetHighlights) ==========\n');
    
    res.write(`event: attachment\ndata: ${jsonPayload}\n\n`);
  }

  return {
    onSearchResults,
    onGetHighlights,
  };
}

/**
 * Helper function to build an attachment object
 * @param {object} context - The context containing attachment data
 * @returns {object} - The attachment object
 */
function buildAttachment(context) {
  return {
    messageId: context.messageId,
    toolCallId: context.toolCallId,
    conversationId: context.conversationId,
    name: context.attachmentName,
    type: Tools.web_search,
    [Tools.web_search]: context.searchResultData,
  };
}

module.exports = {
  createOnSearchResults,
};
