/** 仮想生徒質問応対練習の型。単語帳・日記・作文の型には一切手を加えない(別ファイルに保存) */

/** 相手の学年 */
export type Audience = 'jh1' | 'jh2' | 'jh3' | 'hs1' | 'hs2' | 'hs3';
/** 相手の英語力 */
export type StudentLevel = 'weak' | 'normal' | 'strong';
/** ジャンル(絞り込み用。空なら「広め」= すべてから完全ランダム) */
export type Genre = 'grammar' | 'usage' | 'sound' | 'skills' | 'study' | 'curious';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  jh1: '中1',
  jh2: '中2',
  jh3: '中3',
  hs1: '高1',
  hs2: '高2',
  hs3: '高3',
};
export const AUDIENCE_ORDER: Audience[] = ['jh1', 'jh2', 'jh3', 'hs1', 'hs2', 'hs3'];

export const LEVEL_LABEL: Record<StudentLevel, string> = {
  weak: '英語が苦手',
  normal: '普通',
  strong: '英語が得意',
};
export const LEVEL_ORDER: StudentLevel[] = ['weak', 'normal', 'strong'];

export const GENRE_LABEL: Record<Genre, string> = {
  grammar: '文法',
  usage: '単語・表現の使い分け',
  sound: '発音・つづり',
  skills: '読解・作文・リスニング',
  study: '勉強法・テスト対策',
  curious: '素朴な疑問',
};
export const GENRE_ORDER: Genre[] = ['grammar', 'usage', 'sound', 'skills', 'study', 'curious'];

/** AIによる判定(あくまで参考。文法の説明をAIが誤ることもある) */
export interface PracticeEvaluation {
  score: number; // 0〜100(わかりやすさ・正確さの総合)
  accuracy: 'correct' | 'partly' | 'incorrect'; // 内容の正しさ
  accuracyNote: string; // 正しさについてのコメント(誤りがあれば、どこか)
  clarity: number; // わかりやすさ 1〜5
  levelFit: number; // その生徒のレベルに合っているか 1〜5
  strengths: string[]; // よかった点
  issues: string[]; // わかりにくい点・直したい点
  improvedAnswer: string; // 修正案(その生徒に向けた言い直しの例)
  tip: string; // 次に意識すると良いこと(1つ)
}

export interface PracticeAttempt {
  id: string;
  createdAt: string;
  updatedAt: string;
  audience: Audience;
  studentLevel: StudentLevel;
  genres: Genre[]; // 出題時に選んだジャンル(空 = 広め)
  topic: string; // この質問の話題(例: 「関係代名詞 that と which」)
  situation: string; // 質問された場面(短い説明。空でもよい)
  question: string; // 生徒の質問(日本語)
  answer: string; // 自分の答え
  evaluation?: PracticeEvaluation;
  retryOf?: string; // やり直しの場合、元の attempt の id(Step 2 で使用)
}

/** GitHub に保存する、月ごとのファイル(teaching_practice/YYYY-MM.json) */
export interface PracticeMonthFile {
  version: 1;
  month: string; // 'YYYY-MM'
  attempts: PracticeAttempt[];
  deletedIds: string[]; // 削除した attempt の id(別端末で復活させないため)
}
