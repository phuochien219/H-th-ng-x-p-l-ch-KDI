/**
 * THUẬT TOÁN XẾP LỊCH TỰ ĐỘNG (thuần JavaScript, không gọi dịch vụ Google).
 * Dùng chung cho 2 nhóm nhân sự: GIÁO VIÊN (role 'teacher') và TRỢ GIẢNG (role 'assistant').
 *
 * Ràng buộc CỨNG (không bao giờ vi phạm khi hệ thống tự xếp):
 *   - Không dạy 2 tiết trùng giờ; giữa 2 trường khác nhau phải đủ thời gian di chuyển.
 *   - GV: không xếp vào lịch bận; PHẢI được đào tạo chương trình của lớp (mặc định bật).
 *   - Trợ giảng: chỉ xếp trong khung giờ rảnh đã đăng ký (nếu có đăng ký).
 *   - Không xếp người bị đánh dấu "Không xếp" tại trường; không vượt giờ tối đa,
 *     số trường tối đa, khoảng cách tối đa (trừ trường ưu tiên).
 *
 * Tiêu chí MỀM theo thứ tự ưu tiên (trọng số chỉnh được ở Cấu hình):
 *   GV:  (1) trường ưu tiên → (2) khoảng cách → (3) chương trình đã đào tạo
 *        → (4) ít trường (2–3 trường/GV) → (5) cân bằng giờ dạy → xếp loại.
 *   TG:  khoảng cách gần trường (trọng số lớn) → đang hỗ trợ ở trường đó → cân bằng giờ.
 *
 * Các bước: B1 trường ưu tiên → B2 xếp theo trường (trường khó trước)
 *           → B3 hoán đổi để xếp được tiết bị kẹt → B4 cân bằng giờ dạy.
 */

var RATING_LEVEL = { A: 2, B: 1, C: 0, D: -1 };

function emptyWeek_() { return [[], [], [], [], [], [], []]; }

