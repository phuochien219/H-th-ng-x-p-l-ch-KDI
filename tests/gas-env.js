/**
 * Môi trường giả lập Google Apps Script để chạy và kiểm thử code .gs bằng Node.
 * Giả lập đủ các API mà dự án dùng (SpreadsheetApp, Session, CacheService, ...),
 * và cố ý "khó tính" giống Apps Script thật (vd. báo lỗi khi range vượt kích thước sheet).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC_DIR = path.join(__dirname, '..', 'apps-script');

class FakeRange {
  constructor(sheet, row, col, nrows, ncols) {
    if (!(row >= 1 && col >= 1 && nrows >= 1 && ncols >= 1)) {
      throw new Error(`Invalid range (${row}, ${col}, ${nrows}, ${ncols}) on ${sheet.name}`);
    }
    if (row + nrows - 1 > sheet.maxRows || col + ncols - 1 > sheet.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    Object.assign(this, { sheet, row, col, nrows, ncols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nrows; r++) {
      const line = [];
      for (let c = 0; c < this.ncols; c++) line.push(this.sheet._get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map((r) => r.map((v) => (v === null ? '' : String(v)))); }
  getValue() { return this.sheet._get(this.row, this.col); }
  setValue(v) { this.sheet._set(this.row, this.col, v); return this; }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.nrows) {
      throw new Error(`The number of rows in the data does not match the number of rows in the range. The data has ${values && values.length} but the range has ${this.nrows}.`);
    }
    values.forEach((line, r) => {
      if (line.length !== this.ncols) {
        throw new Error(`The number of columns in the data does not match the number of columns in the range. The data has ${line.length} but the range has ${this.ncols}.`);
      }
      line.forEach((v, c) => {
        if (v !== null && typeof v === 'object' && !(v instanceof Date)) throw new Error('Cannot write object value to cell');
        this.sheet._set(this.row + r, this.col + c, v === undefined ? '' : v);
      });
    });
    return this;
  }
  setBackgrounds(colors) {
    if (colors.length !== this.nrows || colors.some((l) => l.length !== this.ncols)) throw new Error('Background dimensions mismatch');
    this.sheet.backgrounds = colors;
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.nrows; r++) for (let c = 0; c < this.ncols; c++) this.sheet._set(this.row + r, this.col + c, '');
    return this;
  }
  getRow() { return this.row; }
  getNumRows() { return this.nrows; }
}
// Định dạng: không làm gì nhưng trả về range để nối chuỗi như Apps Script.
['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setVerticalAlignment',
  'setHorizontalAlignment', 'setDataValidation', 'insertCheckboxes'].forEach((m) => {
  FakeRange.prototype[m] = function () { return this; };
});

class FakeSheet {
  constructor(ss, name) {
    this.ss = ss;
    this.name = name;
    this.rows = []; // mảng 2 chiều, index từ 0
    this.maxRows = 1000;
    this.maxCols = 26;
    this.frozen = 0;
  }
  _get(r, c) {
    const line = this.rows[r - 1];
    const v = line ? line[c - 1] : undefined;
    return v === undefined ? '' : v;
  }
  _set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getRange(row, col, nrows, ncols) {
    if (typeof row === 'string') throw new Error('A1 notation not supported in fake');
    return new FakeRange(this, row, col, nrows || 1, ncols || 1);
  }
  getLastRow() {
    for (let r = this.rows.length; r >= 1; r--) {
      const line = this.rows[r - 1] || [];
      if (line.some((v) => v !== '' && v !== undefined && v !== null)) return r;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.rows.forEach((line) => {
      for (let c = line.length; c >= 1; c--) {
        if (line[c - 1] !== '' && line[c - 1] !== undefined && line[c - 1] !== null) { max = Math.max(max, c); break; }
      }
    });
    return max;
  }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(values) {
    const r = this.getLastRow() + 1;
    if (r > this.maxRows) this.maxRows = r;
    if (values.length > this.maxCols) this.maxCols = values.length;
    values.forEach((v, i) => this._set(r, i + 1, v));
    return this;
  }
  setFrozenRows(n) { this.frozen = n; return this; }
  getFrozenRows() { return this.frozen; }
  insertRowsAfter(after, n) {
    this.rows.splice(after, 0, ...Array.from({ length: n }, () => []));
    this.maxRows += n;
    return this;
  }
  insertColumnsAfter(after, n) { this.maxCols += n; return this; }
  deleteRows(start, n) {
    if (this.maxRows - n <= this.frozen) throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
    if (start < 1 || start + n - 1 > this.maxRows) throw new Error('Those rows are out of bounds.');
    this.rows.splice(start - 1, n);
    this.maxRows -= n;
    return this;
  }
  deleteRow(r) { return this.deleteRows(r, 1); }
  setColumnWidth() { return this; }
  setTabColor() { return this; }
  clear() { this.rows = []; return this; }
  clearContents() { this.rows = []; return this; }
}

let ssCounter = 0;
class FakeSpreadsheet {
  constructor(name) {
    this.id = 'ss' + (++ssCounter);
    this.name = name || 'Untitled';
    this.sheets = [];
    this.editors = [];
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSpreadsheetTimeZone() { return 'Asia/Ho_Chi_Minh'; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error('A sheet with the name "' + n + '" already exists.');
    const s = new FakeSheet(this, n);
    this.sheets.push(s);
    return s;
  }
  toast() {}
  addEditor(email) { this.editors.push(email); return this; }
}

function formatDate(date, tz, fmt) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  if (parts.hour === '24') parts.hour = '00';
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

/**
 * Tạo môi trường mới. Trả về { ctx, env }:
 *  - ctx: global của các file .gs (gọi ctx.api(...), ctx.buildContext(...), ...)
 *  - env: điều khiển giả lập (env.setUser(email), env.ss, env.sentMail, ...)
 */
