import { describe, it, expect } from 'vitest';
import { serialize, parse } from './htmlBookmarks';
import type { BookmarkNode } from '../shared/types';

/** Build a fake chrome.bookmarks tree (one synthetic root with children). */
function tree(children: BookmarkNode[]): BookmarkNode[] {
  return [{ id: '0', title: '', children }];
}

describe('htmlBookmarks.serialize', () => {
  it('serializes folders and bookmarks with nesting', () => {
    const html = serialize(
      tree([
        {
          id: '1',
          title: 'Dev',
          children: [
            { id: '2', title: 'Rust book', url: 'https://doc.rust-lang.org/' },
            {
              id: '3',
              title: 'Tools',
              children: [{ id: '4', title: 'GitHub', url: 'https://github.com/' }],
            },
          ],
        },
      ]),
    );
    expect(html).toContain('<H3>Dev</H3>');
    expect(html).toContain('<A HREF="https://doc.rust-lang.org/">Rust book</A>');
    expect(html).toContain('<H3>Tools</H3>');
    expect(html).toContain('<A HREF="https://github.com/">GitHub</A>');
  });

  it('escapes HTML-sensitive characters', () => {
    const html = serialize(
      tree([{ id: '1', title: 'A & B <C>', url: 'https://x.test/?a=1&b=2' }]),
    );
    expect(html).toContain('A &amp; B &lt;C&gt;');
    expect(html).toContain('a=1&amp;b=2');
    expect(html).not.toContain('A & B <C>');
  });
});

describe('htmlBookmarks.parse', () => {
  it('parses a simple exported file', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Dev</H3>
  <DL><p>
    <DT><A HREF="https://doc.rust-lang.org/">Rust book</A>
    <DT><H3>Tools</H3>
    <DL><p>
      <DT><A HREF="https://github.com/">GitHub</A>
    </DL><p>
  </DL><p>
</DL><p>`;
    const parsed = parse(html);
    expect(parsed).toHaveLength(1);
    const dev = parsed[0]!;
    expect(dev.title).toBe('Dev');
    expect(dev.children).toBeDefined();
    // Dev contains "Rust book" bookmark and "Tools" folder.
    const titles = dev.children!.map((c) => c.title);
    expect(titles).toContain('Rust book');
    expect(titles).toContain('Tools');
    const tools = dev.children!.find((c) => c.title === 'Tools')!;
    expect(tools.children![0]!.url).toBe('https://github.com/');
  });

  it('unescapes entities in titles and hrefs', () => {
    const html = `<DL><p><DT><A HREF="https://x.test/?a=1&amp;b=2">A &amp; B</A></DL><p>`;
    const [node] = parse(html);
    expect(node!.title).toBe('A & B');
    expect(node!.url).toBe('https://x.test/?a=1&b=2');
  });

  it('round-trips serialize → parse preserving structure', () => {
    const original = tree([
      {
        id: '1',
        title: 'Reading',
        children: [
          { id: '2', title: 'Article 1', url: 'https://a.test/1' },
          { id: '3', title: 'Article 2', url: 'https://a.test/2' },
        ],
      },
      { id: '4', title: 'Loose', url: 'https://loose.test/' },
    ]);
    const parsed = parse(serialize(original));

    const reading = parsed.find((n) => n.title === 'Reading')!;
    expect(reading.children!.map((c) => c.url)).toEqual([
      'https://a.test/1',
      'https://a.test/2',
    ]);
    expect(parsed.find((n) => n.title === 'Loose')!.url).toBe('https://loose.test/');
  });

  it('returns empty array for empty/garbage input', () => {
    expect(parse('')).toEqual([]);
    expect(parse('<html><body>nothing here</body></html>')).toEqual([]);
  });
});
