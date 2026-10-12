#!/usr/bin/env node
/**
 * Tạo file mẫu CSV (mở bằng Excel) cho từng sheet dữ liệu, kèm vài dòng ví dụ.
 * Chạy: node tools/make-templates.js  → thư mục mau-du-lieu/
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createGasEnv } = require('../tests/gas-env');

const OUT = path.join(__dirname, '..', 'mau-du-lieu');
const { ctx } = createGasEnv();
const demo = ctx.buildDemoData(20260901);
const pick = {
  subjects: demo.subjects,
  schools: demo.schools.slice(0, 3),
  teachers: demo.teachers.slice(0, 3),
  links: [demo.links[0], demo.links[1], demo.links.find((l) => l.preference === 'Không xếp')],
  unavailability: demo.unavailability.slice(0, 2),
  lessons: demo.lessons.slice(0, 5),
};
const NAMES = { subjects: '1_MonHoc', schools: '2_TruongHoc', teachers: '3_GiaoVien', links: '4_GV_Truong', unavailability: '5_LichBan', lessons: '6_TKB' };
const csv = (v) => { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

fs.mkdirSync(OUT, { recursive: true });
Object.keys(NAMES).forEach((t) => {
  const cols = ctx.TABLES[t].columns.filter((c) => !['source', 'explain', 'updatedAt', 'updatedBy'].includes(c.key));
  const lines = [cols.map((c) => c.header)].concat(pick[t].map((r) => cols.map((c) => (typeof r[c.key] === 'boolean' ? (r[c.key] ? 'TRUE' : 'FALSE') : r[c.key]))));
  fs.writeFileSync(path.join(OUT, NAMES[t] + '.csv'), '﻿' + lines.map((l) => l.map(csv).join(',')).join('\r\n') + '\r\n');
});
console.log('Đã tạo ' + Object.keys(NAMES).length + ' file mẫu trong mau-du-lieu/');
