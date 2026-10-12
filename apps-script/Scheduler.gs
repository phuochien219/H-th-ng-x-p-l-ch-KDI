/**
 * THUẬT TOÁN XẾP LỊCH TỰ ĐỘNG (thuần JavaScript, không gọi dịch vụ Google).
 *
 * Ràng buộc CỨNG (không bao giờ vi phạm khi hệ thống tự xếp):
 *   - GV không dạy 2 tiết trùng giờ; giữa 2 trường khác nhau phải đủ thời gian di chuyển.
 *   - Không xếp vào lịch bận của GV; không xếp GV bị đánh dấu "Không xếp" tại trường.
 *   - Không vượt giờ tối đa/tuần, không vượt số trường tối đa (mặc định 3).
 *   - Không quá khoảng cách tối đa (trừ khi là trường ưu tiên của GV).
 *   - (Tùy chọn) GV phải được đào tạo môn.
 *
 * Tiêu chí MỀM theo thứ tự ưu tiên (thể hiện qua trọng số, chỉnh được ở Cấu hình):
 *   (1) trường ưu tiên xếp → (2) khoảng cách gần → (3) môn đã được đào tạo
 *   → (4) ít trường (2–3 trường/GV) → (5) cân bằng giờ dạy (10h kiêm nhiệm / 15h thường)
 *   → xếp loại chất lượng GV.
 *
 * Các bước:
 *   Bước 1: xếp các tiết có GV ưu tiên trước (chỉ chọn trong nhóm GV ưu tiên).
 *   Bước 2: xếp phần còn lại theo từng trường, trường "khó" (ít GV phù hợp) làm trước.
 *   Bước 3: sửa chữa – với tiết chưa xếp được, thử chuyển 1 tiết đang chặn sang GV khác.
 *   Bước 4: cân bằng – chuyển tiết từ GV vượt định mức sang GV còn thiếu giờ nếu
 *           điểm không giảm quá ngưỡng cho phép.
 */

var RATING_LEVEL = { A: 2, B: 1, C: 0, D: -1 };

/** Dựng ngữ cảnh xếp lịch từ dữ liệu thô của các bảng. */
function buildContext(data, settings) {
  var S = {};
  SETTINGS_SPEC.forEach(function (s) { S[s.key] = s.def; });
  Object.keys(settings || {}).forEach(function (k) { S[k] = settings[k]; });
  S.dayStartMin = parseTime(S.day_start) || 420;
  S.dayEndMin = parseTime(S.day_end) || 1050;

  var ctx = { S: S, subjects: {}, schools: {}, teachers: {}, links: {}, lessons: {}, lessonList: [], distCache: {}, travelCache: {} };

  (data.subjects || []).forEach(function (s) {
    var code = str(s.code).toUpperCase();
    if (code) ctx.subjects[code] = { code: code, name: str(s.name) || code, color: str(s.color) };
  });

  (data.schools || []).forEach(function (s) {
    var code = str(s.code).toUpperCase();
    if (!code) return;
    ctx.schools[code] = {
      code: code, name: str(s.name) || code, district: str(s.district),
      lat: toNum(s.lat), lng: toNum(s.lng), active: toBool(s.active, true),
    };
  });

  (data.teachers || []).forEach(function (t) {
    var code = str(t.code).toUpperCase();
    if (!code) return;
    var partTime = isPartTimeType(t.type);
    var target = toNum(t.targetHours) || (partTime ? S.target_hours_part_time : S.target_hours_full_time);
    var max = toNum(t.maxHours) || (target + S.max_hours_tolerance);
    var rating = str(t.rating).toUpperCase();
    ctx.teachers[code] = {
      code: code, name: str(t.name) || code, email: normEmail(t.email),
      partTime: partTime, typeLabel: partTime ? 'Kiêm nhiệm' : 'Thường',
      rating: RATING_LEVEL.hasOwnProperty(rating) ? rating : 'C',
      district: str(t.district), lat: toNum(t.lat), lng: toNum(t.lng),
      subjects: splitList(t.subjects).map(function (x) { return x.toUpperCase(); }),
      target: target, max: Math.max(max, target),
      maxSchools: toNum(t.maxSchools) || S.hard_max_schools,
      active: toBool(t.active, true),
      unavailable: [[], [], [], [], [], [], []],
    };
  });

  (data.unavailability || []).forEach(function (u) {
    var t = ctx.teachers[str(u.teacher).toUpperCase()];
    var wd = parseWeekday(u.weekday);
    var s = parseTime(u.start);
    var e = parseTime(u.end);
    if (!t || wd < 0 || s === null || e === null || e <= s) return;
    t.unavailable[wd].push({ start: s, end: e, reason: str(u.reason) });
  });

  (data.links || []).forEach(function (l) {
    var tc = str(l.teacher).toUpperCase();
    var sc = str(l.school).toUpperCase();
    if (!tc || !sc) return;
    ctx.links[tc + '|' + sc] = { distance: toNum(l.distance), preference: normPreference(l.preference) };
  });

  (data.lessons || []).forEach(function (l) {
    var lesson = {
      id: str(l.id), row: l._row, school: str(l.school).toUpperCase(),
      weekday: parseWeekday(l.weekday), start: parseTime(l.start), end: parseTime(l.end),
      className: str(l.className), grade: str(l.grade), subject: str(l.subject).toUpperCase(),
      periods: toNum(l.periods) || 1, room: str(l.room),
      teacher: str(l.teacher).toUpperCase(), locked: toBool(l.locked, false),
      source: str(l.source), explain: str(l.explain), notes: str(l.notes),
    };
    lesson.invalid = validateLesson_(ctx, lesson);
    lesson.load = lesson.invalid ? 0 : (S.load_unit === 'periods' ? lesson.periods : (lesson.end - lesson.start) / 60);
    if (!lesson.id) return;
    ctx.lessons[lesson.id] = lesson;
    ctx.lessonList.push(lesson);
  });
  return ctx;
}

