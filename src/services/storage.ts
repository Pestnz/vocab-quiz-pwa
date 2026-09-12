import type { AppSettings, SentencePracticeLog, VocabDatabase } from '../types/vocab';

const SETTINGS_KEY = 'vocab_app_settings';
const LOCAL_VOCAB_CACHE_KEY = 'vocab_local_cache';
const LOCAL_VOCAB_SHA_KEY = 'vocab_local_sha';
const LOCAL_SENTENCE_HISTORY_KEY = 'sentence_history_local_cache';
const LOCAL_SENTENCE_HISTORY_SHA_KEY = 'sentence_history_local_sha';

export const DEFAULT_SETTINGS: AppSettings = {
  githubToken: '',
  repoOwner: '',
  repoName: '',
  branch: 'main',
  filePath: 'vocab.json',
  geminiApiKey: '',
  defaultLanguage: 'en',
};

export const getStoredSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
    return DEFAULT_SETTINGS;
  }
};

export const saveStoredSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage', e);
  }
};

export const getCachedVocab = (): VocabDatabase => {
  try {
    const raw = localStorage.getItem(LOCAL_VOCAB_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read cached vocab', e);
    return [];
  }
};

export const setCachedVocab = (data: VocabDatabase, sha?: string): void => {
  try {
    localStorage.setItem(LOCAL_VOCAB_CACHE_KEY, JSON.stringify(data));
    if (sha) {
      localStorage.setItem(LOCAL_VOCAB_SHA_KEY, sha);
    }
  } catch (e) {
    console.error('Failed to cache vocab', e);
  }
};

export const getCachedSha = (): string | null => {
  return localStorage.getItem(LOCAL_VOCAB_SHA_KEY);
};

export const setCachedSha = (sha: string): void => {
  localStorage.setItem(LOCAL_VOCAB_SHA_KEY, sha);
};

export const getCachedSentenceHistory = (): SentencePracticeLog[] => {
  try {
    const raw = localStorage.getItem(LOCAL_SENTENCE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read cached sentence history', e);
    return [];
  }
};

export const setCachedSentenceHistory = (data: SentencePracticeLog[], sha?: string): void => {
  try {
    localStorage.setItem(LOCAL_SENTENCE_HISTORY_KEY, JSON.stringify(data));
    if (sha) {
      localStorage.setItem(LOCAL_SENTENCE_HISTORY_SHA_KEY, sha);
    }
  } catch (e) {
    console.error('Failed to cache sentence history', e);
  }
};

export const getCachedSentenceHistorySha = (): string | null => {
  return localStorage.getItem(LOCAL_SENTENCE_HISTORY_SHA_KEY);
};

export const setCachedSentenceHistorySha = (sha: string): void => {
  localStorage.setItem(LOCAL_SENTENCE_HISTORY_SHA_KEY, sha);
};

// 削除済み単語IDの追跡（同期時のゾンビ復活防止ガード）
const DELETED_ITEM_IDS_KEY = 'vocab_deleted_item_ids';
const DELETED_SENTENCE_LOG_IDS_KEY = 'sentence_deleted_log_ids';

export const getDeletedItemIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_ITEM_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read deleted item IDs', e);
    return [];
  }
};

export const addDeletedItemId = (id: string): void => {
  try {
    const current = getDeletedItemIds();
    const updated = [id, ...current.filter(existingId => existingId !== id)].slice(0, 200);
    localStorage.setItem(DELETED_ITEM_IDS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save deleted item ID', e);
  }
};

export const removeDeletedItemId = (id: string): void => {
  try {
    const current = getDeletedItemIds();
    const updated = current.filter(existingId => existingId !== id);
    localStorage.setItem(DELETED_ITEM_IDS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove deleted item ID', e);
  }
};

export const getDeletedSentenceLogIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_SENTENCE_LOG_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read deleted sentence log IDs', e);
    return [];
  }
};

export const addDeletedSentenceLogId = (id: string): void => {
  try {
    const current = getDeletedSentenceLogIds();
    const updated = [id, ...current.filter(existingId => existingId !== id)].slice(0, 200);
    localStorage.setItem(DELETED_SENTENCE_LOG_IDS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save deleted sentence log ID', e);
  }
};

