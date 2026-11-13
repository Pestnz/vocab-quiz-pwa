import type { GlossaryItem, Passage, PassageSentence, SentenceStructure } from '../types/explain';

/**
 * 本文(長文)と文の、作成・整え・分割・結合。
 * 文は「文単位」で管理する(後から品詞分解を足しても、作り直しにならないようにするため)。
 */

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();

export function createSentence(order: number, en = '', over: Partial<PassageSentence> = {}): PassageSentence {
  return { id: newId(), order, no: 0, en, ja: '', reviewed: false, updatedAt: nowIso(), ...over };
}

export function createPassage(title = ''): Passage {
  return { id: newId(), title: title || undefined, sentences: [], updatedAt: nowIso() };
}

export const bySentenceOrder = (a: { order: number }, b: { order: number }): number => a.order - b.order;

/** 並び順に並べ、文番号(no)を 1,2,3… に振り直す。変わった文だけ更新日時を動かす */
export function renumberSentences(sentences: PassageSentence[]): PassageSentence[] {
  const stamp = nowIso();
  return [...sentences].sort(bySentenceOrder).map((s, i) => {
    const changed = s.order !== i || s.no !== i + 1;
    return changed ? { ...s, order: i, no: i + 1, updatedAt: stamp } : s;
  });
}

// ---------------- 読み込み時の整え ----------------

const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);

function normalizeStructure(raw: unknown): SentenceStructure | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<SentenceStructure>;
  if (!Array.isArray(s.tokens)) return undefined;
  return s as SentenceStructure; // 品詞分解の中身は Phase 5b で扱う。ここでは壊さずに保つ
}

export function normalizePassages(raw: unknown): Passage[] {
  if (!Array.isArray(raw)) return [];
  const out: Passage[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const p = r as Partial<Passage> & { paragraphBreaks?: unknown };
    const sentences: PassageSentence[] = (Array.isArray(p.sentences) ? p.sentences : [])
      .filter((x): x is PassageSentence => Boolean(x) && typeof x === 'object')
      .map((x, i) => ({
        id: str(x.id) || newId(),
        order: typeof x.order === 'number' && Number.isFinite(x.order) ? x.order : i,
        no: typeof x.no === 'number' ? x.no : i + 1,
        en: str(x.en),
        ja: str(x.ja),
        speaker: typeof x.speaker === 'string' && x.speaker !== '' ? x.speaker : undefined,
        structure: normalizeStructure(x.structure),
        ocrConfidence: x.ocrConfidence === 'low' || x.ocrConfidence === 'high' ? x.ocrConfidence : undefined,
        reviewed: Boolean(x.reviewed),
        paraStart: x.paraStart ? true : undefined,
        updatedAt: str(x.updatedAt) || nowIso(),
      }));
    // SPEC どおりの paragraphBreaks(文の添字)で書かれていたら、文ごとの paraStart に直す
    if (Array.isArray(p.paragraphBreaks) && !sentences.some((s) => s.paraStart)) {
      const sorted = [...sentences].sort(bySentenceOrder);
      for (const i of p.paragraphBreaks) if (typeof i === 'number' && sorted[i]) sorted[i].paraStart = true;
    }
    const glossary: GlossaryItem[] | undefined = Array.isArray(p.glossary)
      ? p.glossary
          .filter((g): g is GlossaryItem => Boolean(g) && typeof g === 'object')
          .map((g) => ({ term: str(g.term), meaning: str(g.meaning) }))
      : undefined;
    out.push({
      id: str(p.id) || newId(),
      title: typeof p.title === 'string' && p.title !== '' ? p.title : undefined,
      sentences: sentences.sort(bySentenceOrder),
      glossary,
      updatedAt: str(p.updatedAt) || nowIso(),
    });
  }
  return out;
}

// ---------------- 文の分割 ----------------

// 文の終わりとみなさない略語(直前の語が、これで終わるとき)
const ABBREV = /(?:\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Mt|vs|etc|No|Inc|Ltd|Co)|\b[A-Za-z]|\b(?:e\.g|i\.e|a\.m|p\.m|U\.S|U\.K))\.$/;

/**
 * 英文を、1文ずつに分ける。
 * 「. ? !」の後ろ(閉じ引用符・閉じかっこを含む)に空白があり、次が大文字・引用符・数字で始まるところで区切る。
 * 略語(Mr. / e.g. / a.m. など)と、1文字の頭文字(J. K.)では区切らない。
 */
