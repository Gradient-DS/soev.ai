/**
 * ExternalLinkConfirm
 *
 * Confirmation dialog before opening external URLs from citations.
 * Uses the same pattern as the existing ExternalLinkDialog in Web folder.
 */

import { useState } from 'react';
import { OGDialog, OGDialogContent, OGDialogTitle, OGDialogClose } from '@librechat/client';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useHovercardStore } from './CitationHoverCard';
import type { ExternalLinkConfirmProps } from './types';

export function ExternalLinkConfirm({ url, trigger, children }: ExternalLinkConfirmProps) {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const hovercardStore = useHovercardStore();

  const handleContinue = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Open dialog first, then close hovercard on next tick
    // This ensures the dialog portal is created before the hovercard unmounts
    setIsOpen(true);
    requestAnimationFrame(() => {
      hovercardStore?.hide();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Open dialog first, then close hovercard on next tick
      setIsOpen(true);
      requestAnimationFrame(() => {
        hovercardStore?.hide();
      });
    }
  };

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <div
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        className="contents"
      >
        {trigger}
      </div>
      <OGDialogContent className="max-w-md">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            </div>
            <OGDialogTitle className="text-lg font-semibold">
              {localize('com_external_link_warning_title')}
            </OGDialogTitle>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              {localize('com_external_link_warning_message')}
            </p>

            <div className="rounded-lg bg-surface-tertiary p-3">
              <div className="flex items-start gap-2">
                <ExternalLink className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-tertiary" />
                <p className="break-all text-xs text-text-secondary">{url}</p>
              </div>
            </div>

            {children}
          </div>

          <div className="flex justify-end gap-2">
            <OGDialogClose className="rounded-lg border border-border-medium px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-tertiary">
              {localize('com_ui_cancel')}
            </OGDialogClose>
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <ExternalLink className="h-4 w-4" />
              {localize('com_external_link_continue')}
            </button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default ExternalLinkConfirm;
