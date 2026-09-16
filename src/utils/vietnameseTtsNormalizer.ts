/**
 * DMH_Tools - Bộ Chuẩn Hóa Văn Bản Tiếng Việt 100% Cho Giọng Đọc (TTS)
 * Ép buộc quy chuẩn ngữ âm Tiếng Việt toàn diện:
 * 1. Chuyển đổi mọi con số thành chữ tiếng Việt chuẩn xác (21 -> hai mươi mốt, 15 -> mười lăm, 104 -> một trăm linh tư...)
 * 2. Mở rộng tất cả các từ viết tắt chuyên môn y tế, học hàm, học vị, chức danh, phòng ban.
 * 3. Phiên âm các chữ cái Latin (Phòng 1A -> phòng một a, Phòng 2B -> phòng hai bê, Khu C -> khu xê...)
 * 4. Chuyển đổi toàn bộ số La Mã phòng/khoa (Phòng I đến XX -> phòng một đến hai mươi)
 * 5. Loại bỏ ký tự rác, định dạng ngắt câu nhịp nhàng, chống nói tiếng Anh hoặc phát âm sai.
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/**
 * Chuyển đổi một số nguyên (0 - 999,999,999) thành chữ tiếng Việt chuẩn ngữ âm
 */
export function numberToVietnameseWords(num: number): string {
  if (isNaN(num)) return '';
  num = Math.floor(Math.abs(num));

  if (num === 0) return 'không';
  if (num < 10) return DIGITS[num];

  const readTwoDigits = (n: number): string => {
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    let s: string;

    if (tens === 1) {
      s = 'mười';
    } else {
      s = `${DIGITS[tens]} mươi`;
    }

    if (unit === 1) {
      s += tens > 1 ? ' mốt' : ' một';
    } else if (unit === 4) {
      s += tens > 1 ? ' tư' : ' bốn';
    } else if (unit === 5) {
      s += ' lăm';
    } else if (unit > 0) {
      s += ` ${DIGITS[unit]}`;
    }
    return s;
  };

  const readThreeDigits = (n: number, isHighestBlock = false): string => {
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;

    if (hundreds === 0 && isHighestBlock) {
      if (remainder < 10) return DIGITS[remainder];
      return readTwoDigits(remainder);
    }

    let s = `${DIGITS[hundreds]} trăm`;

    if (remainder === 0) return s;

    if (remainder < 10) {
      s += ` linh ${DIGITS[remainder] === 'năm' ? 'năm' : (remainder === 4 ? 'tư' : DIGITS[remainder])}`;
    } else {
      s += ` ${readTwoDigits(remainder)}`;
    }
    return s;
  };

  if (num < 100) {
    return readTwoDigits(num);
  }

  if (num < 1000) {
    return readThreeDigits(num, true);
  }

  if (num < 1000000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    let s = `${readThreeDigits(thousands, true)} nghìn`;
    if (remainder > 0) {
      s += ` ${readThreeDigits(remainder, false)}`;
    }
    return s;
  }

  if (num < 1000000000) {
    const millions = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    let s = `${readThreeDigits(millions, true)} triệu`;
    if (remainder > 0) {
      const thousands = Math.floor(remainder / 1000);
      const remHundreds = remainder % 1000;
      if (thousands > 0) {
        s += ` ${readThreeDigits(thousands, false)} nghìn`;
      }
      if (remHundreds > 0) {
        s += ` ${readThreeDigits(remHundreds, false)}`;
      }
    }
    return s;
  }

  return num.toString();
}

/**
 * Bảng từ điển viết tắt y tế, chức danh & hành chính chuẩn xác
 */
