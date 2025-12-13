/**
 * HighlightedText
 *
 * Renders text that can be highlighted when its associated citation is hovered.
 * Uses CitationContext to coordinate hover state.
 */

import { memo, useContext } from 'react';
import { CitationContext } from './CitationProvider';
import { highlightedTextBase, highlightedTextActive } from './styles';
import type { HighlightedTextProps } from './types';

/**
 * Hook to check if a citation ID is currently being hovered
 */
export function useHighlightState(citationId: string | undefined): boolean {
  const context = useContext(CitationContext);
  return !!(citationId && context?.hoveredCitationId === citationId);
}

export const HighlightedText = memo(function HighlightedText({
  children,
  citationId,
  'data-citation-id': dataCitationId,
  ...rest
}: HighlightedTextProps & Record<string, unknown>) {
  // Use data-citation-id if available (survives rehype-raw), fall back to citationId
  const effectiveCitationId = dataCitationId || citationId;
  const isHighlighted = useHighlightState(effectiveCitationId);

  return (
    <span className={isHighlighted ? highlightedTextActive : highlightedTextBase} {...rest}>
      {children}
    </span>
  );
});

export default HighlightedText;
