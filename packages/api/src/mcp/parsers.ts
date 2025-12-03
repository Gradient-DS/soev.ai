import { Tools } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';
import type * as t from './types';

const RECOGNIZED_PROVIDERS = new Set([
  'google',
  'anthropic',
  'openai',
  'azureopenai',
  'openrouter',
  'xai',
  'deepseek',
  'ollama',
  'bedrock',
]);
const CONTENT_ARRAY_PROVIDERS = new Set(['google', 'anthropic', 'azureopenai', 'openai']);

const imageFormatters: Record<string, undefined | t.ImageFormatter> = {
  // google: (item) => ({
  //   type: 'image',
  //   inlineData: {
  //     mimeType: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  // anthropic: (item) => ({
  //   type: 'image',
  //   source: {
  //     type: 'base64',
  //     media_type: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  default: (item) => ({
    type: 'image_url',
    image_url: {
      url: item.data.startsWith('http') ? item.data : `data:${item.mimeType};base64,${item.data}`,
    },
  }),
};

function isImageContent(item: t.ToolContentPart): item is t.ImageContent {
  return item.type === 'image';
}

function parseAsString(result: t.MCPToolCallResponse): string {
  const content = result?.content ?? [];
  if (!content.length) {
    return '(No response)';
  }

  const text = content
    .map((item) => {
      if (item.type === 'text') {
        return item.text;
      }
      if (item.type === 'resource') {
        const resourceText = [];
        if (item.resource.text != null && item.resource.text) {
          resourceText.push(item.resource.text);
        }
        if (item.resource.uri) {
          resourceText.push(`Resource URI: ${item.resource.uri}`);
        }
        if (item.resource.name) {
          resourceText.push(`Resource: ${item.resource.name}`);
        }
        if (item.resource.description) {
          resourceText.push(`Description: ${item.resource.description}`);
        }
        if (item.resource.mimeType != null && item.resource.mimeType) {
          resourceText.push(`Type: ${item.resource.mimeType}`);
        }
        return resourceText.join('\n');
      }
      return JSON.stringify(item, null, 2);
    })
    .filter(Boolean)
    .join('\n\n');

  return text;
}

/**
 * Converts MCPToolCallResponse content into recognized content block types
 * First element: string or formatted content (excluding image_url)
 * Second element: Recognized types - "image", "image_url", "text", "json"
 *
 * @param  result - The MCPToolCallResponse object
 * @param provider - The provider name (google, anthropic, openai)
 * @returns Tuple of content and image_urls
 */
