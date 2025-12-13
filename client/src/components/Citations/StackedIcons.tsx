/**
 * StackedIcons
 *
 * Displays overlapping favicon/paperclip icons for overflow indicators.
 * Shows up to maxIcons icons with negative margin for overlap effect.
 */

import { Paperclip } from 'lucide-react';
import { getCleanDomain, getFaviconUrl } from './utils';
import { faviconContainer, stackedIcon } from './styles';
import type { StackedIconsProps } from './types';
import { cn } from '~/utils';

export function StackedIcons({ citations, maxIcons = 3 }: StackedIconsProps) {
  const iconsToShow = citations.slice(0, maxIcons);

  return (
    <div className="flex items-center">
      {iconsToShow.map((citation, index) => {
        const isWebSource = citation.origin === 'web_search';
        const domain = getCleanDomain(citation.url || citation.link || '');

        return (
          <div key={citation.id || index} className={cn(stackedIcon, 'relative')}>
            {isWebSource && domain ? (
              <div className={faviconContainer}>
                <div className="absolute inset-0 rounded-full bg-white" />
                <img
                  src={getFaviconUrl(domain)}
                  alt={domain}
                  className="relative size-full"
                />
                <div className="absolute inset-0 rounded-full border border-border-light/10 dark:border-transparent" />
              </div>
            ) : (
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-tertiary">
                <Paperclip className="h-2.5 w-2.5 text-text-secondary" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default StackedIcons;
