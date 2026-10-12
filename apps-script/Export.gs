/**
 * Xuất lịch ra file Google Sheets mới & gửi lịch dạy qua email cho giáo viên.
 */

function lessonLine_(ctx, l, withTeacher) {
  var s = ctx.schools[l.school];
  var t = ctx.people[l.teacher];
  var parts = [fmtTime(l.start) + '–' + fmtTime(l.end)];
  if (withTeacher) {
    parts.push((t ? t.name : (!l.needTeacher ? 'GV của trường' : l.teacher || 'CHƯA XẾP GV')) + (l.needAssistant ? ' + TG ' + (ctx.people[l.assistant] ? ctx.people[l.assistant].name : 'CHƯA XẾP') : ''));
  } else parts.push(s ? s.name : l.school);
  if (l.className) parts.push(l.className);
  parts.push(subjectName_(ctx, l.subject));
  return parts.join(' · ');
}

function usedWeekdays_(ctx) {
  var used = [true, true, true, true, true, false, false];
  ctx.lessonList.forEach(function (l) { if (!l.invalid) used[l.weekday] = true; });
  return [0, 1, 2, 3, 4, 5, 6].filter(function (i) { return used[i]; });
}

function writeTable_(sh, headers, rows, opts) {
  opts = opts || {};
  // Sheet mới chỉ có 1000 dòng × 26 cột – mở rộng trước khi ghi.
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  if (headers.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1f3b73').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  if (rows.length) {
    var range = sh.getRange(2, 1, rows.length, headers.length);
    range.setValues(rows);
    if (opts.wrap) range.setWrap(true).setVerticalAlignment('top');
  }
  if (opts.widths) opts.widths.forEach(function (w, i) { if (w) sh.setColumnWidth(i + 1, w); });
}

function buildExportTables_(ctx) {
  var conflicts = detectConflicts(ctx);
  var days = usedWeekdays_(ctx);
  var st = stateFromAssignments(ctx, null, 'teacher');
  var stA = stateFromAssignments(ctx, null, 'assistant');
  var valid = ctx.lessonList.filter(function (l) { return !l.invalid; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start; });

  var teacherGrid = Object.keys(ctx.teachers).sort().filter(function (c) { return ctx.teachers[c].active; }).map(function (code) {
    var t = ctx.teachers[code];
    var row = [code, t.name, t.typeLabel, round1(st[code].load), t.target, Object.keys(st[code].schools).length];
    days.forEach(function (wd) {
      row.push(st[code].byDay[wd].slice().sort(function (a, b) { return a.start - b.start; })
        .map(function (l) { return lessonLine_(ctx, l, false); }).join('\n'));
    });
    return row;
  });

  var assistantGrid = Object.keys(ctx.assistants).sort().filter(function (c) { return ctx.assistants[c].active; }).map(function (code) {
    var t = ctx.assistants[code];
    var row = [code, t.name, 'Trợ giảng', round1(stA[code].load), t.target, Object.keys(stA[code].schools).length];
    days.forEach(function (wd) {
      row.push(stA[code].byDay[wd].slice().sort(function (a, b) { return a.start - b.start; })
        .map(function (l) { return lessonLine_(ctx, l, false); }).join('\n'));
    });
    return row;
  });

  var schoolGrid = Object.keys(ctx.schools).sort().map(function (code) {
    var s = ctx.schools[code];
    var mine = valid.filter(function (l) { return l.school === code; });
    var row = [code, s.name, s.district, mine.length, mine.filter(function (l) { return !l.teacher; }).length];
    days.forEach(function (wd) {
      row.push(mine.filter(function (l) { return l.weekday === wd; }).map(function (l) { return lessonLine_(ctx, l, true); }).join('\n'));
    });
    return row;
  });

  var detail = valid.map(function (l) {
    var s = ctx.schools[l.school];
    var t = ctx.teachers[l.teacher];
    var a = ctx.assistants[l.assistant];
    return [l.id, weekdayLabel(l.weekday), fmtTime(l.start), fmtTime(l.end), l.school, s ? s.name : '', l.className, l.grade,
      subjectName_(ctx, l.subject), l.periods, l.teacher, t ? t.name : '', l.needAssistant ? 'Có' : 'Không', l.assistant, a ? a.name : '', l.locked ? 'Có' : '', l.source];
  });

  var loads = Object.keys(ctx.teachers).sort().map(function (code) {
    var t = ctx.teachers[code];
    var ts = st[code];
    var schools = Object.keys(ts.schools).map(function (sc) { return (ctx.schools[sc] || {}).name || sc; }).join(', ');
    var status = ts.load > t.max + 1e-9 ? 'Vượt tối đa' : ts.load > t.target + 1e-9 ? 'Trên định mức' : ts.load >= t.target * 0.8 ? 'Đạt' : 'Thiếu giờ';
    return [code, t.name, t.typeLabel, t.active ? 'Có' : 'Không', round1(ts.load), t.target, t.max, Object.keys(ts.schools).length, schools, status];
  });

  var unassigned = valid.filter(function (l) { return l.needTeacher && (!l.teacher || !ctx.teachers[l.teacher]); }).map(function (l) {
    var s = ctx.schools[l.school];
    return [l.id, s ? s.name : l.school, weekdayLabel(l.weekday), fmtTime(l.start) + '–' + fmtTime(l.end), l.className, subjectName_(ctx, l.subject), l.explain];
  });

  var warn = conflicts.map(function (c) {
    return [c.severity === 'error' ? 'Lỗi' : 'Cảnh báo', c.label, c.teacher ? ((ctx.teachers[c.teacher] || {}).name || c.teacher) : '', c.message];
  });

  Object.keys(ctx.assistants).sort().forEach(function (code) {
    var t = ctx.assistants[code];
    var ts = stA[code];
    var schools = Object.keys(ts.schools).map(function (sc) { return (ctx.schools[sc] || {}).name || sc; }).join(', ');
    var status = ts.load > t.max + 1e-9 ? 'Vượt tối đa' : ts.load > t.target + 1e-9 ? 'Trên định mức' : ts.load >= t.target * 0.8 ? 'Đạt' : 'Thiếu giờ';
    loads.push([code, t.name, 'Trợ giảng', t.active ? 'Có' : 'Không', round1(ts.load), t.target, t.max, Object.keys(ts.schools).length, schools, status]);
  });
  valid.filter(function (l) { return l.needAssistant && !ctx.assistants[l.assistant]; }).forEach(function (l) {
    var s = ctx.schools[l.school];
    unassigned.push([l.id, s ? s.name : l.school, weekdayLabel(l.weekday), fmtTime(l.start) + '–' + fmtTime(l.end), l.className, subjectName_(ctx, l.subject), 'Thiếu TRỢ GIẢNG – ' + (l.explainTA || '')]);
  });

  return { days: days, teacherGrid: teacherGrid, assistantGrid: assistantGrid, schoolGrid: schoolGrid, detail: detail, loads: loads, unassigned: unassigned, warn: warn };
}

