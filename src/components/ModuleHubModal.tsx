import React, { useState, useEffect, useCallback } from 'react';
import { 
  Boxes, Download, Trash2, CheckCircle2, AlertTriangle, 
  RefreshCw, GitBranch, FolderOpen, HardDrive, ShieldCheck, 
  Eye, Tv, FileSpreadsheet, GitCompare, Lock, X
} from 'lucide-react';
import { 
  MODULE_LIST, 
  getSavedGithubRepo,
  type ModuleInfo 
} from '../utils/moduleManifest';
import type { LicenseResult } from '../utils/licenseManager';
import { showConfirm, showAlert, showToast } from '../utils/notificationSystem';

interface ModuleStatus {
  id: string;
  installed: boolean;
  sizeOnDiskMb: number;
  path: string;
}

interface ModuleHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseResult | null;
  targetModuleId?: string | null;
}

export const ModuleHubModal: React.FC<ModuleHubModalProps> = ({
  isOpen,
  onClose,
  license,
}) => {
  const repo = getSavedGithubRepo();
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({});
  const [downloadingModule, setDownloadingModule] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; downloadedMb: number; totalMb: number }>({
    percent: 0,
    downloadedMb: 0,
    totalMb: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const eModules = (window as any).electronAPI?.modules;
  const eAPI = (window as any).electronAPI;

  const refreshStatuses = useCallback(async () => {
    if (!eModules?.getStatusAll) return;
    setIsLoadingStatus(true);
    try {
      const res = await eModules.getStatusAll(MODULE_LIST);
      setStatuses(res || {});
    } catch (e: any) {
      console.error('Lỗi kiểm tra trạng thái module:', e);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [eModules]);

  useEffect(() => {
    if (isOpen) {
      refreshStatuses();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, refreshStatuses]);

  useEffect(() => {
    if (!eModules?.onDownloadProgress) return;
    const unsubscribe = eModules.onDownloadProgress((data: any) => {
      if (data) {
        setDownloadProgress({
          percent: data.percent || 0,
          downloadedMb: +(data.downloadedBytes / (1024 * 1024)).toFixed(1),
          totalMb: +(data.totalBytes / (1024 * 1024)).toFixed(1),
        });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      else if (eModules.removeProgressListener) eModules.removeProgressListener();
    };
  }, [eModules]);

  if (!isOpen) return null;

  const isModuleLicensed = (mod: ModuleInfo): boolean => {
    if (!license || !license.valid || license.expired) return false;
    return mod.relatedTabs.some(tab => license.tabs[tab] === true);
  };

  const handleDownload = async (mod: ModuleInfo) => {
    if (downloadingModule) return;
    setDownloadingModule(mod.id);
    setDownloadProgress({ percent: 0, downloadedMb: 0, totalMb: mod.sizeMb });
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const cleanRepo = (repo || '').trim().replace(/^https?:\/\/github\.com\//, '');
      const downloadUrl = `https://github.com/${cleanRepo}/releases/download/v${mod.version}/${mod.releaseAssetFileName}`;

      const res = await eModules.downloadGithub({
        moduleId: mod.id,
        downloadUrl,
        assetName: mod.releaseAssetFileName,
      });

      if (res?.ok) {
        setSuccessMessage(`Đã cài đặt thành công ${mod.name}!`);
        showToast.success(`Đã tải và cài đặt thành công module "${mod.name}"!`);
        await refreshStatuses();
      } else {
        const errMsg = `Tải thất bại: ${res?.error || 'Không thể tải gói từ GitHub'}`;
        setErrorMessage(errMsg);
        showToast.error(errMsg);
      }
    } catch (err: any) {
      const errMsg = `Lỗi mạng khi tải module: ${err.message || err}`;
      setErrorMessage(errMsg);
      showToast.error(errMsg);
    } finally {
      setDownloadingModule(null);
    }
  };

  const handleUninstall = async (mod: ModuleInfo) => {
    const confirmed = await showConfirm({
      title: 'Xác nhận gỡ module',
      message: `Bạn có chắc chắn muốn gỡ cài đặt "${mod.name}" để giải phóng dung lượng ổ cứng không?`,
      type: 'warning',
      confirmText: 'Gỡ cài đặt',
      cancelText: 'Hủy bỏ'
    });
    if (!confirmed) return;

    try {
      const res = await eModules.uninstall(mod.id);
      if (res?.ok) {
        setSuccessMessage(`Đã gỡ cài đặt ${mod.name}!`);
        showToast.success(`Đã gỡ cài đặt thành công module "${mod.name}"!`);
        await refreshStatuses();
      } else {
        const errMsg = res?.error || 'Không thể xóa thư mục module';
        setErrorMessage(errMsg);
        showToast.error(`Gỡ module thất bại: ${errMsg}`);
      }
    } catch (err: any) {
      const errMsg = `Lỗi gỡ cài đặt: ${err.message || err}`;
      setErrorMessage(errMsg);
      showToast.error(errMsg);
    }
  };

  const handleOpenModulesFolder = async () => {
    try {
      const baseDir = await eModules?.getBaseDir();
      if (baseDir && eAPI?.openFolder) {
        await eAPI.openFolder(baseDir);
        showToast.info('Đã mở thư mục lưu trữ module');
      } else if (baseDir) {
        await showAlert({
          title: 'Thư mục Modules',
          message: `Đường dẫn thư mục module:\n${baseDir}`,
          type: 'info'
        });
      }
    } catch (e: any) {
      await showAlert({
        title: 'Thông báo',
        message: `Đường dẫn thư mục module: ${e.message || e}`,
        type: 'warning'
      });
    }
  };

  const renderModuleIcon = (iconName: string) => {
    switch (iconName) {
      case 'Eye': return <Eye size={22} color="#38bdf8" />;
      case 'Tv': return <Tv size={22} color="#34d399" />;
      case 'FileSpreadsheet': return <FileSpreadsheet size={22} color="#fbbf24" />;
      case 'GitCompare': return <GitCompare size={22} color="#c084fc" />;
      default: return <Boxes size={22} color="#94a3b8" />;
    }
  };

  const totalDiskUsedMb = Object.values(statuses).reduce((acc, curr) => acc + (curr.sizeOnDiskMb || 0), 0);
  const totalInstalledCount = Object.values(statuses).filter(s => s.installed).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2500,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: '#0f172a', border: '1px solid #334155', borderRadius: 20,
        width: '100%', maxWidth: 780, maxHeight: '92vh', display: 'flex',
        flexDirection: 'column', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6)',
        color: '#f8fafc', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.35)'
            }}>
              <Boxes size={22} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                Quản Lý Gói Mở Rộng & Module
                <span style={{ fontSize: '0.7rem', background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)', padding: '2px 8px', borderRadius: 10 }}>
                  v6.6.1
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Hệ thống tự động đồng bộ ngầm theo License Key · Chống nặng máy tính
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#cbd5e1' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#450a0a', border: '1px solid #991b1b', borderRadius: 10, color: '#fecaca', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#f87171" />
            <span style={{ flex: 1 }}>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        {successMessage && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#052e16', border: '1px solid #166534', borderRadius: 10, color: '#bbf7d0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#4ade80" />
            <span style={{ flex: 1 }}>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Info bar */}
        <div style={{
          padding: '10px 24px', background: '#090d16', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={14} color="#64748b" />
            <span>Kho tải: <strong style={{ color: '#c7d2fe' }}>{repo}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <HardDrive size={14} color="#38bdf8" />
              <span>Đã lưu: <strong style={{ color: 'white' }}>{totalDiskUsedMb.toFixed(1)} MB</strong> ({totalInstalledCount}/{MODULE_LIST.length} module)</span>
            </div>
            <button
              onClick={refreshStatuses}
              disabled={isLoadingStatus}
              style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
            >
              <RefreshCw size={13} className={isLoadingStatus ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Module List */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MODULE_LIST.map((mod) => {
            const status = statuses[mod.id] || { installed: false, sizeOnDiskMb: 0 };
            const isLicensed = isModuleLicensed(mod);
            const isDownloading = downloadingModule === mod.id;

            return (
              <div
                key={mod.id}
                style={{
                  background: '#1e293b', border: status.installed ? '1px solid #059669' : '1px solid #334155',
                  borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10, background: '#0f172a',
                      border: '1px solid #334155', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0
                    }}>
                      {renderModuleIcon(mod.iconName)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'white' }}>{mod.name}</span>
                        <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 6, background: '#334155', color: '#cbd5e1' }}>
                          v{mod.version}
                        </span>
                        {isLicensed ? (
                          <span style={{ fontSize: '0.7rem', padding: '1px 8px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ShieldCheck size={12} /> Đã cấp phép
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', padding: '1px 8px', borderRadius: 10, background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Lock size={12} /> Cần License
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 3 }}>
                        {mod.shortDesc}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {status.installed ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={15} color="#34d399" /> Đã cài đặt ({status.sizeOnDiskMb.toFixed(1)} MB)
                        </span>
                        <button
                          onClick={() => handleUninstall(mod)}
                          style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 7, padding: '5px 8px', color: '#f87171', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem'
                          }}
                          title="Gỡ cài đặt module để giải phóng bộ nhớ"
                        >
                          <Trash2 size={13} /> Gỡ
                        </button>
                      </div>
                    ) : isDownloading ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                          Đang tải: {downloadProgress.percent}%
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {downloadProgress.downloadedMb} / {downloadProgress.totalMb || mod.sizeMb} MB
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDownload(mod)}
                        disabled={!isLicensed}
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: 'none',
                          background: isLicensed ? 'linear-gradient(135deg, #0ea5e9, #6366f1)' : '#334155',
                          color: isLicensed ? 'white' : '#64748b', cursor: isLicensed ? 'pointer' : 'not-allowed',
                          fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                          boxShadow: isLicensed ? '0 2px 8px rgba(14,165,233,0.3)' : 'none'
                        }}
                      >
                        <Download size={14} />
                        Tải về ({mod.sizeMb} MB)
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar khi tải */}
                {isDownloading && (
                  <div style={{ width: '100%', height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: `${downloadProgress.percent}%`, height: '100%', background: 'linear-gradient(90deg, #0ea5e9, #6366f1)', transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', background: '#090d16', borderTop: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748b'
        }}>
          <button
            onClick={handleOpenModulesFolder}
            style={{
              background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', padding: 0
            }}
          >
            <FolderOpen size={14} />
            Mở thư mục lưu trữ module
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: 8, border: '1px solid #334155',
              background: '#1e293b', color: '#cbd5e1', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
