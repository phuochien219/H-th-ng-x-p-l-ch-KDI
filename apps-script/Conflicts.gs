/**
 * Phát hiện trùng lịch / cảnh báo, tính lịch trống và số liệu tổng quan.
 * (thuần JavaScript – kiểm thử được bằng Node)
 */

var CONFLICT_TYPES = {
  overlap: { label: 'Trùng giờ dạy', severity: 'error' },
  unavailable: { label: 'Trùng lịch bận của GV', severity: 'error' },
  blocked: { label: 'GV bị "Không xếp" tại trường', severity: 'error' },
  inactive: { label: 'GV đã ngừng hoạt động', severity: 'error' },
  unknown_teacher: { label: 'Mã GV không tồn tại', severity: 'error' },
  invalid: { label: 'Dữ liệu TKB lỗi', severity: 'error' },
  travel: { label: 'Không đủ thời gian di chuyển giữa 2 trường', severity: 'warning' },
  over_hours: { label: 'Vượt giờ dạy tối đa', severity: 'warning' },
  too_many_schools: { label: 'Dạy quá nhiều trường', severity: 'warning' },
  untrained: { label: 'GV chưa được đào tạo môn', severity: 'warning' },
  too_far: { label: 'Trường quá xa nhà GV', severity: 'warning' },
};

function lessonBrief_(ctx, l) {
  var s = ctx.schools[l.school];
  return weekdayLabel(l.weekday) + ' ' + fmtTime(l.start) + '–' + fmtTime(l.end) + ' tại ' + (s ? s.name : l.school) +
    (l.className ? ' (lớp ' + l.className + ')' : '');
}

