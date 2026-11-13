import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, LayoutTemplate } from 'lucide-react';
import type { ExamSection, Question, SectionKind } from '../../types/explain';
import {
  SECTION_KINDS,
  SECTION_KIND_LABEL,
  bySectionOrder,
  chibaTemplate,
  countMissingReasons,
  createQuestion,
  createSection,
  circled,
  fullLabel,
  hasAnyQuestionContent,
  missingChoiceReasons,
  moveQuestionInGroup,
  orderAfterGroup,
  orderedWithDepth,
  renumberQuestions,
  renumberSections,
} from '../../services/explainSections';
import { QuestionCard } from './QuestionCard';
import { AnswerKeyImport } from './AnswerKeyImport';
import { AiStatusPanel } from './AiStatusPanel';

interface SectionsEditorProps {
  sections: ExamSection[];
  deletedSectionIds: string[];
  onChange: (next: { sections: ExamSection[]; deletedSectionIds: string[] }) => void;
}

const field = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
const nowIso = (): string => new Date().toISOString();

export const SectionsEditor: React.FC<SectionsEditorProps> = ({ sections, deletedSectionIds, onChange }) => {
  const sorted = useMemo(() => [...sections].sort(bySectionOrder), [sections]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newQuestionId, setNewQuestionId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAi, setShowAi] = useState(false);

  const selected = sorted.find((s) => s.id === selectedId) ?? sorted[0] ?? null;
  const totalMissing = countMissingReasons(sections);

  const commit = (nextSections: ExamSection[], nextDeleted: string[] = deletedSectionIds) =>
    onChange({ sections: nextSections, deletedSectionIds: nextDeleted });

  // ---- 大問 ----
  const addSection = () => {
    const last = sorted[sorted.length - 1];
    const nextNumber = last && /^\d+$/.test(last.number) ? String(Number(last.number) + 1) : String(sorted.length + 1);
    const s = createSection(last ? last.order + 1 : 0, nextNumber, 'other');
    commit([...sections, s]);
    setSelectedId(s.id);
  };

  const applyTemplate = () => {
    if (hasAnyQuestionContent(sections)) {
      const ok = window.confirm('すでに設問が入っています。千葉県の構成(大問1〜9)を、いまの大問の後ろに追加します。よろしいですか?');
      if (!ok) return;
    }
    const base = sorted.length > 0 ? sorted[sorted.length - 1].order + 1 : 0;
    const added = chibaTemplate().map((s, i) => ({ ...s, order: base + i }));
    commit([...sections, ...added]);
    setSelectedId(added[0].id);
  };

  const updateSection = (id: string, patch: Partial<ExamSection>) =>
    commit(sections.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s)));

  const deleteSection = (s: ExamSection) => {
    const ok = window.confirm(
      `大問${s.number || '(番号なし)'}を削除しますか?\n中の設問 ${s.questions.length} 件も消えます。GitHub同期を使っている場合は、他の端末からも消えます。元に戻せません。`
    );
    if (!ok) return;
    const rest = sections.filter((x) => x.id !== s.id);
    commit(renumberSections(rest), [...new Set([...deletedSectionIds, s.id])]);
    setSelectedId(null);
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const arr = [...sorted];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    // 並べ替えた2つ以外にも番号の振り直しが及ぶことがあるので、順序を振り直して更新日時も更新する
    const stamp = nowIso();
    commit(arr.map((s, k) => (s.order === k ? s : { ...s, order: k, updatedAt: stamp })));
  };

  // ---- 設問 ----
  const mapQuestions = (secId: string, fn: (qs: Question[]) => Question[], extra?: Partial<ExamSection>) =>
    commit(sections.map((s) => (s.id === secId ? { ...s, ...extra, questions: fn(s.questions) } : s)));

  const addQuestion = (sec: ExamSection) => {
    const order = sec.questions.length > 0 ? Math.max(...sec.questions.map((q) => q.order)) + 1 : 0;
    // 「(3)」のような番号の最大値の次を提案する(途中の設問を消しても重複しない)
    const top = sec.questions.filter((x) => !x.parentId); // 小問(①など)は数えない
    const used = top.map((x) => Number(/\((\d+)\)/.exec(x.label)?.[1] ?? 0));
    const q = createQuestion(order, `(${Math.max(top.length, ...used) + 1})`, 'choice');
    mapQuestions(sec.id, (qs) => [...qs, q]);
    setNewQuestionId(q.id);
  };

  const updateQuestion = (secId: string, qid: string, patch: Partial<Question>) =>
    mapQuestions(secId, (qs) => qs.map((q) => (q.id === qid ? { ...q, ...patch, updatedAt: nowIso() } : q)));

  // 小問(「(1)」の下の「①」など)を、親の最後の小問のあとに追加する
  const addSubQuestion = (sec: ExamSection, parent: Question) => {
    const siblings = sec.questions.filter((x) => x.parentId === parent.id).length;
    const q = { ...createQuestion(orderAfterGroup(sec.questions, parent.id), circled(siblings + 1), 'choice'), parentId: parent.id };
    mapQuestions(sec.id, (qs) => [...qs, q]);
    setNewQuestionId(q.id);
  };

  const deleteQuestion = (sec: ExamSection, q: Question) => {
    const children = sec.questions.filter((x) => x.parentId === q.id);
    const name = fullLabel(q, sec.questions) || '(番号なし)';
    const ok = window.confirm(
      `設問「${name}」を削除しますか?` +
        (children.length > 0 ? `\n中の小問 ${children.length} 件も消えます。` : '') +
        `\nGitHub同期を使っている場合は、他の端末からも消えます。元に戻せません。`
    );
    if (!ok) return;
    const removed = new Set([q.id, ...children.map((c) => c.id)]);
    mapQuestions(
      sec.id,
      (qs) => renumberQuestions(qs.filter((x) => !removed.has(x.id))),
      { deletedItemIds: [...new Set([...sec.deletedItemIds, ...removed])], updatedAt: nowIso() }
    );
  };

  // 親は小問と一緒に、小問は同じ親の下だけで動く
  const moveQuestion = (sec: ExamSection, qid: string, dir: -1 | 1) => {
    const next = moveQuestionInGroup(sec.questions, qid, dir);
    if (next) mapQuestions(sec.id, () => next);
  };

  if (sorted.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="max-w-md mx-auto text-center space-y-3 py-10">
          <p className="text-sm text-slate-300">大問がまだありません。</p>
          <p className="text-[11px] text-slate-500">
            大問・設問の構成は、年度によって変わります。大問を1つずつ追加するか、令和7年度 千葉県 本検査の構成(大問1〜9)をひな形として入れられます。
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={addSection}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              大問を追加
            </button>
            <button
              onClick={applyTemplate}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold cursor-pointer"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              千葉県の構成を入れる
            </button>
          </div>
        </div>
      </div>
    );
  }

  const missing = selected ? missingChoiceReasons(selected) : [];
  const orderedQs = selected ? orderedWithDepth(selected.questions) : [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-900">
      {showImport && (
        <AnswerKeyImport
          sections={sections}
          defaultSectionId={selected?.id ?? null}
          onApply={(next) => {
            commit(next);
            setShowImport(false);
          }}
          onClose={() => setShowImport(false)}
          onOpenAiSettings={() => setShowAi(true)}
        />
      )}
      {showAi && <AiStatusPanel onClose={() => setShowAi(false)} />}
      {/* 大問のタブ */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800 overflow-x-auto">
        {sorted.map((s) => {
          const m = missingChoiceReasons(s).length;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs cursor-pointer ${
                s.id === selected?.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title={s.title}
            >
              大問{s.number || '?'}
              {m > 0 && <span className="px-1 rounded bg-amber-500 text-slate-900 text-[10px] font-bold">{m}</span>}
            </button>
          );
        })}
        <button onClick={addSection} className="shrink-0 p-1.5 rounded-md text-slate-300 hover:bg-slate-700 cursor-pointer" title="大問を追加">
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="shrink-0 ml-auto px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 cursor-pointer"
          title="正答表(貼り付け・PDF・画像)から、正解と配点を取り込む"
        >
          正答表を取り込む
        </button>
        <span className="shrink-0 pl-2 text-[11px]">
          {totalMissing > 0 ? (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              理由が未入力の選択肢: {totalMissing}件
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              全選択肢の理由が入力済み
            </span>
          )}
        </span>
      </div>

      {selected && (
        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          {/* 大問の設定 */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-400">
              番号
              <input
                value={selected.number}
                onChange={(e) => updateSection(selected.id, { number: e.target.value })}
                aria-label="大問の番号"
                className={`${field} w-14 ml-1`}
              />
            </label>
            <label className="flex-1 min-w-[140px] text-[11px] text-slate-400">
              タイトル
              <input
                value={selected.title ?? ''}
                onChange={(e) => updateSection(selected.id, { title: e.target.value })}
                placeholder="例: 長文(スピーチ)"
                aria-label="大問のタイトル"
                className={`${field} w-full`}
              />
            </label>
            <label className="text-[11px] text-slate-400">
              種類
              <select
                value={selected.kind}
                onChange={(e) => updateSection(selected.id, { kind: e.target.value as SectionKind })}
                aria-label="大問の種類"
                className={`${field} ml-1`}
              >
                {SECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SECTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex items-center">
              <button
                className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                disabled={sorted[0]?.id === selected.id}
                onClick={() => moveSection(selected.id, -1)}
                title="大問を前へ"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                disabled={sorted[sorted.length - 1]?.id === selected.id}
                onClick={() => moveSection(selected.id, 1)}
                title="大問を後ろへ"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                onClick={() => deleteSection(selected)}
                title="この大問を削除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </span>
          </div>

          {missing.length > 0 && (
            <div className="rounded border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
              理由が未入力の選択肢:{' '}
              {missing.map((m) => `${m.questionLabel}の${m.choiceLabel}`).join('、')}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-amber-400/90 mb-0.5">この大問の講師メモ(生徒用には印刷されません)</label>
            <textarea
              value={selected.note ?? ''}
              onChange={(e) => updateSection(selected.id, { note: e.target.value })}
              rows={2}
              className={`${field} w-full`}
            />
          </div>

          {/* 設問 */}
          <div className="space-y-2">
            {orderedQs.map(({ q, depth, parent }) => (
              <QuestionCard
                key={q.id}
                question={q}
                depth={depth}
                parentLabel={parent?.label}
                childCount={selected.questions.filter((x) => x.parentId === q.id).length}
                defaultOpen={q.id === newQuestionId}
                canMoveUp={moveQuestionInGroup(selected.questions, q.id, -1) !== null}
                canMoveDown={moveQuestionInGroup(selected.questions, q.id, 1) !== null}
                onChange={(patch) => updateQuestion(selected.id, q.id, patch)}
                onMove={(dir) => moveQuestion(selected, q.id, dir)}
                onDelete={() => deleteQuestion(selected, q)}
                onAddSub={depth === 0 ? () => addSubQuestion(selected, q) : undefined}
              />
            ))}
            <button
              onClick={() => addQuestion(selected)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              設問を追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
