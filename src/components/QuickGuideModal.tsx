import { useEffect } from 'react';
import {
  BookOpen, X, CheckCircle2, ShieldCheck, Camera, Printer,
  Volume2, ArrowRight, Sparkles
} from 'lucide-react';

interface Props {
  onClose: () => void;
  onOpenTab: (tab: any) => void;
}

export function QuickGuideModal({ onClose, onOpenTab }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const steps = [
    {
      step: 'Bước 1',
      title: 'Thiết Lập Cơ Sở Y Tế & Màn Hình Gọi Số TV (HIS)',
      desc: 'Cấu hình thông tin phòng khám, kết nối loa phát thanh gọi bệnh nhân và màn hình TV phòng chờ.',
      icon: <Volume2 size={24} color="#10b981" />,
      color: '#10b981',
      bgLight: '#ecfdf5',
      tabTarget: 'hiscall',
      tabName: 'Gọi Bệnh Nhân & TV',
      points: [
        'Nhập danh sách bệnh nhân từ phần mềm HIS hoặc file Excel phòng khám.',
        'Mở Màn hình chờ TV phụ chiếu ra phòng chờ với giao diện Full HD chuẩn Bộ Y tế.',
        'Hệ thống tự động phát âm thanh giọng đọc tiếng Việt chuẩn (Bắc/Nam) gọi số vào phòng khám.',
      ],
    },
    {
      step: 'Bước 2',
      title: 'Đối Chiếu BHYT Chống Xuất Toán & Trạm Nội Soi AI 4K',
      desc: 'Chụp hình nội soi chuẩn y khoa không độ trễ và đối chiếu file XML cổng giám định.',
      icon: <Camera size={24} color="#ec4899" />,
      color: '#ec4899',
      bgLight: '#fdf2f8',
      tabTarget: 'endoscopy',
      tabName: 'Nội Soi AI 4K',
      points: [
        'Chụp ảnh nội soi siêu tốc (<20ms), nhận diện cóc đạp qua cáp HDMI (AI Trigger) & bàn đạp chân USB PC (F8/F9).',
        'Bộ lọc AI khử nhiễu, cân bằng sáng và đo lường kích thước tổn thương chính xác.',
        'Đối chiếu tự động file XML Cổng Giám Định với bảng kê 01/BH nội bộ, phát hiện lệch từng đồng.',
      ],
    },
    {
      step: 'Bước 3',
      title: 'Cứu Hộ Máy In LAN & Tối Ưu Tốc Độ Windows PC',
      desc: 'Khắc phục triệt để lỗi máy in chia sẻ mạng LAN và dọn rác tăng tốc máy trạm bác sĩ.',
      icon: <Printer size={24} color="#0284c7" />,
      color: '#0284c7',
      bgLight: '#f0f9ff',
      tabTarget: 'printer',
      tabName: 'Cứu Hộ Máy In & PC Tools',
      points: [
        'Khắc phục 1-Click các mã lỗi kinh điển 0x0000011b, 0x00000709 khi chia sẻ máy in qua mạng nội bộ.',
        'Xóa sạch hàng đợi in kẹt (Spooler Crash), tự động khởi động lại dịch vụ in ấn tức thì.',
        'Bộ công cụ PC Tools dọn dẹp RAM, cache rác hệ thống, giúp máy trạm chạy mượt mà cả ngày.',
      ],
    },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
      zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, width: '95%', maxWidth: 780,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(14,165,233,0.3)',
            }}>
              <BookOpen size={24} color="white" />
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: -0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
                Hướng Dẫn Nhanh 3 Bước
                <span style={{
                  fontSize: '0.72rem', background: '#3b82f6', color: 'white',
                  padding: '2px 8px', borderRadius: 12, fontWeight: 700,
                }}>
                  ONBOARDING
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 2 }}>
                Làm quen và khai thác trọn vẹn sức mạnh bộ giải pháp y tế DMH Tools
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#cbd5e1', transition: 'all 0.2s',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Release v6.6.0 Milestone Banner */}
          <div style={{
            borderRadius: 14, padding: '16px 20px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1.5px solid #93c5fd', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#2563eb" />
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e40af' }}>
                  Điểm Mới Nổi Bật Trong Bản Phát Hành v6.6.0
                </span>
              </div>
              <span style={{
                background: '#2563eb', color: 'white', padding: '2px 8px',
                borderRadius: 10, fontSize: '0.72rem', fontWeight: 700,
              }}>
                MILESTONE
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem', color: '#1e3a8a' }}>
              <div>🔒 <strong>Khóa HWID:</strong> Bảo vệ bản quyền theo bo mạch & CPU.</div>
              <div>⏱ <strong>Smart Trial 3 Ngày:</strong> Trải nghiệm Full tính năng tự động.</div>
              <div>🛡 <strong>Crash Guard:</strong> Chống sập trắng màn hình, bảo toàn dữ liệu y tế.</div>
              <div>🏥 <strong>Thương hiệu DMH:</strong> Nhận diện bản quyền mặc định cố định.</div>
            </div>
          </div>

          {steps.map((s, idx) => (
            <div
              key={idx}
              style={{
                borderRadius: 14, border: '1px solid #e2e8f0',
                padding: '18px 20px', background: '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: s.bgLight, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, color: s.color,
                      background: s.bgLight, padding: '2px 8px', borderRadius: 6,
                    }}>
                      {s.step}
                    </span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                      {s.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    {s.desc}
                  </p>
                </div>
              </div>

              <div style={{
                background: '#f8fafc', borderRadius: 10, padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {s.points.map((pt, pIdx) => (
                  <div key={pIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <CheckCircle2 size={16} color={s.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.45 }}>{pt}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    onOpenTab(s.tabTarget);
                    onClose();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 8, border: `1px solid ${s.color}`,
                    background: 'transparent', color: s.color, fontWeight: 700,
                    fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  Mở tab {s.tabName} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Banner hỗ trợ kỹ thuật */}
          <div style={{
            borderRadius: 14, padding: '16px 20px',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <ShieldCheck size={28} color="#16a34a" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>
                Cần hỗ trợ kỹ thuật hoặc kích hoạt bản quyền phòng khám?
              </div>
              <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: 2 }}>
                Đội ngũ kỹ sư DMH luôn sẵn sàng hỗ trợ trực tiếp qua UltraViewer / AnyDesk / Zalo.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            DMH Tools Suite · Phiên bản thương mại v6.6.0
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #0f172a, #334155)',
              color: 'white', fontWeight: 700, fontSize: '0.88rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            Đã Hiểu & Bắt Đầu Ngay
          </button>
        </div>
      </div>
    </div>
  );
}
