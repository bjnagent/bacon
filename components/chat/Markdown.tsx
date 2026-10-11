"use client";

// Markdown-lite for model output, built as React nodes.
//
// Model text is untrusted: it is shaped by whatever web pages the search tool
// read. So it is never handed to the DOM as HTML — every element below is
// created by React from plain strings, links are limited to http(s), and
// anything the parser doesn't recognise falls through as literal text.
//
// Supported, because it's what the chat prompt actually produces: paragraphs
// and line breaks, **bold**, *italic*, `code`, fenced code, -/*/•/numbered
// lists (nested by indent), # headings (rendered as bold lead-ins), > quotes,
// --- rules, pipe tables and links. Deliberately not supported: images, raw
// HTML, footnotes.
//
// Streaming: text arrives a few words per frame, so an emphasis or code span
// is often open when a frame renders. With `streaming` set, an unclosed marker
// styles the rest of the text instead of flashing a literal "**" until its
// closing pair arrives.

import { memo, type ReactNode } from "react";
import { isNative, openExternal } from "@/lib/native";
import s from "./Markdown.module.css";

// ---------------------------------------------------------------------------
// Blocks

type Block =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "quote"; text: string }
  | { t: "hr" }
  | { t: "code"; text: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | ListBlock;
interface ListBlock { t: "list"; ordered: boolean; start: number; items: ListItem[] }
interface ListItem { text: string; children: ListBlock[] }
interface RawItem { indent: number; ordered: boolean; num: number; text: string }

const UL = /^(\s*)([-*+•])\s+(.*)$/;
const OL = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const HEAD = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TROW = /^\s*\|.*\|\s*$/;
const TSEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function item(line: string): RawItem | null {
  if (HR.test(line)) return null;
  const u = UL.exec(line);
  if (u) return { indent: u[1].length, ordered: false, num: 1, text: u[3] };
  const o = OL.exec(line);
  if (o) return { indent: o[1].length, ordered: true, num: parseInt(o[2], 10), text: o[3] };
  return null;
}

const startsBlock = (l: string) => HEAD.test(l) || FENCE.test(l) || HR.test(l) || QUOTE.test(l);

const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** Items at `indent` become siblings; deeper ones nest under the item before them. */
function buildLists(items: RawItem[], from: number, indent: number): [ListBlock[], number] {
  const lists: ListBlock[] = [];
  let cur: ListBlock | null = null;
  let k = from;
  while (k < items.length) {
    const it = items[k];
    if (it.indent < indent) break;
    if (cur && it.indent >= indent + 2) {
      const [kids, next] = buildLists(items, k, it.indent);
      cur.items[cur.items.length - 1].children.push(...kids);
      k = next;
      continue;
    }
    if (!cur || cur.ordered !== it.ordered) {
      cur = { t: "list", ordered: it.ordered, start: it.num, items: [] };
      lists.push(cur);
    }
    cur.items.push({ text: it.text, children: [] });
    k++;
  }
  return [lists, k];
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join("\n") });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { flush(); i++; continue; }

    if (FENCE.test(line)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or past the end while it's still streaming)
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }
    const h = HEAD.exec(line);
    if (h) { flush(); blocks.push({ t: "h", text: h[2] }); i++; continue; }
    if (HR.test(line)) { flush(); blocks.push({ t: "hr" }); i++; continue; }

    if (TROW.test(line) && i + 1 < lines.length && TSEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TROW.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ t: "table", head, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const body: string[] = [];
      let q: RegExpExecArray | null;
      while (i < lines.length && (q = QUOTE.exec(lines[i]))) { body.push(q[1]); i++; }
      blocks.push({ t: "quote", text: body.join("\n") });
      continue;
    }

    const first = item(line);
    if (first) {
      flush();
      const raw: RawItem[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line ends the list unless another item follows it.
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          const next = j < lines.length ? item(lines[j]) : null;
          if (next && next.indent >= first.indent) { i = j; continue; }
          break;
        }
        const it = item(l);
        if (it && it.indent >= first.indent) { raw.push(it); i++; continue; }
        if (it || startsBlock(l)) break;
        // A plain line under an item continues that item.
        raw[raw.length - 1].text += "\n" + l.trim();
        i++;
      }
      blocks.push(...buildLists(raw, 0, first.indent)[0]);
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Inline

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
const SAFE_URL = /^https?:\/\/[^\s<>"]+$/i;

/** Index of the closing marker for an opener ending at `from`, or -1. */
function findClose(src: string, from: number, marker: string): number {
  const ch = marker[0];
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "`") {
      // Markers inside a code span don't count.
      const end = src.indexOf("`", j + 1);
      if (end === -1) return -1;
      j = end;
      continue;
    }
    if (src[j] !== ch) continue;
    if (marker.length === 1 && src[j + 1] === ch) { j++; continue; } // part of a "**" pair
    if (marker.length === 2 && src[j + 1] !== ch) continue;
    if (j === from || isSpace(src[j - 1])) continue;
    if (ch === "_" && isWord(src[j + marker.length])) continue; // snake_case stays literal
    // "***x***" closes as bold around "*x*", not as bold around "*x" + a stray "*".
    if (marker.length === 2 && src[j + 2] === ch) return j + 1;
    return j;
  }
  return -1;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // In the iOS app, open in the in-app browser so the user keeps their place.
        if (isNative()) { e.preventDefault(); openExternal(href); }
      }}
    >
      {children}
    </a>
  );
}

