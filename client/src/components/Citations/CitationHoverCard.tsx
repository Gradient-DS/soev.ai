/**
 * CitationHoverCard
 *
 * Shared hover content wrapper using Ariakit.
 * Shows citation details on hover with optional carousel navigation.
 */

import { ReactNode, createContext, useContext } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown, Paperclip } from 'lucide-react';
import { VisuallyHidden } from '@ariakit/react';

// Context to allow children to close the hovercard
export const HovercardStoreContext = createContext<Ariakit.HovercardStore | null>(null);

export function useHovercardStore() {
  return useContext(HovercardStoreContext);
}
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import {
  hovercardContainer,
  hovercardNavRow,
  hovercardTitleClickable,
  hovercardTitleNeutral,
  hovercardSnippet,
  faviconContainer,
  navButton,
  metadataBadge,
  pageBadge,
} from './styles';
import { getCleanDomain, getFaviconUrl, hasExternalUrl, getExternalUrl, sortPagesByRelevance } from './utils';
import { ExternalLinkConfirm } from './ExternalLinkConfirm';
import type { CitationHoverCardProps, UnifiedCitation } from './types';

interface FaviconImageProps {
  domain: string;
  className?: string;
}

function FaviconImage({ domain, className = '' }: FaviconImageProps) {
  return (
    <div className={`${faviconContainer} ${className}`}>
      <div className="absolute inset-0 rounded-full bg-white" />
      <img src={getFaviconUrl(domain)} alt={domain} className="relative size-full" />
      <div className="absolute inset-0 rounded-full border border-border-light/10 dark:border-transparent" />
    </div>
  );
}

interface HoverCardContentProps {
  citation: UnifiedCitation;
  showNav?: boolean;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

function HoverCardContent({
  citation,
  showNav,
  currentIndex = 0,
  totalCount = 1,
  onPrev,
  onNext,
}: HoverCardContentProps) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const showExternalLinkConfirm = startupConfig?.interface?.externalLinkConfirm !== false;
  const isWebSource = citation.origin === 'web_search';
  const domain = getCleanDomain(citation.url || citation.link || '');
  const externalUrl = getExternalUrl(citation);
  const hasUrl = hasExternalUrl(citation);

  // Get sorted pages
  const sortedPages = citation.pages
    ? sortPagesByRelevance(citation.pages, citation.pageRelevance).slice(0, 5)
    : [];

  // Title/attribution to display
  const displayTitle = citation.attribution || citation.title || citation.fileName || domain || localize('com_citation_source');

  return (
    <>
      {/* Navigation row for carousel */}
      {showNav && totalCount > 1 && (
        <div className={hovercardNavRow}>
          <span className="flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPrev?.();
              }}
              disabled={currentIndex === 0}
              className={navButton}
              style={{ opacity: currentIndex === 0 ? 0.5 : 1 }}
            >
              ←
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNext?.();
              }}
              disabled={currentIndex === totalCount - 1}
              className={navButton}
              style={{ opacity: currentIndex === totalCount - 1 ? 0.5 : 1 }}
            >
              →
            </button>
          </span>
          <span className="text-xs text-text-tertiary">
            {currentIndex + 1}/{totalCount}
          </span>
        </div>
      )}

      {/* Icon and title row */}
      <span className="mb-2 flex items-center">
        {isWebSource ? (
          <FaviconImage domain={domain} className="mr-2" />
        ) : (
          <div className="mr-2 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface-tertiary dark:bg-gray-600">
            <Paperclip className="h-2.5 w-2.5 text-text-secondary" />
          </div>
        )}

        {hasUrl && externalUrl ? (
          showExternalLinkConfirm ? (
            <ExternalLinkConfirm
              url={externalUrl}
              trigger={
                <span className={hovercardTitleClickable}>
                  {displayTitle}
                </span>
              }
            />
          ) : (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="contents">
              <span className={hovercardTitleClickable}>
                {displayTitle}
              </span>
            </a>
          )
        ) : (
          <span className={hovercardTitleNeutral}>
            {displayTitle}
          </span>
        )}
      </span>

      {/* Title (different from attribution) */}
      {citation.title && citation.title !== displayTitle && (
        <h4 className="mb-1.5 mt-0 text-xs text-text-primary md:text-sm">
          {citation.title}
        </h4>
      )}

      {/* Snippet */}
      {citation.snippet && (
        <p className={hovercardSnippet}>
          {citation.snippet}
        </p>
      )}

      {/* Metadata badges */}
      {(citation.metadata?.year || citation.metadata?.contentsubtype) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {citation.metadata?.year && (
            <span className={metadataBadge}>{citation.metadata.year}</span>
          )}
          {citation.metadata?.contentsubtype && (
            <span className={metadataBadge}>{citation.metadata.contentsubtype}</span>
          )}
        </div>
      )}

      {/* Page numbers */}
      {sortedPages.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
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
        </div>
      )}
    </>
  );
}

export function CitationHoverCard({
  citation,
  children,
  showNav,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}: CitationHoverCardProps) {
  const localize = useLocalize();
  const hovercardStore = Ariakit.useHovercardStore({ showTimeout: 150, hideTimeout: 150 });

  return (
    <span className="relative ml-0.5 inline-block">
      <HovercardStoreContext.Provider value={hovercardStore}>
        <span className="flex items-center">
          <Ariakit.HovercardAnchor store={hovercardStore} render={<span />}>
            {children}
          </Ariakit.HovercardAnchor>
          <Ariakit.HovercardDisclosure store={hovercardStore} className="ml-0.5 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>
              {localize('com_citation_more_details', { label: citation.title || 'citation' })}
            </VisuallyHidden>
            <ChevronDown className="icon-sm" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            store={hovercardStore}
            gutter={16}
            className={hovercardContainer}
            portal={true}
            unmountOnHide={true}
          >
            {/* Re-provide context inside portal since portal renders outside React tree */}
            <HovercardStoreContext.Provider value={hovercardStore}>
              <HoverCardContent
                citation={citation}
                showNav={showNav}
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={onPrev}
                onNext={onNext}
              />
            </HovercardStoreContext.Provider>
          </Ariakit.Hovercard>
        </span>
      </HovercardStoreContext.Provider>
    </span>
  );
}

export { FaviconImage, HoverCardContent };
export default CitationHoverCard;