function detectConflicts(ctx) {
  var out = [];
  function add(type, data) {
    var def = CONFLICT_TYPES[type];
    out.push(Object.assign({ type: type, label: def.label, severity: def.severity }, data));
  }

  ctx.lessonList.forEach(function (l) {
    if (l.invalid) add('invalid', { lessons: [l.id], school: l.school, teacher: l.teacher, message: 'Tiết ' + l.id + ': ' + l.invalid });
  });

  var byTeacher = {};
  ctx.lessonList.forEach(function (l) {
    if (l.invalid || !l.teacher) return;
    var t = ctx.teachers[l.teacher];
    if (!t) {
      add('unknown_teacher', { lessons: [l.id], teacher: l.teacher, school: l.school, weekday: l.weekday,
        message: 'Tiết ' + lessonBrief_(ctx, l) + ' được gán mã GV "' + l.teacher + '" không có trong danh sách GV' });
      return;
    }
    (byTeacher[l.teacher] = byTeacher[l.teacher] || []).push(l);
  });

  Object.keys(byTeacher).sort().forEach(function (code) {
    var t = ctx.teachers[code];
    var list = byTeacher[code];
    var load = 0;
    var schools = {};
    if (!t.active) {
      add('inactive', { teacher: code, lessons: list.map(function (l) { return l.id; }),
        message: t.name + ' đã ngừng hoạt động nhưng vẫn còn ' + list.length + ' tiết được gán' });
    }
    list.forEach(function (l) {
      load += l.load;
      schools[l.school] = true;
      var link = ctx.links[code + '|' + l.school];
      if (link && link.preference === 'blocked') {
        add('blocked', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
          message: t.name + ' bị đánh dấu "Không xếp" nhưng đang dạy ' + lessonBrief_(ctx, l) });
      }
      t.unavailable[l.weekday].forEach(function (u) {
        if (overlaps(l.start, l.end, u.start, u.end)) {
          add('unavailable', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
            message: t.name + ' có lịch bận ' + fmtTime(u.start) + '–' + fmtTime(u.end) + (u.reason ? ' (' + u.reason + ')' : '') +
              ' nhưng được xếp ' + lessonBrief_(ctx, l) });
        }
      });
      if (l.subject && !hasSubject_(t, l.subject)) {
        add('untrained', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
          message: t.name + ' chưa được đào tạo môn ' + subjectName_(ctx, l.subject) + ' – ' + lessonBrief_(ctx, l) });
      }
      var d = teacherSchoolDistance(ctx, code, l.school);
      var prio = link && link.preference === 'priority';
      if (!prio && ctx.S.max_distance_km > 0 && d.km !== null && d.km > ctx.S.max_distance_km) {
        add('too_far', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
          message: t.name + ' cách ' + (ctx.schools[l.school] || {}).name + ' khoảng ' + d.km + ' km (> ' + ctx.S.max_distance_km + ' km)' });
      }
    });

    // Trùng giờ & thời gian di chuyển trong từng ngày.
    for (var wd = 0; wd < 7; wd++) {
      var day = list.filter(function (l) { return l.weekday === wd; })
        .sort(function (a, b) { return a.start - b.start || a.end - b.end; });
      for (var i = 0; i < day.length; i++) {
        for (var j = i + 1; j < day.length; j++) {
          var a = day[i];
          var b = day[j];
          if (overlaps(a.start, a.end, b.start, b.end)) {
            add('overlap', { teacher: code, lessons: [a.id, b.id], weekday: wd, school: a.school,
              message: t.name + ' bị trùng lịch ' + weekdayLabel(wd) + ': ' + fmtTime(a.start) + '–' + fmtTime(a.end) + ' tại ' +
                (ctx.schools[a.school] || {}).name + (a.className ? ' (' + a.className + ')' : '') + ' và ' +
                fmtTime(b.start) + '–' + fmtTime(b.end) + ' tại ' + (ctx.schools[b.school] || {}).name + (b.className ? ' (' + b.className + ')' : '') });
          } else if (a.school !== b.school) {
            var gap = b.start - a.end;
            var need = schoolTravelMinutes(ctx, a.school, b.school);
            // Chỉ xét 2 tiết liền kề nhau trong ngày.
            var between = day.slice(i + 1, j).length;
            if (gap < need && between === 0) {
              add('travel', { teacher: code, lessons: [a.id, b.id], weekday: wd, school: b.school,
                message: t.name + ' chỉ có ' + gap + ' phút để đi từ ' + (ctx.schools[a.school] || {}).name + ' (' + fmtTime(a.end) +
                  ') đến ' + (ctx.schools[b.school] || {}).name + ' (' + fmtTime(b.start) + '), cần khoảng ' + need + ' phút' });
            }
          }
        }
      }
    }

    if (load > t.max + 1e-9) {
      add('over_hours', { teacher: code, lessons: [], message: t.name + ' (' + t.typeLabel + ') dạy ' + round1(load) + 'h/tuần, vượt mức tối đa ' + t.max + 'h (định mức ' + t.target + 'h)' });
    }
    var nSchools = Object.keys(schools).length;
    if (nSchools > t.maxSchools) {
      add('too_many_schools', { teacher: code, lessons: [], message: t.name + ' đang dạy ' + nSchools + ' trường (tối đa ' + t.maxSchools + '): ' +
        Object.keys(schools).map(function (s) { return (ctx.schools[s] || {}).name || s; }).join(', ') });
    }
  });

  out.sort(function (a, b) {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || String(a.teacher || '').localeCompare(String(b.teacher || ''));
  });
  return out;
}

/** Map lessonId → danh sách mức cảnh báo (để tô màu trên lưới lịch). */
function conflictIndex(conflicts) {
  var idx = {};
  conflicts.forEach(function (c) {
    (c.lessons || []).forEach(function (id) {
      var cur = idx[id];
      if (!cur || (cur === 'warning' && c.severity === 'error')) idx[id] = c.severity;
    });
  });
  return idx;
}

/**
 * Lịch trống của GV trong 1 ngày.
 * opts: { from, to (phút, tùy chọn), subject, district, type: 'Thường'|'Kiêm nhiệm', school }
 */