export function splitSentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  const re = /([.?!…]+["”’')\]）」]*)\s+(?=["“‘'(（「]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const end = m.index + m[1].length;
    const head = t.slice(start, end);
    if (ABBREV.test(head.replace(/["”’')\]）」]+$/, ''))) continue; // 略語の「.」なので区切らない
    out.push(head.trim());
    start = m.index + m[0].length;
  }
  const rest = t.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** 段落ごとのテキストを、文に分けて、文の一覧にする(各段落の最初の文に paraStart を付ける) */
export function sentencesFromParagraphs(
  paragraphs: Array<{ text: string; speaker?: string }>,
  baseOrder = 0,
  opts: { reviewed?: boolean; lowConfidenceWords?: string[] } = {}
): PassageSentence[] {
  const out: PassageSentence[] = [];
  const low = (opts.lowConfidenceWords ?? []).map((w) => w.trim()).filter((w) => w.length >= 2);
  paragraphs.forEach((para, pi) => {
    splitSentences(para.text).forEach((en, si) => {
      out.push(
        createSentence(baseOrder + out.length, en, {
          speaker: para.speaker && si === 0 ? para.speaker : undefined,
          paraStart: si === 0 && (pi > 0 || baseOrder > 0) ? true : undefined,
          reviewed: opts.reviewed ?? false,
          ocrConfidence: low.some((w) => en.includes(w)) ? 'low' : undefined,
        })
      );
    });
  });
  return out;
}

/** 入力欄の文字(改行で段落、空行も段落の区切り)から、文の一覧を作る */
export function sentencesFromText(text: string, baseOrder = 0): PassageSentence[] {
  const paras = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // 「Haru: …」のように、行頭が「名前:」なら話者として切り出す
      const m = /^([A-Z][A-Za-z.' -]{0,20}):\s+(.+)$/.exec(l);
      return m ? { speaker: m[1], text: m[2] } : { text: l };
    });
  return sentencesFromParagraphs(paras, baseOrder);
}

// ---------------- 編集操作(すべて新しい配列を返す) ----------------

/** 文をカーソル位置で2つに分ける。後ろの文は、同じ段落のまま、すぐ後ろに入る */
export function splitSentenceAt(sentences: PassageSentence[], id: string, pos: number): PassageSentence[] | null {
  const sorted = [...sentences].sort(bySentenceOrder);
  const i = sorted.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const s = sorted[i];
  const a = s.en.slice(0, pos).trim();
  const b = s.en.slice(pos).trim();
  if (!a || !b) return null;
  const nextOrder = sorted[i + 1] ? (s.order + sorted[i + 1].order) / 2 : s.order + 1;
  const stamp = nowIso();
  const first: PassageSentence = { ...s, en: a, ja: '', structure: undefined, reviewed: false, updatedAt: stamp };
  const second = createSentence(nextOrder, b, { reviewed: false });
  return renumberSentences([...sorted.slice(0, i), first, second, ...sorted.slice(i + 1)]);
}

/** 文を、直前の文と結合する(英文は空白でつなぐ。全訳は、どちらかが空でなければつなぐ) */
export function mergeWithPrevious(sentences: PassageSentence[], id: string): PassageSentence[] | null {
  const sorted = [...sentences].sort(bySentenceOrder);
  const i = sorted.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  const prev = sorted[i - 1];
  const cur = sorted[i];
  const merged: PassageSentence = {
    ...prev,
    en: `${prev.en} ${cur.en}`.replace(/\s+/g, ' ').trim(),
    ja: [prev.ja, cur.ja].filter(Boolean).join(''),
    structure: undefined,
    reviewed: false,
    ocrConfidence: prev.ocrConfidence === 'low' || cur.ocrConfidence === 'low' ? 'low' : prev.ocrConfidence,
    updatedAt: nowIso(),
  };
  return renumberSentences([...sorted.slice(0, i - 1), merged, ...sorted.slice(i + 1)]);
}

/** 文の一覧を、段落ごとに分ける(paraStart のある文から新しい段落) */
export function toParagraphs(sentences: PassageSentence[]): PassageSentence[][] {
  const sorted = [...sentences].sort(bySentenceOrder);
  const out: PassageSentence[][] = [];
  for (const s of sorted) {
    if (out.length === 0 || s.paraStart) out.push([s]);
    else out[out.length - 1].push(s);
  }
  return out;
}

// ---------------- 集計 ----------------

export function countUnreviewed(passages: Passage[]): number {
  return passages.reduce((n, p) => n + p.sentences.filter((s) => !s.reviewed).length, 0);
}

export function passagesToText(passages: Passage[]): string {
  return passages
    .flatMap((p) => [p.title ?? '', ...p.sentences.flatMap((s) => [s.speaker ?? '', s.en, s.ja]), ...(p.glossary ?? []).flatMap((g) => [g.term, g.meaning])])
    .join('\n');
}
