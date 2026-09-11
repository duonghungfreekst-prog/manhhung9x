/**
 * DMH_Tools - Auto-Update Checker Engine
 * Kiểm tra phiên bản mới từ GitHub Releases và cung cấp thông tin cập nhật cho người dùng
 */

import { getSavedGithubRepo } from './moduleManifest';

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  contentType: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  releaseHtmlUrl: string;
  installerAsset?: ReleaseAsset;
  assets: ReleaseAsset[];
  error?: string;
}

/**
 * So sánh 2 chuỗi phiên bản dạng SemVer (Ví dụ: "6.6.1" vs "6.6.0")
 * Trả về: 1 nếu v1 > v2, -1 nếu v1 < v2, 0 nếu bằng nhau
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = (v1 || '').trim().replace(/^v/i, '');
  const clean2 = (v2 || '').trim().replace(/^v/i, '');

  const parts1 = clean1.split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map(p => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Kiểm tra xem người dùng có bật tùy chọn tự động kiểm tra bản cập nhật khi khởi động không
 */
export function isAutoCheckEnabled(): boolean {
  try {
    const val = localStorage.getItem('dmh_auto_check_update');
    return val !== 'false'; // Mặc định là bật (true)
  } catch {
    return true;
  }
}

export function setAutoCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('dmh_auto_check_update', enabled ? 'true' : 'false');
  } catch {}
}

/**
 * Phiên bản đã tạm bỏ qua (không nhắc lại cho đến khi có bản mới hơn)
 */
export function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem('dmh_dismissed_update_version');
  } catch {
    return null;
  }
}

export function setDismissedVersion(version: string): void {
  try {
    localStorage.setItem('dmh_dismissed_update_version', version);
  } catch {}
}

declare const __APP_VERSION__: string | undefined;
export const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '6.6.4';

/**
 * Gọi GitHub Releases API để kiểm tra phiên bản mới nhất
 */
export async function checkForUpdates(
  currentVersion: string = CURRENT_APP_VERSION,
  customRepo?: string
): Promise<UpdateCheckResult> {
  const repo = (customRepo || getSavedGithubRepo()).trim().replace(/^https?:\/\/github\.com\//, '');

  try {
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseName: '',
        releaseNotes: 'Chưa có bản phát hành nào được đăng tải trên kho lưu trữ GitHub này.',
        publishedAt: '',
        releaseHtmlUrl: `https://github.com/${repo}`,
        assets: [],
      };
    }

    if (!response.ok) {
      throw new Error(`GitHub API phản hồi mã lỗi: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latestTag = (data.tag_name || '').trim();
    const latestVer = latestTag.replace(/^v/i, '');

    const hasUpdate = compareVersions(latestVer, currentVersion) > 0;

    const assets: ReleaseAsset[] = Array.isArray(data.assets)
      ? data.assets.map((a: any) => ({
          id: a.id,
          name: a.name,
          size: a.size || 0,
          downloadUrl: a.browser_download_url,
          contentType: a.content_type,
        }))
      : [];

    // Tìm tệp bộ cài đặt (exe hoặc setup)
    const installerAsset = assets.find(
      a => a.name.toLowerCase().endsWith('.exe') || a.name.toLowerCase().includes('setup')
    );

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestVer || currentVersion,
      releaseName: data.name || `Phiên bản v${latestVer}`,
      releaseNotes: data.body || 'Bản cập nhật nâng cao hiệu năng và tối ưu nghiệp vụ y tế.',
      publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString('vi-VN') : '',
      releaseHtmlUrl: data.html_url || `https://github.com/${repo}/releases/latest`,
      installerAsset,
      assets,
    };
  } catch (error: any) {
    console.warn('[UPDATE_CHECK_ERR]', error);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseName: '',
      releaseNotes: '',
      publishedAt: '',
      releaseHtmlUrl: `https://github.com/${repo}`,
      assets: [],
      error: error.message || 'Không thể kết nối đến máy chủ GitHub để kiểm tra bản mới',
    };
  }
}
