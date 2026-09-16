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

const STORAGE_KEY_API_KEY = 'dmh_gemini_api_key';
const STORAGE_KEY_MODEL = 'dmh_gemini_model';
const DEFAULT_MODEL = 'gemini-1.5-flash';

export class GeminiService {
  static getApiKey(): string {
    return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
  }

  static setApiKey(key: string): void {
    if (!key) {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
    }
  }

  static getModel(): string {
    return localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
  }

  static setModel(model: string): void {
    localStorage.setItem(STORAGE_KEY_MODEL, model || DEFAULT_MODEL);
  }

  static async generateText(prompt: string, systemInstruction?: string): Promise<GeminiAnalysisResult> {
    const apiKey = this.getApiKey();
    const model = this.getModel();
    const timestamp = new Date().toISOString();

    if (!apiKey) {
      return {
        ok: false,
        content: '',
        timestamp,
        error: 'Chưa cấu hình Google Gemini API Key. Vui lòng vào Cài Đặt và nhập API Key miễn phí từ Google AI Studio.'
      };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `Lỗi HTTP ${response.status}: ${response.statusText}`;
        return {
          ok: false,
          content: '',
          timestamp,
          error: `Gemini API từ chối [${response.status}]: ${errMsg}`
        };
      }

      const resData = await response.json();
      const textOutput = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        ok: true,
        content: textOutput,
        modelUsed: model,
        timestamp
      };
    } catch (err: any) {
      return {
        ok: false,
        content: '',
        timestamp,
        error: `Lỗi kết nối tới Google Gemini: ${err.message || String(err)}`
      };
    }
  }

  static async analyzeImage(base64Image: string, mimeType = 'image/png', additionalNotes = ''): Promise<GeminiAnalysisResult> {
    const apiKey = this.getApiKey();
    const model = this.getModel();
    const timestamp = new Date().toISOString();

    if (!apiKey) {
      return {
        ok: false,
        content: '',
        timestamp,
        error: 'Chưa cấu hình Google Gemini API Key.'
      };
    }

    try {
      const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const promptText = `Bạn là Chuyên Gia Kỹ Thuật Máy Tính & Hệ Thống In Ấn Phòng Khám của DMH Tools.
Hãy quan sát bức ảnh chụp màn hình này và thực hiện:
1. Nhận diện cửa sổ hoặc thông báo lỗi đang hiển thị (tên phần mềm, mã lỗi Windows nếu có).
2. Phân tích nguyên nhân tại sao lỗi này xuất hiện.
3. Hướng dẫn chi tiết các bước xử lý nhanh và triệt để nhất bằng tiếng Việt.
${additionalNotes ? `\nGhi chú thêm từ người dùng: ${additionalNotes}` : ''}`;

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

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `Lỗi HTTP ${response.status}`;
        return {
          ok: false,
          content: '',
          timestamp,
          error: `Lỗi Gemini Vision: ${errMsg}`
        };
      }

      const resData = await response.json();
      const textOutput = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        ok: true,
        content: textOutput,
        modelUsed: model,
        timestamp
      };
    } catch (err: any) {
      return {
        ok: false,
        content: '',
        timestamp,
        error: `Lỗi gửi ảnh tới Gemini: ${err.message || String(err)}`
      };
    }
  }

  static async analyzePrinterDiagnostics(
    diagnosticData: any,
    installedPrinters: any[] = [],
    systemPorts: any[] = [],
    customNotes = ''
  ): Promise<GeminiAnalysisResult> {
    const systemPrompt = `Bạn là Chuyên Gia Trí Tuệ Nhân Tạo Cao Cấp về Hệ Thống In Ấn & Mạng LAN Windows thuộc phần mềm DMH Tools.
Nhiệm vụ của bạn là đọc các thông số chẩn đoán kỹ thuật thực tế từ Windows Spooler, Registry RPC, dịch vụ mạng và cổng kết nối phần cứng.
Sau đó đưa ra bản báo cáo chẩn đoán chuyên sâu có cấu trúc rõ ràng:
- 🩺 **1. Đánh giá tổng quan sức khỏe hệ thống in ấn**
- 🔍 **2. Bóc tách nguyên nhân gốc rễ các lỗi được phát hiện** (Ví dụ: 0x709, 0x11b, Spooler crash, kẹt lệnh in, sai cổng USB...)
- 🛠️ **3. Khuyến nghị khắc phục cụ thể** (Các bước tự động trong DMH Tools và thao tác phần cứng nếu cần)
- 💡 **4. Lời khuyên vận hành cho phòng khám / doanh nghiệp** để hệ thống luôn ổn định.
Trình bày bằng Markdown chuyên nghiệp, tiếng Việt dễ hiểu, súc tích.`;

    const rawDataSummary = {
      thoi_gian_quet: new Date().toLocaleString('vi-VN'),
      chan_doan_10_buoc: diagnosticData,
      danh_sach_may_in_hien_co: installedPrinters.map(p => ({
        ten_may_in: p.Name,
        ten_driver: p.DriverName,
        cong: p.PortName,
        trang_thai: p.PrinterStatus,
        chia_se: p.Shared
      })),
      cong_he_thong: systemPorts.map(sp => ({
        ten_cong: sp.Name,
        dang_cam_thiet_bi: sp.IsConnected,
        thiet_bi: sp.DeviceName
      })),
      ghi_chu_nguoi_dung: customNotes
    };

    const userPrompt = `Dưới đây là toàn bộ dữ liệu telemetry chẩn đoán hệ thống vừa quét được từ máy tính:\n\`\`\`json\n${JSON.stringify(rawDataSummary, null, 2)}\n\`\`\`\nHãy phân tích và đưa ra giải pháp toàn diện cho người dùng.`;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return this.generateOfflineDiagnosticFallback(diagnosticData, installedPrinters, systemPorts);
    }

    return await this.generateText(userPrompt, systemPrompt);
  }

  private static generateOfflineDiagnosticFallback(
    diagnosticData: any,
    installedPrinters: any[],
    systemPorts: any[]
  ): GeminiAnalysisResult {
    const timestamp = new Date().toISOString();
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (diagnosticData?.spooler?.isOk === false) {
      issues.push('❌ **Dịch vụ Print Spooler bị dừng hoặc crash**: Windows không thể gửi lệnh in.');
      recommendations.push('• Khởi động lại dịch vụ Spooler và chuyển Startup Type sang Automatic.');
    }

    if (diagnosticData?.queue?.isOk === false || (diagnosticData?.queue?.fileCount || 0) > 0) {
      issues.push(`⚠️ **Hàng đợi in bị kẹt lệnh (${diagnosticData?.queue?.fileCount || 0} tệp)**: Gây tắc nghẽn toàn bộ lệnh in tiếp theo.`);
      recommendations.push('• Xóa sạch các file spool kẹt tại thư mục System32\\spool\\PRINTERS.');
    }

    if (diagnosticData?.lanRpc?.isOk === false) {
      issues.push('⚠️ **Chưa cấu hình Registry RPC Named Pipe (Lỗi 0x00000709 / 0x0000011b)**: Khiến các máy trạm trong mạng LAN không thể kết nối máy in chia sẻ.');
      recommendations.push('• Bật RpcUseNamedPipeProtocol = 1 và cấu hình RpcAuthnLevelPrivacyEnabled = 0 trong Registry.');
    }

    const connectedUsbPorts = systemPorts.filter(p => p.IsConnected);
    const usbSummary = connectedUsbPorts.length > 0
      ? `Đã nhận diện thiết bị cắm cáp tại: ${connectedUsbPorts.map(p => p.Name).join(', ')}`
      : 'Chưa phát hiện thiết bị máy in nào đang cắm cáp USB vật lý.';

    let markdown = `### 🤖 Chẩn Đoán Hệ Thống Máy In (DMH Rule-Based AI Engine)\n\n`;
    markdown += `*(💡 Lưu ý: Đây là chế độ phân tích quy tắc cục bộ. Bạn có thể nhập **Gemini API Key** để kích hoạt Trí Tuệ Nhân Tạo đám mây sâu sắc hơn)*\n\n`;

    markdown += `#### 🩺 1. Tình trạng tổng quan:\n`;
    markdown += `- Số sự cố phát hiện: **${diagnosticData?.issueCount || issues.length} vấn đề**\n`;
    markdown += `- Số máy in trong Windows: **${installedPrinters.length} máy in**\n`;
    markdown += `- Kết nối cáp phần cứng: **${usbSummary}**\n\n`;

    if (issues.length > 0) {
      markdown += `#### 🔍 2. Chi tiết các điểm nghẽn kỹ thuật:\n`;
      issues.forEach(iss => { markdown += `${iss}\n`; });
      markdown += `\n#### 🛠️ 3. Khuyến nghị khắc phục ngay:\n`;
      recommendations.forEach(rec => { markdown += `${rec}\n`; });
      markdown += `\n👉 **Bạn chỉ cần bấm nút: "⚡ SỬA TỰ ĐỘNG TOÀN BỘ LỖI (1-CLICK)" trên thanh công cụ, DMH Tools sẽ tự động cấu hình toàn bộ các mục trên trong 3 giây!**\n`;
    } else {
      markdown += `#### 🎉 Hệ thống đạt chuẩn 100%:\n`;
      markdown += `Tất cả các dịch vụ Windows Spooler, phân quyền Registry và mạng LAN đều đang ở trạng thái tối ưu.\n`;
    }

    return {
      ok: true,
      content: markdown,
      modelUsed: 'DMH-Local-Rule-Engine',
      timestamp
    };
  }
}
