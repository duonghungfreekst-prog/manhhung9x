/**
 * Tạo file icon.ico hợp lệ từ đầu
 * Định dạng ICO chuẩn Windows với BMP data bên trong
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tạo BMP 32-bit BGRA cho ICO (không có file header, chỉ DIB header + pixel data)
function createDIBBMP(size, colors) {
  const bytesPerPixel = 4;
  const rowSize = size * bytesPerPixel;
  const pixelDataSize = rowSize * size;
  const dibHeaderSize = 40;
  const maskSize = Math.ceil(size / 8) * size; // 1-bit mask
  const totalSize = dibHeaderSize + pixelDataSize + maskSize;

  const buf = Buffer.alloc(totalSize, 0);

  // BITMAPINFOHEADER
  buf.writeUInt32LE(dibHeaderSize, 0);          // biSize
  buf.writeInt32LE(size, 4);                     // biWidth
  buf.writeInt32LE(size * 2, 8);                // biHeight (doubled for ICO = XOR + AND mask)
  buf.writeUInt16LE(1, 12);                      // biPlanes
  buf.writeUInt16LE(32, 14);                     // biBitCount
  buf.writeUInt32LE(0, 16);                      // biCompression = BI_RGB
  buf.writeUInt32LE(pixelDataSize, 20);          // biSizeImage

  // Draw icon: background + simple cross/check design
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // ICO pixel data is bottom-up
      const rowIdx = size - 1 - y;
      const offset = dibHeaderSize + (rowIdx * size + x) * 4;

      let r = 16, g = 185, b = 129, a = 255; // default: #10b981 green

      // Draw a white rounded design
      const cx = size / 2, cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const radius = size * 0.4;
      const outerRadius = size * 0.48;

      if (dist < outerRadius) {
        if (dist < radius) {
          // Inner white circle content
          // Draw a checkmark shape
          const nx = (x - cx) / radius;
          const ny = (cy - y) / radius;

          // Simple check mark: two lines
          const onCheckL = (nx + 0.5 >= 0 && nx + 0.5 < 0.35) && Math.abs(ny - (nx + 0.5) * 1.2 + 0.2) < 0.15;
          const onCheckR = (nx >= -0.1 && nx < 0.5) && Math.abs(ny + (nx - 0.5) * 1.5 + 0.5) < 0.15;

          if (onCheckL || onCheckR) {
            r = 255; g = 255; b = 255; a = 255;
          } else {
            r = 16; g = 185; b = 129; a = 255; // green fill
          }
        } else {
          // Darker green border ring
          r = 5; g = 150; b = 105; a = 255;
        }
      } else {
        a = 0; // transparent background
      }

      buf[offset] = b;
      buf[offset + 1] = g;
      buf[offset + 2] = r;
      buf[offset + 3] = a;
    }
  }

  // AND mask (all transparent / 0 = show pixel)
  // Left empty (zeros) = show XOR data
  return buf;
}

const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map(s => createDIBBMP(s, null));

// Build ICO file
const numImages = sizes.length;
const directoryOffset = 6;
const imageDataOffset = directoryOffset + numImages * 16;

const totalImageSize = images.reduce((sum, img) => sum + img.length, 0);
const icoBuf = Buffer.alloc(imageDataOffset + totalImageSize);

// ICO header
icoBuf.writeUInt16LE(0, 0); // reserved
icoBuf.writeUInt16LE(1, 2); // type = 1 (ICO)
icoBuf.writeUInt16LE(numImages, 4);

let currentOffset = imageDataOffset;
for (let i = 0; i < sizes.length; i++) {
  const s = sizes[i];
  const img = images[i];
  const dirOffset = directoryOffset + i * 16;

  icoBuf.writeUInt8(s >= 256 ? 0 : s, dirOffset);      // width
  icoBuf.writeUInt8(s >= 256 ? 0 : s, dirOffset + 1);  // height
  icoBuf.writeUInt8(0, dirOffset + 2);                  // color count
  icoBuf.writeUInt8(0, dirOffset + 3);                  // reserved
  icoBuf.writeUInt16LE(1, dirOffset + 4);               // planes
  icoBuf.writeUInt16LE(32, dirOffset + 6);              // bit count
  icoBuf.writeUInt32LE(img.length, dirOffset + 8);      // size in bytes
  icoBuf.writeUInt32LE(currentOffset, dirOffset + 12);  // offset

  img.copy(icoBuf, currentOffset);
  currentOffset += img.length;
}

const icoPath = join(__dirname, '../public/icon.ico');
writeFileSync(icoPath, icoBuf);
console.log(`✅ icon.ico created with ${numImages} sizes: ${sizes.join(', ')} px`);