function validateLesson_(ctx, l) {
  if (!ctx.schools[l.school]) return 'Mã trường "' + l.school + '" không có trong danh sách trường';
  if (l.weekday < 0) return 'Thứ không hợp lệ';
  if (l.start === null || l.end === null) return 'Giờ bắt đầu/kết thúc không hợp lệ';
  if (l.end <= l.start) return 'Giờ kết thúc phải sau giờ bắt đầu';
  return '';
}

function subjectName_(ctx, code) {
  return ctx.subjects[code] ? ctx.subjects[code].name : code;
}

/** Khoảng cách nhà GV → trường: ưu tiên số liệu nhập tay, sau đó ước tính theo tọa độ. */
function teacherSchoolDistance(ctx, tcode, scode) {
  var key = tcode + '|' + scode;
  if (ctx.distCache[key]) return ctx.distCache[key];
  var res;
  var link = ctx.links[key];
  var t = ctx.teachers[tcode];
  var s = ctx.schools[scode];
  if (link && link.distance !== null && link.distance !== undefined) {
    res = { km: link.distance, source: 'manual' };
  } else if (t && s && t.lat !== null && t.lng !== null && s.lat !== null && s.lng !== null) {
    res = { km: round1(haversineKm(t.lat, t.lng, s.lat, s.lng) * ctx.S.road_factor), source: 'estimate' };
  } else {
    res = { km: null, source: 'unknown' };
  }
  ctx.distCache[key] = res;
  return res;
}

/** Thời gian cần để di chuyển giữa 2 trường (phút). */
function schoolTravelMinutes(ctx, a, b) {
  if (a === b) return 0;
  var key = a < b ? a + '|' + b : b + '|' + a;
  if (ctx.travelCache[key] !== undefined) return ctx.travelCache[key];
  var base = ctx.S.min_gap_between_schools_min;
  var sa = ctx.schools[a];
  var sb = ctx.schools[b];
  var mins = base;
  if (sa && sb && sa.lat !== null && sa.lng !== null && sb.lat !== null && sb.lng !== null && ctx.S.travel_speed_kmh > 0) {
    var km = haversineKm(sa.lat, sa.lng, sb.lat, sb.lng) * ctx.S.road_factor;
    mins = Math.max(base, Math.ceil(km / ctx.S.travel_speed_kmh * 60));
  }
  ctx.travelCache[key] = mins;
  return mins;
}

function isPriority_(ctx, tcode, scode) {
  var l = ctx.links[tcode + '|' + scode];
  return !!(l && l.preference === 'priority');
}

