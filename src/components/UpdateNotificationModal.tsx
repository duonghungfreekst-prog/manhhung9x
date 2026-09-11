import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Download, ExternalLink, X, 
  Calendar, ArrowRight, ShieldCheck, 
  AlertCircle
} from 'lucide-react';
import { 
  type UpdateCheckResult, 
  isAutoCheckEnabled, 
  setAutoCheckEnabled, 
  setDismissedVersion 
} from '../utils/updateChecker';

interface UpdateNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateCheckResult;
}

export const UpdateNotificationModal: React.FC<UpdateNotificationModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
}) => {
  const [autoCheck, setAutoCheck] = useState<boolean>(isAutoCheckEnabled());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState<{ downloadedMb: number; totalMb: number }>({ downloadedMb: 0, totalMb: 0 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eModules = (window as any).electronAPI?.modules;
  const eAPI = (window as any).electronAPI;

  // Lắng nghe tiến trình tải
  useEffect(() => {
    if (!eModules?.onDownloadProgress) return;
    const unsub = eModules.onDownloadProgress((data: any) => {
      if (data) {
        setDownloadProgress(data.percent || 0);
        setDownloadSpeed({
          downloadedMb: +(data.downloadedBytes / (1024 * 1024)).toFixed(1),
          totalMb: +(data.totalBytes / (1024 * 1024)).toFixed(1),
        });
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [eModules]);

  if (!isOpen) return null;

  const handleToggleAutoCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAutoCheck(checked);
    setAutoCheckEnabled(checked);
  };

  const handleDismissThisVersion = () => {
    setDismissedVersion(updateInfo.latestVersion);
    onClose();
  };

  // Tải và chạy bộ cài tự động
  const handleAutoUpdate = async () => {
    const directExeUrl = updateInfo.installerAsset?.downloadUrl || 
      `https://github.com/duonghungfreekst-prog/manhhung9x/releases/download/v${updateInfo.latestVersion}/DMH_Tools_Setup_${updateInfo.latestVersion}_Slim.exe`;
    const installerName = updateInfo.installerAsset?.name || `DMH_Tools_Setup_${updateInfo.latestVersion}_Slim.exe`;

    // Nếu không có Electron API -> tải trực tiếp file exe
    if (!eModules?.downloadGithub) {
      window.location.href = directExeUrl;
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);
    setStatusMessage('Đang kết nối tải bộ cài từ GitHub Releases...');
    setDownloadProgress(0);

    try {
      const res = await eModules.downloadGithub({
        moduleId: `update_${updateInfo.latestVersion}`,
        downloadUrl: directExeUrl,
        assetName: installerName,
      });

      if (res?.ok) {
        setStatusMessage('Đã tải hoàn tất! Đang khởi động trình cài đặt cập nhật...');
        setDownloadProgress(100);

        if (eAPI?.runInstaller) {
          await eAPI.runInstaller(res?.installerPath || installerName);
        } else {
          setStatusMessage('Vui lòng chạy file cài đặt vừa tải để hoàn tất cập nhật!');
        }
      } else {
        setErrorMessage(res?.error || 'Tải bộ cài đặt thất bại');
        setIsDownloading(false);
      }
    } catch (err: any) {
      setErrorMessage(`Lỗi mạng: ${err.message || err}`);
      setIsDownloading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16,
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 20,
        width: '100%',
        maxWidth: 580,
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        
        {/* Header Thông Báo */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              flexShrink: 0,
            }}>
              <Sparkles size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', letterSpacing: 0.2 }}>
                  Đã Có Bản Cập Nhật Mới!
                </h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}>
                  v${updateInfo.latestVersion}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#94a3b8' }}>
                {updateInfo.releaseName || `DMH Tools v${updateInfo.latestVersion} Commercial Edition`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Thông tin Phiên bản so sánh */}
        <div style={{
          padding: '10px 24px',
          background: '#090d16',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: '0.78rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace' }}>
            <span style={{ color: '#94a3b8' }}>Phiên bản hiện tại:</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: '#1e293b',
              color: '#cbd5e1',
              fontWeight: 700,
              border: '1px solid #334155',
            }}>
              v${updateInfo.currentVersion}
            </span>
            <ArrowRight size={14} color="#818cf8" />
            <span style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              fontWeight: 700,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              v${updateInfo.latestVersion}
            </span>
          </div>

          {updateInfo.publishedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: '0.74rem' }}>
              <Calendar size={13} color="#818cf8" />
              <span>Phát hành: <strong style={{ color: '#cbd5e1' }}>{updateInfo.publishedAt}</strong></span>
            </div>
          )}
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMessage && (
          <div style={{
            margin: '14px 24px 0',
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 10,
            color: '#fca5a5',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Nội dung nâng cấp (Release Notes / Changelog) */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: '#818cf8',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <ShieldCheck size={16} />
            <span>Nội dung nâng cấp & Tính năng mới:</span>
          </div>
          <div style={{
            padding: 14,
            borderRadius: 12,
            background: '#090d16',
            border: '1px solid #1e293b',
            fontSize: '0.78rem',
            color: '#cbd5e1',
            lineHeight: 1.6,
            maxHeight: 180,
            overflowY: 'auto',
            whiteSpace: 'pre-line',
          }}>
            {updateInfo.releaseNotes || 'Phiên bản cải tiến hiệu năng, mở rộng giao diện và tối ưu hệ thống.'}
          </div>

          {/* Thanh tiến trình tải nếu đang bấm cập nhật */}
          {isDownloading && (
            <div style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 12,
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '0.78rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, color: '#f8fafc' }}>
                <span style={{ fontWeight: 600 }}>{statusMessage || 'Đang tải bản cập nhật...'}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#818cf8' }}>{downloadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #0ea5e9, #6366f1, #10b981)',
                    width: `${downloadProgress}%`,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              {downloadSpeed.totalMb > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right', marginTop: 4, fontFamily: 'monospace' }}>
                  {downloadSpeed.downloadedMb} / {downloadSpeed.totalMb} MB
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer & Actions */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #1e293b',
          background: '#090d16',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: '0.78rem',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={handleToggleAutoCheck}
              style={{ cursor: 'pointer' }}
            />
            <span>Tự động kiểm tra bản cập nhật khi khởi động</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleDismissThisVersion}
              disabled={isDownloading}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                padding: '6px 10px',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#cbd5e1'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
              title="Không thông báo lại cho đến khi có phiên bản cao hơn"
            >
              Bỏ qua bản này
            </button>

            <button
              onClick={() => {
                if (eAPI?.openDriverUrl) eAPI.openDriverUrl(updateInfo.releaseHtmlUrl);
                else window.open(updateInfo.releaseHtmlUrl, '_blank');
              }}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#cbd5e1',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#334155'}
              onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}
            >
              <ExternalLink size={13} />
              <span>Xem GitHub</span>
            </button>

            <button
              onClick={handleAutoUpdate}
              disabled={isDownloading}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isDownloading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              {isDownloading ? (
                <>
                  <div style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  <span>Đang cập nhật ({downloadProgress}%)...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Cập Nhật Ngay</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
