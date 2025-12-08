import React, { useEffect, useCallback, useRef, useState } from 'react';
import throttle from 'lodash/throttle';
import { visit } from 'unist-util-visit';
import { useSetRecoilState } from 'recoil';
import { useLocation } from 'react-router-dom';
import type { Pluggable } from 'unified';
import type { Artifact } from '~/common';
import { useMessageContext, useArtifactContext } from '~/Providers';
import { logger, extractContent, isArtifactRoute } from '~/utils';
import { artifactsState } from '~/store/artifacts';
import ArtifactButton from './ArtifactButton';

/**
 * Extracts raw text content from mdast nodes before rehype processing
 * Handles text, html, and other node types with value property
 */
const extractRawContent = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return '';
  }
  const n = node as { type?: string; value?: string; children?: unknown[] };
  // Handle nodes with value (text, html, code, etc.)
  if (typeof n.value === 'string') {
    return n.value;
  }
  if (Array.isArray(n.children)) {
    return n.children.map(extractRawContent).join('');
  }
  return '';
};

export const artifactPlugin: Pluggable = () => {
  return (tree) => {
    visit(tree, ['textDirective', 'leafDirective', 'containerDirective'], (node, index, parent) => {
      if (node.type === 'textDirective') {
        const replacementText = `:${node.name}`;
        if (parent && Array.isArray(parent.children) && typeof index === 'number') {
          parent.children[index] = {
            type: 'text',
            value: replacementText,
          };
        }
      }
      if (node.name !== 'artifact') {
        return;
      }
      // Extract raw content BEFORE rehype-raw processes it
      const rawContent = extractRawContent(node);
      console.log('[artifactPlugin] node:', JSON.stringify(node, null, 2).slice(0, 500));
      console.log('[artifactPlugin] rawContent length:', rawContent.length, 'preview:', rawContent.slice(0, 100));
      node.data = {
        hName: node.name,
        hProperties: {
          ...node.attributes,
          'data-raw-content': rawContent,
        },
        ...node.data,
      };
      return node;
    });
  };
};

const defaultTitle = 'untitled';
const defaultType = 'unknown';
const defaultIdentifier = 'lc-no-identifier';

export function Artifact({
  node: _node,
  'data-raw-content': rawContent,
  ...props
}: Artifact & {
  children: React.ReactNode | { props: { children: React.ReactNode } };
  node: unknown;
  'data-raw-content'?: string;
}) {
  const location = useLocation();
  const { messageId } = useMessageContext();
  const { getNextIndex, resetCounter } = useArtifactContext();
  const artifactIndex = useRef(getNextIndex(false)).current;

  const setArtifacts = useSetRecoilState(artifactsState);
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  const throttledUpdateRef = useRef(
    throttle((updateFn: () => void) => {
      updateFn();
    }, 25),
  );

  const updateArtifact = useCallback(() => {
    // Prefer raw content from the plugin (preserved before rehype-raw processing)
    // Fall back to extractContent for backwards compatibility
    const content = rawContent || extractContent(props.children);
    logger.log('artifacts', 'updateArtifact: content.length', content.length, 'hasRawContent:', !!rawContent);

    const title = props.title ?? defaultTitle;
    const type = props.type ?? defaultType;
    const identifier = props.identifier ?? defaultIdentifier;
    const artifactKey = `${identifier}_${type}_${title}_${messageId}`
      .replace(/\s+/g, '_')
      .toLowerCase();

    throttledUpdateRef.current(() => {
      const now = Date.now();
      if (artifactKey === `${defaultIdentifier}_${defaultType}_${defaultTitle}_${messageId}`) {
        return;
      }

      const currentArtifact: Artifact = {
        id: artifactKey,
        identifier,
        title,
        type,
        content,
        messageId,
        index: artifactIndex,
        lastUpdateTime: now,
      };

      if (!isArtifactRoute(location.pathname)) {
        return setArtifact(currentArtifact);
      }

      setArtifacts((prevArtifacts) => {
        if (
          prevArtifacts?.[artifactKey] != null &&
          prevArtifacts[artifactKey]?.content === content
        ) {
          return prevArtifacts;
        }

        return {
          ...prevArtifacts,
          [artifactKey]: currentArtifact,
        };
      });

      setArtifact(currentArtifact);
    });
  }, [
    props.type,
    props.title,
    setArtifacts,
    props.children,
    props.identifier,
    rawContent,
    messageId,
    artifactIndex,
    location.pathname,
  ]);

  useEffect(() => {
    resetCounter();
    updateArtifact();
  }, [updateArtifact, resetCounter]);

  return <ArtifactButton artifact={artifact} />;
}
