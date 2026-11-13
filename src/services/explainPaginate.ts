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
  float?: boolean; // 文章を回り込ませる画像(左寄せ・右寄せ)
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
    const align = el.getAttribute('data-align');
    items.push({
      html: el.outerHTML,
      keepWithNext: /^H[1-6]$/.test(el.tagName),
      float: el.tagName === 'IMG' && (align === 'left' || align === 'right'),
    });
  }
  return items;
}

/** ブロックを実際に配置して、それぞれの高さ(下の余白を含む)を測る。画像は読み込みが終わってから測る */
async function measureBlocks(blocks: Block[], layout: PrintLayout): Promise<number[]> {
  const contentW = (210 - layout.marginLeft - layout.marginRight) * MM_TO_PX;
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
  // 先に測ると、画像の高さが0になって、ページの割り付けがずれる
  await Promise.all(Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
  const heights = Array.from(host.children).map((el) => {
    const mb = parseFloat(getComputedStyle(el).marginBottom || '0') || 0;
    return (el as HTMLElement).offsetHeight + mb;
  });
  host.remove();
  return heights;
}

/**
 * 回り込み画像(左寄せ・右寄せ)を、その横に回り込む文章と1つのまとまりにする。
 * まとまりは途中で切らないので、ページの境目で、画像と文章が離れない。
 * 画像の高さ分の文章を、後ろのブロックから集める(手動の改ページでは止める)。
 */
function groupFloats(items: Item[], heights: number[]): Item[] {
  const out: Item[] = [];
  let bi = 0; // ブロックだけを数えた位置(heights の添字)
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it === 'break') {
      out.push(it);
      i++;
      continue;
    }
    if (!it.float) {
      out.push(it);
      i++;
      bi++;
      continue;
    }
    const imgH = heights[bi] ?? 0;
    const parts = [it.html];
    let acc = 0;
    let j = i + 1;
    let bj = bi + 1;
    while (j < items.length && acc < imgH) {
      const nx = items[j];
      if (nx === 'break') break;
      parts.push(nx.html);
      acc += heights[bj] ?? 0;
      j++;
      bj++;
    }
    out.push({ html: `<div class="ex-float-group">${parts.join('')}</div>`, keepWithNext: false });
    i = j;
    bi = bj;
  }
  return out;
}

/**
 * ブロックを実際に配置して高さを測り、A4の1ページに収まるように割り振る。
 * - 設問・表・囲みなどのブロックは途中で切らない
 * - 見出しは次のブロックと同じページに置く
 * - 手動の改ページで必ず次のページへ
 */
export async function paginate(html: string, layout: PrintLayout, mode: PrintMode): Promise<PaginateResult> {
  if (document.fonts?.ready) await document.fonts.ready;

  let items = toItems(html, mode);
  const onlyBlocks = (list: Item[]) => list.filter((i): i is Block => i !== 'break');

  const limit = (297 - layout.marginTop - layout.marginBottom) * MM_TO_PX;

  let heights = await measureBlocks(onlyBlocks(items), layout);
  if (items.some((i) => i !== 'break' && i.float)) {
    // 回り込み画像は、横の文章と1つのまとまりにして、測り直す
    items = groupFloats(items, heights);
    heights = await measureBlocks(onlyBlocks(items), layout);
  }

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