const ABBREVIATIONS: [RegExp, string][] = [
  // Chức danh & Học vị
  [/\bBS\.?\s*CK\s*II\b/gi, 'bác sĩ chuyên khoa hai'],
  [/\bBS\.?\s*CK\s*2\b/gi, 'bác sĩ chuyên khoa hai'],
  [/\bBSCKII\b/gi, 'bác sĩ chuyên khoa hai'],
  [/\bBSCK2\b/gi, 'bác sĩ chuyên khoa hai'],
  [/\bBS\.?\s*CK\s*I\b/gi, 'bác sĩ chuyên khoa một'],
  [/\bBS\.?\s*CK\s*1\b/gi, 'bác sĩ chuyên khoa một'],
  [/\bBSCKI\b/gi, 'bác sĩ chuyên khoa một'],
  [/\bBSCK1\b/gi, 'bác sĩ chuyên khoa một'],
  [/\bCK\s*II\b/gi, 'chuyên khoa hai'],
  [/\bCK\s*2\b/gi, 'chuyên khoa hai'],
  [/\bCK\s*I\b/gi, 'chuyên khoa một'],
  [/\bCK\s*1\b/gi, 'chuyên khoa một'],
  [/\bPGS\.?\s*TS\b/gi, 'phó giáo sư tiến sĩ'],
  [/\bGS\.?\s*TS\b/gi, 'giáo sư tiến sĩ'],
  [/\bThS\.?\s*BS\b/gi, 'thạc sĩ bác sĩ'],
  [/\bTS\.?\s*BS\b/gi, 'tiến sĩ bác sĩ'],
  [/\bThS\b/gi, 'thạc sĩ'],
  [/\bPGS\b/gi, 'phó giáo sư'],
  [/\bGS\b/gi, 'giáo sư'],
  [/\bTS\b/gi, 'tiến sĩ'],
  [/\bBS\b/gi, 'bác sĩ'],
  [/\bB\/S\b/gi, 'bác sĩ'],
  [/\bKTV\b/gi, 'kỹ thuật viên'],
  [/\bĐD\b/gi, 'điều dưỡng'],
  [/\bYT\b/gi, 'y tá'],

  // Đối tượng bệnh nhân & quy trình
  [/\bBN\b/gi, 'bệnh nhân'],
  [/\bSTT\b/gi, 'số thứ tự'],
  [/\bBHYT\b/gi, 'bảo hiểm y tế'],
  [/\bKCB\b/gi, 'khám chữa bệnh'],
  [/\bCLS\b/gi, 'cận lâm sàng'],
  [/\bX-?Quang\b/gi, 'ích quang'],
  [/\bXQ\b/gi, 'ích quang'],
  [/\bX-Q\b/gi, 'ích quang'],
  [/\bCT-?Scanner\b/gi, 'chụp cắt lớp vi tính'],
  [/\bCT\s*Scanner\b/gi, 'chụp cắt lớp vi tính'],
  [/\bMRI\b/gi, 'cộng hưởng từ'],
  [/\bECG\b/gi, 'điện tim'],
  [/\bEEG\b/gi, 'điện não'],
  [/\bSA\b/gi, 'siêu âm'],
  [/\bXN\b/gi, 'xét nghiệm'],
  [/\bTMH\b/gi, 'tai mũi họng'],
  [/\bRHM\b/gi, 'răng hàm mặt'],
  [/\bYHCT\b/gi, 'y học cổ truyền'],
  [/\bPHCN\b/gi, 'phục hồi chức năng'],
  [/\bCĐHA\b/gi, 'chẩn đoán hình ảnh'],
  [/\bHSTC\b/gi, 'hồi sức tích cực'],
  [/\bCC\b/gi, 'cấp cứu'],
  [/\bKKB\b/gi, 'khoa khám bệnh'],
  [/\bKB\b/gi, 'khám bệnh'],
  [/\bĐK\b/gi, 'đăng ký'],
  [/\bDVKT\b/gi, 'dịch vụ kỹ thuật'],
  [/\bDV\b/gi, 'dịch vụ'],
  [/\bVP\b/gi, 'viện phí'],
  [/\bNTP\b/gi, 'nơi tiếp nhận'],
  [/\bTN\b/gi, 'tiếp nhận'],
  [/\bVIP\b/gi, 'chất lượng cao'],

  // Phòng khám, khoa, buồng
  [/\bPK\b/gi, 'phòng khám'],
  [/\bP\.\s*/gi, 'phòng '],

  // Số La Mã phòng khám / khoa / khu (từ I đến XX)
  [/\b(phòng|khoa|khu|tầng)\s+XX\b/gi, '$1 hai mươi'],
  [/\b(phòng|khoa|khu|tầng)\s+XIX\b/gi, '$1 mười chín'],
  [/\b(phòng|khoa|khu|tầng)\s+XVIII\b/gi, '$1 mười tám'],
  [/\b(phòng|khoa|khu|tầng)\s+XVII\b/gi, '$1 mười bảy'],
  [/\b(phòng|khoa|khu|tầng)\s+XVI\b/gi, '$1 mười sáu'],
  [/\b(phòng|khoa|khu|tầng)\s+XV\b/gi, '$1 mười lăm'],
  [/\b(phòng|khoa|khu|tầng)\s+XIV\b/gi, '$1 mười bốn'],
  [/\b(phòng|khoa|khu|tầng)\s+XIII\b/gi, '$1 mười ba'],
  [/\b(phòng|khoa|khu|tầng)\s+XII\b/gi, '$1 mười hai'],
  [/\b(phòng|khoa|khu|tầng)\s+XI\b/gi, '$1 mười một'],
  [/\b(phòng|khoa|khu|tầng)\s+X\b/gi, '$1 mười'],
  [/\b(phòng|khoa|khu|tầng)\s+IX\b/gi, '$1 chín'],
  [/\b(phòng|khoa|khu|tầng)\s+VIII\b/gi, '$1 tám'],
  [/\b(phòng|khoa|khu|tầng)\s+VII\b/gi, '$1 bảy'],
  [/\b(phòng|khoa|khu|tầng)\s+VI\b/gi, '$1 sáu'],
  [/\b(phòng|khoa|khu|tầng)\s+V\b/gi, '$1 năm'],
  [/\b(phòng|khoa|khu|tầng)\s+IV\b/gi, '$1 bốn'],
  [/\b(phòng|khoa|khu|tầng)\s+III\b/gi, '$1 ba'],
  [/\b(phòng|khoa|khu|tầng)\s+II\b/gi, '$1 hai'],
  [/\b(phòng|khoa|khu|tầng)\s+I\b/gi, '$1 một'],

  // Chuẩn hóa số phòng có số 0 ở đầu (phòng 02 -> phòng hai)
  [/\bphòng\s*0+([1-9]\d*)/gi, 'phòng $1'],
  [/\bkhu\s*0+([1-9]\d*)/gi, 'khu $1'],
  [/\bcửa\s*0+([1-9]\d*)/gi, 'cửa $1'],
  [/\bbàn\s*0+([1-9]\d*)/gi, 'bàn $1'],
];

