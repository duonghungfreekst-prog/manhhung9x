/**
 * Script tự động xuất bản GitHub Release v7.0.0 và tải file .exe lên Assets
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_OWNER = 'duonghungfreekst-prog';
const REPO_NAME = 'manhhung9x';
const TAG_NAME = 'v7.0.0';
const TOKEN = process.env.GITHUB_TOKEN || '';

const RELEASE_TITLE = 'DMH_Tools v7.0.0 Enterprise Edition';
const RELEASE_BODY = `## 🚀 DMH_Tools v7.0.0 - Phiên Bản Doanh Nghiệp Toàn Diện

Phiên bản **v7.0.0** là bước nhảy vọt toàn diện về độ ổn định, bảo mật y tế và kiến trúc hệ thống:

### 🛡️ Khắc Phục 100% Lỗi Bảo Mật & Hệ Thống (Audit v2)
- **SEC-001 & PROD-001**: Loại bỏ hoàn toàn Remote Code Execution trong cơ chế tự cập nhật. Áp dụng Whitelist URL GitHub CDN và xác thực mã băm SHA-256 đối soát.
- **SEC-002**: Chống PowerShell Expression Injection trong phân hệ Chữ ký số XML (Chuẩn hóa Regex Hex 40 Thumbprint và Base64 Path).
- **SEC-003**: Nâng cấp License Vault: Cá nhân hóa Dynamic Salt theo phần cứng (HWID) chống bẻ khóa và nhân bản file bản quyền.
- **SEC-004 & BUG-002**: Bảo vệ Python Server: Giới hạn tệp y tế <= 200MB, Timeout 120s chống cạn kiệt tài nguyên / DoS.
- **SEC-005**: Obfuscate API Key Gemini trong bộ nhớ LocalStorage.

### 💾 Chống Mất Dữ Liệu & Bảo Vệ Ổ Đĩa (Zero Data Loss)
- **BUG-001 & ARCH-001**: Cơ chế ghi an toàn nguyên tử (Atomic Write: \`.tmp\` -> \`rename\`) và tự phục hồi (Self-Healing Backup \`.bak\`) cho CSDL nội soi SQLite.
- **Bảo vệ ổ C hệ thống**: Tự động chuyển vị trí lưu trữ ảnh nội soi sang ổ dữ liệu \`D:\\\`, \`E:\\\`, \`F:\\\`.
- **BUG-003 & BUG-004**: Hàng đợi kết nối tuần tự (\`connectingPromises\`) cho SQL Server HIS, chống nghẽn và rò rỉ Connection Pool.

### 🏛️ Tái Cấu Trúc Kiến Trúc
- Phân rã \`main.cjs\` thành các IPC Handler độc lập theo nguyên lý Single Responsibility.
- Bổ sung tầng Repository Sargable Query cho SQL Server HIS.
- Hệ thống Audit Logger ghi nhận vết hoạt động xoay vòng theo ngày, chống CRLF log injection.
- Định kiểu TypeScript nghiêm ngặt cho Preload API.

---
### 📦 Tệp Cài Đặt (Assets)
- **DMH_Tools_Setup_7.0.0_Slim.exe**: Bộ cài đặt tự động cho Windows x64.
`;

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath, contentType) {
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats.size;
  const uploadUrl = uploadUrlTemplate.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);

  console.log(`\n⏳ Đang tải lên: ${fileName} (${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB)...`);

  const urlObj = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    let uploadedBytes = 0;
    let lastLoggedPercent = 0;

    fileStream.on('data', chunk => {
      uploadedBytes += chunk.length;
      const percent = Math.floor((uploadedBytes / fileSizeInBytes) * 100);
      if (percent >= lastLoggedPercent + 10 || percent === 100) {
        process.stdout.write(`\r[Upload] ${percent}% (${(uploadedBytes / (1024 * 1024)).toFixed(2)} / ${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB)`);
        lastLoggedPercent = percent;
      }
    });

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'DMH-Tools-Deployer',
        'Authorization': `token ${TOKEN}`,
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': fileSizeInBytes
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`\n✅ Tải lên thành công: ${fileName}`);
          resolve(body);
        } else {
          console.error(`\n❌ Lỗi upload ${fileName}: HTTP ${res.statusCode} - ${body}`);
          reject(new Error(`Upload failed with code ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`\n❌ Network Error khi upload ${fileName}:`, err.message);
      reject(err);
    });

    fileStream.pipe(req);
  });
}

async function main() {
  console.log(`=== BẮT ĐẦU TỰ ĐỘNG XUẤT BẢN GITHUB RELEASE ${TAG_NAME} ===`);

  const createReleaseOptions = {
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
    method: 'POST',
    headers: {
      'User-Agent': 'DMH-Tools-Deployer',
      'Authorization': `token ${TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
  };

  const payload = JSON.stringify({
    tag_name: TAG_NAME,
    target_commitish: 'main',
    name: RELEASE_TITLE,
    body: RELEASE_BODY,
    draft: false,
    prerelease: false
  });

  console.log('1. Đang tạo Release trên GitHub...');
  let res = await makeRequest(createReleaseOptions, payload);
  let releaseData = res.body;

  if (res.statusCode === 422 && releaseData.errors && releaseData.errors.some(e => e.code === 'already_exists')) {
    console.log('Tag/Release đã tồn tại, đang lấy thông tin release hiện có...');
    const getOptions = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG_NAME}`,
      method: 'GET',
      headers: {
        'User-Agent': 'DMH-Tools-Deployer',
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    const getRes = await makeRequest(getOptions);
    releaseData = getRes.body;
  } else if (res.statusCode < 200 || res.statusCode >= 300) {
    console.error('Lỗi khi tạo release:', res.statusCode, releaseData);
    process.exit(1);
  }

  console.log(`✅ Release ID: ${releaseData.id}`);
  console.log(`🔗 Release URL: ${releaseData.html_url}`);
  const uploadUrl = releaseData.upload_url;

  // Xóa các assets cũ trùng tên nếu release đã tồn tại để tải lên bản mới
  if (Array.isArray(releaseData.assets) && releaseData.assets.length > 0) {
    for (const asset of releaseData.assets) {
      if (['DMH_Tools_Setup_7.0.0_Slim.exe', 'DMH_Tools_Setup_7.0.0_Slim.exe.blockmap', 'latest.yml'].includes(asset.name)) {
        console.log(`Đang xóa asset cũ trên GitHub: ${asset.name} (ID: ${asset.id})...`);
        try {
          await makeRequest({
            hostname: 'api.github.com',
            path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset.id}`,
            method: 'DELETE',
            headers: {
              'User-Agent': 'DMH-Tools-Deployer',
              'Authorization': `token ${TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          console.log(`✅ Đã xóa asset cũ: ${asset.name}`);
        } catch (err) {
          console.warn(`Không thể xóa ${asset.name}:`, err.message);
        }
      }
    }
  }

  const releaseDir = path.resolve(__dirname, '../release');
  const exePath = path.join(releaseDir, 'DMH_Tools_Setup_7.0.0_Slim.exe');
  const blockmapPath = path.join(releaseDir, 'DMH_Tools_Setup_7.0.0_Slim.exe.blockmap');
  const ymlPath = path.join(releaseDir, 'latest.yml');

  if (fs.existsSync(exePath)) {
    await uploadAsset(uploadUrl, exePath, 'application/vnd.microsoft.portable-executable');
  } else {
    console.error(`Không tìm thấy file: ${exePath}`);
  }

  if (fs.existsSync(blockmapPath)) {
    await uploadAsset(uploadUrl, blockmapPath, 'application/octet-stream');
  }

  if (fs.existsSync(ymlPath)) {
    await uploadAsset(uploadUrl, ymlPath, 'text/yaml');
  }

  console.log('\n🎉 ĐÃ HOÀN TẤT XUẤT BẢN PHIÊN BẢN v7.0.0 LÊN GITHUB THÀNH CÔNG!');
  console.log(`Người dùng có thể tải về trực tiếp tại: ${releaseData.html_url}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
