/**
 * CitationProvider
 *
 * Context provider for citation state management.
 * Manages hover state for highlight coordination between citations and text.
 */

import { createContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { CitationContextValue } from './types';

/**
 * Citation context for hover state coordination
 */
export const CitationContext = createContext<CitationContextValue | null>(null);

interface CitationProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps citation-enabled content
 */
export function CitationProvider({ children }: CitationProviderProps) {
  const [hoveredCitationId, setHoveredCitationIdState] = useState<string | null>(null);

  const setHoveredCitationId = useCallback((id: string | null) => {
    setHoveredCitationIdState(id);
  }, []);

  const contextValue = useMemo<CitationContextValue>(
    () => ({
      hoveredCitationId,
      setHoveredCitationId,
    }),
    [hoveredCitationId, setHoveredCitationId],
  );

  return (
    <CitationContext.Provider value={contextValue}>
      {children}
    </CitationContext.Provider>
  );
}

export default CitationProvider;
