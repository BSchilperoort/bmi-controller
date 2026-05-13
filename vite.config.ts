import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const DEFAULT_SERVER_URL = 'http://localhost:50051'

function bmiProxyPlugin(): Plugin {
  let target = DEFAULT_SERVER_URL

  return {
    name: 'bmi-proxy',
    configureServer(server: ViteDevServer) {
      // Runtime endpoint to update proxy target
      server.middlewares.use('/__bmi_proxy__', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') { res.writeHead(405).end(); return }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { url } = JSON.parse(body)
            target = url || DEFAULT_SERVER_URL
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
          } catch {
            res.writeHead(400).end()
          }
        })
      })

      // Proxy /bmi/* to the dynamic target (req.url is already stripped of /bmi prefix)
      server.middlewares.use('/bmi', (req: IncomingMessage, res: ServerResponse) => {
        try {
          const parsed = new URL(target)
          const isHttps = parsed.protocol === 'https:'
          const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: req.url || '/',
            method: req.method,
            headers: { ...req.headers, host: parsed.host },
          }
          const mod = isHttps ? https : http
          const proxyReq = mod.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode!, proxyRes.headers)
            proxyRes.pipe(res, { end: true })
          })
          proxyReq.on('error', (err) => {
            if (!res.headersSent) res.writeHead(502)
            res.end(`Proxy error: ${err.message}`)
          })
          req.pipe(proxyReq, { end: true })
        } catch (err) {
          res.writeHead(500).end(String(err))
        }
      })
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/bmi-controller/' : '/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    bmiProxyPlugin(),
  ],
  server: {
    host: true,
  },
})