function computeFreeSlots(ctx, weekday, opts) {
  opts = opts || {};
  var S = ctx.S;
  var dayStart = S.dayStartMin;
  var dayEnd = S.dayEndMin;
  var st = stateFromAssignments(ctx, null);
  var rows = [];
  Object.keys(ctx.teachers).sort().forEach(function (code) {
    var t = ctx.teachers[code];
    if (!t.active) return;
    if (opts.subject && !hasSubject_(t, String(opts.subject).toUpperCase())) return;
    if (opts.district && t.district !== opts.district) return;
    if (opts.type && t.typeLabel !== opts.type) return;
    var lessons = st[code].byDay[weekday].slice().sort(function (a, b) { return a.start - b.start; });
    var busy = lessons.map(function (l) {
      return { start: l.start, end: l.end, kind: 'lesson', lessonId: l.id, school: l.school,
        label: ((ctx.schools[l.school] || {}).name || l.school) + (l.className ? ' · ' + l.className : '') };
    });
    t.unavailable[weekday].forEach(function (u) {
      busy.push({ start: u.start, end: u.end, kind: 'unavailable', label: u.reason || 'Lịch bận' });
    });
    busy.sort(function (a, b) { return a.start - b.start; });
    var merged = mergeIntervals(busy.map(function (b) { return [b.start, b.end]; }));
    var free = [];
    var cur = dayStart;
    merged.forEach(function (iv) {
      if (iv[0] > cur) free.push([cur, Math.min(iv[0], dayEnd)]);
      cur = Math.max(cur, iv[1]);
    });
    if (cur < dayEnd) free.push([cur, dayEnd]);
    free = free.filter(function (f) { return f[1] - f[0] >= S.min_free_minutes; });
    var freeMinutes = free.reduce(function (s, f) { return s + (f[1] - f[0]); }, 0);

    var fitsRange = null;
    if (opts.from !== undefined && opts.from !== null && opts.to !== undefined && opts.to !== null) {
      fitsRange = merged.every(function (iv) { return !overlaps(iv[0], iv[1], opts.from, opts.to); });
      // Nếu trong ngày đã dạy ở trường khác, kiểm tra thêm thời gian di chuyển tới trường cần dạy.
      if (fitsRange && opts.school) {
        var target = String(opts.school).toUpperCase();
        fitsRange = lessons.every(function (l) {
          if (l.school === target) return true;
          var gap = opts.from >= l.end ? opts.from - l.end : l.start - opts.to;
          return gap >= schoolTravelMinutes(ctx, l.school, target);
        });
      }
    }
    var distance = opts.school ? teacherSchoolDistance(ctx, code, String(opts.school).toUpperCase()).km : null;
    rows.push({
      teacher: code, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district,
      subjects: t.subjects, load: round1(st[code].load), target: t.target, max: t.max,
      busy: busy.map(function (b) { return Object.assign({}, b, { startText: fmtTime(b.start), endText: fmtTime(b.end) }); }),
      free: free.map(function (f) { return { start: f[0], end: f[1], text: fmtTime(f[0]) + '–' + fmtTime(f[1]) }; }),
      freeMinutes: freeMinutes, fitsRange: fitsRange, distance: distance,
      teachingToday: lessons.length,
    });
  });
  rows.sort(function (a, b) {
    if (a.fitsRange !== b.fitsRange) return a.fitsRange ? -1 : 1;
    if (a.distance !== null && b.distance !== null && a.distance !== b.distance) return a.distance - b.distance;
    return (a.load / a.target) - (b.load / b.target) || b.freeMinutes - a.freeMinutes;
  });
  return { weekday: weekday, dayStart: dayStart, dayEnd: dayEnd, rows: rows };
}

