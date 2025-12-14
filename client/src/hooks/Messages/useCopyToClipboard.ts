import { useCallback, useEffect, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { ContentTypes, SearchResultData } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  CLEANUP_REGEX,
  CITE_TAG_REGEX,
  parseIndices,
} from '~/utils/citations';

type Source = {
  link: string;
  title: string;
  attribution?: string;
  type: string;
  typeIndex: number;
  citationKey: string; // Used for deduplication
};

const refTypeMap: Record<string, string> = {
  search: 'organic',
  ref: 'references',
  news: 'topStories',
  image: 'images',
  video: 'videos',
};

export default function useCopyToClipboard({
  text,
  content,
  searchResults,
}: Partial<Pick<TMessage, 'text' | 'content'>> & {
  searchResults?: { [key: string]: SearchResultData };
}) {
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = useCallback(
    (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setIsCopied(true);

      // Get the message text from content or text
      let messageText = text ?? '';
      if (content) {
        messageText = content.reduce((acc, curr, i) => {
          if (curr.type === ContentTypes.TEXT) {
            const text = typeof curr.text === 'string' ? curr.text : curr.text.value;
            return acc + text + (i === content.length - 1 ? '' : '\n');
          }
          return acc;
        }, '');
      }

      // Early return if no search data
      if (!searchResults || Object.keys(searchResults).length === 0) {
        // Clean up any citation markers before returning
        const cleanedText = messageText.replace(CLEANUP_REGEX, '');

        copy(cleanedText, { format: 'text/plain' });
        copyTimeoutRef.current = setTimeout(() => {
          setIsCopied(false);
        }, 3000);
        return;
      }

      // Process citations and build a citation manager
      const citationManager = processCitations(messageText, searchResults);
      let processedText = citationManager.formattedText;

      // Add citations list at the end if we have any
      if (citationManager.citations.size > 0) {
        processedText += '\n\nCitations:\n';
        // Sort citations by their reference number
        const sortedCitations = Array.from(citationManager.citations.entries()).sort(
          (a, b) => a[1].referenceNumber - b[1].referenceNumber,
        );

        // Add each citation to the text
        for (const [_, citation] of sortedCitations) {
          processedText += `[${citation.referenceNumber}] ${citation.link}\n`;
        }
      }

      copy(processedText, { format: 'text/plain' });
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 3000);
    },
    [text, content, searchResults],
  );

  return copyToClipboard;
}

/**
 * Process bracket citations in the text and format them as numbered references for clipboard.
 * Handles both single-source citations (【turn0search0】) and
 * multi-source citations (【turn0search0,turn0news1】).
 */
function processCitations(text: string, searchResults: { [key: string]: SearchResultData }) {
  // Maps citation keys to their info including reference numbers
  const citations = new Map<
    string,
    {
      referenceNumber: number;
      link: string;
      title?: string;
      source: Source;
    }
  >();

  // Map to track URLs to citation keys for deduplication
  const urlToCitationKey = new Map<string, string>();

  let nextReferenceNumber = 1;
  let formattedText = text;

  // Find all bracket citations and process them
  const citeTagCopy = new RegExp(CITE_TAG_REGEX.source, 'g');
  const replacements: Array<[string, string]> = [];

  let match: RegExpExecArray | null;
  while ((match = citeTagCopy.exec(text)) !== null) {
    const fullMatch = match[0];
    const indexAttr = match[1]; // e.g., "turn0search0" or "turn0search0,turn0news1"

    // Parse all indices (supports comma-separated for multiple sources)
    const parsedIndices = parseIndices(indexAttr);
    if (!parsedIndices || parsedIndices.length === 0) {
      // Invalid index format - remove the tag
      replacements.push([fullMatch, '']);
      continue;
    }

    const referenceNumbers: number[] = [];

    for (const { turn, sourceKey, index } of parsedIndices) {
      const searchData = searchResults[turn.toString()];
      if (!searchData) continue;

      const dataType = refTypeMap[sourceKey.toLowerCase()] || sourceKey.toLowerCase();
      const sourceArray = searchData[dataType];

      // Skip if no matching data
      if (!sourceArray || !sourceArray[index]) {
        continue;
      }

      // Get source data
      const sourceData = sourceArray[index];
      const sourceUrl = sourceData.link || '';

      // Skip if no link
      if (!sourceUrl) continue;

      // Check if this URL has already been cited
      let citationKey = urlToCitationKey.get(sourceUrl);

      // If not, create a new citation key
      if (!citationKey) {
        citationKey = `${turn}-${dataType}-${index}`;
        urlToCitationKey.set(sourceUrl, citationKey);
      }

      // Check if this source has been cited before
      let existingCitation = citations.get(citationKey);

      if (!existingCitation) {
        // New citation
        const source: Source = {
          link: sourceUrl,
          title: sourceData.title || sourceData.name || '',
          attribution: sourceData.attribution || sourceData.source || '',
          type: dataType,
          typeIndex: index,
          citationKey,
        };

        existingCitation = {
          referenceNumber: nextReferenceNumber++,
          link: source.link,
          title: source.title,
          source,
        };
        citations.set(citationKey, existingCitation);
      }

      referenceNumbers.push(existingCitation.referenceNumber);
    }

    // Sort and deduplicate reference numbers
    const uniqueSortedRefs = [...new Set(referenceNumbers)].sort((a, b) => a - b);

    // Format the replacement: reference numbers (self-closing tags have no content)
    let replacement: string;
    if (uniqueSortedRefs.length === 0) {
      // No valid references found - remove the tag
      replacement = '';
    } else {
      // Show reference numbers
      replacement = uniqueSortedRefs.map((num) => `[${num}]`).join('');
    }

    replacements.push([fullMatch, replacement]);
  }

  // Apply all replacements (from longest to shortest to avoid nested replacement issues)
  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, replacement] of replacements) {
    formattedText = formattedText.replace(pattern, replacement);
  }

  // Remove any orphaned reference lists at the end of the text
  formattedText = formattedText.replace(/\n\s*\[\d+\](\[\d+\])*\s*$/g, '');

  // Clean up any remaining citation markers
  formattedText = formattedText.replace(CLEANUP_REGEX, '');

  return {
    formattedText,
    citations,
  };
}