export function formatToolContent(
  result: t.MCPToolCallResponse,
  provider: t.Provider,
): t.FormattedContentResult {
  console.log('[MCP parsers] formatToolContent called with:', {
    provider,
    resultType: typeof result,
    hasContent: !!result?.content,
    contentLength: result?.content?.length,
    rawResult: JSON.stringify(result, null, 2),
  });

  const content = Array.isArray(result?.content) ? (result!.content as t.ToolContentPart[]) : [];
  const hasArrayContent = content.length > 0;
  const treatAsArray = hasArrayContent || CONTENT_ARRAY_PROVIDERS.has(provider);

  console.log('[MCP parsers] Processing state:', {
    contentLength: content.length,
    hasArrayContent,
    treatAsArray,
    recognizedProvider: RECOGNIZED_PROVIDERS.has(provider),
  });

  if (!treatAsArray && !RECOGNIZED_PROVIDERS.has(provider)) {
    console.log('[MCP parsers] Using fallback string parsing for unrecognized provider');
    // Fallback: unknown provider and no structured content; stringify
    return [parseAsString(result), undefined];
  }

  if (!hasArrayContent) {
    console.log('[MCP parsers] No content array, returning empty response');
    return [[{ type: 'text', text: '(No response)' }], undefined];
  }

  const formattedContent: t.FormattedContent[] = [];
  const imageUrls: t.FormattedContent[] = [];
  let currentTextBlock = '';
  const uiResources: UIResource[] = [];
  let artifacts: t.Artifacts = undefined;

  type ContentHandler = undefined | ((item: t.ToolContentPart) => void);

  const contentHandlers: {
    text: (item: Extract<t.ToolContentPart, { type: 'text' }>) => void;
    image: (item: t.ToolContentPart) => void;
    resource: (item: Extract<t.ToolContentPart, { type: 'resource' }>) => void;
  } = {
    text: (item) => {
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + item.text;
    },

    image: (item) => {
      if (!isImageContent(item)) {
        return;
      }
  if (treatAsArray && currentTextBlock) {
        formattedContent.push({ type: 'text', text: currentTextBlock });
        currentTextBlock = '';
      }
      const formatter = imageFormatters.default as t.ImageFormatter;
      const formattedImage = formatter(item);

      if (formattedImage.type === 'image_url') {
        imageUrls.push(formattedImage);
      } else {
        formattedContent.push(formattedImage);
      }
    },

    resource: (item) => {
      console.log('[MCP parsers] Processing resource item:', {
        uri: item.resource.uri,
        name: item.resource.name,
        hasText: !!item.resource.text,
        textLength: typeof item.resource.text === 'string' ? item.resource.text.length : 0,
        mimeType: item.resource.mimeType,
        fullResource: JSON.stringify(item.resource, null, 2),
      });
    
      if (item.resource.uri.startsWith('ui://')) {
        console.log('[MCP parsers] Found ui:// resource, adding to uiResources');
        uiResources.push(item.resource as UIResource);
        return;
      } else if (item.resource.uri.startsWith('artifact://file_search')) {
        console.log('[MCP parsers] Found artifact://file_search resource');
        try {
          const textValue = item.resource.text;
          const payloadText = typeof textValue === 'string' ? textValue.trim() : '';
          console.log('[MCP parsers] file_search payload text:', payloadText);
          
          if (payloadText) {
            const parsed = JSON.parse(payloadText) as {
              sources?: Array<unknown>;
              fileCitations?: boolean;
            };
            console.log('[MCP parsers] Parsed file_search data:', parsed);
    
            const isValidSource = (s: unknown): s is t.MCPFileSearchSource =>
              !!s && typeof s === 'object' && 'fileId' in (s as Record<string, unknown>) && 'relevance' in (s as Record<string, unknown>);
    
            const sources = Array.isArray(parsed?.sources)
              ? (parsed.sources
                  .filter(isValidSource)
                  .map((s) => ({ ...s, sourceType: 'mcp' })) as t.MCPFileSearchSource[])
              : [];
            const fileCitations = Boolean(parsed?.fileCitations);
    
            console.log('[MCP parsers] Extracted file_search artifacts:', {
              sourcesCount: sources.length,
              fileCitations,
              sources,
            });
    
            // Store artifacts for later
            artifacts = {
              ...(artifacts || {}),
              [Tools.file_search]: { sources, fileCitations },
            };
    
            // INJECT CITATION MARKERS into the current text block
            if (fileCitations && sources.length > 0) {
              console.log('[MCP parsers] Injecting citation markers into text');
              
              // Add citation reference guide to the text
              let citationGuide = '\n\n**Available Citations (use these exact markers in your response):**\n';
              sources.forEach((source, index) => {
                const fileName = source.fileName || `Source ${index}`;
                const pages = source.pages && source.pages.length > 0 
                  ? ` (pages: ${source.pages.join(', ')})` 
                  : '';
                const metadata = [];
                if (source.metadata?.year) {
                  metadata.push(source.metadata.year);
                }
                if (source.metadata?.contentsubtype) {
                  metadata.push(source.metadata.contentsubtype);
                }
                const metadataStr = metadata.length > 0 ? ` [${metadata.join(', ')}]` : '';
                // Use double backslash to create literal \ue202 string
                citationGuide += `- ${fileName}${pages}${metadataStr}: \\ue202turn0file${index}\n`;
              });
              
              currentTextBlock += citationGuide;
            }
          }
        } catch (err) {
          console.warn('[MCP parsers] Failed to parse artifact://file_search payload:', err);
        }
        return;
      }
    
      // Handle other resources as before
      const resourceText = [] as string[];
      if (item.resource.text != null && item.resource.text) {
        resourceText.push(`Resource Text: ${item.resource.text}`);
      }
      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${item.resource.uri}`);
      }
      if (item.resource.name) {
        resourceText.push(`Resource: ${item.resource.name}`);
      }
      if (item.resource.description) {
        resourceText.push(`Resource Description: ${item.resource.description}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Resource MIME Type: ${item.resource.mimeType}`);
      }
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
    },
  };

  for (const item of content) {
    const handler = contentHandlers[item.type as keyof typeof contentHandlers] as ContentHandler;
    if (handler) {
      handler(item as never);
    } else {
      const stringified = JSON.stringify(item, null, 2);
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + stringified;
    }
  }

  if (treatAsArray && currentTextBlock) {
    formattedContent.push({ type: 'text', text: currentTextBlock });
  }

  if (imageUrls.length || uiResources.length) {
    artifacts = {
      ...(artifacts || {}),
      ...(imageUrls.length && { content: imageUrls }),
      ...(uiResources.length && { [Tools.ui_resources]: { data: uiResources } }),
    };
  }

  console.log('[MCP parsers] Final formatting result:', {
    treatAsArray,
    formattedContentLength: formattedContent.length,
    currentTextBlockLength: currentTextBlock.length,
    hasArtifacts: !!artifacts,
    artifactsKeys: artifacts ? Object.keys(artifacts) : [],
    artifacts: JSON.stringify(artifacts, null, 2),
  });

  if (treatAsArray) {
    console.log('[MCP parsers] Returning array content');
    return [formattedContent, artifacts];
  }

  console.log('[MCP parsers] Returning text block');
  return [currentTextBlock, artifacts];
}
