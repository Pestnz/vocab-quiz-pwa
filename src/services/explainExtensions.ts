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

/** エディター本体と、印刷用のHTML生成の両方で同じものを使う */
export const explainExtensions = [StarterKit, PageBreak, TeacherNote];
