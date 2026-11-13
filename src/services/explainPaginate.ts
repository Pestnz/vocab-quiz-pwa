import { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import type { PrintLayout } from '../types/explain';
import { MM_TO_PX } from './explainLayout';
import { explainExtensions } from './explainExtensions';

export type PrintMode = 'teacher' | 'student';

export interface PaginateResult {
  pages: string[][]; // ページごとのブロックHTML
  overflowCount: number; // 1ページに収まらない大きなブロックの数
}

interface Block {
  html: string;
  keepWithNext: boolean;
}
type Item = Block | 'break';

/**
 * エディターの内容(JSON)をHTMLにする。
 * 画面を持たないエディターを通すので、スキーマにないタグは取り除かれる。
 */
export function docToHtml(content: JSONContent | null): string {
  const editor = new Editor({ extensions: explainExtensions, content: content ?? '' });
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

const htmlCache = new WeakMap<object, string>();

/** 同じ内容(同じオブジェクト)は、HTMLを作り直さない。入力欄の表示用 */
export function cachedHtml(content: JSONContent | null): string {
  if (!content) return '';
  const hit = htmlCache.get(content);
  if (hit !== undefined) return hit;
  const html = docToHtml(content);
  htmlCache.set(content, html);
  return html;
}

function toItems(html: string, mode: PrintMode): Item[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  if (mode === 'student') {
    tpl.content.querySelectorAll('[data-teacher-note]').forEach((n) => n.remove());
  }

  const items: Item[] = [];
  for (const el of Array.from(tpl.content.children)) {
    if (el.matches('div[data-page-break]')) {
      items.push('break');
      continue;
    }
    // 箇条書き・番号付きは1項目ずつに分け、ページをまたげるようにする(番号は start で保つ)
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      const tag = el.tagName.toLowerCase();
      const start = el.tagName === 'OL' ? Number(el.getAttribute('start') ?? 1) || 1 : 1;
      const lis = Array.from(el.children);
      lis.forEach((li, i) => {
        const wrap = document.createElement(tag);
        if (tag === 'ol') wrap.setAttribute('start', String(start + i));
        if (i < lis.length - 1) wrap.className = 'ex-li-mid'; // 項目間の余白をつめる
        wrap.appendChild(li.cloneNode(true));
        items.push({ html: wrap.outerHTML, keepWithNext: false });
      });
      continue;
    }
    items.push({ html: el.outerHTML, keepWithNext: /^H[1-6]$/.test(el.tagName) });
  }
  return items;
}

/**
 * ブロックを実際に配置して高さを測り、A4の1ページに収まるように割り振る。
 * - 設問・表・囲みなどのブロックは途中で切らない
 * - 見出しは次のブロックと同じページに置く
 * - 手動の改ページで必ず次のページへ
 */
export async function paginate(html: string, layout: PrintLayout, mode: PrintMode): Promise<PaginateResult> {
  if (document.fonts?.ready) await document.fonts.ready;

  const items = toItems(html, mode);
  const blocks = items.filter((i): i is Block => i !== 'break');

  const contentW = (210 - layout.marginLeft - layout.marginRight) * MM_TO_PX;
  const limit = (297 - layout.marginTop - layout.marginBottom) * MM_TO_PX;

  const host = document.createElement('div');
  host.className = 'explain-page-body';
  Object.assign(host.style, {
    position: 'absolute',
    left: '-10000px',
    top: '0',
    visibility: 'hidden',
    width: `${contentW}px`,
    fontSize: `${layout.fontSizePt}pt`,
    lineHeight: String(layout.lineHeight),
  });
  host.innerHTML = blocks.map((b) => b.html).join('');
  document.body.appendChild(host);
  const heights = Array.from(host.children).map((el) => {
    const mb = parseFloat(getComputedStyle(el).marginBottom || '0') || 0;
    return (el as HTMLElement).offsetHeight + mb;
  });
  host.remove();

  const pages: string[][] = [[]];
  let used = 0;
  let overflowCount = 0;
  let bi = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it === 'break') {
      if (pages[pages.length - 1].length > 0) {
        pages.push([]);
        used = 0;
      }
      continue;
    }
    const h = heights[bi++] ?? 0;
    let need = h;
    if (it.keepWithNext) {
      const next = items[i + 1];
      if (next && next !== 'break') need += heights[bi] ?? 0;
    }
    if (used + need > limit && pages[pages.length - 1].length > 0) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(it.html);
    used += h;
    if (h > limit) overflowCount++;
  }

  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return { pages, overflowCount };
}
