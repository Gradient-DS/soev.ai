import React, { useMemo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { Download, ExternalLink } from 'lucide-react';
import { ExternalLinkDialog } from './ExternalLinkDialog';
import { useFileDownload, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

type MCPFileSource = {
  file_id: string;
  filename: string;
  bytes?: number;
  type?: string;
  pages?: number[];
  relevance?: number;
  pageRelevance?: Record<number, number>;
  messageId: string;
  toolCallId: string;
  metadata?: {
    url?: string;
    year?: string;
    contentsubtype?: string;
    storageType?: string;
    [key: string]: unknown;
  };
};

interface MCPFileItemProps {
  file: MCPFileSource;
  messageId: string;
  conversationId: string;
  expanded?: boolean;
}

function sortPagesByRelevance(pages: number[], pageRelevance?: Record<number, number>): number[] {
  if (!pageRelevance || Object.keys(pageRelevance).length === 0) {
    return pages;
  }
  return [...pages].sort((a, b) => {
    const relevanceA = pageRelevance[a] || 0;
    const relevanceB = pageRelevance[b] || 0;
    return relevanceB - relevanceA;
  });
}

export const MCPFileItem = React.memo(function MCPFileItem({
  file,
  messageId: _messageId,
  conversationId: _conversationId,
  expanded = false,
}: MCPFileItemProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const showExternalLinkConfirm =
    (startupConfig?.interface as Record<string, unknown> | undefined)?.externalLinkConfirm !== false;

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file.file_id);

  const getErrorMessage = useCallback(
    (error: any) => {
      const errorString = JSON.stringify(error);
      const errorWithResponse = error as any;
      const isLocalFileError =
        error?.message?.includes('local files') ||
        errorWithResponse?.response?.data?.error?.includes('local files') ||
        errorWithResponse?.response?.status === 403 ||
        errorString.includes('local files') ||
        errorString.includes('403');

      return isLocalFileError
        ? localize('com_sources_download_local_unavailable')
        : localize('com_sources_download_failed');
    },
    [localize],
  );

  const isLocalFile = file.metadata?.storageType === 'local';
  const externalUrl = file.metadata?.url;
  const hasExternalUrl = !!externalUrl;

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isLocalFile) {
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
        link.setAttribute('download', file.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(stream.data);
      } catch (error) {
        console.error('Error downloading file:', error);
      }
    },
    [downloadFile, file.filename, isLocalFile, localize, showToast],
  );

  const isLoading = false;

  const fileIcon = useMemo(() => {
    const fileType = file.type?.toLowerCase() || '';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('text')) return '📝';
    if (fileType.includes('word') || fileType.includes('doc')) return '📄';
    if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📈';
    return '📎';
  }, [file.type]);

  const downloadAriaLabel = localize('com_sources_download_aria_label', {
    filename: file.filename,
    status: isLoading ? localize('com_sources_downloading_status') : '',
  });

  const error = null;

  // Metadata badges component
  const MetadataBadges = () => {
    if (!file.metadata?.year && !file.metadata?.contentsubtype) {
      return null;
    }

    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {file.metadata?.year && (
          <span className="rounded-md bg-surface-tertiary px-1.5 py-0.5">{file.metadata.year}</span>
        )}
        {file.metadata?.contentsubtype && (
          <span className="rounded-md bg-surface-tertiary px-1.5 py-0.5">
            {file.metadata.contentsubtype}
          </span>
        )}
      </div>
    );
  };

  if (expanded) {
    if (hasExternalUrl && externalUrl) {
      const expandedExternalButton = (
        <button
          className="flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary [&:hover_.filename]:text-blue-600 dark:[&:hover_.filename]:text-blue-400"
          aria-label={`${file.filename} - ${localize('com_external_link_warning_title')}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{fileIcon}</span>
            <span className="truncate text-xs font-medium text-text-secondary">
              {localize('com_sources_agent_file')}
            </span>
            <ExternalLink className="ml-auto h-3 w-3" />
          </div>
          <div className="mt-1 min-w-0">
            <span className="filename line-clamp-2 break-all text-left text-sm font-medium text-text-primary transition-colors md:line-clamp-3">
              {file.filename}
            </span>
            {file.pages && file.pages.length > 0 && (
              <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
                {localize('com_sources_pages')}:{' '}
                {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
              </span>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <MetadataBadges />
              {file.bytes && (
                <span className="line-clamp-1">{(file.bytes / 1024).toFixed(1)} KB</span>
              )}
            </div>
          </div>
          {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
        </button>
      );

      if (showExternalLinkConfirm) {
        return <ExternalLinkDialog url={externalUrl} trigger={expandedExternalButton} />;
      }
      // Direct link without confirmation dialog
      return (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="contents">
          {expandedExternalButton}
        </a>
      );
    }

    return (
      <button
        onClick={isLocalFile ? undefined : handleDownload}
        disabled={isLoading}
        className={`flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 disabled:opacity-50 ${
          isLocalFile ? 'cursor-default' : 'hover:bg-surface-tertiary'
        }`}
        aria-label={
          isLocalFile ? localize('com_sources_download_local_unavailable') : downloadAriaLabel
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{fileIcon}</span>
          <span className="truncate text-xs font-medium text-text-secondary">
            {localize('com_sources_agent_file')}
          </span>
          {!isLocalFile && <Download className="ml-auto h-3 w-3" />}
        </div>
        <div className="mt-1 min-w-0">
          <span className="line-clamp-2 break-all text-left text-sm font-medium text-text-primary md:line-clamp-3">
            {file.filename}
          </span>
          {file.pages && file.pages.length > 0 && (
            <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
              {localize('com_sources_pages')}:{' '}
              {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
            </span>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <MetadataBadges />
            {file.bytes && (
              <span className="line-clamp-1">{(file.bytes / 1024).toFixed(1)} KB</span>
            )}
          </div>
        </div>
        {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
      </button>
    );
  }

  if (hasExternalUrl && externalUrl) {
    const compactExternalButton = (
      <button
        className="flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary [&:hover_.filename]:text-blue-600 dark:[&:hover_.filename]:text-blue-400"
        aria-label={`${file.filename} - ${localize('com_external_link_warning_title')}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{fileIcon}</span>
          <span className="truncate text-xs font-medium text-text-secondary">
            {localize('com_sources_agent_file')}
          </span>
          <ExternalLink className="ml-auto h-3 w-3" />
        </div>
        <div className="mt-1 min-w-0">
          <span className="filename line-clamp-2 break-all text-left text-sm font-medium text-text-primary transition-colors md:line-clamp-3">
            {file.filename}
          </span>
          {file.pages && file.pages.length > 0 && (
            <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
              {localize('com_sources_pages')}:{' '}
              {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
            </span>
          )}
          <MetadataBadges />
        </div>
        {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
      </button>
    );

    if (showExternalLinkConfirm) {
      return <ExternalLinkDialog url={externalUrl} trigger={compactExternalButton} />;
    }
    // Direct link without confirmation dialog
    return (
      <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="contents">
        {compactExternalButton}
      </a>
    );
  }

  return (
    <button
      onClick={isLocalFile ? undefined : handleDownload}
      disabled={isLoading}
      className={`flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 disabled:opacity-50 ${
        isLocalFile ? 'cursor-default' : 'hover:bg-surface-tertiary'
      }`}
      aria-label={
        isLocalFile ? localize('com_sources_download_local_unavailable') : downloadAriaLabel
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{fileIcon}</span>
        <span className="truncate text-xs font-medium text-text-secondary">
          {localize('com_sources_agent_file')}
        </span>
        {!isLocalFile && <Download className="ml-auto h-3 w-3" />}
      </div>
      <div className="mt-1 min-w-0">
        <span className="line-clamp-2 break-all text-left text-sm font-medium text-text-primary md:line-clamp-3">
          {file.filename}
        </span>
        {file.pages && file.pages.length > 0 && (
          <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
            {localize('com_sources_pages')}:{' '}
            {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
          </span>
        )}
        <MetadataBadges />
      </div>
      {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
    </button>
  );
});