/** Số liệu tổng quan cho trang chủ. */
function computeDashboard(ctx, conflicts) {
  var st = stateFromAssignments(ctx, null);
  var lessons = ctx.lessonList.filter(function (l) { return !l.invalid; });
  var assigned = lessons.filter(function (l) { return l.teacher && ctx.teachers[l.teacher]; });
  var activeTeachers = Object.keys(ctx.teachers).map(function (c) { return ctx.teachers[c]; }).filter(function (t) { return t.active; });
  var activeSchools = Object.keys(ctx.schools).filter(function (c) { return ctx.schools[c].active; });

  var loads = activeTeachers.map(function (t) {
    var ts = st[t.code];
    var status = ts.load > t.max + 1e-9 ? 'over' : ts.load > t.target + 1e-9 ? 'high' : ts.load >= t.target * 0.8 ? 'ok' : ts.load > 0 ? 'low' : 'none';
    return { teacher: t.code, name: t.name, type: t.typeLabel, load: round1(ts.load), target: t.target, max: t.max,
      schools: Object.keys(ts.schools).length, status: status };
  }).sort(function (a, b) { return b.load / b.target - a.load / a.target; });

  var unassignedBySchool = {};
  lessons.forEach(function (l) {
    if (l.teacher && ctx.teachers[l.teacher]) return;
    unassignedBySchool[l.school] = (unassignedBySchool[l.school] || 0) + 1;
  });

  // Cung – cầu theo môn: tổng giờ cần dạy vs số GV đã được đào tạo.
  var subjectStats = {};
  lessons.forEach(function (l) {
    var s = subjectStats[l.subject] = subjectStats[l.subject] || { subject: l.subject, name: subjectName_(ctx, l.subject), lessons: 0, hours: 0, trained: 0, assignedUntrained: 0 };
    s.lessons++;
    s.hours += l.load;
    var t = ctx.teachers[l.teacher];
    if (t && !hasSubject_(t, l.subject)) s.assignedUntrained++;
  });
  Object.keys(subjectStats).forEach(function (code) {
    var s = subjectStats[code];
    s.trained = activeTeachers.filter(function (t) { return hasSubject_(t, code); }).length;
    s.hours = round1(s.hours);
    s.hoursPerTrained = s.trained ? round1(s.hours / s.trained) : null;
  });

  // Phân bố theo quận/huyện: số trường vs số GV.
  var districts = {};
  activeSchools.forEach(function (c) {
    var d = ctx.schools[c].district || '(chưa rõ)';
    (districts[d] = districts[d] || { district: d, schools: 0, teachers: 0, hours: 0 }).schools++;
  });
  activeTeachers.forEach(function (t) {
    var d = t.district || '(chưa rõ)';
    (districts[d] = districts[d] || { district: d, schools: 0, teachers: 0, hours: 0 }).teachers++;
  });
  lessons.forEach(function (l) {
    var d = (ctx.schools[l.school] && ctx.schools[l.school].district) || '(chưa rõ)';
    if (districts[d]) districts[d].hours += l.load;
  });

  var totalHours = lessons.reduce(function (s, l) { return s + l.load; }, 0);
  var capacity = activeTeachers.reduce(function (s, t) { return s + t.target; }, 0);
  return {
    counts: {
      schools: activeSchools.length,
      teachers: activeTeachers.length,
      fullTime: activeTeachers.filter(function (t) { return !t.partTime; }).length,
      partTime: activeTeachers.filter(function (t) { return t.partTime; }).length,
      lessons: lessons.length,
      assigned: assigned.length,
      unassigned: lessons.length - assigned.length,
      locked: lessons.filter(function (l) { return l.locked; }).length,
      invalid: ctx.lessonList.length - lessons.length,
      totalHours: round1(totalHours),
      capacity: round1(capacity),
      errors: conflicts.filter(function (c) { return c.severity === 'error'; }).length,
      warnings: conflicts.filter(function (c) { return c.severity === 'warning'; }).length,
      overloaded: loads.filter(function (l) { return l.status === 'over'; }).length,
      underloaded: loads.filter(function (l) { return l.status === 'low' || l.status === 'none'; }).length,
    },
    loads: loads,
    unassignedBySchool: Object.keys(unassignedBySchool).map(function (s) {
      return { school: s, name: (ctx.schools[s] || {}).name || s, count: unassignedBySchool[s] };
    }).sort(function (a, b) { return b.count - a.count; }),
    subjects: Object.keys(subjectStats).map(function (k) { return subjectStats[k]; }).sort(function (a, b) { return (b.hoursPerTrained || 999) - (a.hoursPerTrained || 999); }),
    districts: Object.keys(districts).map(function (k) { var d = districts[k]; d.hours = round1(d.hours); return d; })
      .sort(function (a, b) { return b.schools - a.schools; }),
  };
}
