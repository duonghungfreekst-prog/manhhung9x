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
        body: `### 🚀 DMH Tools ${tagName} - Bác Sĩ Máy In Toàn Năng: Quét & Chẩn Đoán Toàn Bộ Lỗi, Bảng Sức Khỏe Health Dashboard & Sửa Tự Động 1-Click

#### 🌟 Điểm mới nổi bật trong phiên bản v6.8.0:

- **1. Nâng cấp tính năng Quét Toàn Diện & Chẩn Đoán Tất Cả Lỗi Máy In (Full Diagnostics Scan)**:
  + Tự động quét và chẩn đoán đồng thời 6 hạng mục kỹ thuật cốt lõi:
    1. **Dịch vụ Print Spooler**: Kiểm tra trạng thái hoạt động (Running hay Stopped/Crash) và chế độ khởi động (Automatic).
    2. **Cấu hình Chia Sẻ Mạng LAN (Lỗi 0x00000709 & 0x0000011b)**: Kiểm tra khóa Registry RPC Named Pipe (\`RpcUseNamedPipeProtocol\`) và mức xác thực (\`RpcAuthnLevelPrivacyEnabled\`).
    3. **Chính sách Point and Print (Lỗi 0x00000bcb)**: Kiểm tra Group Policy có đang chặn máy con tự động nạp Driver máy in từ mạng nội bộ hay không.
    4. **Tường lửa Windows Firewall**: Kiểm tra trạng thái mở cổng mạng cho nhóm \`File and Printer Sharing\` & \`Network Discovery\`.
    5. **Bộ đệm in Spooler**: Quét phát hiện số lượng file rác, lệnh in hỏng đang kẹt trong thư mục \`%windir%\\System32\\spool\\PRINTERS\`.
    6. **Cổng mạng TCP/IP SNMP (Lỗi máy in Offline ảo)**: Quét toàn bộ cổng in mạng xem có bật cờ SNMP Status Enabled gây hiểu nhầm trạng thái Offline hay không.

- **2. Bảng Điều Khiển Sức Khỏe Máy In Trực Quan (Diagnostic Health Dashboard)**:
  + Hiển thị trực quan trạng thái từng hạng mục bằng các chỉ số Đạt chuẩn (\`✓\`) hoặc Cảnh báo (\`⚠️\`).
  + Badge thông báo tổng số lỗi phát hiện kèm nút khắc phục nhanh cho từng hạng mục riêng biệt.

- **3. ⚡ Phím Tắt Thần Thánh: SỬA TỰ ĐỘNG TẤT CẢ LỖI (1-Click Auto Fix All)**:
  + Chỉ với 1 lần bấm, hệ thống tự động xử lý trọn gói:
    + Cấu hình Registry sửa dứt điểm lỗi 0x709 & 0x11b.
    + Gỡ bỏ giới hạn Point & Print sửa lỗi 0xbcb.
    + Mở Firewall cho phép chia sẻ máy in và tệp qua mạng LAN.
    + Dọn sạch toàn bộ file rác và lệnh in kẹt trong thư mục Spool.
    + Phân quyền Full Control ACL cho thư mục PRINTERS và bật chế độ tự phục hồi Spooler khi crash.
    + Tắt SNMP trên các cổng mạng và đưa toàn bộ máy in về trạng thái Online.
    + Tự động quét lại và cập nhật hệ thống đạt chuẩn 100% Sức Khỏe Hoàn Hảo.

- **4. Tiếp tục tối ưu hóa độ ổn định và giao diện**:
  + Giao diện hiện đại, dễ sử dụng, phản hồi nhanh chóng và an toàn tuyệt đối cho người dùng.

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
