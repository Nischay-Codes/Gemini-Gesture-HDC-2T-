import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from './node_modules/typescript/lib/typescript.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.ts': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function rewriteImports(code, filePath) {
  // 1. Rewrite bare import @mediapipe/tasks-vision
  code = code.replace(/from\s+['"]@mediapipe\/tasks-vision['"]/g, `from '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'`);
  
  // 2. Rewrite relative imports that lack an extension
  // e.g. from './camera/camera_manager' -> from './camera/camera_manager.ts'
  code = code.replace(/from\s+['"](\.[^'"]+)['"]/g, (match, importPath) => {
    if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.mjs') || importPath.endsWith('.json')) {
      return match;
    }
    const dir = path.dirname(filePath);
    const candidateTs = path.resolve(dir, importPath + '.ts');
    const candidateJs = path.resolve(dir, importPath + '.js');
    if (fs.existsSync(candidateTs)) {
      return `from '${importPath}.ts'`;
    } else if (fs.existsSync(candidateJs)) {
      return `from '${importPath}.js'`;
    }
    return match;
  });

  return code;
}

function sanitizeApiKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim();
  cleaned = cleaned.replace(/^(?:GEMINI_API_KEY|API_KEY|key)\s*[:=]\s*/i, '').trim();
  const match = cleaned.match(/AIzaSy[A-Za-z0-9_-]{25,50}/);
  if (match) return match[0];
  return cleaned;
}

const server = http.createServer((req, res) => {
  // Apply COOP and COEP headers for WebAssembly SIMD & SharedArrayBuffer
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Support API Key storage and retrieval
  if (reqPath === '/api/key') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const key = sanitizeApiKey(parsed.apiKey);
          if (key) {
            fs.writeFileSync(path.join(__dirname, '.env'), `GEMINI_API_KEY=${key}\n`, 'utf-8');
            process.env.GEMINI_API_KEY = key;
          }
          res.end(JSON.stringify({ success: true, saved: Boolean(key), key }));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    } else {
      let apiKey = process.env.GEMINI_API_KEY || '';
      const envPath = path.join(__dirname, '.env');
      if (!apiKey && fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*([^\s\r\n]+)/);
        if (match) apiKey = sanitizeApiKey(match[1]);
      }
      res.end(JSON.stringify({ apiKey }));
      return;
    }
  }

  // Validate API Key directly with Google Generative AI from Node.js (bypasses browser CORS & COEP)
  if (reqPath === '/api/gemini/validate' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const cleanKey = sanitizeApiKey(parsed.apiKey);
        if (!cleanKey) {
          res.end(JSON.stringify({ success: false, message: 'Please enter a valid Gemini API key (starts with AIzaSy...)' }));
          return;
        }

        const t0 = Date.now();
        let modelInUse = 'gemini-2.0-flash';
        let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelInUse}:generateContent?key=${cleanKey}`;

        let googleRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with: READY' }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        });

        if (!googleRes.ok && googleRes.status === 404) {
          modelInUse = 'gemini-1.5-flash';
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelInUse}:generateContent?key=${cleanKey}`;
          googleRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Respond with: READY' }] }],
              generationConfig: { maxOutputTokens: 5 }
            })
          });
        }

        const latencyMs = Date.now() - t0;
        const resData = await googleRes.json().catch(() => ({}));

        if (googleRes.ok) {
          fs.writeFileSync(path.join(__dirname, '.env'), `GEMINI_API_KEY=${cleanKey}\n`, 'utf-8');
          process.env.GEMINI_API_KEY = cleanKey;

          res.end(JSON.stringify({
            success: true,
            model: modelInUse,
            latencyMs,
            key: cleanKey,
            message: `Connected to ${modelInUse} (${latencyMs}ms)`
          }));
        } else {
          const errMsg = resData.error?.message || `Google API returned HTTP ${googleRes.status}`;
          res.end(JSON.stringify({
            success: false,
            model: modelInUse,
            message: errMsg,
            code: resData.error?.code || googleRes.status
          }));
        }
      } catch (err) {
        res.end(JSON.stringify({
          success: false,
          message: `Network error connecting to Google: ${err.message}`
        }));
      }
    });
    return;
  }

  // Proxy multimodal Gemini interpretation requests (zero browser CORS/COEP issues)
  if (reqPath === '/api/gemini/generate' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        let key = sanitizeApiKey(parsed.apiKey) || process.env.GEMINI_API_KEY || '';
        if (!key && fs.existsSync(path.join(__dirname, '.env'))) {
          const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
          const match = envContent.match(/GEMINI_API_KEY\s*=\s*([^\s\r\n]+)/);
          if (match) key = sanitizeApiKey(match[1]);
        }

        if (!key) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { message: 'API key not configured' } }));
          return;
        }

        let model = parsed.model || 'gemini-2.0-flash';
        let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

        let googleRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.requestBody)
        });

        if (!googleRes.ok && googleRes.status === 404 && model === 'gemini-2.0-flash') {
          model = 'gemini-1.5-flash';
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          googleRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.requestBody)
          });
        }

        const data = await googleRes.json().catch(() => ({}));
        res.statusCode = googleRes.status;
        res.end(JSON.stringify({ ...data, _modelInUse: model }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    });
    return;
  }

  if (reqPath === '/') reqPath = '/index.html';

  let localPath = path.join(__dirname, reqPath);

  // Check public dir first for assets like /wasm/..., /models/..., /mediapipe-wasm/...
  const publicPath = path.join(__dirname, 'public', reqPath);
  if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
    localPath = publicPath;
  }

  // If request has no extension and a .ts file exists, resolve it
  if (!fs.existsSync(localPath)) {
    if (fs.existsSync(localPath + '.ts')) {
      localPath = localPath + '.ts';
    } else if (fs.existsSync(localPath + '.js')) {
      localPath = localPath + '.js';
    }
  }

  if (!fs.existsSync(localPath)) {
    res.statusCode = 404;
    res.end(`Not Found: ${reqPath}`);
    return;
  }

  const stat = fs.statSync(localPath);
  if (stat.isDirectory()) {
    const indexPath = path.join(localPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      localPath = indexPath;
    } else {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
  }

  const ext = path.extname(localPath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  if (ext === '.ts') {
    try {
      let code = fs.readFileSync(localPath, 'utf-8');
      code = rewriteImports(code, localPath);
      const transpiled = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          sourceMap: false,
        },
      });
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.end(transpiled.outputText);
      return;
    } catch (err) {
      console.error('Transpile error for', localPath, err);
      res.statusCode = 500;
      res.end(`Transpile error: ${err.message}`);
      return;
    }
  }

  res.setHeader('Content-Type', mimeType);
  fs.createReadStream(localPath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 HDC-Zero Neuromorphic Server running at:`);
  console.log(`   ➜ Local:   http://localhost:${PORT}/`);
  console.log(`   ➜ Network: http://127.0.0.1:${PORT}/`);
  console.log(`   ➜ Headers: COOP / COEP Active (SIMD & Atomics Enabled)`);
  console.log(`======================================================\n`);
});
