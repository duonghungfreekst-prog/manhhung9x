import React, { useState } from 'react';
import { 
  ShieldCheck, FileSignature, Cloud, 
  Layers, Settings,
  Play, FileCode2, Trash2
} from 'lucide-react';
import { showToast } from '../utils/notificationSystem';

type SignMode = 'card' | 'cloud' | 'batch';

export function SignatureTab() {
  const [mode, setMode] = useState<SignMode>('card');
  
  const pk = '#6366f1';
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 10,
    padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,.08)',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem', background:'#f8fafc', height:'100%', overflow:'auto' }}>
      
      {/* Header */}
      <div style={{ ...card, display:'flex', alignItems:'center', gap:15 }}>
        <div style={{ background:pk, padding:10, borderRadius:12 }}>
          <FileSignature color="white" size={24} />
        </div>
        <div>
          <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:700 }}>Ký Số XML & Hồ Sơ</h2>
          <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b' }}>Hỗ trợ CA Token (USB), eSign Cloud & Ký hàng loạt</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'1rem' }}>
        
        {/* Left: Mode Selection */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={card}>
            <h3 style={{ fontSize:'0.88rem', fontWeight:600, marginBottom:12 }}>Phương thức ký</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { id: 'card', label: 'USB Token (CA Card)', icon: <Layers size={16}/> },
                { id: 'cloud', label: 'eSign Cloud / Remote', icon: <Cloud size={16}/> },
                { id: 'batch', label: 'Ký hàng loạt (Batch)', icon: <ShieldCheck size={16}/> },
              ].map(m => (
                <button 
                  key={m.id}
                  onClick={() => setMode(m.id as SignMode)}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                    borderRadius:8, border:'none', cursor:'pointer', textAlign:'left',
                    fontSize:'0.85rem', fontWeight:mode === m.id ? 600 : 400,
                    background: mode === m.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                    color: mode === m.id ? pk : '#64748b',
                    transition: 'all 0.2s'
                  }}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ fontSize:'0.88rem', fontWeight:600, marginBottom:12 }}>Cấu hình</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:'0.78rem', color:'#64748b' }}>Nhà cung cấp CA:</div>
              <select style={{ padding:8, borderRadius:6, border:'1px solid #e2e8f0', fontSize:'0.82rem' }}>
                <option>VNPT-CA</option>
                <option>Viettel-CA</option>
                <option>BKAV-CA</option>
                <option>FPT-CA</option>
              </select>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.82rem', cursor:'pointer', marginTop:5 }}>
                <input type="checkbox" defaultChecked /> Tự động nén XML sau ký
              </label>
            </div>
          </div>
        </div>

        {/* Right: File List & Action */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          
          <div style={{ ...card, flex:1, display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15 }}>
              <h3 style={{ fontSize:'0.88rem', fontWeight:600, margin:0 }}>Danh sách tệp chờ ký</h3>
              <div style={{ display:'flex', gap:8 }}>
                <button 
                  onClick={() => showToast.info('Danh sách tệp đã trống')}
                  style={{ padding:'6px 12px', borderRadius:6, border:'1px solid #e2e8f0', background:'white', fontSize:'0.82rem', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                >
                  <Trash2 size={14}/> Xóa hết
                </button>
                <button 
                  onClick={() => showToast.info('Vui lòng kéo thả tệp XML hồ sơ vào khung bên dưới')}
                  style={{ padding:'6px 15px', borderRadius:6, border:'none', background:pk, color:'white', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                >
                  <FileCode2 size={14}/> Thêm tệp XML
                </button>
              </div>
            </div>

            <div style={{ flex:1, border:'2px dashed #e2e8f0', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', minHeight:200 }}>
              <div style={{ textAlign:'center', color:'#94a3b8' }}>
                <FileCode2 size={40} strokeWidth={1} style={{ marginBottom:10, opacity:0.5 }} />
                <div style={{ fontSize:'0.85rem' }}>Kéo thả file XML vào đây hoặc bấm Thêm tệp</div>
                <div style={{ fontSize:'0.75rem', marginTop:5 }}>Hỗ trợ ký XML hồ sơ 4210, 79/80, 130...</div>
              </div>
            </div>

            <div style={{ marginTop:20, display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button 
                onClick={() => showToast.info('Đang kiểm tra kết nối USB Token / Cloud CA...')}
                style={{ padding:'10px 24px', borderRadius:8, border:`1.5px solid ${pk}`, background:'white', color:pk, fontSize:'0.9rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
              >
                <Settings size={18}/> Kiểm tra kết nối CA
              </button>
              <button 
                onClick={() => showToast.warning('Chưa có tệp XML nào trong danh sách chờ ký!')}
                style={{ padding:'10px 30px', borderRadius:8, border:'none', background:pk, color:'white', fontSize:'0.9rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 4px 12px rgba(99,102,241,0.3)' }}
              >
                <Play size={18} fill="currentColor"/> BẮT ĐẦU KÝ SỐ
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
