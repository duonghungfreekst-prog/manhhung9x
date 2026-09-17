const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runPsScriptFile } = require('../services/system/powerShellExecutor.cjs');

/**
 * ca.ipc.cjs - Module Ký Số XML Chuẩn Bộ Y Tế & USB Token (CA Suite)
 * Xử lý:
 * - Lấy danh sách chứng thư số cá nhân/USB Token đang cắm
 * - Hộp thoại chọn file XML
 * - Ký số XML chuẩn XMLDSig (Enveloped Signature)
 * - Xác thực chữ ký số XML
 * - Hộp thoại lưu file XML đã ký
 */
function registerCaIPC() {
  // 7.1 Lấy danh sách chứng thư số cá nhân / USB Token đang cắm
  ipcMain.handle('ca:get-certificates', async () => {
    try {
      const psScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $certs = @()
        $stores = @("Cert:\\CurrentUser\\My", "Cert:\\LocalMachine\\My")
        foreach ($st in $stores) {
          if (Test-Path $st) {
            $items = Get-ChildItem -Path $st -ErrorAction SilentlyContinue | Where-Object { $_.HasPrivateKey -eq $true }
            foreach ($c in $items) {
              $certs += [PSCustomObject]@{
                Subject = $c.Subject
                Issuer = $c.Issuer
                SerialNumber = $c.SerialNumber
                Thumbprint = $c.Thumbprint
                NotBefore = $c.NotBefore.ToString("yyyy-MM-dd HH:mm:ss")
                NotAfter = $c.NotAfter.ToString("yyyy-MM-dd HH:mm:ss")
                FriendlyName = if ($c.FriendlyName) { $c.FriendlyName } else { "" }
                HasPrivateKey = $c.HasPrivateKey
                Store = $st
              }
            }
          }
        }
        $certs | ConvertTo-Json -Compress
      `;
      const out = await runPsScriptFile(psScript);
      let list = [];
      if (out) {
        try {
          const parsed = JSON.parse(out);
          list = Array.isArray(parsed) ? parsed : [parsed];
        } catch {}
      }
      return { ok: true, certificates: list };
    } catch (err) {
      console.error('[CA_GET_CERTS_ERR]', err);
      return { ok: false, error: err.message, certificates: [] };
    }
  });

  // 7.2 Mở hộp thoại chọn tệp XML từ máy tính
  ipcMain.handle('ca:select-xml-files', async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: 'Chọn các tệp XML hồ sơ cần ký số',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Tệp Hồ Sơ XML (*.xml)', extensions: ['xml'] },
          { name: 'Tất Cả Tệp (*.*)', extensions: ['*'] }
        ]
      });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { ok: true, canceled: true, files: [] };
      }
      const filesInfo = [];
      for (const fp of res.filePaths) {
        try {
          const stat = fs.statSync(fp);
          filesInfo.push({
            path: fp,
            name: path.basename(fp),
            size: stat.size,
          });
        } catch {}
      }
      return { ok: true, canceled: false, files: filesInfo };
    } catch (err) {
      return { ok: false, error: err.message, files: [] };
    }
  });

  // 7.3 Ký số XML chuẩn XMLDSig
  ipcMain.handle('ca:sign-xml', async (_event, payload) => {
    try {
      const { filePath, xmlContent, thumbprint, targetTag = 'CHUKYDONVI', customOutputPath } = payload || {};
      if (!thumbprint) {
        return { ok: false, error: 'Chưa chọn chứng thư số để ký!' };
      }
      let inPath = filePath;
      let isTempIn = false;
      if (!inPath && xmlContent) {
        inPath = path.join(os.tmpdir(), `dmh_in_${Date.now()}.xml`);
        fs.writeFileSync(inPath, xmlContent, { encoding: 'utf8' });
        isTempIn = true;
      }
      if (!inPath || !fs.existsSync(inPath)) {
        return { ok: false, error: 'Không tìm thấy tệp XML cần ký!' };
      }

      const outPath = customOutputPath || (filePath
        ? filePath.replace(/\.xml$/i, '_signed.xml')
        : path.join(os.tmpdir(), `dmh_signed_${Date.now()}.xml`));

      const psScript = `
        Add-Type -AssemblyName System.Security
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

        $thumbprint = "${thumbprint.replace(/"/g, '`"')}"
        $xmlInPath = "${inPath.replace(/\\/g, '\\\\').replace(/"/g, '`"')}"
        $xmlOutPath = "${outPath.replace(/\\/g, '\\\\').replace(/"/g, '`"')}"
        $targetTag = "${(targetTag || 'CHUKYDONVI').replace(/"/g, '`"')}"

        if (-not (Test-Path $xmlInPath)) {
          throw "Tệp XML nguồn không tồn tại: $xmlInPath"
        }

        $xmlDoc = New-Object System.Xml.XmlDocument
        $xmlDoc.PreserveWhitespace = $true
        $xmlDoc.Load($xmlInPath)

        $cert = Get-Item "Cert:\\CurrentUser\\My\\$thumbprint" -ErrorAction SilentlyContinue
        if (-not $cert) {
          $cert = Get-Item "Cert:\\LocalMachine\\My\\$thumbprint" -ErrorAction SilentlyContinue
        }
        if (-not $cert) {
          throw "Không tìm thấy chứng thư số với Thumbprint: $thumbprint trong Windows Certificate Store."
        }

        $privateKey = $cert.PrivateKey
        if (-not $privateKey) {
          try {
            $privateKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
          } catch {}
        }
        if (-not $privateKey) {
          throw "Không thể nạp Private Key từ chứng thư số. Nếu dùng USB Token, vui lòng kiểm tra kết nối thiết bị và mã PIN."
        }

        $signedXml = New-Object System.Security.Cryptography.Xml.SignedXml($xmlDoc)
        $signedXml.SigningKey = $privateKey

        # Reference URI=""
        $reference = New-Object System.Security.Cryptography.Xml.Reference("")
        $envTransform = New-Object System.Security.Cryptography.Xml.XmlDsigEnvelopedSignatureTransform
        $reference.AddTransform($envTransform)
        $c14nTransform = New-Object System.Security.Cryptography.Xml.XmlDsigC14NTransform
        $reference.AddTransform($c14nTransform)
        $signedXml.AddReference($reference)

        # KeyInfo
        $keyInfo = New-Object System.Security.Cryptography.Xml.KeyInfo
        $keyInfoX509 = New-Object System.Security.Cryptography.Xml.KeyInfoX509Data($cert)
        $keyInfo.AddClause($keyInfoX509)
        $signedXml.KeyInfo = $keyInfo

        # Compute Signature
        $signedXml.ComputeSignature()
        $sigElement = $signedXml.GetXml()

        # Đính kèm vào thẻ yêu cầu (CHUKYDONVI hoặc Root)
        $destNode = $null
        if ($targetTag -and $targetTag -ne 'ROOT') {
          $destNode = $xmlDoc.SelectSingleNode("//$targetTag")
          if (-not $destNode) {
            $destNode = $xmlDoc.SelectSingleNode("//" + $targetTag.ToLower())
          }
        }
        if (-not $destNode) {
          $destNode = $xmlDoc.DocumentElement
        }

        $destNode.AppendChild($xmlDoc.ImportNode($sigElement, $true)) | Out-Null
        $xmlDoc.Save($xmlOutPath)
        Write-Output "SUCCESS"
      `;

      await runPsScriptFile(psScript);

      let signedContent = '';
      if (fs.existsSync(outPath)) {
        signedContent = fs.readFileSync(outPath, { encoding: 'utf8' });
      }

      if (isTempIn) {
        try { fs.unlinkSync(inPath); } catch {}
      }

      return {
        ok: true,
        outputPath: outPath,
        signedXml: signedContent,
        filename: path.basename(outPath)
      };
    } catch (err) {
      console.error('[CA_SIGN_ERR]', err);
      return { ok: false, error: err.message };
    }
  });

  // 7.4 Xác thực chữ ký số XML (Verify XML Signature)
  ipcMain.handle('ca:verify-xml', async (_event, payload) => {
    try {
      const { filePath, xmlContent } = payload || {};
      let inPath = filePath;
      let isTempIn = false;
      if (!inPath && xmlContent) {
        inPath = path.join(os.tmpdir(), `dmh_verify_${Date.now()}.xml`);
        fs.writeFileSync(inPath, xmlContent, { encoding: 'utf8' });
        isTempIn = true;
      }
      if (!inPath || !fs.existsSync(inPath)) {
        return { ok: false, error: 'Không tìm thấy tệp XML cần kiểm tra!' };
      }

      const psScript = `
        Add-Type -AssemblyName System.Security
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

        $xmlInPath = "${inPath.replace(/\\/g, '\\\\').replace(/"/g, '`"')}"
        $xmlDoc = New-Object System.Xml.XmlDocument
        $xmlDoc.PreserveWhitespace = $true
        $xmlDoc.Load($xmlInPath)

        $nsMgr = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
        $nsMgr.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#")
        $sigNode = $xmlDoc.SelectSingleNode("//ds:Signature", $nsMgr)

        if (-not $sigNode) {
          [PSCustomObject]@{
            IsSigned = $false
            IsValid = $false
            Message = "Tệp XML chưa có chữ ký số (không tìm thấy thẻ ds:Signature)."
          } | ConvertTo-Json -Compress
          exit
        }

        $signedXml = New-Object System.Security.Cryptography.Xml.SignedXml($xmlDoc)
        $signedXml.LoadXml($sigNode)

        $cert = $null
        $certSubject = ""
        $certIssuer = ""
        $certSerial = ""
        $certValidTo = ""

        $x509CertNode = $sigNode.SelectSingleNode(".//ds:X509Certificate", $nsMgr)
        if ($x509CertNode -and $x509CertNode.InnerText) {
          try {
            $rawBytes = [System.Convert]::FromBase64String($x509CertNode.InnerText.Trim())
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(,$rawBytes)
            $certSubject = $cert.Subject
            $certIssuer = $cert.Issuer
            $certSerial = $cert.SerialNumber
            $certValidTo = $cert.NotAfter.ToString("yyyy-MM-dd HH:mm:ss")
          } catch {}
        }

        $isValid = $false
        try {
          if ($cert) {
            $isValid = $signedXml.CheckSignature($cert, $true)
          } else {
            $isValid = $signedXml.CheckSignature()
          }
        } catch {
          $isValid = $false
        }

        [PSCustomObject]@{
          IsSigned = $true
          IsValid = $isValid
          Subject = $certSubject
          Issuer = $certIssuer
          SerialNumber = $certSerial
          ValidTo = $certValidTo
          Message = if ($isValid) { "Chữ ký số HỢP LỆ. Dữ liệu vẹn toàn không bị can thiệp." } else { "Chữ ký KHÔNG HỢP LỆ hoặc dữ liệu XML đã bị sửa đổi sau khi ký!" }
        } | ConvertTo-Json -Compress
      `;

      const out = await runPsScriptFile(psScript);
      if (isTempIn) {
        try { fs.unlinkSync(inPath); } catch {}
      }

      let parsed = { isSigned: false, isValid: false, message: 'Lỗi xác thực' };
      if (out) {
        try {
          const res = JSON.parse(out);
          parsed = {
            isSigned: !!res.IsSigned,
            isValid: !!res.IsValid,
            subject: res.Subject || '',
            issuer: res.Issuer || '',
            serialNumber: res.SerialNumber || '',
            validTo: res.ValidTo || '',
            message: res.Message || '',
          };
        } catch {}
      }
      return { ok: true, result: parsed };
    } catch (err) {
      console.error('[CA_VERIFY_ERR]', err);
      return { ok: false, error: err.message };
    }
  });

  // 7.5 Hộp thoại lưu tệp XML đã ký
  ipcMain.handle('ca:save-signed-file', async (_event, { defaultName, content }) => {
    try {
      const res = await dialog.showSaveDialog({
        title: 'Lưu tệp XML đã ký số',
        defaultPath: defaultName || 'HoSo_DaKy.xml',
        filters: [{ name: 'XML Files', extensions: ['xml'] }]
      });
      if (res.canceled || !res.filePath) {
        return { ok: true, canceled: true };
      }
      fs.writeFileSync(res.filePath, content, { encoding: 'utf8' });
      return { ok: true, canceled: false, filePath: res.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = {
  registerCaIPC,
};
