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

const server = http.createServer((req, res) => {
  // Apply COOP and COEP headers for WebAssembly SIMD & SharedArrayBuffer
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
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