/** Điểm ưu tiên trường có áp dụng cho tiết này không (tùy cấu hình: chỉ khi GV đã được đào tạo môn). */
function priorityApplies_(ctx, t, lesson) {
  if (!isPriority_(ctx, t.code, lesson.school)) return false;
  return !ctx.S.priority_requires_trained || hasSubject_(t, lesson.subject);
}

function hasSubject_(t, subject) {
  return !subject || t.subjects.indexOf(subject) >= 0;
}

/* ------------------------------ Trạng thái ------------------------------ */

function newState(ctx) {
  var st = {};
  Object.keys(ctx.teachers).forEach(function (code) {
    st[code] = { byDay: [[], [], [], [], [], [], []], load: 0, schools: {}, classes: {} };
  });
  return st;
}

function stateAdd(st, tcode, lesson) {
  var ts = st[tcode];
  if (!ts) return;
  ts.byDay[lesson.weekday].push(lesson);
  ts.load += lesson.load;
  ts.schools[lesson.school] = (ts.schools[lesson.school] || 0) + 1;
  var ck = lesson.school + '|' + lesson.className;
  ts.classes[ck] = (ts.classes[ck] || 0) + 1;
}

function stateRemove(st, tcode, lesson) {
  var ts = st[tcode];
  if (!ts) return;
  var day = ts.byDay[lesson.weekday];
  var idx = day.indexOf(lesson);
  if (idx < 0) return;
  day.splice(idx, 1);
  ts.load -= lesson.load;
  if (--ts.schools[lesson.school] <= 0) delete ts.schools[lesson.school];
  var ck = lesson.school + '|' + lesson.className;
  if (--ts.classes[ck] <= 0) delete ts.classes[ck];
}

/** Trạng thái từ các phân công hiện có (bỏ qua 1 tiết nếu cần). */
function stateFromAssignments(ctx, excludeLessonId) {
  var st = newState(ctx);
  ctx.lessonList.forEach(function (l) {
    if (l.invalid || !l.teacher || l.id === excludeLessonId || !st[l.teacher]) return;
    stateAdd(st, l.teacher, l);
  });
  return st;
}

/* ---------------------------- Kiểm tra ràng buộc ---------------------------- */

/** Ràng buộc không phụ thuộc phân công khác. Trả về mã lý do hoặc ''. */
function staticCheck(ctx, t, lesson) {
  if (!t.active) return 'inactive';
  var link = ctx.links[t.code + '|' + lesson.school];
  var priority = link && link.preference === 'priority';
  if (link && link.preference === 'blocked') return 'blocked';
  if (ctx.S.require_trained_subject && !hasSubject_(t, lesson.subject)) return 'untrained';
  if (!priority && ctx.S.max_distance_km > 0) {
    var d = teacherSchoolDistance(ctx, t.code, lesson.school);
    if (d.km !== null && d.km > ctx.S.max_distance_km) return 'too_far';
  }
  var un = t.unavailable[lesson.weekday];
  for (var i = 0; i < un.length; i++) {
    if (overlaps(lesson.start, lesson.end, un[i].start, un[i].end)) return 'unavailable';
  }
  return '';
}

/** Ràng buộc phụ thuộc lịch hiện tại của GV. */
function dynamicCheck(ctx, st, t, lesson) {
  var ts = st[t.code];
  var day = ts.byDay[lesson.weekday];
  for (var i = 0; i < day.length; i++) {
    var o = day[i];
    if (o.id === lesson.id) continue;
    if (overlaps(lesson.start, lesson.end, o.start, o.end)) return 'overlap';
    if (o.school !== lesson.school) {
      var gap = lesson.start >= o.end ? lesson.start - o.end : o.start - lesson.end;
      if (gap < schoolTravelMinutes(ctx, o.school, lesson.school)) return 'travel';
    }
  }
  if (ts.load + lesson.load > t.max + 1e-9) return 'max_hours';
  if (!ts.schools[lesson.school] && Object.keys(ts.schools).length >= t.maxSchools) return 'max_schools';
  return '';
}

