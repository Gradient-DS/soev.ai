/**
 * CitationInline
 *
 * Single inline citation pill rendered in message text.
 * Replaces the Citation component in Markdown rendering.
 *
 * Behavior:
 * - URL present: Blue text, external link icon, clickable → ExternalLinkConfirm
 * - No URL: Neutral text, not clickable
 * - Hover: Always shows CitationHoverCard
 */

import { useContext } from 'react';
import { ExternalLink } from 'lucide-react';
import { useCitation } from '~/components/Web/Context';
import { useLocalize } from '~/hooks';
import { inlinePillClickable, inlinePillNeutral } from './styles';
import {
  getDisplayLabel,
  hasExternalUrl as checkHasUrl,
  getExternalUrl,
  parseCitationFromProps,
  normalizeSource,
} from './utils';
import { CitationHoverCard } from './CitationHoverCard';
import { ExternalLinkConfirm } from './ExternalLinkConfirm';
import { CitationContext } from './CitationProvider';
import type { CitationInlineProps, UnifiedCitation } from './types';

export function CitationInline(props: CitationInlineProps) {
  const localize = useLocalize();
  const citationContext = useContext(CitationContext);

  // Parse citation data from props
  const parsedCitation = parseCitationFromProps(props);
  const citationId = props['data-citation-id'] || props.node?.properties?.citationId;

  // Use existing useCitation hook for resolution
  const refData = useCitation({
    turn: parsedCitation?.turn || 0,
    refType: parsedCitation?.refType,
    index: parsedCitation?.index || 0,
    page: parsedCitation?.page,
  });

  if (!refData) {
    return null;
  }

  // Convert to unified format for components
  // refData comes from useCitation which returns Citation & Reference & { page?: number }
  const unifiedCitation: UnifiedCitation = normalizeSource(
    refData,
    parsedCitation?.turn || 0,
    parsedCitation?.refType || 'unknown',
    parsedCitation?.index || 0,
  );

  // Check for external URL
  const hasUrl = checkHasUrl(unifiedCitation);
  const externalUrl = getExternalUrl(unifiedCitation);

  // Get display label
  const label = getDisplayLabel(unifiedCitation, 30, parsedCitation?.page);

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
      <span className="truncate">{label}</span>
      {hasUrl && <ExternalLink className="h-3 w-3 flex-shrink-0" />}
    </span>
  );

  // For clickable citations (with URL): show ExternalLinkConfirm on click, no hovercard
  // For non-clickable citations: show hovercard on hover
  if (hasUrl && externalUrl) {
    return (
      <ExternalLinkConfirm url={externalUrl} trigger={pillContent} />
    );
  }

  // Non-clickable: wrap with hovercard for details
  return (
    <CitationHoverCard citation={unifiedCitation}>
      {pillContent}
    </CitationHoverCard>
  );
}

export default CitationInline;
