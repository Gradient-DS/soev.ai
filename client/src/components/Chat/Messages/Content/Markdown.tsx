import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import type { Pluggable } from 'unified';
import type { Root, Text, Element } from 'hast';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset, preprocessLaTeX } from '~/utils';
import { unicodeCitation } from '~/components/Web';
import { code, a, p, img } from './MarkdownComponents';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

/**
 * Rehype plugin to convert literal <br> text in the AST to actual break elements.
 * This allows <br> tags to render as line breaks within table cells without
 * using rehypeRaw which interferes with artifacts.
 * Matches both raw <br> and HTML-escaped &lt;br&gt; variants.
 */
const rehypeBr: Pluggable = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (!('children' in parent)) return;

      // Match both <br> and HTML-escaped &lt;br&gt; variants
      const brPattern = /(<br\s*\/?>|&lt;br\s*\/?&gt;)/gi;
      if (!brPattern.test(node.value)) return;

      // Split text by <br> tags and create new nodes
      const parts = node.value.split(/(<br\s*\/?>|&lt;br\s*\/?&gt;)/gi);
      const newNodes: (Text | Element)[] = [];

      parts.forEach((part) => {
        if (!part) return;
        // Check if this part is a <br> tag (either raw or escaped)
        if (/^(<br\s*\/?>|&lt;br\s*\/?&gt;)$/i.test(part)) {
          newNodes.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
        } else {
          newNodes.push({ type: 'text', value: part });
        }
      });

      // Replace the text node with our new nodes
      (parent.children as (Text | Element)[]).splice(index, 1, ...newNodes);
    });
  };
};

const Markdown = memo(({ content = '', isLatestMessage }: TContentProps) => {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);

  const rehypePlugins = useMemo(
    () => [
      [rehypeBr],
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = [
    supersub,
    remarkGfm,
    remarkDirective,
    artifactPlugin,
    [remarkMath, { singleDollarTextMath: false }],
    unicodeCitation,
  ];

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      <ArtifactProvider>
        <CodeBlockProvider>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /* @ts-ignore */
            rehypePlugins={rehypePlugins}
            components={
              {
                code,
                a,
                p,
                img,
                artifact: Artifact,
                citation: Citation,
                'highlighted-text': HighlightedText,
                'composite-citation': CompositeCitation,
              } as {
                [nodeType: string]: React.ElementType;
              }
            }
          >
            {currentContent}
          </ReactMarkdown>
        </CodeBlockProvider>
      </ArtifactProvider>
    </MarkdownErrorBoundary>
  );
});

export default Markdown;
