/**
 * CitationInlineMultiple
 *
 * Grouped inline citations displayed as "[Source +2]" with carousel in hovercard.
 * Replaces the CompositeCitation component in Markdown rendering.
 */

import { useState, useContext } from 'react';
import { ExternalLink } from 'lucide-react';
import { useCompositeCitations } from '~/components/Web/Context';
import { useLocalize } from '~/hooks';
import { inlinePillClickable, inlinePillNeutral } from './styles';
import {
  getDisplayLabel,
  hasExternalUrl as checkHasUrl,
  getExternalUrl,
  getCleanDomain,
  parseCitationsFromProps,
  normalizeSource,
} from './utils';
import { CitationHoverCard } from './CitationHoverCard';
import { ExternalLinkConfirm } from './ExternalLinkConfirm';
import { CitationContext } from './CitationProvider';
import type { CitationInlineMultipleProps, UnifiedCitation } from './types';

export function CitationInlineMultiple(props: CitationInlineMultipleProps) {
  const localize = useLocalize();
  const citationContext = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);

  // Parse citations from props
  const parsedCitations = parseCitationsFromProps(props);
  const citationId = props['data-citation-id'] || props.node?.properties?.citationId;

  // Use existing useCompositeCitations hook for resolution
  const sources = useCompositeCitations(parsedCitations || []);

  if (!sources || sources.length === 0) {
    return null;
  }

  // Convert to unified format
  // sources come from useCompositeCitations which returns Array<Citation & Reference>
  const unifiedCitations: UnifiedCitation[] = sources.map((source, idx) => {
    const parsed = parsedCitations?.[idx];
    return normalizeSource(
      source,
      parsed?.turn || 0,
      parsed?.refType || 'unknown',
      parsed?.index || idx,
    );
  });

  const totalPages = unifiedCitations.length;
  const currentCitation = unifiedCitations[currentPage];

  // Check if current citation has URL
  const hasUrl = checkHasUrl(currentCitation);
  const externalUrl = getExternalUrl(currentCitation);

  // Build label: "First Source +N"
  const getCitationLabel = () => {
    const firstCitation = unifiedCitations[0];
    const remainingCount = unifiedCitations.length - 1;
    const attribution =
      firstCitation.attribution ||
      firstCitation.title ||
      firstCitation.fileName ||
      getCleanDomain(firstCitation.url || firstCitation.link || '') ||
      localize('com_citation_source');

    // Truncate if too long
    const maxLen = 20;
    const truncated = attribution.length > maxLen
      ? attribution.substring(0, maxLen - 3) + '...'
      : attribution;

    return remainingCount > 0 ? `${truncated} +${remainingCount}` : truncated;
  };

  // Navigation handlers
  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Handle hover state
  const handleMouseEnter = () => {
    citationContext?.setHoveredCitationId(citationId || null);
  };

  const handleMouseLeave = () => {
    citationContext?.setHoveredCitationId(null);
  };

  // Pill content
  const pillContent = (
    <span
      className={hasUrl ? inlinePillClickable : inlinePillNeutral}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="truncate">{getCitationLabel()}</span>
      {hasUrl && <ExternalLink className="h-3 w-3 flex-shrink-0" />}
    </span>
  );

  // For clickable citations (with URL): show ExternalLinkConfirm on click, no hovercard
  // For non-clickable citations: show hovercard with carousel navigation
  if (hasUrl && externalUrl) {
    return (
      <ExternalLinkConfirm url={externalUrl} trigger={pillContent} />
    );
  }

  // Non-clickable: wrap with hovercard for details and navigation
  return (
    <CitationHoverCard
      citation={currentCitation}
      showNav={totalPages > 1}
      currentIndex={currentPage}
      totalCount={totalPages}
      onPrev={handlePrevPage}
      onNext={handleNextPage}
    >
      {pillContent}
    </CitationHoverCard>
  );
}

export default CitationInlineMultiple;
