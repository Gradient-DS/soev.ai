import { memo, useState, useContext, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import type { CitationProps } from './types';
import { SourceHovercard, FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { FileSourceCitation } from '~/components/Web/FileSourceCitation';
import { CitationContext, useCitation, useCompositeCitations } from './Context';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface CompositeCitationProps {
  citationId?: string;
  // New data-* attributes that survive rehype-raw
  'data-citations'?: string;
  'data-citation-id'?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function CompositeCitation(props: CompositeCitationProps) {
  // Parse data from either old format (node.properties) or new data-* attributes
  let citations: Array<Citation> | undefined;
  let citationId: string | undefined;

  // Try new data-* format first (survives rehype-raw)
  if (props['data-citations']) {
    try {
      citations = JSON.parse(props['data-citations']);
      citationId = props['data-citation-id'];
    } catch (e) {
      console.error('[CompositeCitation] Failed to parse data-citations:', e);
    }
  }
  // Fall back to old format for backwards compatibility
  if (!citations && props.node?.properties?.citations) {
    citations = props.node.properties.citations;
    citationId = citationId || props.node.properties.citationId || undefined;
  }

  console.log('[CompositeCitation] Parsed:', { citations, citationId });

  const localize = useLocalize();
  const { setHoveredCitationId } = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);
  const sources = useCompositeCitations(citations || []);

  if (!sources || sources.length === 0) return null;
  const totalPages = sources.length;

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) return localize('com_citation_source');

    const firstSource = sources[0];
    const remainingCount = sources.length - 1;
    const attribution =
      firstSource.attribution ||
      firstSource.title ||
      getCleanDomain(firstSource.link || '') ||
      localize('com_citation_source');

    return remainingCount > 0 ? `${attribution} +${remainingCount}` : attribution;
  };

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const currentSource = sources?.[currentPage];

  return (
    <SourceHovercard
      source={currentSource}
      label={getCitationLabel()}
      onMouseEnter={() => setHoveredCitationId(citationId || null)}
      onMouseLeave={() => setHoveredCitationId(null)}
    >
      {totalPages > 1 && (
        <span className="mb-2 flex items-center justify-between border-b border-border-heavy pb-2">
          <span className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              style={{ opacity: currentPage === 0 ? 0.5 : 1 }}
              className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base"
            >
              ←
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              style={{ opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
              className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base"
            >
              →
            </button>
          </span>
          <span className="text-xs text-text-tertiary">
            {currentPage + 1}/{totalPages}
          </span>
        </span>
      )}
      <span className="mb-2 flex items-center">
        <FaviconImage domain={getCleanDomain(currentSource.link || '')} className="mr-2" />
        <a
          href={currentSource.link}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 cursor-pointer overflow-hidden text-sm font-bold text-[#0066cc] hover:underline dark:text-blue-400 md:line-clamp-3"
        >
          {currentSource.attribution}
        </a>
      </span>
      <h4 className="mb-1.5 mt-0 text-xs text-text-primary md:text-sm">{currentSource.title}</h4>
      <p className="my-2 text-ellipsis break-all text-xs text-text-secondary md:text-sm">
        {currentSource.snippet}
      </p>
    </SourceHovercard>
  );
}

interface CitationComponentProps {
  citationId?: string;
  citationType?: 'span' | 'standalone' | 'composite' | 'group' | 'navlist';
  // New data-* attributes that survive rehype-raw
  'data-citation'?: string;
  'data-citation-type'?: string;
  'data-citation-id'?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function Citation(props: CitationComponentProps) {
  console.log('[Citation] Component rendered with props:', {
    keys: Object.keys(props),
    dataCitation: props['data-citation'],
    dataCitationType: props['data-citation-type'],
    dataCitationId: props['data-citation-id'],
    hasNode: !!props.node,
    nodeProperties: props.node?.properties,
  });

  // Parse data from either old format (node.properties) or new data-* attributes
  let citation: { turn: number; refType: string; index: number; page?: number } | undefined;
  let citationId: string | undefined;

  // Try new data-* format first (survives rehype-raw)
  if (props['data-citation']) {
    try {
      citation = JSON.parse(props['data-citation']);
      citationId = props['data-citation-id'];
    } catch (e) {
      console.error('[Citation] Failed to parse data-citation:', e);
    }
  }
  // Fall back to old format for backwards compatibility
  if (!citation && props.node?.properties?.citation) {
    const propCitation = props.node.properties.citation;
    // Handle case where it might have been stringified
    if (typeof propCitation === 'string' && propCitation !== '[object Object]') {
      try {
        citation = JSON.parse(propCitation);
      } catch {
        // Not JSON, ignore
      }
    } else if (typeof propCitation === 'object') {
      citation = propCitation;
    }
    citationId = citationId || props.node.properties.citationId || undefined;
  }

  console.log('[Citation] Parsed citation:', { citation, citationId });

  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
    page: citation?.page,
  });

  // Setup file download hook
  const isFileType = refData?.refType === 'file' && (refData as any)?.fileId;
  const isLocalFile = isFileType && (refData as any)?.metadata?.storageType === 'local';
  const { refetch: downloadFile } = useFileDownload(
    user?.id ?? '',
    isFileType && !isLocalFile ? (refData as any).fileId : '',
  );

  const handleFileDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isFileType || !(refData as any)?.fileId) return;

      // Don't allow download for local files
      if (isLocalFile) {
        showToast({
          status: 'error',
          message: localize('com_sources_download_local_unavailable'),
        });
        return;
      }

      try {
        const stream = await downloadFile();
        if (stream.data == null || stream.data === '') {
          console.error('Error downloading file: No data found');
          showToast({
            status: 'error',
            message: localize('com_ui_download_error'),
          });
          return;
        }
        const link = document.createElement('a');
        link.href = stream.data;
        link.setAttribute('download', (refData as any).fileName || 'file');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(stream.data);
      } catch (error) {
        console.error('Error downloading file:', error);
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
      }
    },
    [downloadFile, isFileType, isLocalFile, refData, localize, showToast],
  );

  if (!refData) return null;

  // Check if there's an external URL available for click-to-open
  const externalUrl = (refData as any)?.metadata?.url || (refData as any)?.link;
  const hasExternalUrl =
    externalUrl && typeof externalUrl === 'string' && externalUrl.startsWith('http');

  // Handler for opening external URL
  const handleExternalUrlClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hasExternalUrl) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    },
    [hasExternalUrl, externalUrl],
  );

  const getCitationLabel = () => {
    let label =
      refData.attribution ||
      refData.title ||
      getCleanDomain(refData.link || '') ||
      localize('com_citation_source');

    // Add page number to label if present
    if (citation?.page !== undefined) {
      label = `${label}, p.${citation.page}`;
    }

    return label;
  };

  // Use FileSourceCitation for file types (MCP sources with metadata)
  if (isFileType) {
    return (
      <FileSourceCitation
        source={refData}
        label={getCitationLabel()}
        citationId={citationId || undefined}
        page={citation?.page}
        hasExternalUrl={hasExternalUrl}
        onExternalUrlClick={hasExternalUrl ? handleExternalUrlClick : undefined}
        onMouseEnter={() => setHoveredCitationId(citationId || null)}
        onMouseLeave={() => setHoveredCitationId(null)}
      />
    );
  }

  // For web search results, clicking opens the link
  const handleClick = hasExternalUrl ? handleExternalUrlClick : undefined;

  return (
    <SourceHovercard
      source={refData}
      label={getCitationLabel()}
      onMouseEnter={() => setHoveredCitationId(citationId || null)}
      onMouseLeave={() => setHoveredCitationId(null)}
      onClick={handleClick}
      isFile={isFileType}
      isLocalFile={isLocalFile}
      hasExternalUrl={hasExternalUrl}
    />
  );
}

export interface HighlightedTextProps {
  children: React.ReactNode;
  citationId?: string;
  // New data-* attributes that survive rehype-raw
  'data-citation-id'?: string;
}

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
}

export const HighlightedText = memo(function HighlightedText({
  children,
  citationId,
  'data-citation-id': dataCitationId,
  ...rest
}: HighlightedTextProps & Record<string, unknown>) {
  // Use data-citation-id if available (survives rehype-raw), fall back to citationId
  const effectiveCitationId = dataCitationId || citationId;
  console.log('[HighlightedText] Rendering with props:', { citationId, dataCitationId, effectiveCitationId, children: typeof children });
  const isHighlighted = useHighlightState(effectiveCitationId);

  return (
    <span
      className={`rounded px-0 py-0.5 transition-colors ${isHighlighted ? 'bg-amber-300/20' : ''}`}
    >
      {children}
    </span>
  );
});
