import React, { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { ChevronDown, Paperclip, ExternalLink } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { ExternalLinkDialog } from './ExternalLinkDialog';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface FileSourceCitationProps {
  source: any;
  label: string;
  citationId?: string;
  page?: number;
  hasExternalUrl?: boolean;
  onExternalUrlClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function FileSourceCitation({
  source,
  label,
  citationId,
  page,
  hasExternalUrl: hasExternalUrlProp,
  onExternalUrlClick,
  onMouseEnter,
  onMouseLeave,
}: FileSourceCitationProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();

  const isLocalFile = source?.metadata?.storageType === 'local';
  const externalUrl = source?.metadata?.url;
  const hasExternalUrl = hasExternalUrlProp ?? !!externalUrl;
  const isClickable = hasExternalUrl || (!isLocalFile && source?.fileId);

  const { refetch: downloadFile } = useFileDownload(
    user?.id ?? '',
    !isLocalFile && !hasExternalUrl ? source.fileId : '',
  );

  const handleFileDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!source?.fileId) return;

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
          showToast({
            status: 'error',
            message: localize('com_ui_download_error'),
          });
          return;
        }
        const link = document.createElement('a');
        link.href = stream.data;
        link.setAttribute('download', source.fileName || 'file');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(stream.data);
      } catch (error) {
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
      }
    },
    [downloadFile, source, isLocalFile, localize, showToast],
  );

  const renderTrigger = () => {
    // All file citations use the same base styling with proper truncation
    // Matching SourceHovercard styling: border-border-heavy, dark:border-border-medium
    const baseButtonClass =
      'ml-1 inline-flex h-5 max-w-36 items-center gap-1 rounded-xl border border-border-heavy px-2 text-xs font-medium no-underline transition-colors bg-surface-secondary hover:bg-surface-hover dark:border-border-medium dark:hover:bg-surface-tertiary';
    const clickableClass = 'cursor-pointer text-blue-600 dark:text-blue-400';
    const nonClickableClass = 'cursor-default text-text-secondary';

    const buttonClass = `${baseButtonClass} ${isClickable ? clickableClass : nonClickableClass}`;

    // Handler for click - either external URL or file download
    const handleClick = hasExternalUrl
      ? onExternalUrlClick
      : !isLocalFile
        ? handleFileDownload
        : undefined;

    if (hasExternalUrl && externalUrl) {
      return (
        <ExternalLinkDialog
          url={externalUrl}
          trigger={
            <button className={buttonClass} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
              <span className="truncate">{label}</span>
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
            </button>
          }
        />
      );
    }

    return (
      <button
        onClick={handleClick}
        className={buttonClass}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        title={isLocalFile ? localize('com_sources_download_local_unavailable') : undefined}
      >
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider showTimeout={150} hideTimeout={150}>
        <span className="flex items-center">
          <Ariakit.HovercardAnchor render={renderTrigger()} />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>{localize('com_citation_more_details', { label })}</VisuallyHidden>
            <ChevronDown className="icon-sm" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className="dark:shadow-lg-dark z-[999] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            <span className="mb-2 flex items-center">
              <div className="mr-2 flex h-4 w-4 items-center justify-center">
                <Paperclip className="h-3 w-3 text-text-secondary" />
              </div>
              <button
                onClick={!isLocalFile && !hasExternalUrl ? handleFileDownload : undefined}
                className="line-clamp-2 cursor-pointer overflow-hidden text-left text-sm font-bold text-[#0066cc] hover:underline dark:text-blue-400 md:line-clamp-3"
              >
                {source.attribution || source.title || localize('com_file_source')}
              </button>
            </span>

            {source.snippet && (
              <span className="my-2 text-ellipsis break-all text-xs text-text-secondary md:text-sm">
                {source.snippet}
              </span>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {source.metadata?.year && (
                <span className="rounded-md bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
                  {source.metadata.year}
                </span>
              )}
              {source.metadata?.contentsubtype && (
                <span className="rounded-md bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
                  {source.metadata.contentsubtype}
                </span>
              )}
            </div>
          </Ariakit.Hovercard>
        </span>
      </Ariakit.HovercardProvider>
    </span>
  );
}
