import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { Citation, CitationNode } from './types';
import {
  CITE_TAG_REGEX,
  parseIndices,
} from '~/utils/citations';

// Log when module is loaded
console.log('[bracketCitation] Plugin module loaded');

const DEBUG_CITATIONS = true;
const debugLog = (...args: unknown[]) => {
  if (DEBUG_CITATIONS) {
    console.log('[bracketCitation]', ...args);
  }
};

interface CiteMatch {
  fullMatch: string;
  index: number;
  indices: Array<{ turn: number; sourceKey: string; index: number }>;
}

/**
 * Find all cite tag matches in text, sorted by position.
 */
function findCiteMatches(text: string): CiteMatch[] {
  const matches: CiteMatch[] = [];

  // Match self-closing cite tags
  let match: RegExpExecArray | null;
  CITE_TAG_REGEX.lastIndex = 0;
  while ((match = CITE_TAG_REGEX.exec(text)) !== null) {
    const parsedIndices = parseIndices(match[1]);
    if (parsedIndices) {
      matches.push({
        fullMatch: match[0],
        index: match.index,
        indices: parsedIndices,
      });
    }
  }

  // Sort by position
  return matches.sort((a, b) => a.index - b.index);
}

function processTree(tree: Node) {
  debugLog('processTree called');

  // Process both 'text' and 'html' nodes - markdown parses <cite> as HTML nodes
  const nodeTypes = ['text', 'html'];

  for (const nodeType of nodeTypes) {
    visit(tree, nodeType, (node, index, parent) => {
      const textNode = node as CitationNode;
      const parentNode = parent as CitationNode;

      if (typeof textNode.value !== 'string') return;

      const originalValue = textNode.value;

      // Quick check for any bracket citations
      if (!originalValue.includes('【')) {
        return;
      }

      debugLog(`Found ${nodeType} node with bracket citations:`, originalValue.slice(0, 200));

      const matches = findCiteMatches(originalValue);
      if (matches.length === 0) {
        return;
      }

      const segments: Array<CitationNode> = [];
      let currentPosition = 0;

      for (const match of matches) {
        // Add text before this match
        if (match.index > currentPosition) {
          const textBefore = originalValue.substring(currentPosition, match.index);
          if (textBefore) {
            segments.push({ type: 'text', value: textBefore });
          }
        }

        // Create citation node(s)
        const isSingle = match.indices.length === 1;
        const citationId = `cite-${match.index}-${match.indices.map((i) => `${i.turn}${i.sourceKey}${i.index}`).join('_')}`;

        if (isSingle) {
          // Single citation
          const citation = match.indices[0];

          // Add the citation marker node
          segments.push({
            type: 'citation',
            data: {
              hName: 'citation',
              hProperties: {
                'data-citation': JSON.stringify({
                  turn: citation.turn,
                  refType: citation.sourceKey,
                  index: citation.index,
                }),
                'data-citation-type': 'standalone',
                'data-citation-id': citationId,
              },
            },
          });
        } else {
          // Multiple citations (composite)
          const citations: Citation[] = match.indices.map((idx) => ({
            turn: idx.turn,
            refType: idx.sourceKey,
            index: idx.index,
          }));

          // Add the composite citation marker node
          segments.push({
            type: 'composite-citation',
            data: {
              hName: 'composite-citation',
              hProperties: {
                'data-citations': JSON.stringify(citations),
                'data-citation-id': citationId,
              },
            },
          });
        }

        currentPosition = match.index + match.fullMatch.length;
      }

      // Add remaining text
      if (currentPosition < originalValue.length) {
        const remaining = originalValue.substring(currentPosition);
        if (remaining) {
          segments.push({ type: 'text', value: remaining });
        }
      }

      // Replace node with segments
      if (segments.length > 0 && index !== undefined) {
        debugLog('Replacing text node with', segments.length, 'segments');
        parentNode.children?.splice(index, 1, ...segments);
        return index + segments.length;
      }
    });
  }

  debugLog('processTree finished');
}

export function bracketCitation() {
  return (tree: Node) => {
    debugLog('[bracketCitation] Plugin called');
    processTree(tree);
    debugLog('[bracketCitation] Plugin finished');
  };
}

// Export with legacy names for backward compatibility
export { bracketCitation as xmlCitation, bracketCitation as unicodeCitation };
