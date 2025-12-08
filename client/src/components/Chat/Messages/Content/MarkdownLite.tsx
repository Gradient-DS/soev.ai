import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { visit } from 'unist-util-visit';
import type { PluggableList, Pluggable } from 'unified';
import type { Root, Text, Element } from 'hast';
import { code, codeNoExecution, a, p, img } from './MarkdownComponents';
import { CodeBlockProvider, ArtifactProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset } from '~/utils';

/**
 * Rehype plugin to convert literal <br> text in the AST to actual break elements.
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

const MarkdownLite = memo(
  ({ content = '', codeExecution = true }: { content?: string; codeExecution?: boolean }) => {
    const rehypePlugins: PluggableList = [
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
    ];

    return (
      <MarkdownErrorBoundary content={content} codeExecution={codeExecution}>
        <ArtifactProvider>
          <CodeBlockProvider>
            <ReactMarkdown
              remarkPlugins={[
                /** @ts-ignore */
                supersub,
                remarkGfm,
                [remarkMath, { singleDollarTextMath: false }],
              ]}
              /** @ts-ignore */
              rehypePlugins={rehypePlugins}
              // linkTarget="_new"
              components={
                {
                  code: codeExecution ? code : codeNoExecution,
                  a,
                  p,
                  img,
                } as {
                  [nodeType: string]: React.ElementType;
                }
              }
            >
              {content}
            </ReactMarkdown>
          </CodeBlockProvider>
        </ArtifactProvider>
      </MarkdownErrorBoundary>
    );
  },
);

export default MarkdownLite;
