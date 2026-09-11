import { useState, useMemo } from 'react';
import { UploadCard } from './UploadCard';
import { readAnyFile } from '../utils/excelProcessor';
import type { FileFormat } from '../types';
import { 
  Play, Download, Settings, Calculator, FileSearch, ArrowRight, Hash, Sigma, Type, GitCompare,
  Calendar, Layers, CheckSquare, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';

type FormulaType = 'stats' | 'condStats' | 'ifLogic' | 'vlookup' | 'compareFilter' | 'dateOps' | 'math' | 'text' | 'countFreq' | null;

// Hàm bỏ dấu tiếng Việt chuẩn
function removeVietnameseTones(str: string): string {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Viết hoa chữ cái đầu mỗi từ (Họ và tên)
function toProperCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s|-|\/)\S/g, char => char.toUpperCase());
}

// Phân tích ngày tháng linh hoạt
function parseDateVal(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number') {
    if (val > 1000 && val < 100000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const s = String(val).trim();
  if (!s) return null;
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function OfficeFormulasTab() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<FileFormat | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);

  const [formulaMode, setFormulaMode] = useState<FormulaType>(null);
  
  // STATS states (SUM, AVG, MIN, MAX, COUNT, COUNTA)
  const [statsCol, setStatsCol] = useState<string>('');

  // COND STATS (SUMIF, COUNTIF, AVERAGEIF, Group By / Pivot)
  const [condMode, setCondMode] = useState<'groupby' | 'sumif' | 'countif' | 'avgif'>('groupby');
  const [condCol, setCondCol] = useState<string>('');
  const [condOp, setCondOp] = useState<'=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'>('=');
  const [condVal, setCondVal] = useState<string>('');
  const [condValCol, setCondValCol] = useState<string>('');

  // IF LOGIC
  const [ifCol, setIfCol] = useState<string>('');
  const [ifOp, setIfOp] = useState<'=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'empty' | 'not_empty'>('=');
  const [ifCompareVal, setIfCompareVal] = useState<string>('');
  const [ifTrueVal, setIfTrueVal] = useState<string>('Thỏa mãn');
  const [ifFalseVal, setIfFalseVal] = useState<string>('Không');
  const [ifNewCol, setIfNewCol] = useState<string>('KetQua_IF');

  // DATE OPS
  const [dateColA, setDateColA] = useState<string>('');
  const [dateColB, setDateColB] = useState<string>('__TODAY__');
  const [dateOp, setDateOp] = useState<'diff_days' | 'calc_age' | 'year' | 'month' | 'day' | 'format_dmy'>('diff_days');
  const [dateNewCol, setDateNewCol] = useState<string>('KetQua_Ngay');

  // TEXT states (TRIM, LEFT, RIGHT, MID, UPPER, LOWER, PROPER, UNACCENT, LEN, CONCAT)
  const [textCol, setTextCol] = useState<string>('');
  const [textOp, setTextOp] = useState<string>('TRIM');
  const [textParam, setTextParam] = useState<number>(3);
  const [textParam2, setTextParam2] = useState<number>(5);
  const [textConcatCol, setTextConcatCol] = useState<string>('');
  const [textConcatSep, setTextConcatSep] = useState<string>(' ');

  // VLOOKUP states (Single & Multi column)
  const [vlFile, setVlFile] = useState<File | null>(null);
  const [vlFormat, setVlFormat] = useState<FileFormat | null>(null);
  const [vlData, setVlData] = useState<Record<string, unknown>[]>([]);
  const [vlSourceCol, setVlSourceCol] = useState<string>('');
  const [vlTargetCol, setVlTargetCol] = useState<string>('');
  const [vlReturnCols, setVlReturnCols] = useState<string[]>([]);

  // COMPARE FILTER states (Lọc đối chiếu 2 file)
  const [cmpOp, setCmpOp] = useState<'both' | 'file1_only' | 'file2_only' | 'diff_val'>('both');
  const [cmpSourceCol, setCmpSourceCol] = useState<string>('');
  const [cmpTargetCol, setCmpTargetCol] = useState<string>('');
  const [cmpValCol1, setCmpValCol1] = useState<string>('');
  const [cmpValCol2, setCmpValCol2] = useState<string>('');

  // MATH states (+ - * / ROUND ROUNDUP ROUNDDOWN % ABS)
  const [mathKind, setMathKind] = useState<'two_cols' | 'round' | 'percent' | 'abs'>('two_cols');
  const [mathColA, setMathColA] = useState<string>('');
  const [mathOp, setMathOp] = useState<string>('+');
  const [mathColB, setMathColB] = useState<string>('');
  const [roundOp, setRoundOp] = useState<'ROUND' | 'ROUNDUP' | 'ROUNDDOWN'>('ROUND');
  const [roundDigits, setRoundDigits] = useState<number>(0);

  // COUNT FREQ states
  const [countCol, setCountCol] = useState<string>('');

  const sourceColumns = useMemo(() => (data.length > 0 ? Object.keys(data[0]) : []), [data]);
  const vlColumns = useMemo(() => (vlData.length > 0 ? Object.keys(vlData[0]) : []), [vlData]);

  const handleFileChange = async (f: File | null) => {
    setFile(f); setFormat(null); setData([]); setResults([]); setFormulaMode(null);
    if (!f) return;
    try {
      const res = await readAnyFile(f);
      setFormat(res.format.toLowerCase() as FileFormat);
      setData(res.data);
    } catch {
      alert('Lỗi đọc file.'); setFile(null);
    }
  };

  const handleVlFileChange = async (f: File | null) => {
    setVlFile(f); setVlFormat(null); setVlData([]); setVlReturnCols([]);
    if (!f) return;
    try {
      const res = await readAnyFile(f);
      setVlFormat(res.format.toLowerCase() as FileFormat);
      setVlData(res.data);
    } catch {
      alert('Lỗi đọc file 2.'); setVlFile(null);
    }
  };

  // 1. STATS CƠ BẢN
  const runStats = () => {
    if (!statsCol || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      let sum = 0, count = 0, countA = 0;
      let min = Infinity, max = -Infinity;

      data.forEach(row => {
        const raw = row[statsCol];
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') countA++;
        
        const val = parseFloat(String(raw || 0).replace(/,/g, ''));
        if (!isNaN(val) && raw !== '') {
          sum += val;
          count++;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      });

      if (count === 0) { min = 0; max = 0; }
      const avg = count > 0 ? sum / count : 0;

      const summaryTable = [
        { 'Chỉ số': 'SUM (Tổng cộng)', 'Kết quả': sum },
        { 'Chỉ số': 'AVERAGE (Trung bình)', 'Kết quả': avg },
        { 'Chỉ số': 'MAX (Lớn nhất)', 'Kết quả': max },
        { 'Chỉ số': 'MIN (Nhỏ nhất)', 'Kết quả': min },
        { 'Chỉ số': 'COUNT (Đếm ô chứa số)', 'Kết quả': count },
        { 'Chỉ số': 'COUNTA (Đếm ô khác rỗng)', 'Kết quả': countA },
      ];
      setResults(summaryTable);
      setIsProcessing(false);
    }, 400);
  };

  // 2. COND STATS (SUMIF, COUNTIF, AVERAGEIF, Group By / Pivot)
  const runCondStats = () => {
    if (!condCol || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      if (condMode === 'groupby') {
        const groups = new Map<string, { count: number; sum: number }>();
        data.forEach(row => {
          const key = String(row[condCol] ?? '').trim() || '(Rỗng)';
          const cur = groups.get(key) || { count: 0, sum: 0 };
          cur.count += 1;
          if (condValCol) {
            const v = parseFloat(String(row[condValCol] || 0).replace(/,/g, '')) || 0;
            cur.sum += v;
          }
          groups.set(key, cur);
        });

        const res: Record<string, unknown>[] = [];
        groups.forEach((v, k) => {
          const item: Record<string, unknown> = {
            [condCol]: k,
            'Số lượng (COUNT)': v.count,
          };
          if (condValCol) {
            item[`Tổng (${condValCol})`] = Math.round(v.sum * 100) / 100;
            item[`Trung bình (${condValCol})`] = Math.round((v.sum / (v.count || 1)) * 100) / 100;
          }
          res.push(item);
        });
        res.sort((a, b) => (b['Số lượng (COUNT)'] as number) - (a['Số lượng (COUNT)'] as number));
        setResults(res);
      } else {
        // sumif / countif / avgif
        const filtered = data.filter(row => {
          const raw = String(row[condCol] ?? '').trim();
          const target = condVal.trim();
          if (condOp === '=') return raw.toLowerCase() === target.toLowerCase();
          if (condOp === '!=') return raw.toLowerCase() !== target.toLowerCase();
          if (condOp === 'contains') return raw.toLowerCase().includes(target.toLowerCase());

          const numVal = parseFloat(raw.replace(/,/g, ''));
          const numTarget = parseFloat(target.replace(/,/g, ''));
          if (isNaN(numVal) || isNaN(numTarget)) return false;
          if (condOp === '>') return numVal > numTarget;
          if (condOp === '<') return numVal < numTarget;
          if (condOp === '>=') return numVal >= numTarget;
          if (condOp === '<=') return numVal <= numTarget;
          return false;
        });

        if (condMode === 'countif') {
          const summary = [
            { 'Điều kiện': `${condCol} ${condOp} "${condVal}"`, 'Số dòng thỏa mãn': filtered.length },
          ];
          setResults(summary.concat(filtered as any));
        } else {
          // sumif / avgif
          let sum = 0;
          filtered.forEach(row => {
            const v = parseFloat(String(row[condValCol] || 0).replace(/,/g, '')) || 0;
            sum += v;
          });
          const avg = filtered.length > 0 ? sum / filtered.length : 0;
          const summary = [
            {
              'Điều kiện': `${condCol} ${condOp} "${condVal}"`,
              'Cột tính': condValCol,
              'Số dòng thỏa': filtered.length,
              'Tổng (SUM)': Math.round(sum * 100) / 100,
              'Trung bình (AVG)': Math.round(avg * 100) / 100,
            }
          ];
          setResults(summary.concat(filtered as any));
        }
      }
      setIsProcessing(false);
    }, 400);
  };

  // 3. IF LOGIC
  const runIfLogic = () => {
    if (!ifCol || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const colName = ifNewCol.trim() || `IF_${ifCol}`;
      const processed = data.map(row => {
        const raw = row[ifCol];
        const strVal = String(raw ?? '').trim();
        const target = ifCompareVal.trim();

        let isMatch = false;
        if (ifOp === 'empty') {
          isMatch = raw === null || raw === undefined || strVal === '';
        } else if (ifOp === 'not_empty') {
          isMatch = raw !== null && raw !== undefined && strVal !== '';
        } else if (ifOp === '=') {
          isMatch = strVal.toLowerCase() === target.toLowerCase();
        } else if (ifOp === '!=') {
          isMatch = strVal.toLowerCase() !== target.toLowerCase();
        } else if (ifOp === 'contains') {
          isMatch = strVal.toLowerCase().includes(target.toLowerCase());
        } else {
          const nVal = parseFloat(strVal.replace(/,/g, ''));
          const nTarget = parseFloat(target.replace(/,/g, ''));
          if (!isNaN(nVal) && !isNaN(nTarget)) {
            if (ifOp === '>') isMatch = nVal > nTarget;
            if (ifOp === '<') isMatch = nVal < nTarget;
            if (ifOp === '>=') isMatch = nVal >= nTarget;
            if (ifOp === '<=') isMatch = nVal <= nTarget;
          }
        }
        return {
          ...row,
          [colName]: isMatch ? ifTrueVal : ifFalseVal,
        };
      });
      setResults(processed);
      setIsProcessing(false);
    }, 400);
  };

  // 4. DATE OPS
  const runDateOps = () => {
    if (!dateColA || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const colName = dateNewCol.trim() || `KetQua_${dateOp}`;
      const now = new Date();

      const processed = data.map(row => {
        const dtA = parseDateVal(row[dateColA]);
        let resVal: string | number = '';

        if (dtA) {
          if (dateOp === 'diff_days') {
            const dtB = dateColB === '__TODAY__' ? now : parseDateVal(row[dateColB]);
            if (dtB) {
              const diffMs = dtB.getTime() - dtA.getTime();
              resVal = Math.round(diffMs / (1000 * 60 * 60 * 24));
            } else {
              resVal = 'Lỗi ngày B';
            }
          } else if (dateOp === 'calc_age') {
            let age = now.getFullYear() - dtA.getFullYear();
            const m = now.getMonth() - dtA.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < dtA.getDate())) age--;
            resVal = age >= 0 ? age : 0;
          } else if (dateOp === 'year') {
            resVal = dtA.getFullYear();
          } else if (dateOp === 'month') {
            resVal = dtA.getMonth() + 1;
          } else if (dateOp === 'day') {
            resVal = dtA.getDate();
          } else if (dateOp === 'format_dmy') {
            resVal = formatDateDMY(dtA);
          }
        } else {
          resVal = 'Lỗi ngày';
        }

        return { ...row, [colName]: resVal };
      });
      setResults(processed);
      setIsProcessing(false);
    }, 400);
  };

  // 5. TEXT (Mở rộng: Bỏ dấu, Proper, Len, Concat, Mid...)
  const runText = () => {
    if (!textCol || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const processed = data.map(row => {
        const raw = String(row[textCol] ?? '');
        let res: string | number = raw;

        switch (textOp) {
          case 'TRIM': res = raw.trim(); break;
          case 'LEFT': res = raw.substring(0, textParam); break;
          case 'RIGHT': res = raw.substring(Math.max(0, raw.length - textParam)); break;
          case 'MID': res = raw.substring(Math.max(0, textParam - 1), Math.max(0, textParam - 1) + textParam2); break;
          case 'UPPER': res = raw.toUpperCase(); break;
          case 'LOWER': res = raw.toLowerCase(); break;
          case 'PROPER': res = toProperCase(raw); break;
          case 'UNACCENT': res = removeVietnameseTones(raw); break;
          case 'LEN': res = raw.length; break;
          case 'CONCAT': {
            const second = textConcatCol ? String(row[textConcatCol] ?? '') : '';
            res = `${raw}${textConcatSep}${second}`;
            break;
          }
        }
        
        return { ...row, [`KetQua_${textOp}`]: res };
      });
      setResults(processed);
      setIsProcessing(false);
    }, 400);
  };

  // 6. VLOOKUP (Hỗ trợ ghép 1 hoặc nhiều cột cùng lúc)
  const toggleVlReturnCol = (col: string) => {
    setVlReturnCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const runVlookup = () => {
    if (!vlSourceCol || !vlTargetCol || vlReturnCols.length === 0 || data.length === 0 || vlData.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const lookupMap = new Map<string, Record<string, unknown>>();
      vlData.forEach(row => {
        const key = String(row[vlTargetCol] || '').trim().toLowerCase();
        if (key && !lookupMap.has(key)) lookupMap.set(key, row);
      });

      const processed = data.map(row => {
        const key = String(row[vlSourceCol] || '').trim().toLowerCase();
        const matched = lookupMap.get(key);
        const additions: Record<string, unknown> = {};
        vlReturnCols.forEach(rc => {
          additions[rc] = matched ? matched[rc] : '#N/A';
        });
        return { ...row, ...additions };
      });
      setResults(processed);
      setIsProcessing(false);
    }, 400);
  };

  // 7. LỌC ĐỐI CHIẾU 2 FILE
  const runCompareFilter = () => {
    if (!cmpSourceCol || !cmpTargetCol || data.length === 0 || vlData.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const map2 = new Map<string, Record<string, unknown>[]>();
      vlData.forEach(row => {
        const key = String(row[cmpTargetCol] ?? '').trim().toLowerCase();
        if (key) {
          if (!map2.has(key)) map2.set(key, []);
          map2.get(key)!.push(row);
        }
      });

      const setKey1 = new Set<string>();
      data.forEach(row => {
        const key = String(row[cmpSourceCol] ?? '').trim().toLowerCase();
        if (key) setKey1.add(key);
      });

      let res: Record<string, unknown>[] = [];

      if (cmpOp === 'both') {
        res = data.filter(row => {
          const key = String(row[cmpSourceCol] ?? '').trim().toLowerCase();
          return key && map2.has(key);
        });
      } else if (cmpOp === 'file1_only') {
        res = data.filter(row => {
          const key = String(row[cmpSourceCol] ?? '').trim().toLowerCase();
          return !key || !map2.has(key);
        });
      } else if (cmpOp === 'file2_only') {
        res = vlData.filter(row => {
          const key = String(row[cmpTargetCol] ?? '').trim().toLowerCase();
          return !key || !setKey1.has(key);
        });
      } else if (cmpOp === 'diff_val') {
        const diffList: Record<string, unknown>[] = [];
        data.forEach(row1 => {
          const key = String(row1[cmpSourceCol] ?? '').trim().toLowerCase();
          if (key && map2.has(key)) {
            const row2 = map2.get(key)![0];
            const raw1 = row1[cmpValCol1];
            const raw2 = row2[cmpValCol2];
            const val1 = parseFloat(String(raw1 ?? 0).replace(/,/g, '')) || 0;
            const val2 = parseFloat(String(raw2 ?? 0).replace(/,/g, '')) || 0;
            const diff = Math.round((val1 - val2) * 10000) / 10000;
            if (Math.abs(diff) > 0.0001) {
              diffList.push({
                ...row1,
                [`[F2] ${cmpValCol2}`]: raw2,
                'Chênh Lệch (F1 - F2)': diff,
              });
            }
          }
        });
        res = diffList;
      }

      setResults(res);
      setIsProcessing(false);
    }, 400);
  };

  // 8. MATH & LÀM TRÒN
  const runMath = () => {
    if (!mathColA || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const processed = data.map(row => {
        const valA = parseFloat(String(row[mathColA] || 0).replace(/,/g, '')) || 0;
        let res = 0;
        let colTitle = '';

        if (mathKind === 'two_cols') {
          const valB = parseFloat(String(row[mathColB] || 0).replace(/,/g, '')) || 0;
          switch (mathOp) {
            case '+': res = valA + valB; break;
            case '-': res = valA - valB; break;
            case '*': res = valA * valB; break;
            case '/': res = valB !== 0 ? valA / valB : 0; break;
          }
          colTitle = `KetQua (${mathColA} ${mathOp} ${mathColB})`;
        } else if (mathKind === 'round') {
          const factor = Math.pow(10, roundDigits);
          if (roundOp === 'ROUND') res = Math.round(valA * factor) / factor;
          if (roundOp === 'ROUNDUP') res = Math.ceil(valA * factor) / factor;
          if (roundOp === 'ROUNDDOWN') res = Math.floor(valA * factor) / factor;
          colTitle = `${mathColA}_${roundOp}(${roundDigits})`;
        } else if (mathKind === 'percent') {
          const valB = parseFloat(String(row[mathColB] || 0).replace(/,/g, '')) || 0;
          res = valB !== 0 ? Math.round((valA / valB) * 10000) / 100 : 0;
          colTitle = `Tỷ Lệ % (${mathColA} / ${mathColB})`;
        } else if (mathKind === 'abs') {
          res = Math.abs(valA);
          colTitle = `ABS(${mathColA})`;
        }

        return { ...row, [colTitle]: res };
      });
      setResults(processed);
      setIsProcessing(false);
    }, 400);
  };

  // 9. COUNT FREQ
  const runCountFreq = () => {
    if (!countCol || data.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const freqMap = new Map<string, number>();
      data.forEach(row => {
        const val = String(row[countCol] || '').trim();
        freqMap.set(val, (freqMap.get(val) || 0) + 1);
      });
      const summary: Record<string, unknown>[] = [];
      freqMap.forEach((c, k) => summary.push({ [countCol]: k, 'Số lần xuất hiện': c }));
      summary.sort((a, b) => (b['Số lần xuất hiện'] as number) - (a['Số lần xuất hiện'] as number));
      setResults(summary);
      setIsProcessing(false);
    }, 400);
  };

  const handleExport = () => {
    if (results.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KetQua');
    XLSX.writeFile(wb, `KetQua_${formulaMode?.toUpperCase() || 'OFFICE'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '1050px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1f2937', margin: 0, fontSize: '1.35rem' }}>
          <Settings size={24} color="#0ea5e9" />
          Công Thức Office Toàn Diện (Excel Pro)
        </h2>
        <span style={{ fontSize: '0.8rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 10px', borderRadius: '12px', fontWeight: 500 }}>
          Hỗ trợ .xlsx, .xls, .csv
        </span>
      </div>
      
      {/* KHUNG TẢI FILE */}
      <div style={{ display: 'grid', gridTemplateColumns: formulaMode === 'vlookup' || formulaMode === 'compareFilter' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
        <UploadCard
          title="File Dữ Liệu Gốc (File 1)"
          subtitle="Tải file cần xử lý công thức (.xlsx, .xls, .csv)"
          exampleName="BangDuLieu.xlsx"
          file={file}
          format={format}
          onFileChange={handleFileChange}
          previewRows={data.slice(0, 3)}
          color="#0ea5e9"
        />
        
        {(formulaMode === 'vlookup' || formulaMode === 'compareFilter') && (
          <UploadCard
            title="File Tham Chiếu / Đối Chiếu (File 2)"
            subtitle="Tải file dùng để dò tìm hoặc đối chiếu dữ liệu"
            exampleName="BangDoiChieu.xlsx"
            file={vlFile}
            format={vlFormat}
            onFileChange={handleVlFileChange}
            previewRows={vlData.slice(0, 3)}
            color="#8b5cf6"
          />
        )}
      </div>

      {data.length > 0 && (
        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.85rem', fontSize: '0.95rem', color: '#374151', fontWeight: 600 }}>
            Chọn Nhóm Công Thức Tính Toán:
          </h3>

          {/* THANH MENU NÚT CHỨC NĂNG */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button className={`btn-primary ${formulaMode === 'stats' ? 'active' : ''}`} onClick={() => { setFormulaMode('stats'); setResults([]); }} style={{ background: formulaMode === 'stats' ? '#10b981' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Calculator size={15}/> Thống Kê Cơ Bản
            </button>
            <button className={`btn-primary ${formulaMode === 'condStats' ? 'active' : ''}`} onClick={() => { setFormulaMode('condStats'); setResults([]); }} style={{ background: formulaMode === 'condStats' ? '#059669' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Layers size={15}/> Gom Nhóm & SUMIF
            </button>
            <button className={`btn-primary ${formulaMode === 'ifLogic' ? 'active' : ''}`} onClick={() => { setFormulaMode('ifLogic'); setResults([]); }} style={{ background: formulaMode === 'ifLogic' ? '#d97706' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Sparkles size={15}/> Hàm Logic IF
            </button>
            <button className={`btn-primary ${formulaMode === 'vlookup' ? 'active' : ''}`} onClick={() => { setFormulaMode('vlookup'); setResults([]); }} style={{ background: formulaMode === 'vlookup' ? '#8b5cf6' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <FileSearch size={15}/> Ghép Cột (VLOOKUP)
            </button>
            <button className={`btn-primary ${formulaMode === 'compareFilter' ? 'active' : ''}`} onClick={() => { setFormulaMode('compareFilter'); setResults([]); }} style={{ background: formulaMode === 'compareFilter' ? '#6366f1' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <GitCompare size={15}/> Lọc Đối Chiếu (2 File)
            </button>
            <button className={`btn-primary ${formulaMode === 'dateOps' ? 'active' : ''}`} onClick={() => { setFormulaMode('dateOps'); setResults([]); }} style={{ background: formulaMode === 'dateOps' ? '#0284c7' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Calendar size={15}/> Ngày Tháng & Tuổi
            </button>
            <button className={`btn-primary ${formulaMode === 'text' ? 'active' : ''}`} onClick={() => { setFormulaMode('text'); setResults([]); }} style={{ background: formulaMode === 'text' ? '#db2777' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Type size={15}/> Chuỗi Ký Tự
            </button>
            <button className={`btn-primary ${formulaMode === 'math' ? 'active' : ''}`} onClick={() => { setFormulaMode('math'); setResults([]); }} style={{ background: formulaMode === 'math' ? '#ea580c' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Sigma size={15}/> Toán & Làm Tròn
            </button>
            <button className={`btn-primary ${formulaMode === 'countFreq' ? 'active' : ''}`} onClick={() => { setFormulaMode('countFreq'); setResults([]); }} style={{ background: formulaMode === 'countFreq' ? '#0d9488' : '#4b5563', padding: '8px 12px', fontSize: '0.85rem' }}>
              <Hash size={15}/> Đếm Tần Suất
            </button>
          </div>

          {/* 1. CẤU HÌNH STATS CƠ BẢN */}
          {formulaMode === 'stats' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột cần phân tích số liệu:</label>
                <select className="search-input" value={statsCol} onChange={e => setStatsCol(e.target.value)} style={{ width: '260px', padding: '8px' }}>
                  <option value="">-- Chọn cột số --</option>
                  {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button className="btn-primary" style={{ marginTop: '22px', background: '#10b981' }} disabled={!statsCol || isProcessing} onClick={runStats}>
                {isProcessing ? 'Đang chạy...' : <><Play size={16}/> Chạy Thống Kê</>}
              </button>
            </div>
          )}

          {/* 2. CẤU HÌNH COND STATS (SUMIF, COUNTIF, GROUPBY) */}
          {formulaMode === 'condStats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Chế độ tính toán:</label>
                  <select className="search-input" value={condMode} onChange={e => setCondMode(e.target.value as any)} style={{ width: '230px', padding: '8px', fontWeight: 600 }}>
                    <option value="groupby">❖ Gom Nhóm & Tổng Hợp (Pivot)</option>
                    <option value="sumif">∑ SUMIF (Tính tổng có điều kiện)</option>
                    <option value="countif"># COUNTIF (Đếm có điều kiện)</option>
                    <option value="avgif">μ AVERAGEIF (Trung bình có ĐK)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>
                    {condMode === 'groupby' ? 'Cột phân nhóm (Group By):' : 'Cột xét điều kiện:'}
                  </label>
                  <select className="search-input" value={condCol} onChange={e => setCondCol(e.target.value)} style={{ width: '220px', padding: '8px' }}>
                    <option value="">-- Chọn cột --</option>
                    {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {condMode !== 'groupby' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Toán tử:</label>
                      <select className="search-input" value={condOp} onChange={e => setCondOp(e.target.value as any)} style={{ width: '130px', padding: '8px' }}>
                        <option value="=">Bằng (=)</option>
                        <option value="!=">Khác (!=)</option>
                        <option value="contains">Chứa chuỗi</option>
                        <option value=">">Lớn hơn (&gt;)</option>
                        <option value="<">Nhỏ hơn (&lt;)</option>
                        <option value=">=">Lớn hơn hoặc bằng (&gt;=)</option>
                        <option value="<=">Nhỏ hơn hoặc bằng (&lt;=)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Giá trị so sánh:</label>
                      <input className="search-input" placeholder="Nhập giá trị..." value={condVal} onChange={e => setCondVal(e.target.value)} style={{ width: '160px', padding: '8px' }} />
                    </div>
                  </>
                )}

                {(condMode === 'groupby' || condMode === 'sumif' || condMode === 'avgif') && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột số liệu tính SUM/AVG:</label>
                    <select className="search-input" value={condValCol} onChange={e => setCondValCol(e.target.value)} style={{ width: '200px', padding: '8px' }}>
                      <option value="">{condMode === 'groupby' ? '-- Chỉ đếm số lượng --' : '-- Chọn cột số --'}</option>
                      {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <button 
                    className="btn-primary" 
                    style={{ marginTop: '22px', background: '#059669' }} 
                    disabled={!condCol || (condMode !== 'groupby' && !condVal) || isProcessing} 
                    onClick={runCondStats}
                  >
                    {isProcessing ? 'Đang tính...' : <><Play size={16}/> Chạy Thống Kê</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. CẤU HÌNH IF LOGIC */}
          {formulaMode === 'ifLogic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>NẾU Cột:</label>
                  <select className="search-input" value={ifCol} onChange={e => setIfCol(e.target.value)} style={{ width: '200px', padding: '8px' }}>
                    <option value="">-- Chọn cột kiểm tra --</option>
                    {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Điều kiện:</label>
                  <select className="search-input" value={ifOp} onChange={e => setIfOp(e.target.value as any)} style={{ width: '150px', padding: '8px' }}>
                    <option value="=">Bằng (=)</option>
                    <option value="!=">Khác (!=)</option>
                    <option value="contains">Chứa chuỗi</option>
                    <option value="empty">Ô rỗng / Trống</option>
                    <option value="not_empty">Có dữ liệu</option>
                    <option value=">">Lớn hơn (&gt;)</option>
                    <option value="<">Nhỏ hơn (&lt;)</option>
                    <option value=">=">Lớn hơn hoặc = (&gt;=)</option>
                    <option value="<=">Nhỏ hơn hoặc = (&lt;=)</option>
                  </select>
                </div>

                {ifOp !== 'empty' && ifOp !== 'not_empty' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Giá trị so sánh:</label>
                    <input className="search-input" placeholder="Ví dụ: 0 hoặc Nội trú..." value={ifCompareVal} onChange={e => setIfCompareVal(e.target.value)} style={{ width: '160px', padding: '8px' }} />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#15803d' }}>THÌ gán (Đúng):</label>
                  <input className="search-input" placeholder="Gán giá trị đúng..." value={ifTrueVal} onChange={e => setIfTrueVal(e.target.value)} style={{ width: '140px', padding: '8px' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#b91c1c' }}>NGƯỢC LẠI (Sai):</label>
                  <input className="search-input" placeholder="Gán giá trị sai..." value={ifFalseVal} onChange={e => setIfFalseVal(e.target.value)} style={{ width: '140px', padding: '8px' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Tên cột kết quả:</label>
                  <input className="search-input" placeholder="TenCotMoi" value={ifNewCol} onChange={e => setIfNewCol(e.target.value)} style={{ width: '140px', padding: '8px' }} />
                </div>

                <div>
                  <button className="btn-primary" style={{ marginTop: '22px', background: '#d97706' }} disabled={!ifCol || isProcessing} onClick={runIfLogic}>
                    {isProcessing ? 'Đang chạy...' : <><Play size={16}/> Chạy Hàm IF</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. CẤU HÌNH VLOOKUP (NÂNG CẤP ĐA CỘT) */}
          {formulaMode === 'vlookup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {vlData.length === 0 ? (
                <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>Vui lòng tải File Tham Chiếu (File 2) ở khung bên trên trước.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột khóa File 1 (Giá trị dò tìm):</label>
                      <select className="search-input" value={vlSourceCol} onChange={e => setVlSourceCol(e.target.value)} style={{ width: '220px', padding: '8px' }}>
                        <option value="">-- Chọn cột khóa F1 --</option>
                        {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <ArrowRight size={16} color="#9ca3af" style={{ marginTop: '22px' }} />
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Khớp với Cột khóa File 2:</label>
                      <select className="search-input" value={vlTargetCol} onChange={e => setVlTargetCol(e.target.value)} style={{ width: '220px', padding: '8px' }}>
                        <option value="">-- Chọn cột khóa F2 --</option>
                        {vlColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#4b5563' }}>
                      Chọn một hoặc nhiều cột muốn lấy từ File 2 ghép sang File 1 (Multi-VLOOKUP):
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto', background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                      {vlColumns.map(c => {
                        const isSelected = vlReturnCols.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleVlReturnCol(c)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              padding: '4px 10px', borderRadius: '16px', fontSize: '0.8rem',
                              border: '1px solid',
                              cursor: 'pointer',
                              borderColor: isSelected ? '#8b5cf6' : '#d1d5db',
                              background: isSelected ? '#ede9fe' : '#f9fafb',
                              color: isSelected ? '#6d28d9' : '#374151',
                              fontWeight: isSelected ? 600 : 400
                            }}
                          >
                            <CheckSquare size={13} color={isSelected ? '#6d28d9' : '#9ca3af'} />
                            {c}
                          </button>
                        );
                      })}
                    </div>
                    {vlReturnCols.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#6d28d9', marginTop: '4px' }}>
                        Đã chọn {vlReturnCols.length} cột: {vlReturnCols.join(', ')}
                      </div>
                    )}
                  </div>

                  <div>
                    <button className="btn-primary" style={{ background: '#8b5cf6' }} disabled={!vlSourceCol || !vlTargetCol || vlReturnCols.length === 0 || isProcessing} onClick={runVlookup}>
                      {isProcessing ? 'Đang ghép dữ liệu...' : <><Play size={16}/> Chạy Ghép Cột VLOOKUP</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 5. CẤU HÌNH LỌC ĐỐI CHIẾU 2 FILE */}
          {formulaMode === 'compareFilter' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {vlData.length === 0 ? (
                <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>Vui lòng tải File Tham Chiếu / Đối Chiếu (File 2) ở phía trên trước.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột khóa File 1 (vd: Mã thuốc / Mã VT):</label>
                      <select className="search-input" value={cmpSourceCol} onChange={e => setCmpSourceCol(e.target.value)} style={{ width: '230px', padding: '8px' }}>
                        <option value="">-- Chọn cột khóa F1 --</option>
                        {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <ArrowRight size={16} color="#9ca3af" style={{ marginTop: '22px' }} />
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Khớp với Cột khóa File 2:</label>
                      <select className="search-input" value={cmpTargetCol} onChange={e => setCmpTargetCol(e.target.value)} style={{ width: '230px', padding: '8px' }}>
                        <option value="">-- Chọn cột khóa F2 --</option>
                        {vlColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Kiểu lọc đối chiếu:</label>
                      <select className="search-input" value={cmpOp} onChange={e => setCmpOp(e.target.value as any)} style={{ width: '310px', padding: '8px', fontWeight: 500 }}>
                        <option value="both">✓ Có trong cả 2 file (Khớp mã / Giao nhau)</option>
                        <option value="file1_only">▲ Chỉ có ở File 1 (File 2 thiếu / dư)</option>
                        <option value="file2_only">▼ Chỉ có ở File 2 (File 1 thiếu / dư)</option>
                        <option value="diff_val">≠ So sánh chênh lệch Số lượng tồn / Tiền</option>
                      </select>
                    </div>

                    {cmpOp === 'diff_val' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột số liệu F1 (Tồn kho 1):</label>
                          <select className="search-input" value={cmpValCol1} onChange={e => setCmpValCol1(e.target.value)} style={{ width: '180px', padding: '8px' }}>
                            <option value="">-- Chọn cột số --</option>
                            {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột số liệu F2 (Tồn kho 2):</label>
                          <select className="search-input" value={cmpValCol2} onChange={e => setCmpValCol2(e.target.value)} style={{ width: '180px', padding: '8px' }}>
                            <option value="">-- Chọn cột số --</option>
                            {vlColumns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <button 
                        className="btn-primary" 
                        style={{ marginTop: '22px', background: '#6366f1' }} 
                        disabled={!cmpSourceCol || !cmpTargetCol || (cmpOp === 'diff_val' && (!cmpValCol1 || !cmpValCol2)) || isProcessing} 
                        onClick={runCompareFilter}
                      >
                        {isProcessing ? 'Đang lọc...' : <><Play size={16}/> Chạy Lọc Đối Chiếu</>}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 6. CẤU HÌNH NGÀY THÁNG & TÍNH TUỔI */}
          {formulaMode === 'dateOps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Phép tính ngày tháng:</label>
                  <select className="search-input" value={dateOp} onChange={e => setDateOp(e.target.value as any)} style={{ width: '270px', padding: '8px', fontWeight: 600 }}>
                    <option value="diff_days">⏱ Tính số ngày nằm viện / chênh lệch (B - A)</option>
                    <option value="calc_age">🎂 Tính tuổi từ ngày sinh (Age)</option>
                    <option value="year">📅 Lấy Năm (YYYY)</option>
                    <option value="month">📅 Lấy Tháng (MM)</option>
                    <option value="day">📅 Lấy Ngày (DD)</option>
                    <option value="format_dmy">✨ Chuẩn hóa định dạng DD/MM/YYYY</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>
                    {dateOp === 'calc_age' ? 'Cột Ngày Sinh:' : 'Cột Ngày A (Bắt đầu):'}
                  </label>
                  <select className="search-input" value={dateColA} onChange={e => setDateColA(e.target.value)} style={{ width: '220px', padding: '8px' }}>
                    <option value="">-- Chọn cột ngày --</option>
                    {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {dateOp === 'diff_days' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột Ngày B (Kết thúc):</label>
                    <select className="search-input" value={dateColB} onChange={e => setDateColB(e.target.value)} style={{ width: '220px', padding: '8px' }}>
                      <option value="__TODAY__">-- Ngày Hôm Nay (Now) --</option>
                      {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Tên cột kết quả:</label>
                  <input className="search-input" placeholder="TenCotMoi" value={dateNewCol} onChange={e => setDateNewCol(e.target.value)} style={{ width: '160px', padding: '8px' }} />
                </div>

                <div>
                  <button className="btn-primary" style={{ marginTop: '22px', background: '#0284c7' }} disabled={!dateColA || isProcessing} onClick={runDateOps}>
                    {isProcessing ? 'Đang tính...' : <><Play size={16}/> Chạy Tính Ngày</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. CẤU HÌNH TEXT */}
          {formulaMode === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột cần xử lý chuỗi:</label>
                  <select className="search-input" value={textCol} onChange={e => setTextCol(e.target.value)} style={{ width: '210px', padding: '8px' }}>
                    <option value="">-- Chọn cột --</option>
                    {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Hàm xử lý:</label>
                  <select className="search-input" value={textOp} onChange={e => setTextOp(e.target.value)} style={{ width: '230px', padding: '8px', fontWeight: 600 }}>
                    <option value="UNACCENT">🔤 BỎ DẤU TIẾNG VIỆT (Nguyen Van A)</option>
                    <option value="PROPER">🔠 Viết Hoa Chữ Đầu (Họ Và Tên)</option>
                    <option value="UPPER">🔠 IN HOA TOÀN BỘ</option>
                    <option value="LOWER">🔡 in thường toàn bộ</option>
                    <option value="LEN">📏 Đếm độ dài ký tự (Check BHYT/CCCD)</option>
                    <option value="TRIM">✂ TRIM (Xóa khoảng trắng thừa)</option>
                    <option value="LEFT">⇦ LEFT (Cắt từ trái sang)</option>
                    <option value="RIGHT">⇨ RIGHT (Cắt từ phải sang)</option>
                    <option value="MID">↔ MID (Cắt ở giữa chuỗi)</option>
                    <option value="CONCAT">🔗 CONCAT (Ghép với cột khác)</option>
                  </select>
                </div>

                {(textOp === 'LEFT' || textOp === 'RIGHT') && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Số ký tự:</label>
                    <input type="number" min={1} max={500} className="search-input" value={textParam} onChange={e => setTextParam(Number(e.target.value))} style={{ width: '90px', padding: '8px' }} />
                  </div>
                )}

                {textOp === 'MID' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Vị trí bắt đầu:</label>
                      <input type="number" min={1} max={500} className="search-input" value={textParam} onChange={e => setTextParam(Number(e.target.value))} style={{ width: '90px', padding: '8px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Độ dài lấy:</label>
                      <input type="number" min={1} max={500} className="search-input" value={textParam2} onChange={e => setTextParam2(Number(e.target.value))} style={{ width: '90px', padding: '8px' }} />
                    </div>
                  </>
                )}

                {textOp === 'CONCAT' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Ghép với cột:</label>
                      <select className="search-input" value={textConcatCol} onChange={e => setTextConcatCol(e.target.value)} style={{ width: '180px', padding: '8px' }}>
                        <option value="">-- Chọn cột ghép --</option>
                        {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Ký tự nối:</label>
                      <input className="search-input" placeholder="Ví dụ: - hoặc cách" value={textConcatSep} onChange={e => setTextConcatSep(e.target.value)} style={{ width: '80px', padding: '8px', textAlign: 'center' }} />
                    </div>
                  </>
                )}

                <div>
                  <button className="btn-primary" style={{ marginTop: '22px', background: '#db2777' }} disabled={!textCol || isProcessing} onClick={runText}>
                    {isProcessing ? 'Đang chạy...' : <><Play size={16}/> Xử Lý Chuỗi</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 8. CẤU HÌNH MATH & LÀM TRÒN */}
          {formulaMode === 'math' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Kiểu phép toán:</label>
                  <select className="search-input" value={mathKind} onChange={e => setMathKind(e.target.value as any)} style={{ width: '220px', padding: '8px', fontWeight: 600 }}>
                    <option value="two_cols">➕ Phép tính 2 Cột (+, -, *, /)</option>
                    <option value="round">🔢 Làm tròn số / Tiền lẻ (ROUND)</option>
                    <option value="percent">％ Tính Tỷ Lệ Phần Trăm</option>
                    <option value="abs">|x| Trị Tuyệt Đối (ABS)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột A:</label>
                  <select className="search-input" value={mathColA} onChange={e => setMathColA(e.target.value)} style={{ width: '200px', padding: '8px' }}>
                    <option value="">-- Chọn Cột A --</option>
                    {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {mathKind === 'two_cols' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Phép tính:</label>
                      <select className="search-input" value={mathOp} onChange={e => setMathOp(e.target.value)} style={{ width: '70px', padding: '8px', textAlign: 'center' }}>
                        <option value="+">+</option>
                        <option value="-">-</option>
                        <option value="*">*</option>
                        <option value="/">/</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột B:</label>
                      <select className="search-input" value={mathColB} onChange={e => setMathColB(e.target.value)} style={{ width: '200px', padding: '8px' }}>
                        <option value="">-- Chọn Cột B --</option>
                        {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {mathKind === 'percent' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Chia cho Cột B (Tổng):</label>
                    <select className="search-input" value={mathColB} onChange={e => setMathColB(e.target.value)} style={{ width: '200px', padding: '8px' }}>
                      <option value="">-- Chọn Cột B --</option>
                      {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                {mathKind === 'round' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cách làm tròn:</label>
                      <select className="search-input" value={roundOp} onChange={e => setRoundOp(e.target.value as any)} style={{ width: '160px', padding: '8px' }}>
                        <option value="ROUND">ROUND (Chuẩn)</option>
                        <option value="ROUNDUP">ROUNDUP (Lên)</option>
                        <option value="ROUNDDOWN">ROUNDDOWN (Xuống)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Số chữ số làm tròn:</label>
                      <select className="search-input" value={roundDigits} onChange={e => setRoundDigits(Number(e.target.value))} style={{ width: '170px', padding: '8px' }}>
                        <option value="2">2 số lẻ (0.01)</option>
                        <option value="1">1 số lẻ (0.1)</option>
                        <option value="0">0 số lẻ (Hàng đơn vị)</option>
                        <option value="-2">Hàng trăm (-2)</option>
                        <option value="-3">Hàng nghìn (-3)</option>
                        <option value="-4">Hàng chục nghìn (-4)</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <button className="btn-primary" style={{ marginTop: '22px', background: '#ea580c' }} disabled={!mathColA || (mathKind !== 'round' && mathKind !== 'abs' && !mathColB) || isProcessing} onClick={runMath}>
                    {isProcessing ? 'Đang tính...' : <><Play size={16}/> Tính Toán</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 9. CẤU HÌNH COUNT FREQ */}
          {formulaMode === 'countFreq' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>Cột cần đếm tần suất xuất hiện:</label>
                <select className="search-input" value={countCol} onChange={e => setCountCol(e.target.value)} style={{ width: '260px', padding: '8px' }}>
                  <option value="">-- Chọn cột --</option>
                  {sourceColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button className="btn-primary" style={{ marginTop: '22px', background: '#0d9488' }} disabled={!countCol || isProcessing} onClick={runCountFreq}>
                {isProcessing ? 'Đang chạy...' : <><Play size={16}/> Đếm Tần Suất</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* HIỂN THỊ KẾT QUẢ VÀ XUẤT FILE */}
      {results.length > 0 && (
        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#1f2937', fontWeight: 600 }}>
              Bảng Kết Quả Tính Toán ({results.length} dòng)
            </h3>
            <button className="btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
              <Download size={16} /> Xuất File Excel
            </button>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '420px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <table className="results-table" style={{ width: '100%', minWidth: '650px', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  {Object.keys(results[0]).map(k => (
                    <th key={k} style={{ padding: '9px 12px', borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 60).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    {Object.keys(results[0]).map(k => (
                      <td key={k} style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#1e293b' }}>{String(r[k] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 60 && (
              <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                Đang hiển thị trước 60 dòng đầu tiên. Bấm nút <b>"Xuất File Excel"</b> ở góc trên để tải về đầy đủ {results.length} dòng.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
