/**
 * Hàm tiện ích thuần (không gọi dịch vụ Google) – dùng chung cho server và kiểm thử.
 */

function normEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function isAllowedEmail(email) {
  email = normEmail(email);
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+$/.test(email)) return false;
  var domain = email.split('@')[1];
  return APP.ALLOWED_DOMAINS.indexOf(domain) >= 0;
}

function isSuperAdmin(email) {
  return normEmail(email) === normEmail(APP.SUPER_ADMIN);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

/** Chuyển "10,5" / "10.5" / 10.5 → 10.5; rỗng → null. */
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** TRUE/"x"/"có"/1 → true. Rỗng → giá trị mặc định. */
function toBool(v, def) {
  if (v === true || v === false) return v;
  if (v === null || v === undefined || v === '') return def === undefined ? false : def;
  var s = String(v).trim().toLowerCase();
  return ['true', '1', 'x', 'có', 'co', 'yes', 'y', 'v', '✓'].indexOf(s) >= 0;
}

function splitList(v) {
  return str(v).split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Đọc giờ: "7:30", "07:30", "7h30", "7h", "13.45", Date (giá trị giờ của Sheets),
 * số thập phân (phần của ngày, ví dụ 0.3125). Trả về số phút từ 0h, hoặc null.
 */
function parseTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    var hhmm;
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      hhmm = Utilities.formatDate(v, sheetTimeZone_(), 'HH:mm');
    } else {
      hhmm = pad2(v.getHours()) + ':' + pad2(v.getMinutes());
    }
    return parseTime(hhmm);
  }
  if (typeof v === 'number') {
    if (v >= 0 && v < 1) return Math.round(v * 24 * 60);
    return null;
  }
  var s = String(v).trim().toLowerCase();
  var m = s.match(/^(\d{1,2})\s*[:hg.]\s*(\d{1,2})?/);
  if (!m) return null;
  var h = Number(m[1]);
  var min = m[2] ? Number(m[2]) : 0;
  if (/(pm|ch)\s*$/.test(s) && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function fmtTime(min) {
  if (min === null || min === undefined || isNaN(min)) return '';
  return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
}

/**
 * Đọc thứ trong tuần → 0 (Thứ 2) … 6 (Chủ nhật). Không hợp lệ → -1.
 * Hiểu: "Thứ 2", "T2", "thu hai", 2, "Mon", "Monday", "CN", "Chủ nhật", 8.
 */
function parseWeekday(v) {
  if (v === null || v === undefined || v === '') return -1;
  if (typeof v === 'number') {
    if (v >= 2 && v <= 7) return v - 2;
    if (v === 8 || v === 1) return 6;
    return -1;
  }
  var s = removeDiacritics_(String(v)).toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(cn|chu nhat|sun|sunday)$/.test(s)) return 6;
  var names = { hai: 2, ba: 3, tu: 4, nam: 5, sau: 6, bay: 7 };
  var m = s.match(/^(?:thu|t)\s*\.?\s*(\d|hai|ba|tu|nam|sau|bay)$/) || s.match(/^(\d)$/);
  if (m) {
    var n = names[m[1]] || Number(m[1]);
    if (n >= 2 && n <= 7) return n - 2;
    return -1;
  }
  var en = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (var i = 0; i < en.length; i++) if (s.indexOf(en[i]) === 0) return i;
  return -1;
}

function weekdayLabel(i) {
  return WEEKDAYS[i] || '';
}

function removeDiacritics_(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Khoảng cách đường chim bay (km). */
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** Gộp các khoảng [start, end] chồng nhau. */
function mergeIntervals(list) {
  var sorted = list.slice().sort(function (a, b) { return a[0] - b[0]; });
  var out = [];
  sorted.forEach(function (iv) {
    var last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  });
  return out;
}

function normPreference(v) {
  var s = removeDiacritics_(str(v)).toLowerCase();
  if (!s) return '';
  if (/^(uu tien|priority|x|1|co|true)$/.test(s)) return 'priority';
  if (/^(khong xep|chan|blocked|block|0|khong)$/.test(s)) return 'blocked';
  return '';
}

function isPartTimeType(v) {
  var s = removeDiacritics_(str(v)).toLowerCase();
  return s.indexOf('kiem') >= 0 || s === 'part_time' || s === 'part-time';
}

function sheetTimeZone_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || APP.TIMEZONE;
  } catch (e) {
    return APP.TIMEZONE;
  }
}

function nowString() {
  var d = new Date();
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** Giá trị ô → chuỗi an toàn để trả về client (Date → chuỗi). */
function cellToPlain_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(v, sheetTimeZone_(), 'yyyy-MM-dd HH:mm:ss');
    }
    return v.toISOString();
  }
  return v;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
