import type { Language, VocabDatabase, VocabItem } from '../types/vocab';

interface PickWordsOptions {
  count: number; // 1〜5個
  language: Language;
  recentPassedWordIds?: string[]; // 直近合格したクールダウン対象
}

/**
 * 語彙強制使用モード用に対象単語を優先度に基づいて抽出する
 */
export function pickSentenceWords(
  database: VocabDatabase,
  options: PickWordsOptions
): { words: VocabItem[]; totalAvailable: number } {
  const { count, language, recentPassedWordIds = [] } = options;

  // 対象言語の単語を抽出
  const langItems = database.filter(item => item.language === language);
  const totalAvailable = langItems.length;

  if (langItems.length === 0) {
    return { words: [], totalAvailable: 0 };
  }

  const now = Date.now();
  const cooldownSet = new Set(recentPassedWordIds);

  // クールダウン対象外を優先
  let candidates = langItems.filter(item => !cooldownSet.has(item.id));
  if (candidates.length < count) {
    // 候補が足りない場合はクールダウン対象も含める
    candidates = [...langItems];
  }

  // スコアリング（点数が高いほど出題優先度が高い）
  const scored = candidates.map(item => {
    let score = 0;

    // 優先度1: proficiency（習熟度）が低い単語（0: +50点, 1: +40点, 2: +30点, 3: +10点, 4: +5点, 5: 0点）
    const p = item.proficiency ?? 0;
    if (p === 0) score += 50;
    else if (p === 1) score += 40;
    else if (p === 2) score += 30;
    else if (p === 3) score += 10;
    else if (p === 4) score += 5;

    // 優先度2: nextReviewAt が現在時刻を過ぎている（+25点）
    if (item.nextReviewAt) {
      const reviewTime = new Date(item.nextReviewAt).getTime();
      if (reviewTime <= now) {
        score += 25;
      }
    } else {
      score += 20; // 未学習
    }

    // 優先度3: 作成日時が新しい（最大+15点）
    const createdTime = new Date(item.createdAt).getTime() || 0;
    const daysOld = Math.max(0, (now - createdTime) / (1000 * 60 * 60 * 24));
    if (daysOld <= 7) {
      score += 15;
    } else if (daysOld <= 30) {
      score += 8;
    }

    // ランダムな揺らぎ（同点ばかりにならないよう 0〜10点 のノイズ付与）
    score += Math.random() * 10;

    return { item, score };
  });

  // スコア降順ソートして指定件数取得
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, Math.min(count, scored.length)).map(s => s.item);

  return {
    words: selected,
    totalAvailable,
  };
}
