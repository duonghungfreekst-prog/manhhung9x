/**
 * DMH_Tools - Background Auto-Downloader
 * Tự động tải ngầm các module được cấp phép theo License mà không cần người dùng thao tác thủ công.
 */

import { MODULE_LIST, getSavedGithubRepo } from './moduleManifest';
import type { LicenseResult } from './licenseManager';

let isAutoDownloading = false;

export interface AutoDownloadEvent {
  moduleId: string;
  moduleName: string;
  status: 'START' | 'PROGRESS' | 'SUCCESS' | 'ERROR';
  percent?: number;
  message?: string;
}

type Listener = (event: AutoDownloadEvent) => void;
const listeners: Listener[] = [];

export function subscribeAutoDownload(fn: Listener) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(e: AutoDownloadEvent) {
  listeners.forEach(fn => {
    try { fn(e); } catch {}
  });
}

/**
 * Tự động kiểm tra và tải ngầm các module được cấp phép
 */
export async function runAutoDownloadLicensedModules(license: LicenseResult | null) {
  if (!license || !license.valid || license.expired) return;
  if (isAutoDownloading) return;

  const eModules = (window as any).electronAPI?.modules;
  if (!eModules?.getStatusAll || !eModules?.downloadGithub) return;

  // Lọc danh sách module được cấp quyền
  const licensedMods = MODULE_LIST.filter(mod =>
    mod.relatedTabs.some(tab => license.tabs[tab] === true)
  );

  if (licensedMods.length === 0) return;

  try {
    isAutoDownloading = true;
    const statuses = await eModules.getStatusAll(licensedMods);
    const uninstalled = licensedMods.filter(m => !statuses?.[m.id]?.installed);

    if (uninstalled.length === 0) {
      isAutoDownloading = false;
      return;
    }

    const repo = getSavedGithubRepo().trim().replace(/^https?:\/\/github\.com\//, '');

    // Tải tuần tự từng module ngầm
    for (const mod of uninstalled) {
      notify({
        moduleId: mod.id,
        moduleName: mod.name,
        status: 'START',
        percent: 0,
        message: `Đang tự động tải dữ liệu: ${mod.name}...`
      });

      const downloadUrl = `https://github.com/${repo}/releases/download/v${mod.version}/${mod.releaseAssetFileName}`;

      const res = await eModules.downloadGithub({
        moduleId: mod.id,
        downloadUrl,
        assetName: mod.releaseAssetFileName,
      });

      if (res?.ok) {
        notify({
          moduleId: mod.id,
          moduleName: mod.name,
          status: 'SUCCESS',
          percent: 100,
          message: `✓ Đã hoàn tất cài đặt: ${mod.name}`
        });
      } else {
        notify({
          moduleId: mod.id,
          moduleName: mod.name,
          status: 'ERROR',
          message: `Không thể tự động tải ${mod.name}: ${res?.error || 'Lỗi mạng'}`
        });
      }
    }
  } catch (err) {
    console.warn('[AUTO_DOWNLOAD_ERR]', err);
  } finally {
    isAutoDownloading = false;
  }
}
