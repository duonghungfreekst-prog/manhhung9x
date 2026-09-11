import { useState, useEffect } from 'react';
import { ShieldCheck, UploadCloud, FileSpreadsheet, Activity, Server, AlertCircle } from 'lucide-react';

export function DcbhytTab() {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serverStatus, setServerStatus] = useState<'stopped'|'starting'|'running'|'error'>('stopped');
  const [serverPort, setServerPort] = useState<number>(27183);
  const [dragActive, setDragActive] = useState(false);
  
  // Data state
  const [patients, setPatients] = useState<any[]>([]);
  const [metaInfo, setMetaInfo] = useState<{macskcb: string, ngaylap: string, sheet_count: number}>({macskcb: '', ngaylap: '', sheet_count: 0});

  const pk = '#10b981'; // Green theme

  const log = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    const initServer = async () => {
      setServerStatus('starting');
      log('Đang khởi động server XML3176...');
      try {
        const res = await (window as any).electronAPI.startXml3176Server();
        if (res.ok) {
          setServerStatus('running');
          setServerPort(res.port);
          log(`Server chạy tại port ${res.port}`);
        } else {
          setServerStatus('error');
          log(`Lỗi khởi động server: ${res.error}`);
        }
      } catch (e) {
        setServerStatus('error');
        log(`Lỗi kết nối IPC: ${e}`);
      }
    };
    initServer();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.xml')) {
        setXmlFile(file);
      } else {
        alert("Vui lòng chọn file .xml");
      }
    }
  };

  const processXml = async (file: File) => {
    setIsProcessing(true);
    setPatients([]);
    setMetaInfo({macskcb: '', ngaylap: '', sheet_count: 0});
    log(`Bắt đầu xử lý: ${file.name}`);
    
    try {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/xml3176/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml_base64: b64, filename: file.name })
      });
      const data = await res.json();
      
      if (data.ok) {
        setPatients(data.patients || []);
        setMetaInfo({
          macskcb: data.macskcb,
          ngaylap: data.ngaylap,
          sheet_count: data.sheet_count
        });
        log(`Đã phân tích thành công ${data.patients?.length || 0} hồ sơ.`);
      } else {
        log(`Lỗi phân tích: ${data.error}`);
      }
    } catch (e) {
      log(`Lỗi kết nối API: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = async () => {
    if (!xmlFile) return;
    setIsProcessing(true);
    log('Đang tạo file Excel...');
    try {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(xmlFile);
      });

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/xml3176/to-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml_base64: b64, filename: xmlFile.name })
      });
      const data = await res.json();
      
      if (data.ok && data.excel_base64) {
        // Download file
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.excel_base64}`;
        link.download = data.filename || 'export.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log(`Đã xuất Excel: ${data.filename}`);
      } else {
        log(`Lỗi xuất Excel: ${data.error}`);
      }
    } catch (e) {
      log(`Lỗi kết nối API: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '1rem', background: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ background: pk, padding: 10, borderRadius: 12 }}>
            <ShieldCheck color="white" size={24} />
          </div>
          <div>
            <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:700 }}>Đối Chiếu 01BH (XML 3176)</h2>
            <p style={{ margin:0, fontSize:'0.82rem', color:'#64748b' }}>Hệ thống tích hợp chuẩn QĐ 3176</p>
          </div>
        </div>
        
        {/* Server Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', padding: '6px 12px', background: serverStatus === 'running' ? '#dcfce7' : '#fee2e2', color: serverStatus === 'running' ? '#166534' : '#991b1b', borderRadius: 20 }}>
          {serverStatus === 'running' ? <Server size={16} /> : <AlertCircle size={16} />}
          <b>Server: {serverStatus === 'running' ? `Online (Port ${serverPort})` : serverStatus === 'starting' ? 'Đang khởi động...' : 'Offline'}</b>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
          
          {/* Upload Area */}
          <div 
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
            style={{ 
              background: dragActive ? '#f0fdf4' : 'white', 
              border: `2px dashed ${dragActive ? pk : '#cbd5e1'}`, 
              borderRadius: 10, padding: '2rem', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              cursor: 'pointer', transition: 'all 0.2s'
            }}
            onClick={() => document.getElementById('xml-upload')?.click()}
          >
            <input type="file" id="xml-upload" accept=".xml" style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { setXmlFile(file); processXml(file); }
            }} />
            <UploadCloud size={40} color={dragActive ? pk : '#94a3b8'} />
            <div>
              <strong style={{ color: '#334155' }}>Kéo thả file XML 3176 vào đây</strong>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>hoặc click để chọn file từ máy tính</p>
            </div>
            {xmlFile && <div style={{ marginTop: 10, padding: '4px 12px', background: '#e0f2fe', color: '#0369a1', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600 }}>{xmlFile.name}</div>}
          </div>

          {/* Data Table */}
          <div style={{ flex: 1, background: 'white', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Dữ Liệu Hồ Sơ</h3>
                {metaInfo.macskcb && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>CSKCB: {metaInfo.macskcb} | Ngày lập: {metaInfo.ngaylap} | {patients.length} bệnh nhân</span>}
              </div>
              
              <button 
                onClick={handleExportExcel}
                disabled={!xmlFile || isProcessing || patients.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', borderRadius: 6, fontWeight: 600, cursor: (!xmlFile || isProcessing || patients.length === 0) ? 'not-allowed' : 'pointer', opacity: (!xmlFile || isProcessing || patients.length === 0) ? 0.5 : 1 }}
              >
                <FileSpreadsheet size={16} color="#0284c7" /> Xuất Excel
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>STT</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Mã HS</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Họ Tên</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Mã Thẻ</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Ngày Vào</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Ngày Ra</th>
                    <th style={{ padding: '8px 12px', borderBottom: '1px solid #cbd5e1' }}>Tổng Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Chưa có dữ liệu</td></tr>
                  ) : (
                    patients.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px' }}>{p.MA_LK || p.MA_HOSO}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.HO_TEN}</td>
                        <td style={{ padding: '8px 12px', color: '#0ea5e9' }}>{p.MA_THE_BHYT}</td>
                        <td style={{ padding: '8px 12px' }}>{p.NGAY_VAO}</td>
                        <td style={{ padding: '8px 12px' }}>{p.NGAY_RA}</td>
                        <td style={{ padding: '8px 12px', color: '#16a34a', fontWeight: 600 }}>
                          {parseFloat(p.T_TONGCHI || 0).toLocaleString('vi-VN')} đ
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Log */}
        <div style={{ background: 'white', padding: '1rem', borderRadius: 10, display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={16} /> Nhật ký hệ thống
          </h3>
          <div style={{ flex: 1, background: '#1e293b', color: '#f8fafc', padding: '1rem', borderRadius: 6, fontSize: '0.78rem', fontFamily: 'monospace', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {logs.length === 0 ? 'Chưa có nhật ký...' : logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
