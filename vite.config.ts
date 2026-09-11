import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  base: './',   // <-- quan trọng: dùng đường dẫn tương đối cho Electron
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '6.6.9'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'vendor-xlsx'
            if (id.includes('docx')) return 'vendor-docx'
            if (id.includes('pdfjs-dist')) return 'vendor-pdf'
            if (id.includes('tesseract.js')) return 'vendor-ocr'
            if (id.includes('mssql')) return 'vendor-mssql'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
          }
        }
      }
    }
  },
})
