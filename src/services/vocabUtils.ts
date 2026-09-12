import type { Language, VocabItem } from '../types/vocab';

/**
 * 新規単語が既存の単語帳アイテムと実質的に完全重複しているかを判定
 * - 言語（language）が一致
 * - 見出し語（term）が一致（大文字小文字無視）
 * - かつ、意味（meaning）または入力テキスト（sourceText）が被っている場合のみ「重複」と判定
 * 
 * これにより:
 * - 「右」と「権利」の right（多義語）➔ 意味が異なるため両方登録可能
 * - 「soccer」と「football」（同義語）➔ 見出し語が異なるため両方登録可能
 * - 「apple（りんご）」の2重登録 ➔ 重複とみなしてスキップ
 */
export function isDuplicateVocab(
  existing: VocabItem,
  candidate: {
    language: Language;
    term: string;
    sourceText?: string;
    meaning?: string;
  }
): boolean {
  if (existing.language !== candidate.language) {
    return false;
  }

  const existingTerm = existing.term.trim().toLowerCase();
  const candidateTerm = candidate.term.trim().toLowerCase();

  // 見出し語が異なれば重複ではない（例: soccer と football）
  if (existingTerm !== candidateTerm) {
    return false;
  }

  // 見出し語が同じ場合（例: right 同士）
  const existingSource = (existing.sourceText || '').trim().toLowerCase();
  const candidateSource = (candidate.sourceText || '').trim().toLowerCase();
  const existingMeaning = (existing.meaning || '').trim().toLowerCase();
  const candidateMeaning = (candidate.meaning || '').trim().toLowerCase();

  // 1. 日本語入力元（sourceText）が一致している場合（例: 「右」と「右」）
  if (
    existingSource &&
    candidateSource &&
    existingSource === candidateSource &&
    existingSource !== existingTerm // 英語そのものの入力（bank同士）で意味が違う場合は多義語として許容
  ) {
    return true;
  }

  // 2. 意味（meaning）の主要部分が被っているか判定
  if (existingMeaning && candidateMeaning) {
    if (existingMeaning === candidateMeaning) {
      return true;
    }

    // 句読点やスペースで分割して主要語の重複をチェック
    const existingKeywords = existingMeaning
      .split(/[,、/・;；\s()（）]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 1);
    const candidateKeywords = candidateMeaning
      .split(/[,、/・;；\s()（）]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 1);

    const hasOverlap = candidateKeywords.some(k => existingKeywords.includes(k));
    if (hasOverlap) {
      return true;
    }
  }

  // 3. 意味も入力元も特に区別がつかない場合は見出し語一致で重複と判定
  if (!existingMeaning && !candidateMeaning) {
    return true;
  }

  return false;
}