/** Các tiết đang khiến GV không nhận được tiết `lesson` (trùng giờ / không kịp di chuyển). */
function blockingLessons_(ctx, st, t, lesson) {
  var out = [];
  st[t.code].byDay[lesson.weekday].forEach(function (o) {
    if (o.id === lesson.id) return;
    if (overlaps(lesson.start, lesson.end, o.start, o.end)) { out.push(o); return; }
    if (o.school !== lesson.school) {
      var gap = lesson.start >= o.end ? lesson.start - o.end : o.start - lesson.end;
      if (gap < schoolTravelMinutes(ctx, o.school, lesson.school)) out.push(o);
    }
  });
  return out;
}

/* --------------------------------- Chấm điểm --------------------------------- */

function scoreCandidate(ctx, st, t, lesson) {
  var S = ctx.S;
  var parts = [];
  if (priorityApplies_(ctx, t, lesson)) parts.push(['Trường ưu tiên xếp của GV', S.w_priority]);
  else if (isPriority_(ctx, t.code, lesson.school)) parts.push(['Trường ưu tiên (không áp dụng vì chưa đào tạo môn)', 0]);

  var d = teacherSchoolDistance(ctx, t.code, lesson.school);
  var km = d.km === null ? S.unknown_distance_km : d.km;
  var dLabel = d.source === 'manual' ? 'Khoảng cách ' + km + ' km'
    : d.source === 'estimate' ? 'Khoảng cách ước tính ~' + km + ' km'
    : 'Chưa có khoảng cách (tạm tính ' + km + ' km)';
  parts.push([dLabel, -S.w_distance_per_km * km]);

  if (lesson.subject) {
    if (hasSubject_(t, lesson.subject)) parts.push(['Đã được đào tạo môn ' + subjectName_(ctx, lesson.subject), S.w_trained]);
    else parts.push(['Chưa được đào tạo môn ' + subjectName_(ctx, lesson.subject), 0]);
  }

  var ts = st[t.code];
  var nSchools = Object.keys(ts.schools).length;
  if (ts.schools[lesson.school]) {
    parts.push(['Đang dạy tại trường này', S.w_same_school]);
    var sameDay = ts.byDay[lesson.weekday].some(function (o) { return o.school === lesson.school && o.id !== lesson.id; });
    if (sameDay) parts.push(['Đã có lịch ở trường này cùng ngày', S.w_same_day_school]);
  } else if (nSchools >= S.preferred_max_schools) {
    parts.push(['Thêm trường thứ ' + (nSchools + 1) + ' (nên dạy ≤ ' + S.preferred_max_schools + ' trường)', -S.w_extra_school]);
  }

  if (lesson.className && ts.classes[lesson.school + '|' + lesson.className]) parts.push(['Đang dạy lớp ' + lesson.className, S.w_same_class]);

  var newLoad = ts.load + lesson.load;
  if (newLoad <= t.target + 1e-9) {
    parts.push(['Giờ dạy ' + round1(ts.load) + '/' + t.target + 'h – còn thiếu giờ', S.w_load_balance * (t.target - ts.load) / t.target]);
  } else {
    var over = newLoad - Math.max(t.target, ts.load);
    parts.push(['Vượt định mức ' + t.target + 'h (lên ' + round1(newLoad) + 'h)', -S.w_over_target_per_hour * over]);
  }

  var lvl = RATING_LEVEL[t.rating] || 0;
  if (lvl) parts.push(['Xếp loại ' + t.rating, lvl * S.w_rating]);

  var total = 0;
  parts = parts.map(function (p) {
    var v = Math.round(p[1] * 10) / 10;
    total += v;
    return [p[0], v];
  });
  return { total: Math.round(total * 10) / 10, parts: parts };
}

function explainText(score) {
  return 'Điểm ' + score.total + ': ' + score.parts.map(function (p) {
    return (p[1] >= 0 ? '+' : '') + p[1] + ' ' + p[0];
  }).join('; ');
}

function pickBest_(ctx, st, lesson, teachers) {
  var best = null;
  teachers.forEach(function (t) {
    var sc = scoreCandidate(ctx, st, t, lesson);
    if (!best || sc.total > best.score.total || (sc.total === best.score.total && t.code < best.teacher.code)) {
      best = { teacher: t, score: sc };
    }
  });
  return best;
}

function cmp_() {
  var keys = arguments;
  return function (a, b) {
    for (var i = 0; i < keys.length; i++) {
      var va = keys[i](a);
      var vb = keys[i](b);
      if (va < vb) return -1;
      if (va > vb) return 1;
    }
    return 0;
  };
}

