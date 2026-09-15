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
        body: `### 🚀 DMH Tools ${tagName} - Khắc Phục Triệt Để Lỗi Mất Thanh Cuộn & Tái Cấu Trúc Toàn Diện Vùng Cuộn Giao Diện (Layout Scroll Fix)

#### 🌟 Điểm mới nổi bật trong phiên bản v6.9.2:

- **1. Khắc Phục Triệt Để Lỗi Mất Thanh Cuộn (Scrollbar) & Cắt Cụt Nội Dung Đáy**:
  + Sửa tận gốc lỗi CSS Flexbox khiến vùng hiển thị nội dung phân hệ Kỹ Thuật PC (\`PcToolsTab\`) và Trạm Nội Soi (\`EndoscopyTab\`) bị đẩy tràn khung nhìn và cắt cụt nội dung ở phía dưới.
  + Loại bỏ thuộc tính xung đột chiều cao \`height: 100%\` bên trong flex container có header, giúp vùng làm việc tự động nhận diện chính xác 100% không gian khả dụng của màn hình.
  + Đảm bảo 100% danh mục phần mềm (Kho Ứng Dụng Thiết Yếu, Bộ gõ, Giải nén, Hỗ trợ từ xa, Runtime, Trình phát đa phương tiện...) và tất cả các sub-tab đều cuộn được mượt mà từ đầu tới cuối.

- **2. Tích Hợp Bộ Thanh Cuộn Trực Quan Toàn Cầu (Global Webkit Scrollbar Styling)**:
  + Trang bị giao diện thanh cuộn 9px cao cấp, trực quan với rãnh trượt tinh tế, ngăn chặn triệt để tình trạng Windows 10/11 tự động ẩn thanh cuộn (Overlay Scrollbar) gây khó khăn cho người dùng.
  + Thiết kế riêng thanh cuộn \`dark-slate-scrollbar\` siêu ngầu cho thanh Sidebar chuyên mục Kỹ Thuật PC, đồng bộ hoàn hảo với phong cách dark navy slate hiện đại.

- **3. Tái Cấu Trúc Wrapper Phân Hệ Với \`.tab-panel-fullbleed\`**:
  + Thay thế cấu trúc cũ bằng class chuẩn \`.tab-panel-fullbleed\` (\`flex: 1 1 auto; min-height: 0; height: 100%;\`), loại bỏ hoàn toàn khoảng trống xanh nhạt (\`#dbeafe\`) bị hở ở đáy màn hình.
  + Bổ sung đệm đáy rộng rãi (\`padding-bottom: 60px\` cho Workspace và \`3.5rem\` cho toàn bộ các tab tài liệu), giúp các nút bấm và card nội dung cuối cùng luôn cách mép đáy thoáng đãng, không bao giờ bị thanh Taskbar Windows che khuất.

- **4. Tối Ưu Hóa & Kiểm Thử Toàn Diện 15 Phân Hệ**:
  + Kiểm tra và tinh chỉnh độ mượt khi cuộn trên mọi độ phân giải màn hình từ Laptop (1366x768, 1600x900) đến Màn hình máy bàn (1920x1080, 2K, 4K) và các mức phóng to tỉ lệ hiển thị (Zoom 125%, 150%).

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
