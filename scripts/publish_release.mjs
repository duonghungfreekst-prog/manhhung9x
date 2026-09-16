/**
 * DMH_Tools - Auto-Publish Release Script
 * Tự động đóng gói các module và đăng tải phiên bản mới lên GitHub Releases
 * Cách dùng: node scripts/publish_release.mjs [GH_TOKEN]
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Đọc thông tin phiên bản từ package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '6.6.0';
const tagName = `v${version}`;
const releaseName = `DMH Tools v${version} Commercial Suite`;

// 2. Xác định GitHub Token
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.argv[2];

// Thử đọc từ .env nếu chưa có
if (!token) {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const match = line.match(/^\s*(?:GH_TOKEN|GITHUB_TOKEN)\s*=\s*(.+)\s*$/);
      if (match) {
        token = match[1].trim().replace(/^["']|["']$/g, '');
      }
      const repoMatch = line.match(/^\s*(?:GH_REPO|GITHUB_REPO)\s*=\s*(.+)\s*$/);
      if (repoMatch) {
        repo = repoMatch[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

let repo = process.env.GH_REPO || 'duonghungfreekst-prog/manhhung9x';

console.log('===============================================================');
console.log(`🚀 DMH TOOLS AUTO-PUBLISH RELEASE ENGINE`);
console.log(`📦 Phiên bản: ${version} (${tagName})`);
console.log(`🌐 Kho GitHub: ${repo}`);
console.log('===============================================================\n');

if (!token) {
  console.error('❌ LỖI: Chưa có GitHub Token (GH_TOKEN).');
  console.log('👉 Vui lòng tạo Personal Access Token (PAT) trên GitHub (Quyền: repo):');
  console.log('   https://github.com/settings/tokens/new');
  console.log('👉 Sau đó chạy lại bằng 1 trong các cách sau:');
  console.log('   1. Tạo file .env với dòng: GH_TOKEN=ghp_xxxxxx');
  console.log('   2. Hoặc chạy: node scripts/publish_release.mjs ghp_xxxxxx\n');
  process.exit(1);
}

// 3. Tạo thư mục chứa các gói phát hành
const outDistDir = path.join(rootDir, 'release_assets');
if (!fs.existsSync(outDistDir)) {
  fs.mkdirSync(outDistDir, { recursive: true });
}

// 4. Hàm nén thư mục bằng PowerShell Compress-Archive
function compressToZip(sourcePath, destZip) {
  if (fs.existsSync(destZip) && fs.statSync(destZip).size > 1000) {
    const stat = fs.statSync(destZip);
    console.log(`⚡ Sử dụng gói nén sẵn: ${path.basename(destZip)} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
    return true;
  }
  if (!fs.existsSync(sourcePath)) {
    console.warn(`⚠️ Bỏ qua nén: Thư mục nguồn không tồn tại: ${sourcePath}`);
    return false;
  }
  console.log(`⏳ Đang nén gói: ${path.basename(destZip)}...`);
  const psCmd = `powershell -NoProfile -NonInteractive -Command "Compress-Archive -LiteralPath '${sourcePath}' -DestinationPath '${destZip}' -Force"`;
  try {
    execSync(psCmd, { stdio: 'ignore' });
    const stat = fs.statSync(destZip);
    console.log(`✅ Nén hoàn tất: ${path.basename(destZip)} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
    return true;
  } catch (err) {
    console.error(`❌ Lỗi nén ${destZip}:`, err.message);
    return false;
  }
}

// 5. Đóng gói các Module On-Demand
console.log('📦 Bắt đầu nén các gói Module On-Demand:');
const assetsToUpload = [];

// Module 1: Endoscopy
const endoZip = path.join(outDistDir, `dmh-mod-endoscopy-v${version}.zip`);
const endoSrc = path.join(rootDir, 'python_core_dist', 'endoscopy_server');
if (compressToZip(endoSrc, endoZip)) assetsToUpload.push(endoZip);

// Module 2: HisCall & Piper TTS
const ttsZip = path.join(outDistDir, `dmh-mod-hiscall-v${version}.zip`);
const ttsSrc = path.join(rootDir, 'vendor', 'piper');
if (compressToZip(ttsSrc, ttsZip)) assetsToUpload.push(ttsZip);

// Module 3: Converter PDF
const convZip = path.join(outDistDir, `dmh-mod-converter-v${version}.zip`);
const convSrc = path.join(rootDir, 'bin', 'dist');
if (compressToZip(convSrc, convZip)) assetsToUpload.push(convZip);

// Module 4: Compare & XML Server
const compZip = path.join(outDistDir, `dmh-mod-compare-v${version}.zip`);
const compSrc = path.join(rootDir, 'python_core_dist', 'compare_server');
if (compressToZip(compSrc, compZip)) assetsToUpload.push(compZip);

// Bộ cài đặt Windows Setup & Slim Installer nếu đã build trong release/
const slimExe = path.join(rootDir, 'release', `DMH_Tools_Setup_${version}_Slim.exe`);
if (fs.existsSync(slimExe)) {
  console.log(`📦 Tìm thấy bộ cài đặt siêu nhẹ (Slim): ${path.basename(slimExe)}`);
  assetsToUpload.push(slimExe);
}

const setupExe = path.join(rootDir, 'release', `DMH_Tools Setup ${version}.exe`);
if (fs.existsSync(setupExe)) {
  console.log(`📦 Tìm thấy bộ cài đặt chính: ${path.basename(setupExe)}`);
  assetsToUpload.push(setupExe);
}

const latestYml = path.join(rootDir, 'release', 'latest.yml');
if (fs.existsSync(latestYml)) {
  console.log(`📦 Tìm thấy file cấu hình cập nhật: ${path.basename(latestYml)}`);
  assetsToUpload.push(latestYml);
}

// 6. Gọi GitHub REST API
function githubRequest(endpoint, method = 'GET', body = null, isUpload = false, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const hostname = isUpload ? 'uploads.github.com' : 'api.github.com';
    const options = {
      hostname,
      path: endpoint,
      method,
      headers: {
        'User-Agent': 'DMH-Tools-AutoPublisher/6.6.0',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    if (body && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = contentType;
      options.headers['Content-Length'] = Buffer.byteLength(body);
    } else if (Buffer.isBuffer(body)) {
      options.headers['Content-Type'] = contentType;
      options.headers['Content-Length'] = body.length;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`GitHub API [${res.statusCode}]: ${json.message || data}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Mã phản hồi [${res.statusCode}]: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// 7. Tạo hoặc lấy Release hiện tại
async function main() {
  try {
    console.log(`\n🔍 Đang kiểm tra xem Release ${tagName} đã tồn tại chưa...`);
    let release;
    try {
      release = await githubRequest(`/repos/${repo}/releases/tags/${tagName}`);
      console.log(`ℹ️ Đã tìm thấy Release ${tagName} (ID: ${release.id})`);
    } catch {
      console.log(`✨ Chưa có Release ${tagName}. Đang tạo Release mới trên GitHub...`);
      release = await githubRequest(`/repos/${repo}/releases`, 'POST', {
        tag_name: tagName,
        name: releaseName,
        body: `### 🚀 DMH Tools ${tagName} - Bộ Cài Chuẩn Windows Driver: Loại Bỏ Triệt Để Nhầm OPOS, Tự Động Ép Cổng USB Thực Tế & Chống Báo Ảo

#### 🌟 Điểm mới then chốt trong phiên bản ${tagName}:

- **🛡️ Khắc Phục Triệt Để Sự Cố Chọn Nhầm Bộ Cài Phụ Trợ OPOS (OPOS_POSPrinterSO)**:
  + Gói tệp nén của hãng Xprinter chứa đồng thời nhiều thư mục: \`Windows\`, \`OPOS\`, \`JavaPOS\`, \`Linux\`, \`macOS\`...
  + Do thứ tự bảng chữ cái (\`OPOS\` đứng trước \`Windows\`), thuật toán quét file cũ đã bốc nhầm file tiện ích lập trình \`OPOS_POSPrinterSO\` (tạo icon 3 khối M, E màu mè ra Desktop thay vì cài Driver máy in Windows).
  + Bản **v6.9.10** tích hợp **Thuật Toán Xếp Hạng Thông Minh (Smart Driver Ranking)**:
    * ⛔ Trừ điểm nặng (-1000đ) và phế truất triệt để các tệp nằm trong thư mục hoặc tên chứa \`OPOS\`, \`JavaPOS\`, \`Linux\`, \`Tool\`, \`Test\`.
    * 🎯 Ưu tiên số 1 (+200đ đến +560đ) cho các bộ cài đặt Spooler chính thức nằm trong thư mục \`Windows\` (như: \`XPrinter Driver Setup V8.2.exe\`, \`POS Printer Driver Setup\`).

- **🖥️ Hiển Thị Đúng Cửa Sổ Cài Đặt Windows Driver Của Hãng**:
  + Mở đúng bộ cài đặt Windows Spooler Driver của nhà sản xuất ra trước mắt người dùng để chọn dòng máy (XP-80, XP-58...) và bấm **Install Now**.

- **👁️ Watcher Spooler Engine & Tự Động Ép Cổng USB Thực Tế (USB003...)**:
  + Giám sát thời gian thực hệ thống in Windows: Ngay khi máy in xuất hiện, DMH Tools tự động dò và ép cổng về đúng cổng USB đang cắm cáp vật lý thực tế (\`USB003\`).
  + Gửi lệnh in test đích danh vào máy in vừa cài, không in nhầm máy in mặc định.

*Hệ Thống Quản Lý Phòng Khám & Kỹ Thuật Máy Tính DMH*`,
        draft: false,
        prerelease: false,
      });
      console.log(`✅ Tạo Release mới thành công! (ID: ${release.id})`);
    }

function uploadAssetFile(uploadUrl, filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    const options = {
      hostname: 'uploads.github.com',
      path: uploadUrl,
      method: 'POST',
      headers: {
        'User-Agent': 'DMH-Tools-AutoPublisher/6.6.0',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': fileName.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable' : (fileName.endsWith('.yml') ? 'text/yaml' : 'application/zip'),
        'Content-Length': fileSize,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`GitHub API [${res.statusCode}]: ${json.message || data}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`Mã phản hồi [${res.statusCode}]: ${data}`));
        }
      });
    });

    req.on('error', reject);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(req);
  });
}

    // 8. Tải từng asset lên Release
    console.log(`\n📤 Bắt đầu tải ${assetsToUpload.length} tệp lên GitHub Releases:`);
    const existingAssets = release.assets || [];
    for (const filePath of assetsToUpload) {
      const fileName = path.basename(filePath);
      const stat = fs.statSync(filePath);

      const match = existingAssets.find(a => a.name === fileName);
      if (match) {
        console.log(`♻️ Tệp ${fileName} đã có trên Release (ID: ${match.id}). Đang xóa để cập nhật bản mới nhất...`);
        try {
          await githubRequest(`/repos/${repo}/releases/assets/${match.id}`, 'DELETE');
          console.log(`🗑️ Đã xóa bản cũ của ${fileName}`);
        } catch (delErr) {
          console.warn(`⚠️ Cảnh báo xóa bản cũ: ${delErr.message}`);
        }
      }

      const uploadUrl = `/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`;
      console.log(`⏳ Đang upload: ${fileName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)...`);
      try {
        await uploadAssetFile(uploadUrl, filePath);
        console.log(`✅ Upload thành công: ${fileName}`);
      } catch (err) {
        console.error(`❌ Lỗi upload ${fileName}:`, err.message);
      }
    }

    console.log('\n===============================================================');
    console.log('🎉🎉🎉 PHÁT HÀNH THÀNH CÔNG BẢN CẬP NHẬT LÊN GITHUB!');
    console.log(`🌐 Link phát hành: ${release.html_url}`);
    console.log('===============================================================\n');
  } catch (error) {
    console.error('\n❌ QUÁ TRÌNH PHÁT HÀNH THẤT BẠI:', error.message);
    process.exit(1);
  }
}

main();
