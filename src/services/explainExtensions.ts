import StarterKit from '@tiptap/starter-kit';
import { Node as TiptapNode, mergeAttributes } from '@tiptap/react';

/** 手動の改ページ(印刷時にここで次のページへ) */
export const PageBreak = TiptapNode.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: () => ['div', { 'data-page-break': 'true' }],
});

/** 講師メモ(生徒配布用の印刷には出力しない) */
export const TeacherNote = TiptapNode.create({
  name: 'teacherNote',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-teacher-note]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-teacher-note': 'true' }),
    0,
  ],
});

/**
 * PDFの切り抜き画像(データURLで本文に埋め込む)。
 * 安全のため、外部のURLは受け付けず、data:image/ だけを画像として読む。
 * width / height は元の画像の大きさ(読み込み前でも、ページの割り付けが狂わないようにする)、
 * widthPct は本文の幅に対する表示の大きさ(%)。
 */
export const ExplainImage = TiptapNode.create({
  name: 'explainImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: 'PDFの切り抜き' },
      width: { default: null, parseHTML: (el: HTMLElement) => Number(el.getAttribute('width')) || null },
      height: { default: null, parseHTML: (el: HTMLElement) => Number(el.getAttribute('height')) || null },
      widthPct: { default: 100, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-w')) || 100 },
      // 配置: block = 単独の行(文章は下)/ left = 左に寄せて右に文章が回り込む / right = 右に寄せて左に回り込む
      align: {
        default: 'block',
        parseHTML: (el: HTMLElement) => {
          const a = el.getAttribute('data-align');
          return a === 'left' || a === 'right' ? a : 'block';
        },
      },
    };
  },
  parseHTML: () => [{ tag: 'img[src^="data:image/"]' }],
  renderHTML: ({ HTMLAttributes }) => {
    const { src, alt, width, height, widthPct, align } = HTMLAttributes as Record<string, unknown>;
    const pct = Number(widthPct) || 100;
    const natural = Number(width) || 0;
    const side = align === 'left' || align === 'right' ? align : 'block';
    // 回り込みは float で行う。画像と文章のあいだの余白もここで決める(印刷の測定と画面を一致させるため)
    const floatStyle =
      side === 'left' ? 'float:left;margin:0 1em 0.4em 0;' : side === 'right' ? 'float:right;margin:0 0 0.4em 1em;' : '';
    return [
      'img',
      {
        src: String(src ?? ''),
        alt: String(alt ?? ''),
        ...(natural ? { width: String(natural) } : {}),
        ...(Number(height) ? { height: String(Number(height)) } : {}),
        'data-w': String(pct),
        ...(side !== 'block' ? { 'data-align': side } : {}),
        // 原寸より大きくは引き伸ばさない
        style: `${floatStyle}width:${pct}%;${natural ? `max-width:${natural}px;` : ''}height:auto`,
      },
    ];
  },
});

/** エディター本体と、印刷用のHTML生成の両方で同じものを使う */
export const explainExtensions = [StarterKit, PageBreak, TeacherNote, ExplainImage];

/** 設問の解説・選択肢の理由の小さな入力欄用(画像は貼れるが、改ページ・講師メモは使わない) */
export const miniExtensions = [StarterKit, ExplainImage];
