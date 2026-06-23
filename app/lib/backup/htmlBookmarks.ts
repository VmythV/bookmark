/**
 * Netscape bookmark HTML (the standard browser import/export format)
 * serialize + parse. See docs/detailed-design.md §9.
 *
 * Runs in the background service worker, so it must not depend on DOM APIs
 * (DOMParser is unavailable there). Parsing is a tolerant line/tag scan rather
 * than full HTML parsing — sufficient for the well-known, flat structure browsers
 * emit (<DT><H3> for folders, <DT><A> for bookmarks, <DL> for nesting).
 */
import type { BookmarkNode } from '../shared/types';

const HEADER = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Serialize a bookmark forest (the children of the roots) to Netscape HTML. */
export function serialize(roots: BookmarkNode[]): string {
  const out: string[] = [HEADER, '<DL><p>'];
  const writeNodes = (nodes: BookmarkNode[], indent: string) => {
    for (const node of nodes) {
      if (node.url === undefined) {
        // folder
        out.push(`${indent}<DT><H3>${escapeHtml(node.title)}</H3>`);
        out.push(`${indent}<DL><p>`);
        if (node.children) writeNodes(node.children, indent + '    ');
        out.push(`${indent}</DL><p>`);
      } else {
        out.push(
          `${indent}<DT><A HREF="${escapeHtml(node.url)}">${escapeHtml(node.title)}</A>`,
        );
      }
    }
  };
  // Skip the synthetic root(s); export their children.
  const top = roots.flatMap((r) => r.children ?? [r]);
  writeNodes(top, '    ');
  out.push('</DL><p>');
  return out.join('\n');
}

/** A parsed bookmark node (no ids; structure only). */
export interface ParsedNode {
  title: string;
  url?: string;
  children?: ParsedNode[];
}

/**
 * Parse Netscape bookmark HTML into a tree. Tolerant scan: tracks <DL> nesting,
 * attaches <A> as bookmarks and <H3> as folders.
 */
export function parse(html: string): ParsedNode[] {
  const root: ParsedNode = { title: '', children: [] };
  const stack: ParsedNode[] = [root];
  let pendingFolder: ParsedNode | null = null;

  // Tokenize on the tags we care about.
  const tagRe = /<(\/?)(DL|H3|A)\b([^>]*)>([^<]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2]!.toUpperCase();
    const attrs = m[3] ?? '';
    const text = unescapeHtml((m[4] ?? '').trim());
    const parent = stack[stack.length - 1]!;

    if (tag === 'H3' && !closing) {
      // Opening a folder; its <DL> will follow and nest under it.
      pendingFolder = { title: text, children: [] };
      (parent.children ??= []).push(pendingFolder);
    } else if (tag === 'DL' && !closing) {
      // Enter the most recently declared folder, if any.
      stack.push(pendingFolder ?? parent);
      pendingFolder = null;
    } else if (tag === 'DL' && closing) {
      if (stack.length > 1) stack.pop();
    } else if (tag === 'A' && !closing) {
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
      if (href) (parent.children ??= []).push({ title: text, url: unescapeHtml(href) });
    }
  }
  return root.children ?? [];
}
