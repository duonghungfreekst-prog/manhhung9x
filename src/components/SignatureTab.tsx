import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, ShieldAlert, FileSignature, CheckCircle2,
  AlertTriangle, Play, FileCode2, Trash2, RefreshCw,
  Download, UploadCloud, Eye, FileCheck, Layers, Settings,
  Key, X
} from 'lucide-react';
import JSZip from 'jszip';
import { showToast } from '../utils/notificationSystem';
import { startGlobalLoading, stopGlobalLoading } from '../utils/globalLoading';
import type { CaCertificate, XmlFileToSign, XmlVerificationResult } from '../types';

type MainViewMode = 'sign' | 'verify';

export function SignatureTab() {
  const [viewMode, setViewMode] = useState<MainViewMode>('sign');

  // ── Danh sách chứng thư số từ Windows Certificate Store / USB Token ──
  const [certificates, setCertificates] = useState<CaCertificate[]>([]);
  const [selectedThumbprint, setSelectedThumbprint] = useState<string>('');
  const [isLoadingCerts, setIsLoadingCerts] = useState<boolean>(false);
  const [targetTag, setTargetTag] = useState<string>('CHUKYDONVI');

  // ── Danh sách tệp XML chờ ký ──
  const [files, setFiles] = useState<XmlFileToSign[]>([]);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [signProgress, setSignProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Modal xem trước XML ──
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string } | null>(null);

  // ── Phân hệ Xác Thực Chữ Ký (Verify) ──
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<XmlVerificationResult | null>(null);
  const [verifyDragOver, setVerifyDragOver] = useState<boolean>(false);
  const verifyInputRef = useRef<HTMLInputElement>(null);

  const eAPI = () => (window as any).electronAPI;

  // ── 1. Quét danh sách chứng thư số từ Windows Certificate Store ─────────────
  const loadCertificates = useCallback(async (silent = false) => {
    const api = eAPI();
    if (!api?.ca?.getCertificates) {
      if (!silent) {
        showToast.warning('Chức năng giao tiếp USB Token chỉ khả dụng trong môi trường Electron.');
      }
      return;
    }
    setIsLoadingCerts(true);
    try {
      const res = await api.ca.getCertificates();
      if (res.ok && Array.isArray(res.certificates)) {
        setCertificates(res.certificates);
        if (res.certificates.length > 0) {
          setSelectedThumbprint(prev => {
            const exists = res.certificates.some((c: CaCertificate) => c.Thumbprint === prev);
            return exists ? prev : res.certificates[0].Thumbprint;
          });
          if (!silent) {
            showToast.success(`Đã tìm thấy ${res.certificates.length} chứng thư số / USB Token trên máy tính!`);
          }
        } else {
          setSelectedThumbprint('');
          if (!silent) {
            showToast.info('Không tìm thấy chứng thư số nào có Private Key. Vui lòng cắm USB Token và cài driver.');
          }
        }
      } else {
        if (!silent) {
          showToast.error(res.error || 'Không thể quét danh sách chứng thư số.');
        }
      }
    } catch (err: any) {
      if (!silent) {
        showToast.error('Lỗi khi quét chứng thư số: ' + (err?.message || err));
      }
    } finally {
      setIsLoadingCerts(false);
    }
  }, []);

  useEffect(() => {
    loadCertificates(true);
  }, [loadCertificates]);

  // ── 2. Xử lý nạp tệp XML cần ký ───────────────────────────────────────────
  const addXmlFilesFromList = async (rawFiles: File[]) => {
    const xmlList = rawFiles.filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (xmlList.length === 0) {
      showToast.warning('Vui lòng chọn các tệp có định dạng .xml!');
      return;
    }

    const newEntries: XmlFileToSign[] = [];
    for (const file of xmlList) {
      try {
        const text = await file.text();
        const fp = (file as any).path || '';
        newEntries.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name: file.name,
          path: fp,
          content: text,
          size: file.size,
          status: 'idle'
        });
      } catch (e: any) {
        console.error('Lỗi đọc file:', file.name, e);
      }
    }

    setFiles(prev => {
      const existingNames = new Set(prev.map(p => p.name));
      const filtered = newEntries.filter(e => !existingNames.has(e.name));
      return [...prev, ...filtered];
    });

    showToast.success(`Đã nạp ${newEntries.length} tệp XML vào danh sách chờ ký!`);
  };

  const handleSelectFilesDialog = async () => {
    const api = eAPI();
    if (api?.ca?.selectXmlFiles) {
      try {
        const res = await api.ca.selectXmlFiles();
        if (res.ok && !res.canceled && res.files?.length > 0) {
          const newEntries: XmlFileToSign[] = res.files.map((f: any) => ({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: f.name,
            path: f.path,
            size: f.size,
            status: 'idle'
          }));
          setFiles(prev => {
            const existingPaths = new Set(prev.map(p => p.path || p.name));
            const filtered = newEntries.filter(e => !existingPaths.has(e.path || e.name));
            return [...prev, ...filtered];
          });
          showToast.success(`Đã thêm ${newEntries.length} tệp XML vào danh sách!`);
          return;
        }
      } catch (err) {
        console.warn('Fallback standard file input:', err);
      }
    }
    fileInputRef.current?.click();
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addXmlFilesFromList(Array.from(e.dataTransfer.files));
    }
  };

  // ── 3. Bắt đầu Ký số Hàng loạt (Batch Signing) ────────────────────────────
  const handleStartSigning = async () => {
    if (!selectedThumbprint) {
      showToast.warning('Vui lòng chọn chứng thư số hoặc cắm USB Token trước khi ký!');
      return;
    }
    const pendingFiles = files.filter(f => f.status !== 'success');
    if (pendingFiles.length === 0) {
      showToast.info('Tất cả các tệp trong danh sách đều đã được ký!');
      return;
    }

    const api = eAPI();
    if (!api?.ca?.signXml) {
      showToast.error('Không tìm thấy module ký số native trong ứng dụng Electron!');
      return;
    }

    setIsSigning(true);
    setSignProgress({ current: 0, total: pendingFiles.length });
    startGlobalLoading('ca-sign', `Đang ký số ${pendingFiles.length} tệp XML qua USB Token...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const targetFile = pendingFiles[i];
      setSignProgress({ current: i + 1, total: pendingFiles.length });

      setFiles(prev => prev.map(f => f.id === targetFile.id ? { ...f, status: 'signing', error: undefined } : f));

      try {
        const payload: any = {
          thumbprint: selectedThumbprint,
          targetTag: targetTag || 'CHUKYDONVI',
        };

        if (targetFile.path) {
          payload.filePath = targetFile.path;
        } else if (targetFile.content) {
          payload.xmlContent = targetFile.content;
        }

        const res = await api.ca.signXml(payload);
        if (res.ok) {
          successCount++;
          setFiles(prev => prev.map(f => f.id === targetFile.id ? {
            ...f,
            status: 'success',
            signedXml: res.signedXml,
            signedPath: res.outputPath,
            signedAt: new Date().toLocaleTimeString('vi-VN')
          } : f));
        } else {
          failCount++;
          setFiles(prev => prev.map(f => f.id === targetFile.id ? {
            ...f,
            status: 'error',
            error: res.error || 'Lỗi không xác định khi ký'
          } : f));
        }
      } catch (err: any) {
        failCount++;
        setFiles(prev => prev.map(f => f.id === targetFile.id ? {
          ...f,
          status: 'error',
          error: err?.message || String(err)
        } : f));
      }
    }

    setIsSigning(false);
    stopGlobalLoading('ca-sign');

    if (failCount === 0) {
      showToast.success(`Ký số thành công toàn bộ ${successCount} tệp XML!`);
    } else {
      showToast.warning(`Đã ký xong: ${successCount} thành công, ${failCount} tệp lỗi. Vui lòng kiểm tra mã PIN hoặc kết nối USB Token.`);
    }
  };

  // ── 4. Tải về hoặc lưu tệp đã ký ──────────────────────────────────────────
  const handleDownloadSingle = async (fileItem: XmlFileToSign) => {
    if (!fileItem.signedXml) {
      if (fileItem.signedPath) {
        showToast.info(`Tệp đã lưu tại: ${fileItem.signedPath}`);
      }
      return;
    }
    const blob = new Blob([fileItem.signedXml], { type: 'application/xml;charset=utf-8;' });
    const downloadName = fileItem.name.replace(/\.xml$/i, '_signed.xml');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast.success(`Đã tải về: ${downloadName}`);
  };

  const handleDownloadAllZip = async () => {
    const signedFiles = files.filter(f => f.status === 'success' && f.signedXml);
    if (signedFiles.length === 0) {
      showToast.warning('Chưa có tệp XML nào được ký hoàn tất để tải về!');
      return;
    }

    startGlobalLoading('ca-zip', 'Đang nén các tệp XML đã ký thành file .zip...');
    try {
      const zip = new JSZip();
      for (const f of signedFiles) {
        zip.file(f.name.replace(/\.xml$/i, '_signed.xml'), f.signedXml!);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DMH_HoSo_DaKy_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast.success(`Đã xuất file nén chứa ${signedFiles.length} tệp XML đã ký!`);
    } catch (err: any) {
      showToast.error('Lỗi khi nén file zip: ' + (err?.message || err));
    } finally {
      stopGlobalLoading('ca-zip');
    }
  };

  // ── 5. Xác thực chữ ký XML (Verify XML Signature) ─────────────────────────
  const handleVerifyFileSelect = async (f: File) => {
    setVerifyFile(f);
    setVerifyResult(null);
    startGlobalLoading('ca-verify', `Đang kiểm tra chữ ký số tệp ${f.name}...`);

    try {
      const api = eAPI();
      let result: any = null;
      if (api?.ca?.verifyXml) {
        const fp = (f as any).path || '';
        if (fp) {
          const res = await api.ca.verifyXml({ filePath: fp });
          if (res.ok) result = res.result;
        } else {
          const content = await f.text();
          const res = await api.ca.verifyXml({ xmlContent: content });
          if (res.ok) result = res.result;
        }
      }

      if (!result) {
        const text = await f.text();
        const hasSig = text.includes('<Signature') || text.includes('<ds:Signature') || text.includes('<signature');
        result = {
          isSigned: hasSig,
          isValid: hasSig,
          subject: hasSig ? 'Đã tìm thấy chữ ký số chuẩn XMLDSig' : 'Chưa ký',
          message: hasSig ? 'Tệp XML có thẻ chữ ký số XMLDSig' : 'Tệp chưa được ký số'
        };
      }

      setVerifyResult(result);
      if (result.isSigned && result.isValid) {
        showToast.success('Chữ ký số HỢP LỆ! Dữ liệu hồ sơ vẹn toàn.');
      } else if (result.isSigned && !result.isValid) {
        showToast.error('CẢNH BÁO: Chữ ký không hợp lệ hoặc hồ sơ đã bị sửa đổi!');
      } else {
        showToast.info('Tệp XML này chưa có chữ ký số.');
      }
    } catch (err: any) {
      showToast.error('Lỗi xác thực XML: ' + (err?.message || err));
    } finally {
      stopGlobalLoading('ca-verify');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const selectedCert = certificates.find(c => c.Thumbprint === selectedThumbprint);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', height: '100%', overflow: 'auto' }}>
      
      {/* ── HEADER THANH CÔNG CỤ ── */}
      <div style={{
        background: 'white', borderRadius: 12, padding: '1rem 1.25rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', padding: 10, borderRadius: 12, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
            <FileSignature color="white" size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>
                Ký Số XML & Hồ Sơ Y Tế
              </h2>
              <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                Chuẩn QĐ 130 & QĐ 3176 BYT
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Tích hợp USB Token CA (VNPT, Viettel, BKAV, FPT...), ký hàng loạt & kiểm tra tính toàn vẹn chữ ký số
            </p>
          </div>
        </div>

        {/* Chuyển đổi tab: Ký số vs Xác thực chữ ký */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, gap: 4 }}>
          <button
            onClick={() => setViewMode('sign')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: viewMode === 'sign' ? 'white' : 'transparent',
              color: viewMode === 'sign' ? '#4f46e5' : '#64748b',
              boxShadow: viewMode === 'sign' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            <FileSignature size={15} /> Ký Số Hồ Sơ ({files.length})
          </button>
          <button
            onClick={() => setViewMode('verify')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: viewMode === 'verify' ? 'white' : 'transparent',
              color: viewMode === 'verify' ? '#4f46e5' : '#64748b',
              boxShadow: viewMode === 'verify' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            <ShieldCheck size={15} /> Kiểm Tra / Xác Thực Chữ Ký
          </button>
        </div>
      </div>

      {/* ── CHẾ ĐỘ 1: KÝ SỐ HỒ SƠ XML ── */}
      {viewMode === 'sign' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', flex: 1, minHeight: 0 }}>
          
          {/* Cột trái: Cấu hình USB Token & Chứng thư số */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Thẻ Quản lý USB Token / CA Store */}
            <div style={{ background: 'white', borderRadius: 12, padding: '1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                  <Key size={16} color="#4f46e5" />
                  <span>Chứng Thư Số / USB Token</span>
                </div>
                <button
                  onClick={() => loadCertificates(false)}
                  disabled={isLoadingCerts}
                  title="Quét lại USB Token & Certificate Store"
                  style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                    padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.75rem', color: '#475569'
                  }}
                >
                  <RefreshCw size={13} className={isLoadingCerts ? 'spin' : ''} />
                  <span>Quét lại</span>
                </button>
              </div>

              {certificates.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    Chọn chứng thư số ký tài liệu:
                  </label>
                  <select
                    value={selectedThumbprint}
                    onChange={(e) => setSelectedThumbprint(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 10px', borderRadius: 8,
                      border: '1.5px solid #cbd5e1', fontSize: '0.82rem',
                      outline: 'none', background: '#f8fafc', fontWeight: 500
                    }}
                  >
                    {certificates.map((cert) => (
                      <option key={cert.Thumbprint} value={cert.Thumbprint}>
                        {cert.FriendlyName || cert.Subject.split(',')[0].replace('CN=', '')} ({cert.Issuer.split(',')[0].replace('CN=', '')})
                      </option>
                    ))}
                  </select>

                  {/* Chi tiết chứng thư được chọn */}
                  {selectedCert && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 8, padding: '10px 12px', fontSize: '0.78rem',
                      display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4
                    }}>
                      <div>
                        <b style={{ color: '#334155' }}>Chủ thể (CN):</b>
                        <div style={{ color: '#0f172a', wordBreak: 'break-word', fontWeight: 600 }}>
                          {selectedCert.Subject}
                        </div>
                      </div>
                      <div>
                        <b style={{ color: '#334155' }}>Nhà cấp (CA):</b>
                        <div style={{ color: '#4f46e5', fontWeight: 600 }}>
                          {selectedCert.Issuer.split(',')[0].replace('CN=', '')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <b style={{ color: '#334155' }}>Hạn dùng:</b>
                          <div style={{ color: '#16a34a', fontWeight: 600 }}>{selectedCert.NotAfter.split(' ')[0]}</div>
                        </div>
                        <div>
                          <b style={{ color: '#334155' }}>Khóa riêng:</b>
                          <div style={{ color: selectedCert.HasPrivateKey ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            {selectedCert.HasPrivateKey ? 'Sẵn sàng' : 'Không có'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: '14px', borderRadius: 8, background: '#fef2f2',
                  border: '1px dashed #fca5a5', textAlign: 'center'
                }}>
                  <AlertTriangle size={24} color="#ef4444" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#991b1b' }}>
                    Chưa phát hiện USB Token
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 4 }}>
                    Vui lòng cắm USB Token vào cổng USB và mở ứng dụng quản lý Token để nạp chứng thư số.
                  </div>
                  <button
                    onClick={() => loadCertificates(false)}
                    style={{
                      marginTop: 10, padding: '5px 12px', borderRadius: 6,
                      border: 'none', background: '#ef4444', color: 'white',
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Kiểm tra lại
                  </button>
                </div>
              )}
            </div>

            {/* Thẻ Cấu hình Thẻ Ký XML */}
            <div style={{ background: 'white', borderRadius: 12, padding: '1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
                <Settings size={16} color="#4f46e5" />
                <span>Cấu Hình Thẻ Ký XML</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                    Vị trí chèn thẻ Signature:
                  </label>
                  <select
                    value={targetTag}
                    onChange={(e) => setTargetTag(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8,
                      border: '1.5px solid #cbd5e1', fontSize: '0.82rem',
                      outline: 'none', background: '#f8fafc'
                    }}
                  >
                    <option value="CHUKYDONVI">&lt;CHUKYDONVI&gt; (Chuẩn QĐ 130 & 3176 BYT)</option>
                    <option value="CHUKYBACSI">&lt;CHUKYBACSI&gt; (Chữ ký Bác sĩ điều trị)</option>
                    <option value="ROOT">Gốc tài liệu (Enveloped Root)</option>
                  </select>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4, background: '#f1f5f9', padding: 8, borderRadius: 6 }}>
                  💡 Chuẩn Quyết định 130/QĐ-BYT quy định chữ ký số cơ sở khám chữa bệnh được đính kèm bên trong thẻ <code>&lt;CHUKYDONVI&gt;</code>.
                </div>
              </div>
            </div>

            {/* Thẻ Thống kê danh sách */}
            <div style={{ background: 'white', borderRadius: 12, padding: '1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                <Layers size={16} color="#4f46e5" />
                <span>Tiến Độ Ký</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center' }}>
                <div style={{ background: '#f0fdf4', padding: '10px 8px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>
                    {files.filter(f => f.status === 'success').length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>Đã ký thành công</div>
                </div>
                <div style={{ background: '#fef2f2', padding: '10px 8px', borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>
                    {files.filter(f => f.status === 'error').length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 }}>Tệp lỗi</div>
                </div>
              </div>
            </div>

          </div>

          {/* Cột phải: Danh sách tệp XML & Thao tác ký */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
            
            <div style={{
              background: 'white', borderRadius: 12, padding: '1.2rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flex: 1, display: 'flex',
              flexDirection: 'column', minHeight: 0
            }}>
              
              {/* Header danh sách tệp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    Danh Sách Tệp XML Chờ Ký ({files.length})
                  </h3>
                  {files.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Tổng dung lượng: {formatSize(files.reduce((acc, f) => acc + f.size, 0))}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".xml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) addXmlFilesFromList(Array.from(e.target.files));
                    }}
                  />
                  <button
                    onClick={() => setFiles([])}
                    disabled={files.length === 0 || isSigning}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                      background: 'white', fontSize: '0.8rem', color: '#64748b', cursor: files.length > 0 ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500
                    }}
                  >
                    <Trash2 size={14} /> Xóa hết
                  </button>
                  <button
                    onClick={handleSelectFilesDialog}
                    disabled={isSigning}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none',
                      background: '#4f46e5', color: 'white', fontSize: '0.8rem',
                      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 2px 6px rgba(79,70,229,0.3)'
                    }}
                  >
                    <FileCode2 size={15} /> Thêm Tệp XML
                  </button>
                </div>
              </div>

              {/* Khu vực Bảng Danh Sách / Vùng Thả Tệp */}
              {files.length === 0 ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDropFiles}
                  onClick={handleSelectFilesDialog}
                  style={{
                    flex: 1, border: `2px dashed ${dragOver ? '#4f46e5' : '#cbd5e1'}`,
                    borderRadius: 12, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', minHeight: 240,
                    background: dragOver ? '#eef2ff' : '#f8fafc', cursor: 'pointer',
                    transition: 'all 0.2s', padding: 20
                  }}
                >
                  <UploadCloud size={48} color={dragOver ? '#4f46e5' : '#94a3b8'} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#334155' }}>
                    Kéo thả các tệp XML vào đây hoặc bấm để chọn tệp
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                    Hỗ trợ XML hồ sơ QĐ 130 (XML1 - XML12), CV 4210, QĐ 3176, hồ sơ giám định BHYT...
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 220 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '10px 12px', width: 40 }}>STT</th>
                        <th style={{ padding: '10px 12px' }}>Tên Tệp XML</th>
                        <th style={{ padding: '10px 12px', width: 100 }}>Dung Lượng</th>
                        <th style={{ padding: '10px 12px', width: 140 }}>Trạng Thái</th>
                        <th style={{ padding: '10px 12px', width: 140, textAlign: 'center' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f, idx) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: f.status === 'signing' ? '#eef2ff' : 'transparent' }}>
                          <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FileCode2 size={16} color="#6366f1" />
                              <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                                {f.name}
                              </span>
                            </div>
                            {f.error && (
                              <div style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 2, fontWeight: 500 }}>
                                ⚠ {f.error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '9px 12px', color: '#64748b' }}>{formatSize(f.size)}</td>
                          <td style={{ padding: '9px 12px' }}>
                            {f.status === 'idle' && (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 }}>
                                Chờ ký
                              </span>
                            )}
                            {f.status === 'signing' && (
                              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                                <RefreshCw size={12} className="spin" /> Đang ký...
                              </span>
                            )}
                            {f.status === 'success' && (
                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                                <CheckCircle2 size={12} /> Đã ký ({f.signedAt})
                              </span>
                            )}
                            {f.status === 'error' && (
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                                <ShieldAlert size={12} /> Thất bại
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              {f.status === 'success' && (
                                <button
                                  onClick={() => handleDownloadSingle(f)}
                                  title="Tải tệp XML đã ký"
                                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: 4, borderRadius: 6, cursor: 'pointer' }}
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setPreviewFile({ name: f.name, content: f.signedXml || f.content || '' })}
                                title="Xem nội dung XML"
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', padding: 4, borderRadius: 6, cursor: 'pointer' }}
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={() => setFiles(prev => prev.filter(item => item.id !== f.id))}
                                disabled={isSigning}
                                title="Xóa khỏi danh sách"
                                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: 4, borderRadius: 6, cursor: 'pointer' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tiến độ và Nút Hành Động Ký Số */}
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                {isSigning ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                    <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(signProgress.current / (signProgress.total || 1)) * 100}%`,
                        background: '#4f46e5', transition: 'width 0.3s'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4f46e5' }}>
                      {signProgress.current}/{signProgress.total} ({Math.round((signProgress.current / (signProgress.total || 1)) * 100)}%)
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {files.filter(f => f.status === 'success').length > 0 && (
                      <button
                        onClick={handleDownloadAllZip}
                        style={{
                          padding: '8px 16px', borderRadius: 8, border: '1.5px solid #16a34a',
                          background: '#f0fdf4', color: '#16a34a', fontSize: '0.85rem', fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <Download size={16} /> Tải Về Tất Cả (.zip)
                      </button>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleStartSigning}
                    disabled={files.length === 0 || isSigning || !selectedThumbprint}
                    style={{
                      padding: '10px 28px', borderRadius: 8, border: 'none',
                      background: files.length > 0 && !isSigning && selectedThumbprint ? '#4f46e5' : '#cbd5e1',
                      color: 'white', fontSize: '0.92rem', fontWeight: 700,
                      cursor: files.length > 0 && !isSigning && selectedThumbprint ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: files.length > 0 && !isSigning && selectedThumbprint ? '0 4px 12px rgba(79,70,229,0.35)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isSigning ? (
                      <><RefreshCw size={18} className="spin" /> ĐANG KÝ SỐ...</>
                    ) : (
                      <><Play size={18} fill="currentColor" /> BẮT ĐẦU KÝ SỐ</>
                    )}
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ── CHẾ ĐỘ 2: KIỂM TRA & XÁC THỰC CHỮ KÝ SỐ (VERIFY XML) ── */}
      {viewMode === 'verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0 }}>
          
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              Kiểm Tra Tính Toàn Vẹn & Tính Hợp Lệ Của Chữ Ký Số XML
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748b' }}>
              Kéo thả hoặc tải lên tệp XML đã ký để hệ thống tự động bóc tách chứng thư số, xác minh thuật toán băm (Digest) và kiểm tra dữ liệu có bị chỉnh sửa sau khi ký hay không.
            </p>

            <input
              type="file"
              ref={verifyInputRef}
              accept=".xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleVerifyFileSelect(e.target.files[0]);
              }}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setVerifyDragOver(true); }}
              onDragLeave={() => setVerifyDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setVerifyDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handleVerifyFileSelect(e.dataTransfer.files[0]);
              }}
              onClick={() => verifyInputRef.current?.click()}
              style={{
                border: `2px dashed ${verifyDragOver ? '#4f46e5' : '#cbd5e1'}`,
                borderRadius: 12, padding: '2.5rem 1.5rem', textAlign: 'center',
                background: verifyDragOver ? '#eef2ff' : '#f8fafc', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <FileCheck size={48} color={verifyDragOver ? '#4f46e5' : '#94a3b8'} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                {verifyFile ? verifyFile.name : 'Bấm vào đây hoặc Kéo thả tệp XML cần xác thực chữ ký'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                Hỗ trợ tệp XML QĐ 130, XML 3176, CV 4210 có gắn chữ ký số XMLDSig
              </div>
            </div>
          </div>

          {/* Hiển thị kết quả thẩm tra chữ ký */}
          {verifyResult && (
            <div style={{
              background: 'white', borderRadius: 12, padding: '1.5rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              border: `1.5px solid ${verifyResult.isValid ? '#86efac' : verifyResult.isSigned ? '#fca5a5' : '#e2e8f0'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                {verifyResult.isValid ? (
                  <div style={{ background: '#dcfce7', padding: 10, borderRadius: '50%' }}>
                    <ShieldCheck size={28} color="#16a34a" />
                  </div>
                ) : verifyResult.isSigned ? (
                  <div style={{ background: '#fee2e2', padding: 10, borderRadius: '50%' }}>
                    <ShieldAlert size={28} color="#dc2626" />
                  </div>
                ) : (
                  <div style={{ background: '#f1f5f9', padding: 10, borderRadius: '50%' }}>
                    <AlertTriangle size={28} color="#64748b" />
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: verifyResult.isValid ? '#15803d' : verifyResult.isSigned ? '#b91c1c' : '#475569' }}>
                    {verifyResult.isValid ? 'CHỮ KÝ SỐ HỢP LỆ VÀ NGUYÊN VẸN' : verifyResult.isSigned ? 'CẢNH BÁO: CHỮ KÝ SỐ KHÔNG HỢP LỆ HOẶC ĐÃ BỊ SỬA ĐỔI' : 'TỆP XML CHƯA ĐƯỢC KÝ SỐ'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                    {verifyResult.message}
                  </div>
                </div>
              </div>

              {verifyResult.isSigned && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12, background: '#f8fafc', padding: 16, borderRadius: 10, border: '1px solid #e2e8f0'
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CHỦ THỂ KÝ (SUBJECT)</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', marginTop: 3 }}>
                      {verifyResult.subject || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>NHÀ CUNG CẤP CHỨNG THỰC (CA)</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4f46e5', marginTop: 3 }}>
                      {verifyResult.issuer || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>SỐ SERIAL CHỨNG THƯ</div>
                    <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#334155', marginTop: 3 }}>
                      {verifyResult.serialNumber || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>HẠN SỬ DỤNG CHỨNG THƯ</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#16a34a', marginTop: 3 }}>
                      {verifyResult.validTo || '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── MODAL XEM TRƯỚC XML ── */}
      {previewFile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999, padding: 20
        }}>
          <div style={{
            background: 'white', borderRadius: 12, width: '80%', maxWidth: 900,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCode2 size={18} color="#4f46e5" />
                <span>Nội dung XML: {previewFile.name}</span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={{ flex: 1, padding: 16, overflow: 'auto', background: '#0f172a', color: '#e2e8f0' }}>
              <pre style={{ margin: 0, fontSize: '0.78rem', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {previewFile.content || 'Tệp chưa có nội dung hoặc đang đọc từ đường dẫn hệ thống.'}
              </pre>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                onClick={() => setPreviewFile(null)}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

