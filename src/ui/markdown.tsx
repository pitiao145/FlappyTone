import type { ReactNode } from "react";

/**
 * A minimal markdown-to-React renderer, scoped to exactly what
 * `docs/legal/*.md` uses: `#`/`##`/`###` headings, paragraphs, `**bold**`,
 * `*italic*`, `[text](url)`, unordered lists (`-`), and `---` rules.
 *
 * Returns React elements, never an HTML string — no `dangerouslySetInnerHTML`.
 * These documents are trusted today, but a renderer that injects HTML is a
 * standing hazard for no benefit here.
 *
 * Anything this doesn't understand (tables, ordered lists, code fences,
 * nested lists) is not special-cased: it degrades to a plain paragraph of
 * its own literal text rather than broken markup or a crash.
 */

/** Inline spans: bold, italic, links, plain text. Order matters — links
 * are matched first so `[**bold**](url)` doesn't get eaten by bold first. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // One alternation, left-to-right, so precedence follows match position,
  // not rule order: link | bold | italic.
  const re = /\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      const external = m[2].startsWith("http");
      // Whitelist safe schemes so a stray `javascript:`/`data:` URL renders as
      // inert text, not a clickable script — cheap insurance if this generic
      // renderer is ever pointed at anything but our own static legal copy.
      const href = /^(https?:|mailto:|\/|#)/i.test(m[2]) ? m[2] : undefined;
      nodes.push(
        <a key={key} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key}>{m[4]}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Parses a markdown document into React elements, one per block. */
export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const text = para.join(" ").trim();
    if (text) blocks.push(<p key={key++}>{renderInline(text, `p${key}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++} className="terms-bullets">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, `li${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push(<hr key={key++} />);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2].trim(), `h${key}`);
      if (level === 1) blocks.push(<h1 key={key++}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={key++}>{content}</h2>);
      else blocks.push(<h3 key={key++}>{content}</h3>);
      continue;
    }

    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      list.push(item[1]);
      continue;
    }

    // Anything else (a table row, an ordered-list line, a code fence marker)
    // isn't a construct this renderer supports — treat it as plain text so
    // it still reads, rather than emitting raw markup.
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return blocks;
}
