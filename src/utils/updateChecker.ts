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
export const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '6.8.1';

/**
 * Gọi GitHub Releases API để kiểm tra phiên bản mới nhất
 */
export async function checkForUpdates(
  currentVersion: string = CURRENT_APP_VERSION,
  customRepo?: string
): Promise<UpdateCheckResult> {
  const repo = (customRepo || getSavedGithubRepo()).trim().replace(/^https?:\/\/github\.com\//, '');

  let latestVer = '';
  let latestTag = '';
  let releaseName = '';
  let releaseNotes = '';
  let publishedAt = '';
  let releaseHtmlUrl = `https://github.com/${repo}/releases/latest`;
  let assets: ReleaseAsset[] = [];
  let installerAsset: ReleaseAsset | undefined = undefined;

  try {
    // Tầng 1: Thử truy vấn qua GitHub REST API
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

    if (response.ok) {
      const data = await response.json();
      latestTag = (data.tag_name || '').trim();
      latestVer = latestTag.replace(/^v/i, '');
      releaseName = data.name || `Phiên bản v${latestVer}`;
      releaseNotes = data.body || 'Bản cập nhật nâng cao hiệu năng và tối ưu nghiệp vụ.';
      publishedAt = data.published_at ? new Date(data.published_at).toLocaleDateString('vi-VN') : '';
      releaseHtmlUrl = data.html_url || `https://github.com/${repo}/releases/latest`;

      if (Array.isArray(data.assets)) {
        assets = data.assets.map((a: any) => ({
          id: a.id,
          name: a.name,
          size: a.size || 0,
          downloadUrl: a.browser_download_url,
          contentType: a.content_type,
        }));
        installerAsset = assets.find(
          a => a.name.toLowerCase().endsWith('.exe') || a.name.toLowerCase().includes('setup')
        );
      }
    } else {
      throw new Error(`GitHub API trả về mã: ${response.status}`);
    }
  } catch (apiErr: any) {
    console.warn('[UPDATE_CHECK_API_WARN] Chuyển sang kênh dự phòng trực tiếp:', apiErr.message);

    // Tầng 2: Dự phòng chống lỗi 403 Rate Limit hoặc lỗi API bằng cách lấy redirect URL trực tiếp
    try {
      const checkUrl = `https://github.com/${repo}/releases/latest`;
      const redRes = await fetch(checkUrl, { method: 'HEAD', redirect: 'follow' });
      const finalUrl = redRes.url || '';
      const match = finalUrl.match(/releases\/tag\/(v?[\d.]+)/i);

      if (match) {
        latestTag = match[1];
        latestVer = latestTag.replace(/^v/i, '');
        releaseName = `DMH Tools v${latestVer} Commercial Suite`;
        releaseNotes = 'Bản cập nhật mới nhất từ nhà phát triển. Sửa lỗi và bổ sung tính năng.';
        releaseHtmlUrl = finalUrl;

        const defaultExeName = `DMH_Tools_Setup_${latestVer}_Slim.exe`;
        const directDownloadUrl = `https://github.com/${repo}/releases/download/${latestTag.startsWith('v') ? latestTag : 'v' + latestTag}/${defaultExeName}`;
        installerAsset = {
          id: 1,
          name: defaultExeName,
          size: 140 * 1024 * 1024,
          downloadUrl: directDownloadUrl,
          contentType: 'application/vnd.microsoft.portable-executable',
        };
        assets = [installerAsset];
      } else {
        throw new Error('Không thể phân giải phiên bản từ GitHub');
      }
    } catch (fallbackErr: any) {
      console.error('[UPDATE_CHECK_ERR]', fallbackErr);
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseName: '',
        releaseNotes: '',
        publishedAt: '',
        releaseHtmlUrl: `https://github.com/${repo}`,
        assets: [],
        error: `Lỗi kết nối GitHub: ${apiErr.message || fallbackErr.message}`,
      };
    }
  }

  const hasUpdate = compareVersions(latestVer, currentVersion) > 0;

  return {
    hasUpdate,
    currentVersion,
    latestVersion: latestVer || currentVersion,
    releaseName: releaseName || `Phiên bản v${latestVer}`,
    releaseNotes: releaseNotes || 'Bản cập nhật nâng cao hiệu năng và tối ưu nghiệp vụ.',
    publishedAt,
    releaseHtmlUrl,
    installerAsset,
    assets,
  };
}