function exportToSpreadsheet_(user) {
  var ctx = context_();
  var T = buildExportTables_(ctx);
  var dayHeaders = T.days.map(weekdayLabel);
  var name = 'KDI – Lịch dạy STEM – ' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'dd/MM/yyyy HH:mm');
  var out = SpreadsheetApp.create(name);
  var first = out.getSheets()[0];
  first.setName('Lịch theo GV');
  writeTable_(first, ['Mã GV', 'Họ tên', 'Loại', 'Giờ/tuần', 'Định mức', 'Số trường'].concat(dayHeaders), T.teacherGrid,
    { wrap: true, widths: [70, 170, 90, 70, 70, 70].concat(dayHeaders.map(function () { return 260; })) });
  writeTable_(out.insertSheet('Lịch theo trợ giảng'), ['Mã TG', 'Họ tên', 'Loại', 'Giờ/tuần', 'Định mức', 'Số trường'].concat(dayHeaders), T.assistantGrid,
    { wrap: true, widths: [70, 170, 90, 70, 70, 70].concat(dayHeaders.map(function () { return 260; })) });
  writeTable_(out.insertSheet('Lịch theo trường'), ['Mã trường', 'Tên trường', 'Quận/Huyện', 'Số tiết', 'Chưa xếp'].concat(dayHeaders), T.schoolGrid,
    { wrap: true, widths: [80, 200, 110, 60, 70].concat(dayHeaders.map(function () { return 280; })) });
  writeTable_(out.insertSheet('Chi tiết TKB'), ['ID', 'Thứ', 'Bắt đầu', 'Kết thúc', 'Mã trường', 'Tên trường', 'Lớp', 'Khối', 'Chương trình', 'Số tiết', 'Mã GV', 'Giáo viên', 'Cần TG', 'Mã TG', 'Trợ giảng', 'Ghim', 'Nguồn xếp'], T.detail);
  writeTable_(out.insertSheet('Tổng hợp giờ dạy'), ['Mã GV', 'Họ tên', 'Loại', 'Hoạt động', 'Giờ/tuần', 'Định mức', 'Tối đa', 'Số trường', 'Các trường', 'Đánh giá'], T.loads,
    { widths: [70, 170, 90, 70, 70, 70, 70, 70, 360, 100] });
  writeTable_(out.insertSheet('Chưa xếp'), ['ID', 'Trường', 'Thứ', 'Giờ', 'Lớp', 'Môn', 'Lý do'], T.unassigned, { widths: [100, 200, 70, 100, 60, 140, 500] });
  writeTable_(out.insertSheet('Cảnh báo'), ['Mức độ', 'Loại', 'Giáo viên', 'Chi tiết'], T.warn, { widths: [80, 220, 170, 600] });
  try { out.addEditor(user.email); } catch (e) { /* người dùng có thể trùng chủ sở hữu */ }
  audit_(user, 'Xuất lịch', name, out.getUrl());
  return { url: out.getUrl(), name: name };
}

