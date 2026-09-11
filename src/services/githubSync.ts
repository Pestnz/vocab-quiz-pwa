import type { AppSettings, VocabDatabase, VocabItem } from '../types/vocab';
import { getCachedSha, setCachedSha, setCachedVocab } from './storage';

export function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64Utf8(b64: string): string {
  const cleanB64 = b64.replace(/\s/g, '');
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export class GitHubSyncService {
  private currentSha: string | null = null;

  constructor() {
    this.currentSha = getCachedSha();
  }

  public getSha(): string | null {
    return this.currentSha;
  }

  public setSha(sha: string | null): void {
    this.currentSha = sha;
    if (sha) {
      setCachedSha(sha);
    }
  }

  private getHeaders(token: string): HeadersInit {
    return {
      'Authorization': `Bearer ${token.trim()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /**
   * GitHubリポジトリから vocab.json を取得する
   */
  public async fetchVocab(settings: AppSettings): Promise<{ data: VocabDatabase; sha: string | null }> {
    const { githubToken, repoOwner, repoName, branch, filePath } = settings;

    if (!githubToken || !repoOwner || !repoName) {
      throw new Error('GitHub設定（PAT、所有者、リポジトリ名）が未完了です。');
    }

    const cleanPath = filePath ? filePath.replace(/^\/+/, '') : 'vocab.json';
    const url = `https://api.github.com/repos/${encodeURIComponent(repoOwner.trim())}/${encodeURIComponent(repoName.trim())}/contents/${cleanPath}?ref=${encodeURIComponent(branch.trim() || 'main')}&_t=${Date.now()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(githubToken),
      cache: 'no-store',
    });

    if (response.status === 404) {
      this.setSha(null);
      setCachedVocab([]);
      return { data: [], sha: null };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub取得エラー (${response.status} ${response.statusText})`);
    }

    const data = await response.json();
    const sha = data.sha as string;
    this.setSha(sha);

    let parsedData: VocabDatabase = [];
    if (data.content) {
      const jsonString = fromBase64Utf8(data.content);
      parsedData = JSON.parse(jsonString);
      if (!Array.isArray(parsedData)) {
        parsedData = [];
      }
    }

    setCachedVocab(parsedData, sha);
    return { data: parsedData, sha };
  }

  /**
   * vocab.json を GitHub にコミット・プッシュする
   */
  public async pushVocab(
    data: VocabDatabase,
    settings: AppSettings,
    commitMessage: string,
    retryCount = 0
  ): Promise<{ sha: string }> {
    const { githubToken, repoOwner, repoName, branch, filePath } = settings;

    if (!githubToken || !repoOwner || !repoName) {
      throw new Error('GitHub設定が未完了です。');
    }

    const cleanPath = filePath ? filePath.replace(/^\/+/, '') : 'vocab.json';
    const url = `https://api.github.com/repos/${encodeURIComponent(repoOwner.trim())}/${encodeURIComponent(repoName.trim())}/contents/${cleanPath}`;

    const jsonString = JSON.stringify(data, null, 2);
    const base64Content = toBase64Utf8(jsonString);

    const payload: {
      message: string;
      content: string;
      branch: string;
      sha?: string;
    } = {
      message: commitMessage,
      content: base64Content,
      branch: branch.trim() || 'main',
    };

    const currentSha = this.currentSha || getCachedSha();
    if (currentSha) {
      payload.sha = currentSha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(githubToken),
      body: JSON.stringify(payload),
    });

    // 409 Conflict 処理
    if (response.status === 409) {
      if (retryCount >= 2) {
        throw new Error('リモートとの競合が複数回発生しました。最新データを手動で再同期してください。');
      }

      console.warn('409 Conflict detected. Fetching latest remote and merging...');
      const remote = await this.fetchVocab(settings);
      const merged = this.mergeVocabDatabases(data, remote.data);
      return this.pushVocab(merged, settings, `${commitMessage} (auto-merge)`, retryCount + 1);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub保存エラー (${response.status} ${response.statusText})`);
    }

    const result = await response.json();
    const newSha = result.content.sha as string;
    this.setSha(newSha);
    setCachedVocab(data, newSha);

    return { sha: newSha };
  }

  /**
   * ローカルとリモートのVocabItemをマージする
   */
  public mergeVocabDatabases(local: VocabDatabase, remote: VocabDatabase): VocabDatabase {
    const map = new Map<string, VocabItem>();

    for (const item of remote) {
      map.set(item.id, item);
    }

    for (const localItem of local) {
      const existing = map.get(localItem.id);
      if (!existing) {
        map.set(localItem.id, localItem);
      } else {
        const localTime = new Date(localItem.updatedAt).getTime() || 0;
        const remoteTime = new Date(existing.updatedAt).getTime() || 0;
        if (localTime >= remoteTime) {
          map.set(localItem.id, localItem);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * GitHub PAT & リポジトリ接続テスト
   */
  public async testConnection(settings: AppSettings): Promise<{ success: boolean; message: string }> {
    const { githubToken, repoOwner, repoName } = settings;
    if (!githubToken.trim() || !repoOwner.trim() || !repoName.trim()) {
      return { success: false, message: 'トークン、所有者、リポジトリ名を入力してください。' };
    }

    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(repoOwner.trim())}/${encodeURIComponent(repoName.trim())}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(githubToken),
      });

      if (response.status === 200) {
        const data = await response.json();
        return {
          success: true,
          message: `接続成功: ${data.full_name} (${data.private ? 'Private' : 'Public'})`,
        };
      } else if (response.status === 401) {
        return { success: false, message: '認証エラー (401): PATの有効期限や権限(repoスコープ)を確認してください。' };
      } else if (response.status === 404) {
        return { success: false, message: 'リポジトリが見つかりません (404): 所有者名・リポジトリ名を確認してください。' };
      } else {
        return { success: false, message: `接続失敗: ステータスコード ${response.status}` };
      }
    } catch (e: unknown) {
      const err = e as Error;
      return { success: false, message: `通信エラー: ${err.message || '接続できませんでした'}` };
    }
  }
}

export const githubSyncService = new GitHubSyncService();
