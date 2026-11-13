import React, { useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';
import { cachedHtml } from '../../services/explainPaginate';
import './explain.css';

interface RichFieldProps {
  value: JSONContent | null;
  onChange: (value: JSONContent) => void;
  placeholder?: string;
  invalid?: boolean; // 未入力などで強調する
}

const MiniEditor: React.FC<{
  value: JSONContent | null;
  onChange: (v: JSONContent) => void;
  onDone: () => void;
}> = ({ value, onChange, onDone }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value ?? '',
    autofocus: 'end',
    onUpdate: ({ editor: ed }) => onChange(ed.getJSON()),
    editorProps: { attributes: { spellcheck: 'false' } },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed?.isActive('bold') ?? false,
      italic: ed?.isActive('italic') ?? false,
      underline: ed?.isActive('underline') ?? false,
      bullet: ed?.isActive('bulletList') ?? false,
      ordered: ed?.isActive('orderedList') ?? false,
    }),
  });
  if (!editor || !active) return null;

  const tb = (on: boolean) =>
    `p-1 rounded cursor-pointer ${on ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`;
  // ボタンを押してもエディターのフォーカスが外れないようにする
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    // 編集用のバーは「欄の上に重ねて」表示し、欄の高さを変えない
    // (別の欄をクリックしたときに、編集中の欄が閉じて画面がずれ、クリックが外れるのを防ぐ)
    <div
      className="relative rounded border border-emerald-500 bg-white"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone();
      }}
    >
      <div className="absolute left-0 right-0 -top-7 z-10 flex items-center gap-0.5 px-1 py-0.5 border border-slate-300 bg-slate-100 rounded shadow">
        <button className={tb(active.bold)} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()} title="太字">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button className={tb(active.italic)} onMouseDown={keep} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button className={tb(active.underline)} onMouseDown={keep} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線">
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button className={tb(active.bullet)} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBulletList().run()} title="箇条書き">
          <List className="w-3.5 h-3.5" />
        </button>
        <button className={tb(active.ordered)} onMouseDown={keep} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="番号付き">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <span className="ml-auto text-[10px] text-slate-400 pr-1">枠の外をクリックで確定</span>
      </div>
      <div className="explain-page-body px-2 py-1 min-h-[2.25rem] !bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

/**
 * 設問の解説・選択肢の理由に使う、小さなリッチテキスト欄。
 * ふだんは表示だけ(軽い)で、クリックした欄だけ編集モードになる。
 */
export const RichField: React.FC<RichFieldProps> = ({ value, onChange, placeholder, invalid }) => {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <MiniEditor value={value} onChange={onChange} onDone={() => setEditing(false)} />;
  }

  const html = cachedHtml(value);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`rounded border px-2 py-1 min-h-[2.25rem] cursor-text !bg-white hover:border-emerald-400 ${
        invalid ? 'border-rose-400' : 'border-slate-300'
      }`}
    >
      {html ? (
        <div className="explain-page-body !bg-white" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className="text-xs text-slate-400">{placeholder ?? 'クリックして入力'}</span>
      )}
    </div>
  );
};
