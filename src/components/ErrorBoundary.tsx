import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTab?: () => void;
  inline?: boolean;
  tabTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CRASH_GUARD] Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
    if (this.props.fallbackTab) {
      this.props.fallbackTab();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div style={{
            margin: '28px auto',
            maxWidth: 640,
            padding: '24px 28px',
            background: '#ffffff',
            borderRadius: 14,
            border: '1.5px solid #fee2e2',
            boxShadow: '0 8px 24px -4px rgba(239, 68, 68, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#fef2f2', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12
            }}>
              <ShieldAlert size={28} color="#dc2626" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#991b1b' }}>
              Phân Hệ {this.props.tabTitle ? `"${this.props.tabTitle}"` : ''} Gặp Sự Cố Bất Ngờ
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Hệ thống đã tự động cách ly lỗi để bảo vệ an toàn cho các phân hệ khác và toàn bộ dữ liệu đang làm việc.
            </p>
            <div style={{
              background: '#fef2f2', borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: '#991b1b', fontFamily: 'monospace',
              marginBottom: 20, textAlign: 'left', wordBreak: 'break-word',
              border: '1px solid #fecaca'
            }}>
              ⚠️ Chi tiết lỗi: {this.state.error?.message || 'Lỗi hiển thị giao diện không xác định'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '8px 18px', borderRadius: 8, background: '#1d4ed8',
                  color: 'white', border: 'none', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)'
                }}
              >
                <RefreshCw size={14} /> Thử Tải Lại Phân Hệ
              </button>
              {this.props.fallbackTab && (
                <button
                  onClick={this.props.fallbackTab}
                  style={{
                    padding: '8px 18px', borderRadius: 8, background: '#f1f5f9',
                    color: '#334155', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                  }}
                >
                  <Home size={14} /> Chuyển Về Đối Chiếu
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f8fafc',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: 600,
            width: '100%',
            background: '#ffffff',
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #fee2e2',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)',
              padding: '24px 28px',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  padding: 10,
                  background: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ShieldAlert size={28} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                    Hệ Thống Phục Hồi An Toàn (Crash Guard)
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#fecaca', opacity: 0.9 }}>
                    Đã ngăn chặn thành công lỗi gián đoạn giao diện của DMH Tools
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 28 }}>
              <div style={{
                background: '#fef2f2',
                borderRadius: 10,
                padding: 16,
                border: '1px solid #fecaca',
                marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>
                      Thông Báo Sự Cố:
                    </div>
                    <div style={{ fontSize: 12.5, color: '#7f1d1d', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                      {this.state.error?.message || 'Lỗi hiển thị thành phần giao diện không xác định'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
                Hệ sinh thái DMH Tools được trang bị cơ chế tự bảo vệ dữ liệu. Mọi thông tin bệnh nhân nội soi, kết quả đối chiếu BHYT và cấu hình hệ thống của bạn đã được bảo toàn an toàn trên đĩa cứng.
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={this.handleReset}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '11px 18px',
                    borderRadius: 8,
                    background: '#1d4ed8',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 6px -1px rgba(29, 78, 216, 0.3)'
                  }}
                >
                  <Home size={16} /> Quay Lại Trang Chính
                </button>

                <button
                  onClick={this.handleReload}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '11px 18px',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <RefreshCw size={16} /> Khởi Động Lại Ứng Dụng
                </button>
              </div>

              {this.state.errorInfo && (
                <details style={{ marginTop: 24, fontSize: 11, color: '#94a3b8' }}>
                  <summary style={{ cursor: 'pointer', marginBottom: 8, fontWeight: 600 }}>
                    Chi tiết kỹ thuật dành cho lập trình viên (StackTrace)
                  </summary>
                  <pre style={{
                    padding: 12,
                    background: '#0f172a',
                    color: '#38bdf8',
                    borderRadius: 8,
                    overflowX: 'auto',
                    maxHeight: 180,
                    fontSize: 11
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
