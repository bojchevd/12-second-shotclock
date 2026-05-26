// Tiny static file server for the shot-clock app.
// Run via: node serve.js  (or double-click start-shot-clock.bat)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, 'app');
const PORT = 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav':  'audio/wav',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/operator.html';
  const filePath = path.resolve(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ct = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/operator.html`;
  console.log(`Shot clock running at ${url}`);
  console.log(`Press Ctrl+C to stop.`);
  if (!process.argv.includes('--no-open')) {
    exec(`start "" "${url}"`, () => {});
  }
});
