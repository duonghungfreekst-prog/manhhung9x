/**
 * DMH_Tools - Google Gemini AI Diagnostic Service
 * Tích hợp Gemini 1.5 Flash / 2.0 Flash để phân tích nhật ký lỗi hệ thống,
 * chẩn đoán máy in, mạng LAN và đọc ảnh chụp màn hình lỗi.
 */

export interface GeminiAnalysisResult {
  ok: boolean;
  content: string;
  modelUsed?: string;
  timestamp: string;
  error?: string;
}

export interface DiagnosticTelemetryPayload {
  diagnosticData?: any;
  installedPrinters?: any[];
  systemPorts?: any[];
  customNotes?: string;
  targetHost?: string;
  networkProbe?: {
    ok?: boolean;
    host?: string;
    resolvedIp?: string;
    pingOk?: boolean;
    pingMs?: number;
    port445Smb?: boolean;
    port135Rpc?: boolean;
    port139Netbios?: boolean;
    ipcAccessOk?: boolean;
    ipcError?: string;
    sharedPrinters?: string[];
    insecureGuestAllowed?: boolean;
    smbSigningRequired?: boolean;
    clientOs?: string;
  };
  eventLogs?: Array<{
    source: string;
    id: number;
    level: string;
    time: string;
    message: string;
  }>;
  stuckJobs?: Array<{
    printer: string;
    id: number;
    document: string;
    status: string;
  }>;
  spoolerStatus?: string;
  windowsVersion?: string;
}

const STORAGE_KEY_API_KEY = 'dmh_gemini_api_key';
const STORAGE_KEY_MODEL = 'dmh_gemini_model';

// API keys phải được người dùng tự nhập qua Settings — KHÔNG hard-code trong source
const DEFAULT_API_KEYS: string[] = [];
const DEFAULT_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'];

const _obfuscate = (s: string) => {
  try { return btoa(encodeURIComponent(s)); } catch { return s; }
};
const _deobfuscate = (s: string) => {
  try { return decodeURIComponent(atob(s)); } catch { return s; }
};

export class GeminiService {
  static getApiKey(): string {
    const stored = localStorage.getItem(STORAGE_KEY_API_KEY);
    if (stored) return _deobfuscate(stored);
    return DEFAULT_API_KEYS[0];
  }