/** Dựng ngữ cảnh xếp lịch từ dữ liệu thô của các bảng. */
function buildContext(data, settings) {
  var S = {};
  SETTINGS_SPEC.forEach(function (s) { S[s.key] = s.def; });
  Object.keys(settings || {}).forEach(function (k) { S[k] = settings[k]; });
  S.dayStartMin = parseTime(S.day_start) || 420;
  S.dayEndMin = parseTime(S.day_end) || 1050;

  var ctx = {
    S: S, subjects: {}, schools: {}, classes: {}, teachers: {}, assistants: {}, people: {},
    links: {}, maps: {}, lessons: {}, lessonList: [], distCache: {}, travelCache: {},
  };

  (data.subjects || []).forEach(function (s) {
    var code = str(s.code).toUpperCase();
    if (code) ctx.subjects[code] = { code: code, name: str(s.name) || code, color: str(s.color) };
  });

  (data.schools || []).forEach(function (s) {
    var code = str(s.code).toUpperCase();
    if (!code) return;
    var ll = coordsOf_(s);
    ctx.schools[code] = {
      code: code, name: str(s.name) || code, district: str(s.district),
      lat: ll.lat, lng: ll.lng, active: toBool(s.active, true),
    };
  });

  (data.classes || []).forEach(function (c) {
    var sc = str(c.school).toUpperCase();
    var cn = str(c.className).toUpperCase();
    if (!sc || !cn) return;
    ctx.classes[sc + '|' + cn] = { subject: str(c.subject).toUpperCase(), grade: str(c.grade), needAssistant: str(c.needAssistant), needTeacher: str(c.needTeacher) };
  });

  (data.teachers || []).forEach(function (t) {
    var code = str(t.code).toUpperCase();
    if (!code) return;
    var partTime = isPartTimeType(t.type);
    var target = toNum(t.targetHours) || (partTime ? S.target_hours_part_time : S.target_hours_full_time);
    var max = toNum(t.maxHours) || (target + S.max_hours_tolerance);
    var rating = str(t.rating).toUpperCase();
    var ll = coordsOf_(t);
    var p = {
      code: code, role: 'teacher', name: str(t.name) || code, email: normEmail(t.email),
      partTime: partTime, typeLabel: partTime ? 'Kiêm nhiệm' : 'Thường',
      rating: RATING_LEVEL.hasOwnProperty(rating) ? rating : 'C',
      district: str(t.district), lat: ll.lat, lng: ll.lng,
      // Tương thích dữ liệu cũ: cột "Môn đã đào tạo" (nếu còn).
      subjects: splitList(t.subjects).map(function (x) { return x.toUpperCase(); }),
      target: target, max: Math.max(max, target),
      maxSchools: toNum(t.maxSchools) || S.hard_max_schools,
      active: toBool(t.active, true),
      unavailable: emptyWeek_(), free: null,
    };
    ctx.teachers[code] = p;
    ctx.people[code] = p;
  });

  (data.training || []).forEach(function (r) {
    var t = ctx.teachers[str(r.teacher).toUpperCase()];
    var subj = str(r.subject).toUpperCase();
    var status = removeDiacritics_(str(r.status)).toLowerCase();
    if (!t || !subj || (status && status !== 'dat')) return;
    if (t.subjects.indexOf(subj) < 0) t.subjects.push(subj);
  });

  (data.assistants || []).forEach(function (a) {
    var code = str(a.code).toUpperCase();
    if (!code || ctx.people[code]) return;
    var target = toNum(a.targetHours) || S.target_hours_assistant;
    var max = toNum(a.maxHours) || (target + S.max_hours_tolerance);
    var ll = coordsOf_(a);
    var p = {
      code: code, role: 'assistant', name: str(a.name) || code, email: normEmail(a.email),
      partTime: false, typeLabel: 'Trợ giảng', rating: '', district: str(a.district), lat: ll.lat, lng: ll.lng,
      subjects: [], target: target, max: Math.max(max, target),
      maxSchools: toNum(a.maxSchools) || S.assistant_max_schools,
      active: toBool(a.active, true), unavailable: emptyWeek_(), free: null,
    };
    ctx.assistants[code] = p;
    ctx.people[code] = p;
  });

  (data.assistantFree || []).forEach(function (f) {
    var p = ctx.assistants[str(f.assistant).toUpperCase()];
    var wd = parseWeekday(f.weekday);
    var s = parseTime(f.start);
    var e = parseTime(f.end);
    if (!p || wd < 0 || s === null || e === null || e <= s) return;
    if (!p.free) p.free = emptyWeek_();
    p.free[wd].push({ start: s, end: e });
  });

  (data.unavailability || []).forEach(function (u) {
    var t = ctx.people[str(u.teacher).toUpperCase()];
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

  (data.distances || []).forEach(function (d) {
    var pc = str(d.person).toUpperCase();
    var sc = str(d.school).toUpperCase();
    var km = toNum(d.km);
    if (!pc || !sc || km === null) return;
    ctx.maps[pc + '|' + sc] = { km: km, minutes: toNum(d.minutes), coords: str(d.coords) };
  });

  (data.lessons || []).forEach(function (l) {
    var school = str(l.school).toUpperCase();
    var className = str(l.className);
    var cls = ctx.classes[school + '|' + className.toUpperCase()] || null;
    var subject = str(l.subject).toUpperCase() || (cls ? cls.subject : '');
    var need = str(l.needAssistant) || (cls ? cls.needAssistant : '');
    var needT = str(l.needTeacher) || (cls ? cls.needTeacher : '');
    var lesson = {
      id: str(l.id), row: l._row, school: school,
      weekday: parseWeekday(l.weekday), start: parseTime(l.start), end: parseTime(l.end),
      className: className, grade: str(l.grade) || (cls ? cls.grade : ''), subject: subject,
      subjectFromClass: !str(l.subject) && !!cls,
      periods: toNum(l.periods) || 1, room: str(l.room),
      teacher: str(l.teacher).toUpperCase(), assistant: str(l.assistant).toUpperCase(), needRaw: str(l.needAssistant),
      needAssistant: need ? yesNo_(need, S.default_need_assistant) : !!S.default_need_assistant,
      needTeacher: needT ? yesNo_(needT, true) : true, needTeacherRaw: str(l.needTeacher),
      locked: toBool(l.locked, false),
      source: str(l.source), explain: str(l.explain), explainTA: str(l.explainTA), notes: str(l.notes),
    };
    lesson.invalid = validateLesson_(ctx, lesson);
    lesson.load = lesson.invalid ? 0 : (S.load_unit === 'periods' ? lesson.periods : (lesson.end - lesson.start) / 60);
    if (!lesson.id) return;
    ctx.lessons[lesson.id] = lesson;
    ctx.lessonList.push(lesson);
  });
  return ctx;
}

/** "Có"/"Không"/TRUE/x… → true/false. */
function yesNo_(v, def) {
  var s = removeDiacritics_(str(v)).toLowerCase();
  if (/^(co|x|true|1|yes|y)$/.test(s)) return true;
  if (/^(khong|false|0|no|n)$/.test(s)) return false;
  return def;
}

/** Tọa độ của 1 bản ghi: cột Vĩ độ/Kinh độ, nếu trống thì đọc từ link Google Maps. */
function coordsOf_(r) {
  var lat = toNum(r.lat);
  var lng = toNum(r.lng);
  if (lat === null || lng === null) {
    var p = parseMapsLink(r.mapUrl);
    if (p) { lat = p.lat; lng = p.lng; }
  }
  return { lat: lat, lng: lng };
}

/** Khóa tọa độ của 1 cặp người–trường (để biết số liệu Google Maps còn đúng không). */
function coordsKey_(p, s) {
  function f(n) { return Number(n).toFixed(5); }
  return f(p.lat) + ',' + f(p.lng) + '|' + f(s.lat) + ',' + f(s.lng);
}

function hasCoords_(o) {
  return !!o && o.lat !== null && o.lat !== undefined && o.lng !== null && o.lng !== undefined;
}

function validateLesson_(ctx, l) {
  if (!ctx.schools[l.school]) return 'Mã trường "' + l.school + '" không có trong danh sách trường';
  if (l.weekday < 0) return 'Thứ không hợp lệ';
  if (l.start === null || l.end === null) return 'Giờ bắt đầu/kết thúc không hợp lệ';
  if (l.end <= l.start) return 'Giờ kết thúc phải sau giờ bắt đầu';
  if (!l.subject) return 'Chưa xác định chương trình/môn của lớp ' + (l.className || '') + ' (khai báo ở sheet LopHoc hoặc cột Mã môn)';
  return '';
}

function subjectName_(ctx, code) {
  return ctx.subjects[code] ? ctx.subjects[code].name : code;
}

/**
 * Khoảng cách nhà (GV/TG) → trường. Thứ tự ưu tiên nguồn số liệu:
 *   nhập tay (GV_Truong) → Google Maps xe máy (KhoangCach) → ước tính theo tọa độ.
 */
function teacherSchoolDistance(ctx, code, scode) {
  var key = code + '|' + scode;
  if (ctx.distCache[key]) return ctx.distCache[key];
  var res;
  var link = ctx.links[key];
  var p = ctx.people[code];
  var s = ctx.schools[scode];
  var gm = ctx.maps[key];
  if (link && link.distance !== null && link.distance !== undefined) {
    res = { km: link.distance, source: 'manual' };
  } else if (gm && hasCoords_(p) && hasCoords_(s) && gm.coords === coordsKey_(p, s)) {
    res = { km: gm.km, minutes: gm.minutes, source: 'maps' };
  } else if (hasCoords_(p) && hasCoords_(s)) {
    res = { km: round1(haversineKm(p.lat, p.lng, s.lat, s.lng) * ctx.S.road_factor), source: 'estimate' };
  } else {
    res = { km: null, source: 'unknown' };
  }
  ctx.distCache[key] = res;
  return res;
}

function distanceLabel_(d, km) {
  return d.source === 'manual' ? 'Khoảng cách ' + km + ' km'
    : d.source === 'maps' ? 'Khoảng cách ' + km + ' km (Google Maps, xe máy' + (d.minutes ? ' ~' + Math.round(d.minutes) + ' phút' : '') + ')'
    : d.source === 'estimate' ? 'Khoảng cách ước tính ~' + km + ' km'
    : 'Chưa có khoảng cách (tạm tính ' + km + ' km)';
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
  if (hasCoords_(sa) && hasCoords_(sb) && ctx.S.travel_speed_kmh > 0) {
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

/** Điểm ưu tiên trường có áp dụng cho tiết này không (GV: chỉ khi đã được đào tạo chương trình). */
function priorityApplies_(ctx, t, lesson) {
  if (!isPriority_(ctx, t.code, lesson.school)) return false;
  if (t.role === 'assistant') return true;
  return !ctx.S.priority_requires_trained || hasSubject_(t, lesson.subject);
}

function hasSubject_(t, subject) {
  if (t.role === 'assistant') return true;
  return !subject || t.subjects.indexOf(subject) >= 0;
}

function roleOf_(role) {
  return STAFF_ROLES[role] ? role : 'teacher';
}

function poolOf_(ctx, role) {
  return ctx[STAFF_ROLES[roleOf_(role)].pool];
}

/* ------------------------------ Trạng thái ------------------------------ */

function newState(ctx, role) {
  var st = {};
  Object.keys(poolOf_(ctx, role)).forEach(function (code) {
    st[code] = { byDay: emptyWeek_(), load: 0, schools: {}, classes: {} };
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
function stateFromAssignments(ctx, excludeLessonId, role) {
  var field = STAFF_ROLES[roleOf_(role)].field;
  var st = newState(ctx, role);
  ctx.lessonList.forEach(function (l) {
    var code = l[field];
    if (l.invalid || !code || l.id === excludeLessonId || !st[code]) return;
    stateAdd(st, code, l);
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
  if (t.role !== 'assistant' && ctx.S.require_trained_subject && !hasSubject_(t, lesson.subject)) return 'untrained';
  if (!priority && ctx.S.max_distance_km > 0) {
    var d = teacherSchoolDistance(ctx, t.code, lesson.school);
    if (d.km !== null && d.km > ctx.S.max_distance_km) return 'too_far';
  }
  var un = t.unavailable[lesson.weekday];
  for (var i = 0; i < un.length; i++) {
    if (overlaps(lesson.start, lesson.end, un[i].start, un[i].end)) return 'unavailable';
  }
  if (t.free && !insideFree_(t, lesson)) return 'not_free';
  return '';
}

/** Tiết nằm trọn trong 1 khung giờ rảnh đã đăng ký. */
function insideFree_(t, lesson) {
  var slots = t.free[lesson.weekday] || [];
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].start <= lesson.start && lesson.end <= slots[i].end) return true;
  }
  return false;
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
  var isTA = t.role === 'assistant';
  if (priorityApplies_(ctx, t, lesson)) parts.push(['Trường ưu tiên xếp', S.w_priority]);
  else if (isPriority_(ctx, t.code, lesson.school)) parts.push(['Trường ưu tiên (không áp dụng vì chưa đào tạo chương trình)', 0]);

  var d = teacherSchoolDistance(ctx, t.code, lesson.school);
  var km = d.km === null ? S.unknown_distance_km : d.km;
  parts.push([distanceLabel_(d, km), -(isTA ? S.w_ta_distance_per_km : S.w_distance_per_km) * km]);

  if (!isTA && lesson.subject) {
    if (hasSubject_(t, lesson.subject)) parts.push(['Đã được đào tạo ' + subjectName_(ctx, lesson.subject), S.require_trained_subject ? 0 : S.w_trained]);
    else parts.push(['Chưa được đào tạo ' + subjectName_(ctx, lesson.subject), 0]);
  }

  var ts = st[t.code];
  var nSchools = Object.keys(ts.schools).length;
  if (ts.schools[lesson.school]) {
    parts.push([isTA ? 'Đang trợ giảng tại trường này' : 'Đang dạy tại trường này', S.w_same_school]);
    var sameDay = ts.byDay[lesson.weekday].some(function (o) { return o.school === lesson.school && o.id !== lesson.id; });
    if (sameDay) parts.push(['Đã có lịch ở trường này cùng ngày', S.w_same_day_school]);
  } else if (nSchools >= S.preferred_max_schools) {
    parts.push(['Thêm trường thứ ' + (nSchools + 1) + ' (nên dạy ≤ ' + S.preferred_max_schools + ' trường)', -S.w_extra_school]);
  }

  if (lesson.className && ts.classes[lesson.school + '|' + lesson.className]) parts.push(['Đang dạy lớp ' + lesson.className, S.w_same_class]);

  var newLoad = ts.load + lesson.load;
  if (newLoad <= t.target + 1e-9) {
    parts.push([(isTA ? 'Giờ trợ giảng ' : 'Giờ dạy ') + round1(ts.load) + '/' + t.target + 'h – còn thiếu giờ', S.w_load_balance * (t.target - ts.load) / t.target]);
  } else {
    var over = newLoad - Math.max(t.target, ts.load);
    parts.push(['Vượt định mức ' + t.target + 'h (lên ' + round1(newLoad) + 'h)', -S.w_over_target_per_hour * over]);
  }

  var lvl = isTA ? 0 : (RATING_LEVEL[t.rating] || 0);
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
 * @param {Object} opts { role: 'teacher' | 'assistant', mode: 'fill' | 'rebuild', schools: [mã trường] (tùy chọn) }
 *   - fill: giữ nguyên phân công hiện có, chỉ xếp tiết còn trống.
 *   - rebuild: xếp lại toàn bộ (trừ tiết đã Ghim) trong phạm vi các trường được chọn.
 */
function runAutoSchedule(ctx, opts) {
  opts = opts || {};
  var role = roleOf_(opts.role);
  var field = STAFF_ROLES[role].field;
  var pool = poolOf_(ctx, role);
  var mode = opts.mode === 'rebuild' ? 'rebuild' : 'fill';
  var scope = null;
  if (opts.schools && opts.schools.length) {
    scope = {};
    opts.schools.forEach(function (s) { scope[String(s).toUpperCase()] = true; });
  }
  var st = newState(ctx, role);
  var toSchedule = [];
  var kept = 0;
  var invalid = [];
  var skippedInactiveSchool = 0;

  ctx.lessonList.slice().sort(cmp_(function (l) { return l.id; })).forEach(function (l) {
    if (l.invalid) { invalid.push(l); return; }
    var inScope = !scope || scope[l.school];
    var cur = l[field];
    if (cur && pool[cur] && (l.locked || mode === 'fill' || !inScope)) {
      stateAdd(st, cur, l);
      kept++;
      return;
    }
    if (!inScope) return;
    if (role === 'assistant' && !l.needAssistant) return;
    if (role === 'teacher' && !l.needTeacher) return;
    if (!ctx.schools[l.school].active) { skippedInactiveSchool++; return; }
    toSchedule.push(l);
  });

  var teacherList = Object.keys(pool).sort().map(function (c) { return pool[c]; })
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
    proposals.push({ lessonId: id, role: role, before: l[field] || '', teacher: a.teacher, score: a.score.total, explain: explainText(a.score) + phaseNote, phase: a.phase });
  });
  var unassigned = failed.map(function (l) {
    return { lessonId: l.id, role: role, before: l[field] || '', reason: unassignedReason_(ctx, st, l, cands[l.id], staticReasons[l.id], teacherList.length, role) };
  }).sort(cmp_(function (u) { return u.lessonId; }));

  var loads = teacherList.map(function (t) {
    var ts = st[t.code];
    return { teacher: t.code, name: t.name, type: t.typeLabel, load: round1(ts.load), target: t.target, max: t.max, schools: Object.keys(ts.schools).sort() };
  });

  return {
    role: role,
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

function unassignedReason_(ctx, st, l, cands, staticReasons, nTeachers, role) {
  var who = role === 'assistant' ? 'TG' : 'GV';
  var counts = {};
  Object.keys(staticReasons).forEach(function (k) { counts[k] = staticReasons[k]; });
  cands.forEach(function (t) {
    var r = dynamicCheck(ctx, st, t, l);
    if (r) counts[r] = (counts[r] || 0) + 1;
  });
  var order = ['overlap', 'travel', 'max_hours', 'max_schools', 'unavailable', 'not_free', 'too_far', 'untrained', 'blocked'];
  var parts = order.filter(function (k) { return counts[k]; }).map(function (k) {
    var label = REASON_LABELS[k];
    if (k === 'too_far') label += ' (> ' + ctx.S.max_distance_km + ' km)';
    if (k === 'untrained') label += ' ' + subjectName_(ctx, l.subject);
    return counts[k] + ' ' + who + ' ' + label.charAt(0).toLowerCase() + label.slice(1);
  });
  if (!nTeachers) return role === 'assistant' ? 'Chưa có trợ giảng nào đang hoạt động' : 'Chưa có giáo viên nào đang hoạt động';
  var untrainedAll = role !== 'assistant' && counts.untrained === nTeachers;
  if (untrainedAll) return 'Chưa có GV nào được đào tạo ' + subjectName_(ctx, l.subject) + ' – cần đào tạo thêm GV';
  return 'Không có ' + who + ' phù hợp: ' + (parts.join('; ') || 'không rõ');
}

/** Xếp hạng toàn bộ GV (hoặc trợ giảng) cho 1 tiết – dùng khi gán tay / tìm người dạy thay. */
function rankCandidates(ctx, lessonId, role) {
  role = roleOf_(role);
  var pool = poolOf_(ctx, role);
  var field = STAFF_ROLES[role].field;
  var l = ctx.lessons[lessonId];
  if (!l) throw new Error('Không tìm thấy tiết ' + lessonId);
  if (l.invalid) throw new Error('Tiết có dữ liệu lỗi: ' + l.invalid);
  var st = stateFromAssignments(ctx, lessonId, role);
  var out = [];
  Object.keys(pool).sort().forEach(function (code) {
    var t = pool[code];
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
      schools: Object.keys(st[code].schools).length, current: l[field] === code, role: role,
    });
  });
  out.sort(function (a, b) {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return b.score - a.score || (a.teacher < b.teacher ? -1 : 1);
  });
  return out;
}