function createGasEnv(opts) {
  opts = opts || {};
  const env = {
    ss: new FakeSpreadsheet('KDI Scheduler DB'),
    created: [],
    currentEmail: '',
    sentMail: [],
    cache: new Map(),
    props: new Map(Object.entries(opts.props || {})),
    errors: [],
    setUser(email) { this.currentEmail = email || ''; },
  };
  const sandbox = {
    console: {
      log() {}, info() {}, warn() {},
      error: (...a) => { env.errors.push(a.join(' ')); if (opts.verbose) console.error(...a); },
    },
    Logger: { log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => env.ss,
      getActive: () => env.ss,
      openById: (id) => (id === env.ss.id ? env.ss : env.created.find((s) => s.id === id)),
      create: (name) => {
        const s = new FakeSpreadsheet(name);
        s.insertSheet('Sheet1');
        env.created.push(s);
        return s;
      },
      newDataValidation: () => {
        const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) };
        return b;
      },
      getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
      flush: () => {},
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.currentEmail }),
      getEffectiveUser: () => ({ getEmail: () => 'owner@kdi.edu.vn' }),
      getScriptTimeZone: () => 'Asia/Ho_Chi_Minh',
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (env.cache.has(k) ? env.cache.get(k) : null),
        put: (k, v) => { env.cache.set(k, String(v)); },
        remove: (k) => { env.cache.delete(k); },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (env.props.has(k) ? env.props.get(k) : null),
        setProperty: (k, v) => { env.props.set(k, String(v)); },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      formatDate,
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    MailApp: {
      sendEmail: (m) => { env.sentMail.push(m); },
      getRemainingDailyQuota: () => 100,
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/kdi.edu.vn/s/FAKE/exec' }) },
    HtmlService: {
      createTemplateFromFile: () => { throw new Error('HtmlService not available in tests'); },
      createHtmlOutputFromFile: (name) => ({ getContent: () => fs.readFileSync(path.join(SRC_DIR, name + '.html'), 'utf8') }),
    },
  };
  const ctx = vm.createContext(sandbox);
  // Nạp từng file như Apps Script (mỗi file một script, chung global).
  // Thứ tự alphabet giúp phát hiện phụ thuộc chéo lúc nạp file.
  fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.gs')).sort().forEach((f) => {
    new vm.Script(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'), { filename: f }).runInContext(ctx);
  });
  return { ctx, env };
}

/** Gọi API như client và trả về object (đã JSON.parse). */
function callApi(ctx, env, email, action, args, token) {
  env.setUser(email);
  ctx.Db.clearCache();
  return JSON.parse(ctx.api(action, args || {}, token || ''));
}

module.exports = { createGasEnv, callApi, FakeSpreadsheet, formatDate };