  static setApiKey(key: string): void {
    if (!key) {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY_API_KEY, _obfuscate(key.trim()));
    }
  }

  static getModel(): string {
    const saved = localStorage.getItem(STORAGE_KEY_MODEL);
    if (saved && !saved.includes('1.5') && !saved.includes('2.0') && !saved.includes('2.5')) return saved;
    return DEFAULT_MODEL;
  }

  static setModel(model: string): void {
    localStorage.setItem(STORAGE_KEY_MODEL, model || DEFAULT_MODEL);
  }

  static async generateText(prompt: string, systemInstruction?: string): Promise<GeminiAnalysisResult> {
    const customKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    // Luôn ưu tiên customKey nếu có, sau đó tự động failover qua toàn bộ Key Pool dự phòng
    const keyCandidates = customKey 
      ? [customKey, ...DEFAULT_API_KEYS.filter(k => k !== customKey)]
      : DEFAULT_API_KEYS;
    const preferredModel = this.getModel();
    const modelCandidates = [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)];
    const timestamp = new Date().toISOString();

    let lastError = '';

    const w = typeof window !== 'undefined' ? (window as any) : null;

    // Cơ chế tự động thử lần lượt các Key và Model trong Key Pool (Không bao giờ gián đoạn)
    for (const key of keyCandidates) {
      for (const model of modelCandidates) {
        try {
          const contents: any[] = [];
          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });

          const bodyPayload: any = {
            contents,
            generationConfig: {
              temperature: 0.3,
              topP: 0.8,
              maxOutputTokens: 2048,
            }
          };

          if (systemInstruction) {
            bodyPayload.systemInstruction = {
              parts: [{ text: systemInstruction }]
            };
          }

          // Cách 1: Gọi qua Electron IPC Proxy (Node.js backend) - Không bị chặn bởi CORS/CSP
          if (w?.electronAPI?.gemini?.proxyGenerate) {
            const proxyRes = await w.electronAPI.gemini.proxyGenerate({ key, model, bodyPayload });
            if (proxyRes?.ok && proxyRes.content) {
              return {
                ok: true,
                content: proxyRes.content,
                modelUsed: proxyRes.modelUsed || model,
                timestamp
              };
            } else {
              lastError = proxyRes?.error || `HTTP error`;
              continue;
            }
          }

          // Cách 2: Gọi fetch trực tiếp nếu chạy trên môi trường Web thuần
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });

          if (response.ok) {
            const resData = await response.json();
            const textOutput = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textOutput) {
              return {
                ok: true,
                content: textOutput,
                modelUsed: model,
                timestamp
              };
            }
          } else {
            const errJson = await response.json().catch(() => ({}));
            lastError = errJson?.error?.message || `HTTP ${response.status}`;
            continue;
          }
        } catch (err: any) {
          lastError = err.message || String(err);
          continue;
        }
      }
    }

    return {
      ok: false,
      content: '',
      timestamp,
      error: `Tất cả kênh AI Google đều đang bận: ${lastError}`
    };
  }

  static async analyzeImage(base64Image: string, mimeType = 'image/png', additionalNotes = ''): Promise<GeminiAnalysisResult> {
    const customKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    const keyCandidates = customKey 
      ? [customKey, ...DEFAULT_API_KEYS.filter(k => k !== customKey)]
      : DEFAULT_API_KEYS;
    const preferredModel = this.getModel();
    const modelCandidates = [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)];
    const timestamp = new Date().toISOString();
    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const promptText = `Bạn là Chuyên Gia Kỹ Thuật Máy Tính & Hệ Thống In Ấn Phòng Khám của DMH Tools.
Hãy quan sát bức ảnh chụp màn hình này và thực hiện:
1. Nhận diện cửa sổ hoặc thông báo lỗi đang hiển thị (tên phần mềm, mã lỗi Windows nếu có).
2. Phân tích nguyên nhân tại sao lỗi này xuất hiện.
3. Hướng dẫn chi tiết các bước xử lý nhanh và triệt để nhất bằng tiếng Việt.
${additionalNotes ? `\nGhi chú thêm từ người dùng: ${additionalNotes}` : ''}`;

    let lastError = '';
    const w = typeof window !== 'undefined' ? (window as any) : null;

    for (const key of keyCandidates) {
      for (const model of modelCandidates) {
        try {
          const bodyPayload = {
            contents: [
              {
                role: 'user',
                parts: [
                  { text: promptText },
                  {
                    inlineData: {
                      mimeType,
                      data: cleanBase64
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            }
          };

          // Gọi qua Electron IPC Proxy nếu có
          if (w?.electronAPI?.gemini?.proxyGenerate) {
            const proxyRes = await w.electronAPI.gemini.proxyGenerate({ key, model, bodyPayload });
            if (proxyRes?.ok && proxyRes.content) {
              return {
                ok: true,
                content: proxyRes.content,
                modelUsed: proxyRes.modelUsed || model,
                timestamp
              };
            } else {
              lastError = proxyRes?.error || 'Proxy error';
              continue;
            }
          }

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });

          if (response.ok) {
            const resData = await response.json();
            const textOutput = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textOutput) {
              return {
                ok: true,
                content: textOutput,
                modelUsed: model,
                timestamp
              };
            }
          } else {
            const errJson = await response.json().catch(() => ({}));
            lastError = errJson?.error?.message || `HTTP ${response.status}`;
            continue;
          }
        } catch (err: any) {
          lastError = err.message || String(err);
          continue;
        }
      }
    }

    return {
      ok: false,
      content: '',
      timestamp,
      error: `Lỗi xử lý ảnh từ AI: ${lastError}`
    };
  }

  static async analyzePrinterDiagnostics(
    diagnosticDataOrPayload: any,
    installedPrinters: any[] = [],
    systemPorts: any[] = [],
    customNotes = '',
    targetHost = '',
    networkProbe?: any,
    eventLogs?: any[]
  ): Promise<GeminiAnalysisResult> {
    let payload: DiagnosticTelemetryPayload;
    if (diagnosticDataOrPayload && typeof diagnosticDataOrPayload === 'object' && ('diagnosticData' in diagnosticDataOrPayload || 'networkProbe' in diagnosticDataOrPayload || 'eventLogs' in diagnosticDataOrPayload)) {
      payload = diagnosticDataOrPayload;
    } else {
      payload = {
        diagnosticData: diagnosticDataOrPayload,
        installedPrinters,
        systemPorts,
        customNotes,
        targetHost,
        networkProbe,
        eventLogs
      };
    }

    const systemPrompt = `Bạn là Chuyên Gia Kỹ Thuật Trưởng Hệ Thống Windows, Mạng LAN & Ứng Dụng Chuyên Sâu của DMH Tools.
Nhiệm vụ của bạn là đọc và giải mã TOÀN BỘ dữ liệu telemetry thực tế từ máy tính mà KHÔNG BỊ GIỚI HẠN ở bất kỳ lỗi mặc định nào:
1. Đọc và phân tích TẤT CẢ các bản ghi lỗi trong Windows Event Log (bao gồm Application, System, PrintService, SMBClient, WerFault). Bất kể là lỗi crash phần mềm, lỗi .NET, lỗi SQL Server, lỗi driver phần cứng, lỗi dịch vụ Windows hay lỗi mạng LAN, hãy chỉ đích danh nguyên nhân, mã lỗi và file/dịch vụ gây lỗi.
2. Đọc kết quả bắt mạch mạng máy chủ (Ping, Cổng SMB 445, Cổng RPC 135, Cổng NetBIOS 139, phiên IPC$, Danh sách máy in chia sẻ thực tế trên máy chủ, chính sách Insecure Guest Logon / SMB Signing).
3. Đọc thông số hàng đợi in (Stuck Jobs), dịch vụ Spooler và thông tin phiên bản Windows Build.
4. Đọc thông số máy in đã cài và cổng USB phần cứng.

Bản báo cáo của bạn BẮT BUỘC phải trả lời rõ ràng 4 mục:
- 🩺 **1. Tổng quan tình trạng & Vị trí sự cố**: Lỗi đang bắt nguồn từ MÁY CHỦ IN (Server), MÁY CON (Client), hay một ứng dụng/dịch vụ cụ thể nào? Chỉ rõ IP hoặc Tên máy cần thao tác.
- 🔍 **2. Bóc tách nguyên nhân gốc rễ kỹ thuật**: Giải mã chi tiết mã lỗi Hex/Win32 (như 0x40, 0x709, 0x11b), Event ID, thông điệp lỗi của Windows và nguyên nhân tại sao lỗi này xuất hiện.
- 🛠️ **3. Hướng dẫn khắc phục 1-2-3 thực chiến**: Các bước xử lý chuẩn xác để triệt tiêu lỗi tận gốc (bao gồm giải pháp Local Port nếu bị chặn SMB, giải pháp dọn sạch Spooler nếu kẹt lệnh, và ghim Windows Credential nếu bị chặn phiên IPC$).
- 💡 **4. Lời khuyên vận hành an toàn cho phòng khám / doanh nghiệp**.

Trình bày bằng Markdown chuyên nghiệp, tiếng Việt dễ hiểu, mạch lạc, nhấn mạnh bằng các biểu tượng icon trực quan.`;

    const rawDataSummary = {
      thoi_gian_quet: new Date().toLocaleString('vi-VN'),
      phien_ban_windows: payload.windowsVersion || 'Windows',
      trang_thai_dich_vu_spooler: payload.spoolerStatus || 'Chưa kiểm tra',
      lenh_in_dang_ket_stuck_jobs: (payload.stuckJobs && payload.stuckJobs.length > 0)
        ? payload.stuckJobs.map(j => `Máy in: "${j.printer}" | Tệp: "${j.document}" | ID: ${j.id} | Trạng thái: ${j.status}`)
        : 'Không có lệnh in nào bị kẹt trong hàng đợi',
      may_chu_dich: payload.targetHost || 'Chưa chỉ định IP/Tên máy chủ in',
      bat_mach_mang_lan: payload.networkProbe ? {
        ip_may_chu: payload.networkProbe.host,
        ip_phan_giai_dns: payload.networkProbe.resolvedIp || 'Không có DNS/NetBIOS',
        ping_thong_mang: payload.networkProbe.pingOk ? `OK (${payload.networkProbe.pingMs}ms)` : 'MẤT KẾT NỐI (Timeout / Rớt mạng)',
        cong_445_smb: payload.networkProbe.port445Smb ? 'MỞ (Thông)' : 'BỊ CHẶN (Tường lửa/Antivirus máy chủ khoá)',
        cong_135_rpc: payload.networkProbe.port135Rpc ? 'MỞ (Thông)' : 'BỊ CHẶN',
        cong_139_netbios: payload.networkProbe.port139Netbios ? 'MỞ' : 'ĐÓNG',
        bat_tay_phien_ipc: payload.networkProbe.ipcAccessOk ? 'THÀNH CÔNG' : `THẤT BẠI: ${payload.networkProbe.ipcError || 'Bị từ chối quyền'}`,
        danh_sach_may_in_chia_se_tim_thay: (payload.networkProbe.sharedPrinters && payload.networkProbe.sharedPrinters.length > 0)
          ? payload.networkProbe.sharedPrinters
          : 'Chưa thấy máy in chia sẻ nào (hoặc phiên IPC$ bị chặn)',
        chinh_sach_smb_client: {
          cho_phep_guest_anonymously: payload.networkProbe.insecureGuestAllowed !== null ? (payload.networkProbe.insecureGuestAllowed ? 'Cho phép' : 'Bị chặn (Đặc trưng Windows 11 24H2)') : 'Không rõ',
          bat_buoc_ky_ten_smb_signing: payload.networkProbe.smbSigningRequired !== null ? (payload.networkProbe.smbSigningRequired ? 'Bắt buộc' : 'Không bắt buộc') : 'Không rõ'
        },
        he_dieu_hanh_may_con: payload.networkProbe.clientOs || 'Windows'
      } : 'Chưa quét kết nối mạng tới máy chủ in',
      nhat_ky_event_log_windows_moi_nhat: (payload.eventLogs && payload.eventLogs.length > 0)
        ? payload.eventLogs.slice(0, 15).map(l => `[${l.time}] [${l.level}] ${l.source} (ID ${l.id}): ${l.message}`)
        : 'Không phát hiện bản ghi lỗi mới trong Event Viewer (15-30 phút gần nhất)',
      chan_doan_10_buoc_noi_bo: payload.diagnosticData,
      danh_sach_may_in_hien_co: (payload.installedPrinters || []).map(p => ({
        ten_may_in: p.Name,
        ten_driver: p.DriverName,
        cong: p.PortName,
        trang_thai: p.PrinterStatus,
        chia_se: p.Shared
      })),
      cong_he_thong_usb: (payload.systemPorts || []).map(sp => ({
        ten_cong: sp.Name,
        dang_cam_thiet_bi: sp.IsConnected,
        thiet_bi: sp.DeviceName
      })),
      ghi_chu_nguoi_dung: payload.customNotes || ''
    };

    const userPrompt = `Dưới đây là toàn bộ dữ liệu telemetry thực tế từ máy trạm (bao gồm Bắt Mạch Mạng Máy Chủ, Hàng Đợi Lệnh In và Toàn Bộ Nhật Ký Windows Event Log):\n\`\`\`json\n${JSON.stringify(rawDataSummary, null, 2)}\n\`\`\`\nHãy đóng vai Kỹ Sư Trưởng phân tích chuyên sâu và đưa ra kết luận chuẩn xác 100% cho người dùng.`;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return this.generateOfflineDiagnosticFallback(payload);
    }

    const res = await this.generateText(userPrompt, systemPrompt);
    if (res.ok && res.content) {
      return res;
    }

    // Nếu dịch vụ AI Cloud tạm thời gián đoạn (mất mạng hoặc hết quota), tự động kích hoạt Rule-Based AI Engine cục bộ
    const fallback = this.generateOfflineDiagnosticFallback(payload);
    if (res.error) {
      fallback.content = `> 💡 **Thông báo kết nối AI**: *${res.error}*\n> *(Hệ thống đã tự động kích hoạt Bác Sĩ Quy Tắc Cục Bộ để phân tích dữ liệu ngay lập tức cho bạn)*\n\n` + fallback.content;
    }
    return fallback;
  }

  private static generateOfflineDiagnosticFallback(
    payload: DiagnosticTelemetryPayload
  ): GeminiAnalysisResult {
    const timestamp = new Date().toISOString();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Phân tích kết quả Bắt Mạch Mạng Máy Chủ (Network Probe)
    if (payload.networkProbe && payload.targetHost) {
      if (payload.networkProbe.pingOk === false) {
        issues.push(`❌ **Không thể Ping tới Máy Chủ [${payload.targetHost}]**: Mạng LAN bị đứt kết nối vật lý, lỏng dây mạng hoặc 2 máy đang ở khác lớp mạng (Subnet khác nhau).`);
        recommendations.push(`• Kiểm tra dây cáp mạng LAN hoặc Wi-Fi, đảm bảo 2 máy cùng dải IP (Ví dụ: 192.168.1.xxx).`);
      } else if (payload.networkProbe.port445Smb === false) {
        issues.push(`🚫 **Cổng 445 (SMB) trên Máy Chủ [${payload.targetHost}] ĐANG BỊ TƯỜNG LỬA CHẶN**: Đây chính là thủ phạm gây ra lỗi **0x00000040** (*The specified network name is no longer available*). Máy con ping thấy máy chủ nhưng không thể mở luồng truyền file/máy in.`);
        recommendations.push(`• 👉 **VỊ TRÍ CẦN XỬ LÝ: PHẢI QUA MÁY CHỦ**. Mở DMH Tools trên máy chủ bấm "Mở Tường Lửa Chia Sẻ File & Máy In" hoặc tắt tạm Firewall/Antivirus để kiểm tra.`);
        recommendations.push(`• 💡 **GIẢI PHÁP TỨC THÌ TRÊN MÁY NÀY**: Bấm nút **"Kết Nối Máy In Qua Cổng Cục Bộ (Local Port)"** để in trực tiếp, bỏ qua hoàn toàn lỗi chặn cổng 445!`);
      }

      if (payload.networkProbe.ipcAccessOk === false && payload.networkProbe.port445Smb === true) {
        issues.push(`🔒 **Lỗi xác thực chia sẻ mạng (IPC$) tới [${payload.targetHost}]**: Máy chủ yêu cầu mật khẩu hoặc Windows 11 24H2 chặn truy cập không mật khẩu (Insecure Guest Auth).`);
        recommendations.push(`• Nhập tài khoản/mật khẩu của máy chủ vào ô "Ghim Windows Credential" trong DMH Tools.`);
      }

      if (payload.networkProbe.sharedPrinters && payload.networkProbe.sharedPrinters.length > 0) {
        recommendations.push(`• 🖨️ **Máy in chia sẻ tìm thấy trên máy chủ**: ${payload.networkProbe.sharedPrinters.join(', ')}.`);
      }
    }

    // 2. Phân tích lệnh in kẹt (Stuck Jobs)
    if (payload.stuckJobs && payload.stuckJobs.length > 0) {
      issues.push(`⚠️ **Hàng đợi in đang kẹt ${payload.stuckJobs.length} lệnh in**: Khiến mọi lệnh in tiếp theo bị chặn hoàn toàn.`);
      payload.stuckJobs.slice(0, 3).forEach(j => {
        issues.push(`  - Máy in "${j.printer}": Tài liệu "${j.document}" (ID ${j.id}, trạng thái: ${j.status})`);
      });
      recommendations.push(`• Bấm "Xóa Sạch Lệnh In Kẹt" hoặc khởi động lại Spooler để giải phóng hàng đợi.`);
    }

    // 3. Phân tích Nhật ký Windows Event Log
    if (payload.eventLogs && payload.eventLogs.length > 0) {
      const logSample = payload.eventLogs.slice(0, 4);
      issues.push(`📋 **Phát hiện ${payload.eventLogs.length} sự kiện lỗi từ Windows Event Viewer**:`);
      logSample.forEach(l => {
        issues.push(`  - [${l.source} Event ID ${l.id}]: ${l.message ? l.message.substring(0, 120) : ''}...`);
      });
      recommendations.push(`• Đã tự động phân loại các sự kiện lỗi từ Event Log. Sử dụng tính năng "Sửa Tự Động Toàn Bộ Lỗi" để đồng bộ lại Spooler và RPC.`);
    }

    // 4. Phân tích chẩn đoán Spooler & Registry nội bộ
    const diag = payload.diagnosticData;
    if (diag?.spooler?.isOk === false || payload.spoolerStatus === 'Stopped') {
      issues.push('❌ **Dịch vụ Print Spooler bị dừng hoặc crash**: Windows không thể gửi lệnh in.');
      recommendations.push('• Khởi động lại dịch vụ Spooler và chuyển Startup Type sang Automatic.');
    }

    if (diag?.queue?.isOk === false || (diag?.queue?.fileCount || 0) > 0) {
      issues.push(`⚠️ **Thư mục Spool kẹt tệp (${diag?.queue?.fileCount || 0} tệp)**: Gây tắc nghẽn toàn bộ lệnh in tiếp theo.`);
      recommendations.push('• Xóa sạch các file spool kẹt tại thư mục System32\\spool\\PRINTERS.');
    }

    if (diag?.lanRpc?.isOk === false) {
      issues.push('⚠️ **Chưa cấu hình Registry RPC Named Pipe (Lỗi 0x00000709 / 0x0000011b)**: Khiến các máy trạm trong mạng LAN không thể kết nối máy in chia sẻ.');
      recommendations.push('• Bật RpcUseNamedPipeProtocol = 1 và cấu hình RpcAuthnLevelPrivacyEnabled = 0 trong Registry.');
    }

    const connectedUsbPorts = (payload.systemPorts || []).filter(p => p.IsConnected);
    const usbSummary = connectedUsbPorts.length > 0
      ? `Đã nhận diện thiết bị cắm cáp tại: ${connectedUsbPorts.map(p => p.Name).join(', ')}`
      : 'Chưa phát hiện thiết bị máy in nào đang cắm cáp USB vật lý.';

    let markdown = `### 🤖 Chẩn Đoán Hệ Thống Máy In & Mạng LAN (DMH Rule-Based AI Engine)\n\n`;
    markdown += `*(💡 Lưu ý: Đây là chế độ phân tích quy tắc cục bộ nâng cao. Bạn có thể nhập **Google Gemini API Key** để kích hoạt Trí Tuệ Nhân Tạo đám mây sâu sắc hơn)*\n\n`;

    markdown += `#### 🩺 1. Tình trạng tổng quan:\n`;
    if (payload.targetHost) {
      markdown += `- Máy chủ đích kiểm tra: **${payload.targetHost}** ${payload.networkProbe?.resolvedIp ? `(${payload.networkProbe.resolvedIp})` : ''}\n`;
      markdown += `- Ping mạng: **${payload.networkProbe?.pingOk ? `Thông (${payload.networkProbe.pingMs}ms)` : 'Không phản hồi'}**\n`;
      markdown += `- Cổng SMB 445: **${payload.networkProbe?.port445Smb ? '🟢 MỞ (Đạt)' : '🔴 BỊ CHẶN (Lỗi 0x40)'}**\n`;
      if (payload.networkProbe?.sharedPrinters && payload.networkProbe.sharedPrinters.length > 0) {
        markdown += `- Máy in chia sẻ trên máy chủ: **${payload.networkProbe.sharedPrinters.join(', ')}**\n`;
      }
    }
    markdown += `- Số sự cố phát hiện: **${issues.length} vấn đề**\n`;
    markdown += `- Số máy in trong Windows: **${(payload.installedPrinters || []).length} máy in**\n`;
    markdown += `- Kết nối cáp phần cứng: **${usbSummary}**\n\n`;

    if (issues.length > 0) {
      markdown += `#### 🔍 2. Chi tiết các điểm nghẽn kỹ thuật:\n`;
      issues.forEach(iss => { markdown += `${iss}\n`; });
      markdown += `\n#### 🛠️ 3. Khuyến nghị khắc phục chuẩn xác:\n`;
      recommendations.forEach(rec => { markdown += `${rec}\n`; });
      markdown += `\n👉 **Bạn có thể bấm nút: "⚡ SỬA TỰ ĐỘNG TOÀN BỘ LỖI (1-CLICK)" hoặc "Kết Nối Qua Cổng Cục Bộ (Local Port)" trên thanh công cụ để xử lý ngay!**\n`;
    } else {
      markdown += `#### 🎉 Hệ thống đạt chuẩn 100%:\n`;
      markdown += `Tất cả các dịch vụ Windows Spooler, cổng kết nối mạng LAN và phân quyền Registry đều đang ở trạng thái tối ưu.\n`;
    }

    return {
      ok: true,
      content: markdown,
      modelUsed: 'DMH-Enhanced-Rule-Engine',
      timestamp
    };
  }
}
