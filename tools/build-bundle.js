#!/usr/bin/env node
/**
 * Đóng gói mã nguồn thành bộ file tối giản để chép–dán vào trình soạn Apps Script:
 *   dist/Code.gs (gộp mọi file .gs), dist/Index.html, Styles.html, Client.html, Views.html, appsscript.json
 * Chạy: npm run build
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps-script');
const DIST = path.join(__dirname, '..', 'dist');
// Thứ tự gộp: cấu hình → tiện ích → dữ liệu → thuật toán → API → giao diện.
const ORDER = ['Config', 'Utils', 'Db', 'Scheduler', 'Conflicts', 'Auth', 'Api', 'Import', 'Export', 'Setup', 'WebApp'];

function build() {
  const files = fs.readdirSync(SRC);
  const gs = files.filter((f) => f.endsWith('.gs')).map((f) => f.replace(/\.gs$/, ''));
  const missing = gs.filter((n) => !ORDER.includes(n));
  if (missing.length) throw new Error('Thêm vào ORDER trong build-bundle.js: ' + missing.join(', '));
  const version = (fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8').match(/VERSION: '([^']+)'/) || [])[1];
  const header = '/**\n * KDI Scheduler ' + version + ' – bản gộp 1 file (tự động tạo bởi tools/build-bundle.js).\n' +
    ' * KHÔNG sửa trực tiếp file này – sửa trong thư mục apps-script/ rồi chạy: npm run build\n */\n';
  const code = header + ORDER.filter((n) => gs.includes(n)).map((n) =>
    '\n/* ======================= ' + n + '.gs ======================= */\n' + fs.readFileSync(path.join(SRC, n + '.gs'), 'utf8')).join('');
  const out = { 'Code.gs': code };
  files.filter((f) => f.endsWith('.html') || f === 'appsscript.json').forEach((f) => { out[f] = fs.readFileSync(path.join(SRC, f), 'utf8'); });
  return out;
}

if (require.main === module) {
  const out = build();
  fs.mkdirSync(DIST, { recursive: true });
  Object.keys(out).forEach((f) => fs.writeFileSync(path.join(DIST, f), out[f]));
  console.log('Đã tạo dist/: ' + Object.keys(out).join(', '));
}

module.exports = { build, DIST };
