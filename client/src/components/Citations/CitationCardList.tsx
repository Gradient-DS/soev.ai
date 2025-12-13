/**
 * CitationCardList
 *
 * Tabbed interface showing all citations grouped by origin.
 * Replaces the Sources component for the new citation system.
 */

import { useMemo, useState } from 'react';
import { Globe, Cloud, File, Newspaper, Image as ImageIcon } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  AnimatedTabs,
} from '@librechat/client';
import type { SearchResultData, ImageResult } from 'librechat-data-provider';
import { useSearchContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { searchResultsToCitations, groupByOrigin, getCleanDomain, getFaviconUrl } from './utils';
import { CitationCard } from './CitationCard';
import { StackedIcons } from './StackedIcons';
import { overflowButton } from './styles';
import type { CitationCardListProps, UnifiedCitation, CitationOrigin } from './types';

interface TabWithIconProps {
  label: string;
  icon: React.ReactNode;
}

function TabWithIcon({ label, icon }: TabWithIconProps) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-4 w-4">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

interface CitationGroupProps {
  citations: UnifiedCitation[];
  limit?: number;
  messageId: string;
}

function CitationGroup({ citations, limit = 3, messageId }: CitationGroupProps) {
  const localize = useLocalize();
  const visibleCitations = citations.slice(0, limit);
  const remainingCount = citations.length - limit;
  const hasOverflow = remainingCount > 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {visibleCitations.map((citation) => (
        <CitationCard
          key={citation.id}
          citation={citation}
          variant="compact"
        />
      ))}

      {hasOverflow && (
        <OGDialog>
          <OGDialogTrigger asChild>
            <button className={overflowButton}>
              <StackedIcons citations={citations.slice(limit, limit + 3)} maxIcons={3} />
              <span>{localize('com_sources_more_sources', { count: remainingCount })}</span>
            </button>
          </OGDialogTrigger>
          <OGDialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
            <OGDialogTitle className="border-b border-border-light pb-3 text-lg font-semibold">
              {localize('com_sources_title')}
            </OGDialogTitle>
            <div className="mt-4 flex flex-col gap-3">
              {citations.map((citation) => (
                <CitationCard
                  key={citation.id}
                  citation={citation}
                  variant="expanded"
                />
              ))}
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
    </div>
  );
}

interface ImageItemProps {
  image: ImageResult;
}

function ImageItem({ image }: ImageItemProps) {
  const localize = useLocalize();
  return (
    <a
      href={image.imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group overflow-hidden rounded-lg bg-surface-secondary transition-all duration-300 hover:bg-surface-tertiary"
    >
      {image.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden">
          <img
            src={image.imageUrl}
            alt={image.title || localize('com_sources_image_alt')}
            className="size-full object-cover"
          />
          {image.title && (
            <div className="absolute bottom-0 left-0 right-0 w-full border-none bg-gray-900/80 p-1 text-xs font-medium text-white backdrop-blur-sm">
              <span className="truncate">{image.title}</span>
            </div>
          )}
        </div>
      )}
    </a>
  );
}

export function CitationCardList({ searchResults: propSearchResults, messageId }: CitationCardListProps) {
  const localize = useLocalize();
  const { searchResults: contextSearchResults } = useSearchContext();

  // Use prop searchResults if provided, otherwise fall back to context
  const searchResults = propSearchResults || contextSearchResults;

  // Convert search results to unified citations
  const { citations, images } = useMemo(() => {
    if (!searchResults) {
      return { citations: [], images: [] };
    }

    const unifiedCitations = searchResultsToCitations(searchResults);

    // Extract images separately
    const imageResults: ImageResult[] = [];
    for (const result of Object.values(searchResults)) {
      if (result?.images) {
        imageResults.push(...result.images);
      }
    }

    return {
      citations: unifiedCitations,
      images: imageResults,
    };
  }, [searchResults]);

  // Group citations by origin
  const groupedCitations = useMemo(() => groupByOrigin(citations), [citations]);

  // Build tabs based on available data
  const tabs = useMemo(() => {
    const availableTabs: Array<{ label: React.ReactNode; content: React.ReactNode }> = [];

    // Web tab
    if (groupedCitations.web_search.length > 0) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_web')} icon={<Globe className="h-4 w-4" />} />,
        content: (
          <CitationGroup
            citations={groupedCitations.web_search}
            limit={3}
            messageId={messageId}
          />
        ),
      });
    }

    // SharePoint tab
    if (groupedCitations.sharepoint.length > 0) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_sharepoint')} icon={<Cloud className="h-4 w-4" />} />,
        content: (
          <CitationGroup
            citations={groupedCitations.sharepoint}
            limit={3}
            messageId={messageId}
          />
        ),
      });
    }

    // Files tab (file_search + mcp)
    const filesCitations = [...groupedCitations.file_search, ...groupedCitations.mcp];
    if (filesCitations.length > 0) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_files')} icon={<File className="h-4 w-4" />} />,
        content: (
          <CitationGroup
            citations={filesCitations}
            limit={3}
            messageId={messageId}
          />
        ),
      });
    }

    // Images tab
    if (images.length > 0) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_images')} icon={<ImageIcon className="h-4 w-4" />} />,
        content: (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((image, i) => (
              <ImageItem key={`image-${i}`} image={image} />
            ))}
          </div>
        ),
      });
    }

    return availableTabs;
  }, [groupedCitations, images, messageId, localize]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div role="region" aria-label={localize('com_sources_region_label')}>
      <AnimatedTabs
        tabs={tabs}
        containerClassName="flex min-w-full mb-4"
        tabListClassName="flex items-center mb-2 border-b border-border-light overflow-x-auto"
        tabPanelClassName="w-full overflow-x-auto scrollbar-none md:mx-0 md:px-0"
        tabClassName="flex items-center whitespace-nowrap text-xs font-medium text-token-text-secondary px-1 pt-2 pb-1 border-b-2 border-transparent data-[state=active]:text-text-primary outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      />
    </div>
  );
}

export default CitationCardList;
