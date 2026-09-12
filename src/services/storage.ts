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
