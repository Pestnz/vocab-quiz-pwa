import React from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Underline, List, ListOrdered, Quote, Heading2, Heading3, Undo2, Redo2, Minus } from 'lucide-react';
import './explain.css';

interface DocEditorProps {
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
}

export const DocEditor: React.FC<DocEditorProps> = ({ initialContent, onChange }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent ?? '',
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON()),
    editorProps: {
      attributes: { spellcheck: 'false' },
    },
  });

  // ツールバーのボタンの「押されている状態」を再描画に反映する
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed?.isActive('bold') ?? false,
      italic: ed?.isActive('italic') ?? false,
      underline: ed?.isActive('underline') ?? false,
      h2: ed?.isActive('heading', { level: 2 }) ?? false,
      h3: ed?.isActive('heading', { level: 3 }) ?? false,
      bullet: ed?.isActive('bulletList') ?? false,
      ordered: ed?.isActive('orderedList') ?? false,
      quote: ed?.isActive('blockquote') ?? false,
      canUndo: ed?.can().undo() ?? false,
      canRedo: ed?.can().redo() ?? false,
    }),
  });

  if (!editor || !active) {
    return <div className="p-4 text-sm text-slate-400">エディターを準備中…</div>;
  }

  const tb = (on: boolean) =>
    `p-1.5 rounded-md cursor-pointer disabled:opacity-30 ${
      on ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
    }`;

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-900">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-800 bg-slate-900/90">
        <button className={tb(false)} title="元に戻す" disabled={!active.canUndo} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="w-4 h-4" />
        </button>
        <button className={tb(false)} title="やり直す" disabled={!active.canRedo} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="w-4 h-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <button className={tb(active.h2)} title="見出し(大)" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </button>
        <button className={tb(active.h3)} title="見出し(小)" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="w-4 h-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <button className={tb(active.bold)} title="太字" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </button>
        <button className={tb(active.italic)} title="斜体" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </button>
        <button className={tb(active.underline)} title="下線" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="w-4 h-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <button className={tb(active.bullet)} title="箇条書き" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </button>
        <button className={tb(active.ordered)} title="番号付き" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </button>
        <button className={tb(active.quote)} title="囲み" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="w-4 h-4" />
        </button>
        <button className={tb(false)} title="区切り線" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="w-4 h-4" />
        </button>
        <span className="ml-auto text-[10px] text-slate-500">赤線 = A4の1ページの目安</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-800/60">
        <div className="explain-paper">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
