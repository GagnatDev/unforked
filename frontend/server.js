const http = require('http')
const fs = require('fs')
const path = require('path')
const pino = require('pino')

const isProd = process.env.NODE_ENV === 'production'
const log = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
})

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'
const PORT = parseInt(process.env.PORT || '3000', 10)
const DIST = path.join(__dirname, 'dist')

const mimes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  log.info({ method: req.method, url: req.url }, 'incoming request')

  if (req.url.startsWith('/api/')) {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const backend = new URL(url.pathname + url.search, BACKEND_URL)
    const target = backend.href
    log.debug({ target, method: req.method }, 'proxying to backend')

    const opts = {
      method: req.method,
      headers: { ...req.headers, host: new URL(BACKEND_URL).host },
    }
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? req : null
    const proxy = http.request(backend, opts, (proxyRes) => {
      log.info(
        { target, method: req.method, status: proxyRes.statusCode, backendUrl: BACKEND_URL },
        'backend response'
      )
      if (proxyRes.statusCode >= 400) {
        log.warn(
          { target, status: proxyRes.statusCode, headers: proxyRes.headers },
          'backend returned error'
        )
      }
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })
    proxy.on('error', (e) => {
      log.error({ err: e.message, target, backendUrl: BACKEND_URL }, 'proxy error (backend unreachable?)')
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end('Bad Gateway: ' + e.message)
    })
    if (body) req.pipe(proxy)
    else proxy.end()
    return
  }

  let file = path.join(DIST, req.url === '/' ? 'index.html' : req.url)
  if (!file.startsWith(DIST)) {
    log.warn({ url: req.url }, 'forbidden path')
    res.writeHead(403)
    res.end()
    return
  }
  if (!path.extname(file)) {
    file = path.join(file, 'index.html')
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    log.debug({ requested: req.url, fallback: 'index.html' }, 'static fallback')
    file = path.join(DIST, 'index.html')
  }
  const ext = path.extname(file)
  res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream')

  const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2|png)$/.test(req.url)
  const isSW = /^\/(sw\.js|workbox-[^/]+\.js)$/.test(req.url)
  const isHTML = ext === '.html'
  if (isHashed) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (isSW || isHTML) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600')
  }

  fs.createReadStream(file).pipe(res)
})

server.listen(PORT, '0.0.0.0', () => {
  log.info({ port: PORT, backendUrl: BACKEND_URL }, 'server listening')
})
