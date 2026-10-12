'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { build, DIST } = require('../tools/build-bundle');

test('dist/ khớp với mã nguồn (chạy "npm run build" sau khi sửa code)', () => {
  const out = build();
  Object.keys(out).forEach((f) => {
    const p = path.join(DIST, f);
    assert.ok(fs.existsSync(p), 'thiếu ' + p);
    assert.equal(fs.readFileSync(p, 'utf8'), out[f], f + ' đã cũ – chạy npm run build');
  });
});

test('Code.gs gộp nạp được và có đủ các hàm chính', () => {
  const ctx = vm.createContext({ console });
  new vm.Script(build()['Code.gs'], { filename: 'Code.gs' }).runInContext(ctx);
  ['api', 'doGet', 'include', 'onOpen', 'setupSheets', 'menuAutoSchedule', 'runAutoSchedule', 'detectConflicts'].forEach((fn) => {
    assert.equal(typeof ctx[fn], 'function', fn);
  });
});
