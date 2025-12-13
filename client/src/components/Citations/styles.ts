/**
 * Citation Shared Styles
 *
 * Centralized Tailwind class constants for consistent citation styling.
 */

// ============================================================================
// Text Styles (URL-based behavior)
// ============================================================================

/** Clickable citation text (has URL) */
export const clickableTextStyle =
  'text-blue-600 dark:text-blue-400 cursor-pointer hover:underline';

/** Non-clickable citation text (no URL) */
export const neutralTextStyle = 'text-text-primary cursor-default';

// ============================================================================
// Inline Citation Pill Styles
// ============================================================================

/** Base styles for inline citation pills */
export const inlinePillBase =
  'ml-1 inline-flex h-5 max-w-36 items-center gap-1 rounded-xl border px-2 text-xs font-medium no-underline transition-colors';

/** Inline pill - clickable variant (has URL) */
export const inlinePillClickable = `${inlinePillBase} border-border-heavy bg-surface-secondary hover:bg-surface-hover dark:border-border-medium dark:hover:bg-surface-tertiary text-blue-600 dark:text-blue-400 cursor-pointer`;

/** Inline pill - neutral variant (no URL) */
export const inlinePillNeutral = `${inlinePillBase} border-border-heavy bg-surface-secondary dark:border-border-medium text-text-primary cursor-default`;

// ============================================================================
// Card Styles
// ============================================================================

/** Base styles for citation cards */
export const cardBase =
  'flex flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300';

/** Card - clickable variant (has URL) */
export const cardClickable = `${cardBase} hover:bg-surface-tertiary cursor-pointer`;

/** Card - neutral variant (no URL) */
export const cardNeutral = `${cardBase} cursor-default`;

/** Compact card for top-level display - fills grid cell */
export const cardCompact =
  'flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm';

/** Expanded card for dialog list */
export const cardExpanded =
  'flex w-full flex-col rounded-lg border border-border-light bg-surface-secondary p-3';

// ============================================================================
// Hovercard Styles
// ============================================================================

/** Hovercard container */
export const hovercardContainer =
  'z-[999] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg dark:shadow-lg-dark';

/** Hovercard navigation row */
export const hovercardNavRow =
  'mb-2 flex items-center justify-between border-b border-border-heavy pb-2';

/** Hovercard title link - clickable */
export const hovercardTitleClickable =
  'line-clamp-2 cursor-pointer overflow-hidden text-sm font-bold text-[#0066cc] hover:underline dark:text-blue-400 md:line-clamp-3';

/** Hovercard title - non-clickable */
export const hovercardTitleNeutral =
  'line-clamp-2 overflow-hidden text-sm font-bold text-text-primary md:line-clamp-3';

/** Hovercard snippet text */
export const hovercardSnippet =
  'my-2 text-ellipsis break-all text-xs text-text-secondary md:text-sm';

// ============================================================================
// Icon Styles
// ============================================================================

/** Favicon container */
export const faviconContainer = 'relative size-4 flex-shrink-0 overflow-hidden rounded-full';

/** Paperclip icon container */
export const paperclipContainer = 'flex h-4 w-4 items-center justify-center';

/** Stacked icon with overlap */
export const stackedIcon = '-ml-1.5 first:ml-0';

// ============================================================================
// Badge/Tag Styles
// ============================================================================

/** Metadata badge */
export const metadataBadge =
  'inline-flex items-center rounded-md bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary';

/** Page number badge */
export const pageBadge =
  'inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300';

// ============================================================================
// Button Styles
// ============================================================================

/** Navigation arrow button */
export const navButton =
  'flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base disabled:opacity-50';

/** Overflow "show more" button - fills grid cell */
export const overflowButton =
  'flex h-full w-full items-center justify-center gap-2 rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-secondary hover:bg-surface-tertiary transition-colors';

// ============================================================================
// Tab Styles
// ============================================================================

/** Tab container */
export const tabContainer = 'flex gap-1 border-b border-border-light mb-3';

/** Tab button - active */
export const tabActive =
  'px-3 py-2 text-sm font-medium text-text-primary border-b-2 border-blue-500 -mb-px';

/** Tab button - inactive */
export const tabInactive =
  'px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors';

// ============================================================================
// Highlighted Text Styles
// ============================================================================

/** Highlighted text - default state */
export const highlightedTextBase = 'rounded px-0 py-0.5 transition-colors';

/** Highlighted text - active/hovered state */
export const highlightedTextActive = `${highlightedTextBase} bg-amber-300/20`;
