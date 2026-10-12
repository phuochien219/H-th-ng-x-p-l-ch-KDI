/**
 * Lớp truy cập dữ liệu: mỗi "bảng" là một sheet trong Google Sheets, dòng 1 là tiêu đề.
 * Cột được nhận diện theo TÊN TIÊU ĐỀ nên người dùng có thể đổi thứ tự cột hoặc
 * thêm cột ghi chú riêng mà không làm hỏng hệ thống.
 */

/**
 * TĂNG TỐC: đọc Google Sheets mất ~0,2–0,5 giây/sheet, nên dữ liệu các bảng chính được
 * lưu tạm (CacheService) dưới dạng 1 "ảnh chụp" dùng chung cho mọi người dùng.
 * - Mọi thao tác ghi của hệ thống xóa ảnh chụp ngay lập tức.
 * - Sửa tay trên Sheets: trigger onEdit xóa ảnh chụp; trường hợp khác (vd. xóa dòng)
 *   ảnh chụp tự hết hạn sau SNAPSHOT_TTL_SEC giây.
 * - Trong withLock_ (khi ghi) luôn đọc trực tiếp từ sheet để đảm bảo chính xác.
 */
var SNAPSHOT_TABLES = ['settings', 'users', 'subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'distances', 'lessons'];
var SNAPSHOT_TTL_SEC = 300;
var SNAPSHOT_CHUNK = 30000; // ký tự/ô cache (giới hạn 100KB, tiếng Việt tối đa 3 byte/ký tự)

var Db = (function () {
  var cache = {};
  var fresh = false;
  var snapMemo = null;

  function snapshot_() {
    if (snapMemo) return snapMemo;
    var sc = null;
    try { sc = CacheService.getScriptCache(); } catch (e) { sc = null; }
    if (sc) {
      try {
        var meta = sc.get('snap_meta');
        if (meta) {
          var keys = [];
          for (var i = 0; i < Number(meta); i++) keys.push('snap_' + i);
          var parts = sc.getAll(keys);
          var complete = keys.every(function (k) { return parts[k] !== undefined && parts[k] !== null; });
          if (complete) {
            snapMemo = JSON.parse(keys.map(function (k) { return parts[k]; }).join(''));
            return snapMemo;
          }
        }
      } catch (e) { /* đọc lại từ sheet */ }
    }
    var data = {};
    SNAPSHOT_TABLES.forEach(function (t) { data[t] = readSheet_(t); });
    snapMemo = data;
    if (sc) {
      try {
        var json = JSON.stringify(data);
        var map = {};
        var n = Math.ceil(json.length / SNAPSHOT_CHUNK);
        for (var j = 0; j < n; j++) map['snap_' + j] = json.substr(j * SNAPSHOT_CHUNK, SNAPSHOT_CHUNK);
        map.snap_meta = String(n);
        sc.putAll(map, SNAPSHOT_TTL_SEC);
      } catch (e) { /* dữ liệu quá lớn để lưu tạm – vẫn chạy bình thường */ }
    }
    return snapMemo;
  }

  function invalidateSnapshot(table) {
    if (table && SNAPSHOT_TABLES.indexOf(table) < 0) return;
    snapMemo = null;
    try { CacheService.getScriptCache().remove('snap_meta'); } catch (e) { /* bỏ qua */ }
  }

  function ss() {
    var active = null;
    try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
    if (active) return active;
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Chưa cấu hình SPREADSHEET_ID (Project Settings → Script properties).');
    return SpreadsheetApp.openById(id);
  }

  function def(table) {
    var d = TABLES[table];
    if (!d) throw new Error('Không có bảng: ' + table);
    return d;
  }

  function sheet(table, create) {
    var d = def(table);
    var sh = ss().getSheetByName(d.sheet);
    if (!sh && create) {
      sh = ss().insertSheet(d.sheet);
      ensureHeaders_(table, sh);
    }
    return sh;
  }

  /** Đảm bảo đủ tiêu đề cột; thêm cột thiếu vào cuối. */
  function ensureHeaders_(table, sh) {
    var d = def(table);
    var lastCol = sh.getLastColumn();
    var headers = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str) : [];
    var added = false;
    d.columns.forEach(function (c) {
      if (headers.indexOf(c.header) < 0) {
        headers.push(c.header);
        added = true;
      }
    });
    if (headers.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    if (added || lastCol === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1f3b73').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    d.columns.forEach(function (c) {
      if (TEXT_COLUMNS[c.type]) {
        var col = headers.indexOf(c.header) + 1;
        sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    });
    delete cache[table];
    invalidateSnapshot(table);
    return headers;
  }

  /** Đọc toàn bộ bảng (có cache trong 1 lần thực thi). */
  function load(table) {
    if (cache[table]) return cache[table];
    var d = def(table);
    var sh = sheet(table, false);
    var entry = { sheet: sh, header: [], col: {}, grid: [], rows: null };
    if (sh) {
      var lastRow = sh.getLastRow();
      var lastCol = sh.getLastColumn();
      if (lastRow >= 1 && lastCol >= 1) {
        entry.grid = sh.getRange(1, 1, lastRow, lastCol).getValues();
        entry.header = entry.grid[0].map(str);
      }
    }
    d.columns.forEach(function (c) {
      entry.col[c.key] = entry.header.indexOf(c.header);
    });
    cache[table] = entry;
    return entry;
  }

  function rowToObj_(table, entry, r) {
    var d = def(table);
    var row = entry.grid[r];
    var o = { _row: r + 1 };
    d.columns.forEach(function (c) {
      var i = entry.col[c.key];
      var v = i >= 0 ? row[i] : '';
      if (c.type === 'bool') v = toBool(v, c.def === undefined ? false : c.def);
      else v = cellToPlain_(v);
      if (typeof v === 'string') v = v.trim();
      o[c.key] = v;
    });
    return o;
  }

  function isBlankRow_(row) {
    for (var i = 0; i < row.length; i++) {
      if (row[i] !== '' && row[i] !== null && row[i] !== false) return false;
    }
    return true;
  }

  /** Danh sách đối tượng của bảng (bỏ dòng trống) – dùng ảnh chụp nếu có thể. */
  function read(table) {
    if (!fresh && SNAPSHOT_TABLES.indexOf(table) >= 0) {
      var snap = snapshot_();
      // Ảnh chụp cũ (từ phiên bản trước) có thể thiếu bảng mới → tạo lại.
      if (!snap[table]) { invalidateSnapshot(); snap = snapshot_(); }
      return (snap[table] || readSheet_(table)).map(function (o) { return Object.assign({}, o); });
    }
    return readSheet_(table);
  }

  /** Đọc trực tiếp từ sheet. */
  function readSheet_(table) {
    var entry = load(table);
    if (!entry.rows) {
      var out = [];
      for (var r = 1; r < entry.grid.length; r++) {
        if (isBlankRow_(entry.grid[r])) continue;
        out.push(rowToObj_(table, entry, r));
      }
      entry.rows = out;
    }
    return entry.rows.map(function (o) { return Object.assign({}, o); });
  }

  function valueForCell_(c, v) {
    if (v === undefined || v === null) return '';
    if (c.type === 'bool') return !!v;
    if (c.type === 'time' && typeof v === 'number') return fmtTime(v);
    if (c.type === 'weekday' && typeof v === 'number') return weekdayLabel(v);
    return v;
  }

  function buildRow_(table, entry, obj, baseRow) {
    var d = def(table);
    var width = Math.max(entry.header.length, 1);
    var row = baseRow ? baseRow.slice() : new Array(width).fill('');
    while (row.length < width) row.push('');
    d.columns.forEach(function (c) {
      var i = entry.col[c.key];
      if (i < 0 || !(c.key in obj)) return;
      row[i] = valueForCell_(c, obj[c.key]);
    });
    return row;
  }

  function prepare_(table) {
    var sh = sheet(table, true);
    var entry = load(table);
    var missing = def(table).columns.some(function (c) { return entry.col[c.key] < 0; });
    if (missing) {
      ensureHeaders_(table, sh);
      entry = load(table);
    }
    return entry;
  }

  /** Thêm nhiều dòng. */
  function append(table, objs) {
    if (!objs || !objs.length) return;
    var entry = prepare_(table);
    var rows = objs.map(function (o) { return buildRow_(table, entry, o, null); });
    var sh = entry.sheet;
    // Dòng trống cuối cùng thực sự (bỏ qua ô chỉ chứa FALSE của checkbox).
    var lastData = 1;
    for (var r = entry.grid.length - 1; r >= 1; r--) {
      if (!isBlankRow_(entry.grid[r])) { lastData = r + 1; break; }
    }
    var start = lastData + 1;
    var lastNeeded = start + rows.length - 1;
    if (lastNeeded > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), lastNeeded - sh.getMaxRows());
    def(table).columns.forEach(function (c) {
      if (TEXT_COLUMNS[c.type] && entry.col[c.key] >= 0) sh.getRange(start, entry.col[c.key] + 1, rows.length, 1).setNumberFormat('@');
    });
    invalidateSnapshot(table);
    sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
    def(table).columns.forEach(function (c) {
      if (c.type === 'bool' && entry.col[c.key] >= 0) sh.getRange(start, entry.col[c.key] + 1, rows.length, 1).insertCheckboxes();
    });
    delete cache[table];
  }

  /**
   * Cập nhật các dòng đã có. Mỗi phần tử cần `_row` (số dòng trong sheet) và các
   * trường cần đổi. Cột ngoài schema được giữ nguyên.
   */
  function update(table, items) {
    if (!items || !items.length) return;
    var entry = prepare_(table);
    var d = def(table);
    var touchedCols = {};
    items.forEach(function (it) {
      var r = it._row - 1;
      if (r < 1 || r >= entry.grid.length) throw new Error('Dòng không hợp lệ: ' + it._row);
      entry.grid[r] = buildRow_(table, entry, it, entry.grid[r]);
      d.columns.forEach(function (c) {
        if (c.key in it && entry.col[c.key] >= 0) touchedCols[entry.col[c.key]] = true;
      });
    });
    invalidateSnapshot(table);
    var width = entry.header.length;
    if (items.length <= 10) {
      items.forEach(function (it) {
        entry.sheet.getRange(it._row, 1, 1, width).setValues([entry.grid[it._row - 1].slice(0, width)]);
      });
    } else {
      var n = entry.grid.length - 1;
      Object.keys(touchedCols).forEach(function (ci) {
        ci = Number(ci);
        var colValues = [];
        for (var r = 1; r <= n; r++) colValues.push([entry.grid[r][ci] === undefined ? '' : entry.grid[r][ci]]);
        entry.sheet.getRange(2, ci + 1, n, 1).setValues(colValues);
      });
    }
    entry.rows = null;
  }

  /** Xóa các dòng theo số dòng sheet. */
  function remove(table, rowNumbers) {
    if (!rowNumbers || !rowNumbers.length) return;
    var sh = sheet(table, false);
    if (!sh) return;
    invalidateSnapshot(table);
    // Sheets không cho xóa hết các dòng không cố định → chừa lại 1 dòng trống.
    if (sh.getMaxRows() - rowNumbers.length <= 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
    var sorted = rowNumbers.slice().sort(function (a, b) { return b - a; });
    // Gộp các dòng liền nhau để xóa nhanh hơn.
    var i = 0;
    while (i < sorted.length) {
      var end = sorted[i];
      var start = end;
      while (i + 1 < sorted.length && sorted[i + 1] === start - 1) {
        i++;
        start = sorted[i];
      }
      sh.deleteRows(start, end - start + 1);
      i++;
    }
    delete cache[table];
  }

  /** Ghi đè toàn bộ dữ liệu của bảng (dùng cho dữ liệu mẫu / bảng log). */
  function replaceAll(table, objs) {
    var sh = sheet(table, true);
    var lastRow = sh.getLastRow();
    if (lastRow > 1) {
      // Xóa hẳn các dòng (xóa nội dung thì ô checkbox vẫn còn giá trị FALSE).
      if (sh.getMaxRows() - (lastRow - 1) <= 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
      sh.deleteRows(2, lastRow - 1);
    }
    delete cache[table];
    invalidateSnapshot(table);
    append(table, objs);
  }

  function keyOf(table, obj) {
    var k = def(table).key;
    if (Array.isArray(k)) return k.map(function (x) { return str(obj[x]).toUpperCase(); }).join('|');
    if (k === 'email') return normEmail(obj[k]);
    return str(obj[k]);
  }

  function findByKey(table, key) {
    var rows = read(table);
    for (var i = 0; i < rows.length; i++) if (keyOf(table, rows[i]) === key) return rows[i];
    return null;
  }

  function clearCache() {
    cache = {};
    snapMemo = null;
  }

  function setFresh(v) {
    fresh = !!v;
  }

  return {
    ss: ss,
    sheet: sheet,
    ensureHeaders: function (table) { return ensureHeaders_(table, sheet(table, true)); },
    read: read,
    append: append,
    update: update,
    remove: remove,
    replaceAll: replaceAll,
    keyOf: keyOf,
    findByKey: findByKey,
    clearCache: clearCache,
    setFresh: setFresh,
    invalidateSnapshot: invalidateSnapshot,
  };
})();

/** Đọc cấu hình (sheet CauHinh) + giá trị mặc định. */
function getSettings_() {
  var out = {};
  SETTINGS_SPEC.forEach(function (s) { out[s.key] = s.def; });
  var rows = [];
  try { rows = Db.read('settings'); } catch (e) { rows = []; }
  var specByKey = {};
  SETTINGS_SPEC.forEach(function (s) { specByKey[s.key] = s; });
  rows.forEach(function (r) {
    var spec = specByKey[r.key];
    if (!spec || r.value === '' || r.value === null) return;
    out[r.key] = coerceSetting_(spec, r.value);
  });
  return out;
}

function coerceSetting_(spec, v) {
  if (spec.type === 'number') {
    var n = toNum(v);
    return n === null ? spec.def : n;
  }
  if (spec.type === 'bool') return toBool(v, spec.def);
  if (spec.type === 'time') {
    var t = parseTime(v);
    return t === null ? spec.def : fmtTime(t);
  }
  if (spec.type === 'select') {
    var ok = spec.options.some(function (o) { return o[0] === String(v); });
    return ok ? String(v) : spec.def;
  }
  return String(v);
}

function saveSettings_(values) {
  var rows = Db.read('settings');
  var byKey = {};
  rows.forEach(function (r) { byKey[r.key] = r; });
  var updates = [];
  var inserts = [];
  SETTINGS_SPEC.forEach(function (spec) {
    if (!(spec.key in values)) return;
    var v = coerceSetting_(spec, values[spec.key]);
    if (byKey[spec.key]) updates.push({ _row: byKey[spec.key]._row, value: v, description: spec.label });
    else inserts.push({ key: spec.key, value: v, description: spec.label });
  });
  Db.update('settings', updates);
  Db.append('settings', inserts);
}

/** Sinh ID tăng dần dạng PREFIX-000123. */
function nextIds_(table, prefix, count) {
  var max = 0;
  var re = new RegExp('^' + prefix + '-(\\d+)$');
  Db.read(table).forEach(function (r) {
    var m = str(r.id).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  var out = [];
  for (var i = 1; i <= count; i++) {
    var n = String(max + i);
    while (n.length < 6) n = '0' + n;
    out.push(prefix + '-' + n);
  }
  return out;
}

function audit_(user, action, entity, details) {
  try {
    Db.append('audit', [{
      at: nowString(),
      user: user && user.email ? user.email : String(user || 'system'),
      action: action,
      entity: entity || '',
      details: typeof details === 'string' ? details : JSON.stringify(details || ''),
    }]);
  } catch (e) {
    console.error('Không ghi được nhật ký: ' + e);
  }
}

/** Chạy hàm trong khóa toàn script để tránh 2 người ghi đè nhau. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Hệ thống đang bận (người khác đang cập nhật). Vui lòng thử lại sau ít giây.');
  try {
    Db.clearCache();
    Db.setFresh(true);
    return fn();
  } finally {
    Db.setFresh(false);
    Db.clearCache();
    lock.releaseLock();
  }
}
