#!/usr/bin/env node
/**
 * Máy chủ chạy thử giao diện trên máy cá nhân (không cần Google):
 *   npm run dev   →  mở http://localhost:8080
 *
 * - Nạp toàn bộ code .gs vào môi trường giả lập Apps Script (tests/gas-env.js)
 *   với dữ liệu mẫu ~70 trường / 110 GV trong một "Google Sheet" ảo (trong bộ nhớ).
 * - Giả lập google.script.run để giao diện gọi thẳng hàm api() của server.
 * - Thanh công cụ góc dưới trái cho phép đổi tài khoản để thử phân quyền.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGasEnv } = require('../tests/gas-env');

const PORT = Number(process.env.PORT || 8080);
const SRC = path.join(__dirname, '..', 'apps-script');

const { ctx, env } = createGasEnv({ props: { DEV_SHOW_OTP: 'true' }, verbose: true });
ctx.setupSheets();
ctx.loadDemoData_();
ctx.Db.clearCache();
if (process.env.DEV_EMPTY !== '1') {
  // Chạy sẵn 1 lần xếp lịch để giao diện có dữ liệu.
  const admin = { email: 'hien.le@kdi.edu.vn', isSuperAdmin: true, role: 'admin' };
  const run = ctx.runAuto_({ mode: 'fill' }, admin);
  ctx.applyRun_({ id: run.id }, admin);
}
const firstTeacher = ctx.Db.read('teachers')[0];

const DEV_USERS = [
  ['hien.le@kdi.edu.vn', 'Quản trị gốc (Admin)'],
  ['scheduler@kdi.edu.vn', 'Chuyên viên xếp lịch (AC)'],
  ['sale@kdi.edu.vn', 'Sale'],
  ['viewer@kdi.edu.vn', 'Xem lịch'],
  [firstTeacher.email, 'Giáo viên ' + firstTeacher.name],
  ['', 'Chưa đăng nhập Google (dùng mã OTP)'],
  ['nguoi.ngoai@gmail.com', 'Email ngoài KDI'],
];
// Cấp sẵn vai trò cho các tài khoản thử.
[['scheduler@kdi.edu.vn', 'scheduler'], ['sale@kdi.edu.vn', 'sale'], ['viewer@kdi.edu.vn', 'viewer']].forEach(([email, role]) => {
  ctx.saveUser_({ email: 'hien.le@kdi.edu.vn', isSuperAdmin: true, role: 'admin' }, { email, name: role.toUpperCase(), role });
});

function page() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (m, name) => fs.readFileSync(path.join(SRC, name + '.html'), 'utf8'));
  const shim = `<script>
  (function () {
    function devUser() { var p = new URLSearchParams(location.search); return p.has('as') ? p.get('as') : 'hien.le@kdi.edu.vn'; }
    function Runner(s, f) { this._s = s; this._f = f; }
    Runner.prototype.withSuccessHandler = function (fn) { return new Runner(fn, this._f); };
    Runner.prototype.withFailureHandler = function (fn) { return new Runner(this._s, fn); };
    Runner.prototype.api = function (action, args, token) {
      var s = this._s, f = this._f;
      fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action, args: args, token: token, as: devUser() }) })
        .then(function (r) { return r.text(); }).then(function (t) { if (s) s(t); }).catch(function (e) { if (f) f(e); });
    };
    window.google = { script: { run: new Runner() } };
    window.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999;background:#fff3bf;border:1px solid #f08c00;border-radius:8px;padding:4px 8px;font:12px Arial';
      bar.innerHTML = 'DEV – đăng nhập như: <select id="dev-as">' + ${JSON.stringify(DEV_USERS)}.map(function (u) {
        return '<option value="' + u[0] + '"' + (u[0] === devUser() ? ' selected' : '') + '>' + u[1] + (u[0] ? ' – ' + u[0] : '') + '</option>';
      }).join('') + '</select>';
      document.body.appendChild(bar);
      document.getElementById('dev-as').onchange = function () { try { localStorage.clear(); } catch (e) {} location.href = '?as=' + encodeURIComponent(this.value); };
    });
  })();
  </script>`;
  return html.replace('<head>', '<head>' + shim);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try {
        const { action, args, token, as } = JSON.parse(body || '{}');
        env.setUser(as || '');
        ctx.Db.clearCache();
        out = ctx.api(action, args || {}, token || '');
        if (action === 'auth.requestCode') console.log('[OTP]', JSON.parse(out).data);
      } catch (e) {
        out = JSON.stringify({ ok: false, error: String(e && e.message || e) });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(out);
    });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page());
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('KDI Scheduler (chế độ chạy thử) tại http://localhost:' + PORT);
  console.log('Dữ liệu mẫu: ' + ctx.Db.read('schools').length + ' trường, ' + ctx.Db.read('teachers').length + ' GV, ' + ctx.Db.read('lessons').length + ' tiết.');
});
