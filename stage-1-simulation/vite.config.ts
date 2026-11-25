import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  build:{
    target:'chrome90',
    rollupOptions:{output:{manualChunks:{three:['three']}}}
  },
  server:{fs:{allow:[fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../stage-2-mixed-reality/',import.meta.url))],deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/refs/**']}},
});