/* --------------------------------- Xếp lịch --------------------------------- */

/**
 * @param {Object} ctx  ngữ cảnh từ buildContext
 * @param {Object} opts { mode: 'fill' | 'rebuild', schools: [mã trường] (tùy chọn) }
 *   - fill: giữ nguyên phân công hiện có, chỉ xếp tiết còn trống.
 *   - rebuild: xếp lại toàn bộ (trừ tiết đã Ghim) trong phạm vi các trường được chọn.
 */
function runAutoSchedule(ctx, opts) {
  opts = opts || {};
  var mode = opts.mode === 'rebuild' ? 'rebuild' : 'fill';
  var scope = null;
  if (opts.schools && opts.schools.length) {
    scope = {};
    opts.schools.forEach(function (s) { scope[String(s).toUpperCase()] = true; });
  }
  var st = newState(ctx);
  var toSchedule = [];
  var kept = 0;
  var invalid = [];
  var skippedInactiveSchool = 0;

  ctx.lessonList.slice().sort(cmp_(function (l) { return l.id; })).forEach(function (l) {
    if (l.invalid) { invalid.push(l); return; }
    var inScope = !scope || scope[l.school];
    var hasTeacher = l.teacher && ctx.teachers[l.teacher];
    if (hasTeacher && (l.locked || mode === 'fill' || !inScope)) {
      stateAdd(st, l.teacher, l);
      kept++;
      return;
    }
    if (!inScope) return;
    if (!ctx.schools[l.school].active) { skippedInactiveSchool++; return; }
    toSchedule.push(l);
  });

  var teacherList = Object.keys(ctx.teachers).sort().map(function (c) { return ctx.teachers[c]; })
    .filter(function (t) { return t.active; });

  // Ứng viên thỏa ràng buộc tĩnh.
  var cands = {};
  var staticReasons = {};
  toSchedule.forEach(function (l) {
    var c = [];
    var reasons = {};
    teacherList.forEach(function (t) {
      var r = staticCheck(ctx, t, l);
      if (r) reasons[r] = (reasons[r] || 0) + 1;
      else c.push(t);
    });
    cands[l.id] = c;
    staticReasons[l.id] = reasons;
  });

  var assigned = {}; // lessonId -> { teacher, score, phase }
  function assign(l, t, score, phase) {
    stateAdd(st, t.code, l);
    assigned[l.id] = { teacher: t.code, score: score, phase: phase };
  }
  function unassign(l) {
    var a = assigned[l.id];
    if (!a) return;
    stateRemove(st, a.teacher, l);
    delete assigned[l.id];
  }

  // Bước 1: trường ưu tiên – chỉ dùng GV ưu tiên đã được đào tạo đúng môn
  // (GV ưu tiên chưa đào tạo môn vẫn được cộng điểm ưu tiên ở bước 2).
  function prioTrained(t, l) { return priorityApplies_(ctx, t, l) && hasSubject_(t, l.subject); }
  var prio = toSchedule.filter(function (l) {
    return cands[l.id].some(function (t) { return prioTrained(t, l); });
  });
  prio.sort(cmp_(
    function (l) { return cands[l.id].filter(function (t) { return prioTrained(t, l); }).length; },
    function (l) { return cands[l.id].length; },
    function (l) { return l.weekday; }, function (l) { return l.start; }, function (l) { return l.id; }
  ));
  prio.forEach(function (l) {
    var feasible = cands[l.id].filter(function (t) {
      return prioTrained(t, l) && !dynamicCheck(ctx, st, t, l);
    });
    if (!feasible.length) return;
    var best = pickBest_(ctx, st, l, feasible);
    assign(l, best.teacher, best.score, 1);
  });

  // Bước 2: phần còn lại, nhóm theo trường; trường khó làm trước.
  var rest = toSchedule.filter(function (l) { return !assigned[l.id]; });
  var schoolDifficulty = {};
  rest.forEach(function (l) {
    var n = cands[l.id].length;
    if (schoolDifficulty[l.school] === undefined || n < schoolDifficulty[l.school]) schoolDifficulty[l.school] = n;
  });
  rest.sort(cmp_(
    function (l) { return schoolDifficulty[l.school]; }, function (l) { return l.school; },
    function (l) { return cands[l.id].length; },
    function (l) { return l.weekday; }, function (l) { return l.start; }, function (l) { return l.id; }
  ));
  var failed = [];
  rest.forEach(function (l) {
    var feasible = cands[l.id].filter(function (t) { return !dynamicCheck(ctx, st, t, l); });
    if (!feasible.length) { failed.push(l); return; }
    var best = pickBest_(ctx, st, l, feasible);
    assign(l, best.teacher, best.score, 2);
  });

  // Bước 3: sửa chữa bằng cách chuyển 1 tiết đang chặn sang GV khác.
  for (var pass = 0; pass < 2 && failed.length; pass++) {
    var stillFailed = [];
    failed.forEach(function (l) {
      var ranked = cands[l.id].map(function (t) { return { t: t, s: scoreCandidate(ctx, st, t, l).total }; })
        .sort(function (a, b) { return b.s - a.s || (a.t.code < b.t.code ? -1 : 1); });
      var done = false;
      for (var i = 0; i < ranked.length && !done; i++) {
        var t = ranked[i].t;
        var blockers = blockingLessons_(ctx, st, t, l);
        if (blockers.length !== 1) continue;
        var b = blockers[0];
        // Chỉ di chuyển tiết do lần chạy này xếp và không thuộc trường ưu tiên của GV.
        if (b.locked || !assigned[b.id] || priorityApplies_(ctx, t, b)) continue;
        var prevB = assigned[b.id];
        unassign(b);
        if (!dynamicCheck(ctx, st, t, l)) {
          var scoreL = scoreCandidate(ctx, st, t, l);
          stateAdd(st, t.code, l);
          var alts = cands[b.id].filter(function (t2) { return t2.code !== t.code && !dynamicCheck(ctx, st, t2, b); });
          stateRemove(st, t.code, l);
          if (alts.length) {
            assign(l, t, scoreL, 3);
            var bestB = pickBest_(ctx, st, b, alts);
            assign(b, bestB.teacher, bestB.score, 3);
            done = true;
            break;
          }
        }
        stateAdd(st, t.code, b); // hoàn nguyên
        assigned[b.id] = prevB;
      }
      if (!done) stillFailed.push(l);
    });
    if (stillFailed.length === failed.length) { failed = stillFailed; break; }
    failed = stillFailed;
  }

  // Bước 4: cân bằng giờ dạy.
  var moved = 0;
  var tol = ctx.S.balance_tolerance;
  if (tol > 0) {
    for (var iter = 0; iter < 3; iter++) {
      var movedThisIter = 0;
      var over = teacherList.filter(function (t) { return st[t.code].load > t.target + 1e-9; })
        .sort(function (a, b) { return (st[b.code].load - b.target) - (st[a.code].load - a.target); });
      over.forEach(function (A) {
        var mine = [];
        Object.keys(assigned).forEach(function (id) {
          if (assigned[id].teacher === A.code && !priorityApplies_(ctx, A, ctx.lessons[id])) mine.push(ctx.lessons[id]);
        });
        mine.sort(cmp_(function (l) { return l.id; }));
        mine.forEach(function (l) {
          if (st[A.code].load <= A.target + 1e-9) return;
          var prev = assigned[l.id];
          unassign(l);
          var scoreA = scoreCandidate(ctx, st, A, l).total;
          var best = null;
          cands[l.id].forEach(function (B) {
            if (B.code === A.code) return;
            if (st[B.code].load + l.load > B.target + 1e-9) return;
            if (dynamicCheck(ctx, st, B, l)) return;
            var sB = scoreCandidate(ctx, st, B, l);
            if (sB.total >= scoreA - tol && (!best || sB.total > best.score.total)) best = { teacher: B, score: sB };
          });
          if (best) {
            assign(l, best.teacher, best.score, 4);
            movedThisIter++;
          } else {
            stateAdd(st, A.code, l);
            assigned[l.id] = prev;
          }
        });
      });
      moved += movedThisIter;
      if (!movedThisIter) break;
    }
  }

  // Kết quả.
  var proposals = [];
  Object.keys(assigned).sort().forEach(function (id) {
    var a = assigned[id];
    var l = ctx.lessons[id];
    var phaseNote = a.phase === 1 ? ' [B1: trường ưu tiên]' : a.phase === 3 ? ' [B3: hoán đổi để xếp được]' : a.phase === 4 ? ' [B4: cân bằng giờ dạy]' : '';
    proposals.push({ lessonId: id, before: l.teacher || '', teacher: a.teacher, score: a.score.total, explain: explainText(a.score) + phaseNote, phase: a.phase });
  });
  var unassigned = failed.map(function (l) {
    return { lessonId: l.id, before: l.teacher || '', reason: unassignedReason_(ctx, st, l, cands[l.id], staticReasons[l.id], teacherList.length) };
  }).sort(cmp_(function (u) { return u.lessonId; }));

  var loads = teacherList.map(function (t) {
    var ts = st[t.code];
    return { teacher: t.code, name: t.name, type: t.typeLabel, load: round1(ts.load), target: t.target, max: t.max, schools: Object.keys(ts.schools).sort() };
  });

  return {
    mode: mode,
    proposals: proposals,
    unassigned: unassigned,
    invalid: invalid.map(function (l) { return { lessonId: l.id, reason: l.invalid }; }),
    loads: loads,
    stats: {
      considered: toSchedule.length,
      assigned: proposals.length,
      changed: proposals.filter(function (p) { return p.teacher !== p.before; }).length,
      unassigned: unassigned.length,
      kept: kept,
      invalid: invalid.length,
      inactiveSchoolLessons: skippedInactiveSchool,
      priorityAssigned: proposals.filter(function (p) { return p.phase === 1; }).length,
      repaired: proposals.filter(function (p) { return p.phase === 3; }).length,
      balanced: moved,
    },
  };
}