export function renderInline(src: string, streaming = false, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let n = 0;
  const k = () => `${key}.${n++}`;
  const text = () => {
    if (!buf) return;
    const parts = buf.split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) out.push(<br key={k()} />);
      if (p) out.push(p);
    });
    buf = "";
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === "\\" && i + 1 < src.length && /[\\`*_[\]()#>|~-]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        text();
        out.push(<code key={k()}>{src.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
      if (end === -1 && streaming && i + 1 < src.length) {
        text();
        out.push(<code key={k()}>{src.slice(i + 1)}</code>);
        break;
      }
      buf += c;
      i++;
      continue;
    }

    if (c === "*" || c === "_") {
      const marker = src[i + 1] === c ? c + c : c;
      const after = src[i + marker.length];
      const canOpen = !isSpace(after) && !(c === "_" && isWord(src[i - 1]));
      if (canOpen) {
        const close = findClose(src, i + marker.length, marker);
        const Tag = marker.length === 2 ? "strong" : "em";
        if (close !== -1) {
          text();
          const id = k();
          out.push(<Tag key={id}>{renderInline(src.slice(i + marker.length, close), streaming, id)}</Tag>);
          i = close + marker.length;
          continue;
        }
        if (streaming) {
          text();
          const id = k();
          out.push(<Tag key={id}>{renderInline(src.slice(i + marker.length), streaming, id)}</Tag>);
          break;
        }
      }
      buf += marker;
      i += marker.length;
      continue;
    }

    if (c === "[") {
      const m = /^\[([^\]\n]+)\]\((\S+?)\)/.exec(src.slice(i));
      if (m && SAFE_URL.test(m[2])) {
        text();
        const id = k();
        out.push(<Link key={id} href={m[2]}>{renderInline(m[1], streaming, id)}</Link>);
        i += m[0].length;
        continue;
      }
    }

    if ((c === "h" || c === "H") && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      const m = /^https?:\/\/[^\s<>"]+/i.exec(src.slice(i));
      if (m) {
        let url = m[0];
        // Sentence punctuation after a bare URL isn't part of it.
        while (/[.,;:!?'")\]]$/.test(url) && !(url.endsWith(")") && url.includes("("))) url = url.slice(0, -1);
        if (url.length > 10) {
          text();
          out.push(<Link key={k()} href={url}>{url.replace(/^https?:\/\/(www\.)?/i, "")}</Link>);
          i += url.length;
          continue;
        }
      }
    }

    buf += c;
    i++;
  }
  text();
  return out;
}

// ---------------------------------------------------------------------------
// Render

function List({ list, streaming, id }: { list: ListBlock; streaming: boolean; id: string }) {
  const kids = list.items.map((it, j) => (
    <li key={j}>
      {renderInline(it.text, streaming, `${id}.${j}`)}
      {it.children.map((c, ci) => <List key={ci} list={c} streaming={streaming} id={`${id}.${j}.${ci}`} />)}
    </li>
  ));
  return list.ordered
    ? <ol start={list.start !== 1 ? list.start : undefined}>{kids}</ol>
    : <ul>{kids}</ul>;
}

export function renderMarkdown(src: string, streaming = false): ReactNode[] {
  return parseBlocks(src).map((b, i) => {
    const id = `b${i}`;
    switch (b.t) {
      case "p": return <p key={id}>{renderInline(b.text, streaming, id)}</p>;
      case "h": return <p key={id} className={s.heading}>{renderInline(b.text, streaming, id)}</p>;
      case "quote": return <blockquote key={id}>{renderInline(b.text, streaming, id)}</blockquote>;
      case "hr": return <hr key={id} />;
      case "code": return <pre key={id}><code>{b.text}</code></pre>;
      case "list": return <List key={id} list={b} streaming={streaming} id={id} />;
      case "table":
        return (
          <div key={id} className={s.table} role="region" aria-label="Table" tabIndex={0}>
            <table>
              <thead><tr>{b.head.map((c, j) => <th key={j} scope="col">{renderInline(c, streaming, `${id}.h${j}`)}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>{b.head.map((_, j) => <td key={j}>{renderInline(r[j] ?? "", streaming, `${id}.${ri}.${j}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

/** Model prose. Memoised: only the message that is streaming re-parses per frame. */
export const Markdown = memo(function Markdown({ text, streaming = false, className }: { text: string; streaming?: boolean; className?: string }) {
  return <div className={className ? `${s.md} ${className}` : s.md}>{renderMarkdown(text, streaming)}</div>;
});

export default Markdown;