/** Nội dung email lịch dạy của 1 GV. */
function teacherEmailHtml_(ctx, code) {
  var t = ctx.people[code];
  var field = STAFF_ROLES[t.role].field;
  var lessons = ctx.lessonList.filter(function (l) { return !l.invalid && l[field] === code; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start; });
  var load = lessons.reduce(function (s, l) { return s + l.load; }, 0);
  var rows = lessons.map(function (l) {
    var s = ctx.schools[l.school] || {};
    return '<tr><td>' + weekdayLabel(l.weekday) + '</td><td>' + fmtTime(l.start) + '–' + fmtTime(l.end) + '</td><td>' + escapeHtml(s.name || l.school) +
      '</td><td>' + escapeHtml(l.className) + '</td><td>' + escapeHtml(subjectName_(ctx, l.subject)) + '</td><td>' + escapeHtml(l.room) + '</td></tr>';
  }).join('');
  var td = 'style="border:1px solid #ccd;padding:6px 10px"';
  return '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    '<p>Chào thầy/cô <b>' + escapeHtml(t.name) + '</b>,</p>' +
    '<p>KDI Education gửi thầy/cô lịch dạy STEM hằng tuần (tổng <b>' + round1(load) + ' giờ</b>, ' + lessons.length + ' tiết):</p>' +
    '<table style="border-collapse:collapse">' +
    '<tr style="background:#1f3b73;color:#fff"><th ' + td + '>Thứ</th><th ' + td + '>Giờ</th><th ' + td + '>Trường</th><th ' + td + '>Lớp</th><th ' + td + '>Môn</th><th ' + td + '>Phòng</th></tr>' +
    rows.replace(/<td>/g, '<td ' + td + '>') + '</table>' +
    '<p>Nếu có thay đổi hoặc bận đột xuất, thầy/cô vui lòng báo ngay cho bộ phận xếp lịch.</p><p>Trân trọng,<br>KDI Education</p></div>';
}

function emailSchedules_(user, codes) {
  var ctx = context_();
  var list = (codes && codes.length ? codes.map(function (c) { return str(c).toUpperCase(); }) : Object.keys(ctx.people))
    .filter(function (c) { return ctx.people[c] && ctx.people[c].active; });
  var sent = 0;
  var skipped = [];
  var targets = list.filter(function (code) {
    var t = ctx.people[code];
    var field = STAFF_ROLES[t.role].field;
    var has = ctx.lessonList.some(function (l) { return l[field] === code && !l.invalid; });
    if (!t.email) { skipped.push({ teacher: code, reason: 'Chưa có email' }); return false; }
    if (!has) { skipped.push({ teacher: code, reason: 'Chưa có lịch dạy' }); return false; }
    return true;
  });
  var quota = MailApp.getRemainingDailyQuota();
  if (targets.length > quota) throw userError_('Hạn mức gửi email hôm nay chỉ còn ' + quota + ', cần ' + targets.length + '.');
  targets.forEach(function (code) {
    MailApp.sendEmail({
      to: ctx.people[code].email,
      subject: '[KDI] Lịch ' + (ctx.people[code].role === 'assistant' ? 'trợ giảng' : 'dạy') + ' STEM của ' + ctx.people[code].name,
      htmlBody: teacherEmailHtml_(ctx, code),
    });
    sent++;
  });
  audit_(user, 'Gửi lịch qua email', sent + ' GV', skipped.length ? 'Bỏ qua ' + skipped.length : '');
  return { sent: sent, skipped: skipped, quotaLeft: quota - sent };
}
