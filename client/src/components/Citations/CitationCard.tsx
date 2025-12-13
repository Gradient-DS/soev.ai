/**
 * CitationCard
 *
 * Single source card for top-level display (compact) and expanded dialogs (expanded).
 * Click behavior based on presence of URL.
 */

import { Paperclip, ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  cardCompact,
  cardExpanded,
  cardClickable,
  cardNeutral,
  metadataBadge,
  pageBadge,
} from './styles';
import { getCleanDomain, getFaviconUrl, hasExternalUrl, getExternalUrl, sortPagesByRelevance } from './utils';
import { ExternalLinkConfirm } from './ExternalLinkConfirm';
import type { CitationCardProps } from './types';
import { cn } from '~/utils';

function FaviconImage({ domain, className = '' }: { domain: string; className?: string }) {
  return (
    <div className={cn('relative size-4 flex-shrink-0 overflow-hidden rounded-full', className)}>
      <div className="absolute inset-0 rounded-full bg-white" />
      <img src={getFaviconUrl(domain)} alt={domain} className="relative size-full" />
      <div className="absolute inset-0 rounded-full border border-border-light/10 dark:border-transparent" />
    </div>
  );
}

export function CitationCard({ citation, variant, showHoverCard }: CitationCardProps) {
  const localize = useLocalize();
  const isWebSource = citation.origin === 'web_search';
  const domain = getCleanDomain(citation.url || citation.link || '');
  const externalUrl = getExternalUrl(citation);
  const hasUrl = hasExternalUrl(citation);

  // Sorted pages (show first 5)
  const sortedPages = citation.pages
    ? sortPagesByRelevance(citation.pages, citation.pageRelevance).slice(0, 5)
    : [];

  // Display values
  const displayAttribution = isWebSource
    ? domain
    : localize('com_file_source');
  const displayTitle = citation.title || citation.fileName || domain || localize('com_citation_source');

  if (variant === 'compact') {
    // Compact card for top-level display
    const cardContent = (
      <div className={cn(cardCompact, hasUrl ? cardClickable : cardNeutral)}>
        {/* Icon and attribution */}
        <div className="mb-1 flex items-center gap-2">
          {isWebSource ? (
            <FaviconImage domain={domain} />
          ) : (
            <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface-tertiary dark:bg-gray-600">
              <Paperclip className="h-2.5 w-2.5 text-text-secondary" />
            </div>
          )}
          <span className="truncate text-xs text-text-secondary">
            {displayAttribution}
          </span>
          {hasUrl && (
            <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0 text-text-tertiary" />
          )}
        </div>

        {/* Title */}
        <span className="line-clamp-2 text-sm font-medium text-text-primary">
          {displayTitle}
        </span>
      </div>
    );

    if (hasUrl && externalUrl) {
      return (
        <ExternalLinkConfirm url={externalUrl} trigger={cardContent} />
      );
    }

    return cardContent;
  }

  // Expanded card for dialog list
  const expandedContent = (
    <div className={cn(cardExpanded, hasUrl ? 'cursor-pointer hover:bg-surface-tertiary' : '')}>
      {/* Header row with icon, attribution, and external link indicator */}
      <div className="mb-2 flex items-center gap-2">
        {isWebSource ? (
          <FaviconImage domain={domain} />
        ) : (
          <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface-tertiary dark:bg-gray-600">
            <Paperclip className="h-2.5 w-2.5 text-text-secondary" />
          </div>
        )}
        <span className="text-xs text-text-secondary">
          {displayAttribution}
        </span>
        {hasUrl && (
          <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0 text-blue-500" />
        )}
      </div>

      {/* Title */}
      <h4 className={cn(
        'mb-1 text-sm font-medium',
        hasUrl ? 'text-blue-600 dark:text-blue-400' : 'text-text-primary'
      )}>
        {displayTitle}
      </h4>

      {/* Snippet */}
      {citation.snippet && (
        <p className="mb-2 line-clamp-3 text-xs text-text-secondary">
          {citation.snippet}
        </p>
      )}

      {/* Metadata row */}
      {(citation.metadata?.year || citation.metadata?.contentsubtype || sortedPages.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {citation.metadata?.year && (
            <span className={metadataBadge}>{citation.metadata.year}</span>
          )}
          {citation.metadata?.contentsubtype && (
            <span className={metadataBadge}>{citation.metadata.contentsubtype}</span>
          )}
          {sortedPages.length > 0 && (
            <>
              <span className="mx-1 text-text-tertiary">|</span>
              <span className="text-xs text-text-tertiary">{localize('com_sources_pages')}:</span>
              {sortedPages.map((page) => (
                <span key={page} className={pageBadge}>
                  {page}
                </span>
              ))}
              {citation.pages && citation.pages.length > 5 && (
                <span className="text-xs text-text-tertiary">
                  +{citation.pages.length - 5}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  if (hasUrl && externalUrl) {
    return (
      <ExternalLinkConfirm url={externalUrl} trigger={expandedContent} />
    );
  }

  return expandedContent;
}

export default CitationCard;
