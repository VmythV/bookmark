/**
 * Capture information about a page for saving. See docs/detailed-design.md §5.
 */
import type { PageInfo } from '../shared/types';

/** Capture from the current document (used inside a content script). */
export function capturePageInfo(): PageInfo {
  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content') ??
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content') ??
    undefined;

  const selectionText = window.getSelection?.()?.toString().trim() || undefined;

  return {
    url: location.href,
    title: document.title,
    selectionText,
    description: description?.trim() || undefined,
  };
}
