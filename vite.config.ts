import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {siteRoute,publicPages,DASHBOARD_PATH} from './shared/routes.ts'

export default defineConfig({
  plugins: [react(),{name:'apply-vigil-download-preview',configureServer(server){
    server.middlewares.use((request,response,next)=>{
      const url=new URL(request.url??'/','http://localhost'),route=siteRoute(url)
      if(route.redirect){response.writeHead(308,{Location:route.redirect});response.end();return}
      if(route.asset===DASHBOARD_PATH)request.url='/index.html'+url.search
      else if(publicPages[route.asset])request.url='/site/download/'+publicPages[route.asset]+url.search
      else if(url.pathname.startsWith('/download/'))request.url='/site/download/'+url.pathname.slice('/download/'.length)+url.search
      else if(url.pathname==='/sw.js')request.url='/legacy-sw.js'
      next()
    })
  }}],
  server: { port: 5173, strictPort: true, proxy: { '/api': {
    target:'http://127.0.0.1:8787',changeOrigin:true,
    configure(proxy){proxy.on('proxyReq',(forward,request)=>{
      // Translate only trusted development origins; other origins still fail CSRF validation.
      if(request.headers.origin==='http://127.0.0.1:5173'||request.headers.origin==='http://localhost:5173')forward.setHeader('origin','http://127.0.0.1:8787')
    })},
  } } },
  build: { target: 'es2022' },
})