function unassignedReason_(ctx, st, l, cands, staticReasons, nTeachers) {
  var counts = {};
  Object.keys(staticReasons).forEach(function (k) { counts[k] = staticReasons[k]; });
  cands.forEach(function (t) {
    var r = dynamicCheck(ctx, st, t, l);
    if (r) counts[r] = (counts[r] || 0) + 1;
  });
  var order = ['overlap', 'travel', 'max_hours', 'max_schools', 'unavailable', 'too_far', 'untrained', 'blocked'];
  var parts = order.filter(function (k) { return counts[k]; }).map(function (k) {
    var label = REASON_LABELS[k];
    if (k === 'too_far') label += ' (> ' + ctx.S.max_distance_km + ' km)';
    if (k === 'untrained') label += ' ' + subjectName_(ctx, l.subject);
    return counts[k] + ' GV ' + label.charAt(0).toLowerCase() + label.slice(1);
  });
  if (!nTeachers) return 'Chưa có giáo viên nào đang hoạt động';
  return 'Không có GV phù hợp: ' + (parts.join('; ') || 'không rõ');
}

/** Xếp hạng toàn bộ GV cho 1 tiết (dùng khi gán tay / tìm GV dạy thay). */
function rankCandidates(ctx, lessonId) {
  var l = ctx.lessons[lessonId];
  if (!l) throw new Error('Không tìm thấy tiết ' + lessonId);
  if (l.invalid) throw new Error('Tiết có dữ liệu lỗi: ' + l.invalid);
  var st = stateFromAssignments(ctx, lessonId);
  var out = [];
  Object.keys(ctx.teachers).sort().forEach(function (code) {
    var t = ctx.teachers[code];
    if (!t.active) return;
    var reason = staticCheck(ctx, t, l) || dynamicCheck(ctx, st, t, l);
    var sc = scoreCandidate(ctx, st, t, l);
    var d = teacherSchoolDistance(ctx, code, l.school);
    out.push({
      teacher: code, name: t.name, type: t.typeLabel, rating: t.rating,
      feasible: !reason, reason: reason ? REASON_LABELS[reason] : '', reasonCode: reason,
      score: sc.total, explain: explainText(sc),
      trained: hasSubject_(t, l.subject), priority: isPriority_(ctx, code, l.school),
      distance: d.km, distanceSource: d.source,
      load: round1(st[code].load), target: t.target, max: t.max,
      schools: Object.keys(st[code].schools).length, current: l.teacher === code,
    });
  });
  out.sort(function (a, b) {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return b.score - a.score || (a.teacher < b.teacher ? -1 : 1);
  });
  return out;
}
