import React, { useState } from 'react';
import { FileText, CheckCircle, AlertTriangle, Code, Play, Download } from 'lucide-react';

export function SelfBuilt01Tab() {
  const [xmlStructure, setXmlStructure] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [generatedXml, setGeneratedXml] = useState<string>('');
  
  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    dob: '',
    salaryBasis: '',
    taxCode: '',
    notes: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const analyzeGoldenRecord = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Lỗi #5 fix: đệ quy phân tích XML nhiều cấp (tối đa depth 3)
    const describeNode = (el: Element, depth: number): string => {
      const indent = '  '.repeat(depth);
      const attrs = Array.from(el.attributes)
        .map(a => `@${a.name}="${a.value.substring(0, 30)}"`);
      const attrsStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
      const textContent = el.children.length === 0
        ? (el.textContent?.trim().substring(0, 40) || '')
        : '';
      const textStr = textContent ? `: "${textContent}${textContent.length >= 40 ? '...' : ''}"` : '';

      let result = `${indent}└ <${el.nodeName}>${attrsStr}${textStr}\n`;

      if (depth < 3) {
        // Nhóm các tag con trùng tên lại thành 1 (tránh spam)
        const seen = new Set<string>();
        Array.from(el.children).forEach(child => {
          if (!seen.has(child.nodeName)) {
            seen.add(child.nodeName);
            const sameTagCount = el.querySelectorAll(child.nodeName).length;
            const countNote = sameTagCount > 1 ? ` ×${sameTagCount}` : '';
            result += describeNode(child, depth + 1).replace(
              `└ <${child.nodeName}>`,
              `└ <${child.nodeName}>${countNote}`
            );
          }
        });
      } else if (el.children.length > 0) {
        result += `${'  '.repeat(depth + 1)}└ ... (${el.children.length} phần tử con nữa)\n`;
      }
      return result;
    };

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const parseErr = doc.querySelector('parsererror');
        if (parseErr) {
          setXmlStructure('Lỗi cú pháp XML: ' + (parseErr.textContent?.slice(0, 120) ?? ''));
          return;
        }

        const root = doc.documentElement;
        let structure = `Root Element: <${root.nodeName}>\n`;
        const attrs = Array.from(root.attributes);
        if (attrs.length > 0) {
          structure += `  Attributes: ${attrs.map(a => `${a.name}="${a.value}"`).join(', ')}\n`;
        }
        structure += `  Tổng con trực tiếp: ${root.children.length} phần tử\n\n`;

        if (root.children.length === 0) {
          structure += '  Không tìm thấy thẻ con nào.';
        } else {
          // Hiển thị cấu trúc cầy (đệ quy tối đa 3 cấp)
          const seen = new Set<string>();
          Array.from(root.children).forEach(child => {
            if (!seen.has(child.nodeName)) {
              seen.add(child.nodeName);
              const count = root.querySelectorAll(child.nodeName).length;
              structure += `└ <${child.nodeName}>${count > 1 ? ` ×${count}` : ''}\n`;
              Array.from(child.children).forEach(gc => {
                if (!gc.previousElementSibling || gc.previousElementSibling.nodeName !== gc.nodeName) {
                  structure += describeNode(gc, 2);
                }
              });
            }
          });
        }
        setXmlStructure(structure);
      } catch (err) {
        setXmlStructure('Lỗi đọc file XML: ' + String(err));
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const validateData = () => {
    const errors: string[] = [];
    
    // 1. HoTen_NLD: Không được null, max 100 ký tự
    if (!formData.fullName.trim()) {
      errors.push('Họ tên (employee.fullName) không được để trống.');
    } else if (formData.fullName.length > 100) {
      errors.push('Họ tên không được vượt quá 100 ký tự.');
    }

    // 2. NgaySinh: DD/MM/YYYY
    const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/\d{4}$/;
    if (!dateRegex.test(formData.dob)) {
      errors.push('Ngày sinh (employee.dob) phải đúng định dạng DD/MM/YYYY.');
    }

    // 3. MucLuong_Dong: Integer, > 0
    const salary = parseInt(formData.salaryBasis, 10);
    if (isNaN(salary) || salary <= 0 || !/^\d+$/.test(formData.salaryBasis)) {
      errors.push('Mức lương đóng (insurance.salary_basis) phải là số nguyên lớn hơn 0 (không chứa dấu phẩy).');
    }

    // 4. MaSoThue: Exactly 10 hoặc 14 ký tự
    const taxLen = formData.taxCode.trim().length;
    if (taxLen !== 10 && taxLen !== 14) {
      errors.push('Mã số thuế (company.taxCode) phải có đúng 10 hoặc 14 ký tự.');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const generateXML = () => {
    if (!validateData()) {
      setGeneratedXml('');
      return;
    }

    try {
      // 3. NGUYÊN TẮC: KHÔNG SỬ DỤNG STRING CONCATENATION. Sử dụng DOM API.
      const doc = document.implementation.createDocument(null, 'HoSo_01BH', null);
      const root = doc.documentElement;

      // <HoTen_NLD>
      const hoTen = doc.createElement('HoTen_NLD');
      hoTen.textContent = formData.fullName.trim().toUpperCase(); // Yêu cầu UPPERCASE
      root.appendChild(hoTen);

      // <NgaySinh>
      const ngaySinh = doc.createElement('NgaySinh');
      ngaySinh.textContent = formData.dob;
      root.appendChild(ngaySinh);

      // <MucLuong_Dong>
      const mucLuong = doc.createElement('MucLuong_Dong');
      mucLuong.textContent = formData.salaryBasis;
      root.appendChild(mucLuong);

      // <MaSoThue>
      const maSoThue = doc.createElement('MaSoThue');
      maSoThue.textContent = formData.taxCode;
      root.appendChild(maSoThue);

      // <GhiChu> sử dụng CDATA
      if (formData.notes) {
        const ghiChu = doc.createElement('GhiChu');
        const cdata = doc.createCDATASection(formData.notes); // Bọc CDATA
        ghiChu.appendChild(cdata);
        root.appendChild(ghiChu);
      }

      const serializer = new XMLSerializer();
      let xmlString = serializer.serializeToString(doc);
      // Format XML cho dễ đọc (đơn giản)
      xmlString = xmlString.replace(/></g, '>\n<');

      setGeneratedXml('<?xml version="1.0" encoding="UTF-8"?>\n' + xmlString);
    } catch (err) {
      setValidationErrors(['Lỗi tạo XML: ' + String(err)]);
    }
  };

  const downloadXML = () => {
    if (!generatedXml) return;
    const blob = new Blob([generatedXml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `01_BH_${formData.taxCode || 'export'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Reverse Engineering */}
      <div className="results-section">
        <div className="results-header">
          <div className="results-title">
            <Code size={18} style={{ marginRight: 8, color: 'var(--primary)' }} />
            1. Phân tích cấu trúc (Reverse Engineering)
          </div>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Tải lên file XML "Golden Record" (File mẫu chuẩn) hoặc XSD để dịch ngược và xem trước cấu trúc mong đợi của XML Viewer.
          </p>
          <input type="file" accept=".xml,.xsd" onChange={analyzeGoldenRecord} style={{ fontSize: '0.85rem' }} />
          {xmlStructure && (
            <pre style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, fontSize: '0.8rem', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
              {xmlStructure}
            </pre>
          )}
        </div>
      </div>

      {/* 2. Mapping Dictionary */}
      <div className="results-section">
        <div className="results-header">
          <div className="results-title">
            <FileText size={18} style={{ marginRight: 8, color: 'var(--primary)' }} />
            2. Từ điển Mapping (Mapping Dictionary)
          </div>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <table className="preview-table" style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Nguồn (Form/DB)</th>
                <th>Đích (XML Tag)</th>
                <th>Định dạng bắt buộc</th>
                <th>Ràng buộc (Validation)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>employee.fullName</td>
                <td style={{ color: '#0369a1' }}>&lt;HoTen_NLD&gt;</td>
                <td>UPPERCASE, UTF-8</td>
                <td>Không được null, max 100 ký tự</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>employee.dob</td>
                <td style={{ color: '#0369a1' }}>&lt;NgaySinh&gt;</td>
                <td>DD/MM/YYYY</td>
                <td>Phải đúng định dạng ngày</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>insurance.salary_basis</td>
                <td style={{ color: '#0369a1' }}>&lt;MucLuong_Dong&gt;</td>
                <td>Integer, không có dấu phẩy</td>
                <td>Phải &gt; 0</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>company.taxCode</td>
                <td style={{ color: '#0369a1' }}>&lt;MaSoThue&gt;</td>
                <td>String</td>
                <td>Exactly 10 hoặc 14 ký tự</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>employee.notes</td>
                <td style={{ color: '#0369a1' }}>&lt;GhiChu&gt;</td>
                <td>CDATA</td>
                <td>Bao bọc trong &lt;![CDATA[...]]&gt;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3 & 4. Form Input & Validation */}
      <div className="results-section">
        <div className="results-header">
          <div className="results-title">
            <CheckCircle size={18} style={{ marginRight: 8, color: 'var(--primary)' }} />
            3 & 4. Xây dựng Code chuẩn & Tích hợp Validate "từ trong trứng nước"
          </div>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', gap: '2rem' }}>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Họ và tên (employee.fullName)</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} className="search-input" style={{ width: '100%' }} placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ngày sinh (employee.dob)</label>
              <input type="text" name="dob" value={formData.dob} onChange={handleInputChange} className="search-input" style={{ width: '100%' }} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mức lương đóng (insurance.salary_basis)</label>
              <input type="text" name="salaryBasis" value={formData.salaryBasis} onChange={handleInputChange} className="search-input" style={{ width: '100%' }} placeholder="Ví dụ: 5000000" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã số thuế (company.taxCode)</label>
              <input type="text" name="taxCode" value={formData.taxCode} onChange={handleInputChange} className="search-input" style={{ width: '100%' }} placeholder="10 hoặc 14 ký tự" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ghi chú (sẽ bọc CDATA)</label>
              <textarea name="notes" value={formData.notes} onChange={handleInputChange} className="search-input" style={{ width: '100%', minHeight: 60 }} placeholder="Nghỉ ốm đau > 14 ngày & sinh con" />
            </div>

            <button className="btn-primary" onClick={generateXML} style={{ width: 'fit-content' }}>
              <Play size={16} /> Validate & Xuất XML
            </button>

            {validationErrors.length > 0 && (
              <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991b1b', fontWeight: 700, marginBottom: 8 }}>
                  <AlertTriangle size={16} /> Cảnh báo Validate (Chặn xuất XML):
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#b91c1c', fontSize: '0.85rem' }}>
                  {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
             <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>Mô phỏng XML Output (Sử dụng XML DOM API):</label>
             <div style={{ flex: 1, background: '#1e293b', color: '#e2e8f0', padding: '1rem', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflow: 'auto', minHeight: 200 }}>
               {generatedXml || 'Chưa sinh XML. Hãy điền thông tin và bấm nút.\n\nSử dụng cơ chế DOM API thay vì String Concatenation để tránh lỗi cấu trúc.'}
             </div>
             {generatedXml && (
               <button className="btn-secondary" onClick={downloadXML} style={{ marginTop: '1rem', width: 'fit-content' }}>
                 <Download size={16} /> Tải file XML
               </button>
             )}
          </div>

        </div>
      </div>
    </div>
  );
}
