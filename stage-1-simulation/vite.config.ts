import { defineConfig } from 'vite';
export default defineConfig({
  build:{
    target:'chrome90',
    rollupOptions:{output:{manualChunks:{three:['three']}}}
  },
  server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/refs/**']}},
});
