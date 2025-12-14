import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { Pluggable } from 'unified';
import { CitationInline, CitationInlineMultiple, HighlightedText } from '~/components/Citations';
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

const Markdown = memo(({ content = '', isLatestMessage }: TContentProps) => {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    const processed = LaTeXParsing ? preprocessLaTeX(content) : content;
    // Debug: log FULL raw content to see exactly what we're getting
    console.log('[Markdown] RAW CONTENT (full):', content);
    console.log('[Markdown] PROCESSED CONTENT (full):', processed);
    console.log('[Markdown] Content analysis:', {
      hasCiteTags: processed.includes('<cite'),
      hasAngleBrackets: processed.includes('<'),
      length: processed.length,
    });
    return processed;
  }, [content, LaTeXParsing, isInitializing]);

  // Debug plugin to inspect tree after remark processing
  const debugRehypePlugin = useMemo(
    () => () => (tree: any) => {
      const hasCitations = JSON.stringify(tree).includes('citation');
      const hasHighlightedText = JSON.stringify(tree).includes('highlighted-text');
      console.log('[Markdown:debugRehypePlugin] Tree before rehype-raw:', {
        hasCitations,
        hasHighlightedText,
        treeType: tree.type,
        childrenCount: tree.children?.length,
        firstFewChildren: tree.children?.slice(0, 3).map((c: any) => ({
          type: c.type,
          tagName: c.tagName,
          dataHName: c.data?.hName,
        })),
      });
      // Log any citation nodes found
      const findCitations = (node: any, path: string[] = []): void => {
        if (node.type === 'citation' || node.data?.hName === 'citation' || node.tagName === 'citation') {
          console.log('[Markdown:debugRehypePlugin] Found citation node at path:', path.join(' > '), node);
        }
        if (node.children) {
          node.children.forEach((child: any, i: number) => findCitations(child, [...path, `${node.type || node.tagName}[${i}]`]));
        }
      };
      findCitations(tree);
    },
    [],
  );

  // Debug plugin to inspect tree after rehype-raw processing
  const debugAfterRehypeRaw = useMemo(
    () => () => (tree: any) => {
      const hasCitations = JSON.stringify(tree).includes('citation');
      const hasHighlightedText = JSON.stringify(tree).includes('highlighted-text');
      console.log('[Markdown:debugAfterRehypeRaw] Tree AFTER rehype-raw:', {
        hasCitations,
        hasHighlightedText,
        treeType: tree.type,
        childrenCount: tree.children?.length,
      });
      // Log any citation nodes found after rehype-raw
      const findCitations = (node: any, path: string[] = []): void => {
        if (node.type === 'citation' || node.data?.hName === 'citation' || node.tagName === 'citation') {
          console.log('[Markdown:debugAfterRehypeRaw] Found citation node at path:', path.join(' > '), {
            type: node.type,
            tagName: node.tagName,
            dataHName: node.data?.hName,
            properties: node.properties,
          });
        }
        if (node.children) {
          node.children.forEach((child: any, i: number) => findCitations(child, [...path, `${node.type || node.tagName}[${i}]`]));
        }
      };
      findCitations(tree);
    },
    [],
  );

  const rehypePlugins = useMemo(
    () => [
      debugRehypePlugin,
      [rehypeRaw, { passThrough: ['citation', 'highlighted-text', 'composite-citation', 'artifact'] }],
      debugAfterRehypeRaw,
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
    [debugRehypePlugin, debugAfterRehypeRaw],
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
                citation: CitationInline,
                'highlighted-text': HighlightedText,
                'composite-citation': CitationInlineMultiple,
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