/**
 * Phiên âm các chữ cái tiếng Latin đứng độc lập hoặc ghép sau số phòng (1A -> một a, 2B -> hai bê...)
 */
const LETTER_MAP: Record<string, string> = {
  A: 'a', B: 'bê', C: 'xê', D: 'đê', E: 'e', F: 'ép',
  G: 'gờ', H: 'hát', I: 'i', J: 'giê', K: 'ca', L: 'e lờ',
  M: 'em', N: 'en', O: 'o', P: 'pê', Q: 'quy', R: 'e rờ',
  S: 'ét', T: 'tê', U: 'u', V: 'vê', W: 'vê kép', X: 'ích',
  Y: 'i dài', Z: 'dét'
};

/**
 * Hàm chuẩn hóa chính: ép buộc 100% văn bản sang tiếng Việt thuần trước khi phát thanh
 */
export function normalizeVietnameseForSpeech(rawText: string): string {
  if (!rawText) return '';

  let text = rawText.trim();

  // 1. Thay thế các từ viết tắt chuyên môn y tế và hành chính
  for (const [pattern, replacement] of ABBREVIATIONS) {
    text = text.replace(pattern, replacement);
  }

  // 2. Xử lý tên có dấu nháy đơn dân tộc (K'Sor -> K Sor, H'Hen -> H Hen)
  text = text.replace(/([A-ZÀ-Ỹa-zà-ỹ])'([A-ZÀ-Ỹa-zà-ỹ])/g, '$1 $2');

  // 3. Chuẩn hóa chữ cái đơn lẻ sau số phòng/dãy (VD: "phòng 1A" -> "phòng 1 a", "phòng 2B" -> "phòng 2 bê")
  text = text.replace(/(\d+)\s*([A-Za-z])\b/g, (_m, num, letter) => {
    const sound = LETTER_MAP[letter.toUpperCase()] || letter;
    return `${num} ${sound}`;
  });

  // Phiên âm chữ cái sau "khu", "dãy", "cửa", "bàn" (VD: "khu B" -> "khu bê")
  text = text.replace(/\b(khu|dãy|cửa|bàn|tầng)\s+([A-Za-z])\b/gi, (_m, prefix, letter) => {
    const sound = LETTER_MAP[letter.toUpperCase()] || letter;
    return `${prefix} ${sound}`;
  });

  // 4. Chuyển đổi mọi số nguyên (01, 2, 21, 15, 104...) thành chữ tiếng Việt chuẩn xác
  // Bỏ số 0 vô nghĩa ở đầu
  text = text.replace(/\b0*([1-9]\d*)\b/g, (_match, numStr) => {
    const num = parseInt(numStr, 10);
    return numberToVietnameseWords(num);
  });

  // Số 0 đứng riêng lẻ
  text = text.replace(/\b0\b/g, 'không');

  // 5. Loại bỏ các ký tự lạ, ký tự tiếng Anh rác
  text = text.replace(/[@#$%^&*_+=\\~<>[\]{}|/]/g, ' ');

  // 6. Chuẩn hóa dấu câu ngắt nhịp tiếng Việt tự nhiên
  text = text.replace(/\s*,\s*/g, ', ');
  text = text.replace(/\s*\.\s*/g, '. ');
  text = text.replace(/\s*;\s*/g, '; ');
  text = text.replace(/\s*:\s*/g, ': ');
  text = text.replace(/\s+/g, ' ').trim();

  // Đảm bảo kết thúc câu bằng dấu chấm để ngữ điệu âm thanh hạ thấp tròn vành rõ chữ
  if (text && !text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text += '.';
  }

  return text;
}
