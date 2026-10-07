import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': {
    target:'http://127.0.0.1:8787',changeOrigin:true,
    configure(proxy){proxy.on('proxyReq',(forward,request)=>{
      // Translate only trusted development origins; other origins still fail CSRF validation.
      if(request.headers.origin==='http://127.0.0.1:5173'||request.headers.origin==='http://localhost:5173')forward.setHeader('origin','http://127.0.0.1:8787')
    })},
  } } },
  build: { target: 'es2022' },
})
