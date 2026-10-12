'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv } = require('./gas-env');

const { ctx: G } = createGasEnv();
// Đối tượng tạo trong vm có prototype khác realm của Node → chuẩn hóa trước khi so sánh sâu.
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Dữ liệu nhỏ dựng tay cho từng tình huống. */
function scenario(over) {
  const base = {
    subjects: [{ code: 'RB', name: 'Robotics' }, { code: 'SCR', name: 'Scratch' }],
    schools: [
      { code: 'S1', name: 'Trường 1', lat: '', lng: '' },
      { code: 'S2', name: 'Trường 2', lat: '', lng: '' },
      { code: 'S3', name: 'Trường 3', lat: '', lng: '' },
    ],
    teachers: [],
    links: [],
    unavailability: [],
    lessons: [],
  };
  return Object.assign(base, over);
}
function T(code, extra) { return Object.assign({ code, name: 'GV ' + code, type: 'Thường', rating: 'C', subjects: 'RB, SCR' }, extra); }
function L(id, school, weekday, start, end, extra) {
  return Object.assign({ id, school, weekday, start, end, subject: 'RB', className: id, periods: 1 }, extra);
}
function D(teacher, school, distance, preference) { return { teacher, school, distance, preference: preference || '' }; }
function run(data, settings, opts) {
  const c = G.buildContext(data, settings || {});
  const res = G.runAutoSchedule(c, opts || { mode: 'fill' });
  const byLesson = {};
  res.proposals.forEach((p) => { byLesson[p.lessonId] = p.teacher; });
  return { c, res, byLesson };
}

test('đọc giờ, thứ, số', () => {
  assert.equal(G.parseTime('7:30'), 450);
  assert.equal(G.parseTime('07:30:00'), 450);
  assert.equal(G.parseTime('7h30'), 450);
  assert.equal(G.parseTime('13.45'), 825);
  assert.equal(G.parseTime('2:15 PM'), 855);
  assert.equal(G.parseTime(0.3125), 450);
  assert.equal(G.parseTime('25:00'), null);
  assert.equal(G.parseTime('abc'), null);
  assert.equal(G.fmtTime(450), '07:30');
  assert.equal(G.parseWeekday('Thứ 2'), 0);
  assert.equal(G.parseWeekday('thứ bảy'), 5);
  assert.equal(G.parseWeekday('T5'), 3);
  assert.equal(G.parseWeekday(2), 0);
  assert.equal(G.parseWeekday('CN'), 6);
  assert.equal(G.parseWeekday('Chủ nhật'), 6);
  assert.equal(G.parseWeekday('Friday'), 4);
  assert.equal(G.parseWeekday('Thứ 9'), -1);
  assert.equal(G.toNum('10,5'), 10.5);
  assert.equal(G.toNum(''), null);
  assert.equal(G.normPreference('Ưu tiên'), 'priority');
  assert.equal(G.normPreference('Không xếp'), 'blocked');
  assert.equal(G.isPartTimeType('Kiêm nhiệm'), true);
  assert.equal(G.isAllowedEmail('hien.le@kdi.edu.vn'), true);
  assert.equal(G.isAllowedEmail('x@kdi.edu.vn.evil.com'), false);
  assert.equal(G.isAllowedEmail('x@gmail.com'), false);
});

test('(1) trường ưu tiên thắng khoảng cách', () => {
  const { byLesson } = run(scenario({
    teachers: [T('A'), T('B')],
    links: [D('A', 'S1', 12, 'Ưu tiên'), D('B', 'S1', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  }));
  assert.equal(byLesson.L1, 'A');
});

test('(2) khoảng cách gần hơn được ưu tiên; (3) môn đã đào tạo phân định khi khoảng cách sát nhau', () => {
  const far = run(scenario({
    teachers: [T('A', { subjects: 'RB' }), T('B', { subjects: 'SCR' })],
    links: [D('A', 'S1', 9), D('B', 'S1', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  }), { require_trained_subject: false });
  assert.equal(far.byLesson.L1, 'B', 'GV chưa đào tạo nhưng gần hơn 8km vẫn thắng (khoảng cách xếp trước môn học)');
  const near = run(scenario({
    teachers: [T('A', { subjects: 'RB' }), T('B', { subjects: 'SCR' })],
    links: [D('A', 'S1', 4), D('B', 'S1', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  }), { require_trained_subject: false });
  assert.equal(near.byLesson.L1, 'A', 'chênh 3km thì GV đã được đào tạo thắng');
});

test('bắt buộc đào tạo môn khi bật cấu hình', () => {
  const { byLesson, res } = run(scenario({
    teachers: [T('B', { subjects: 'SCR' })],
    links: [D('B', 'S1', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  }), { require_trained_subject: true });
  assert.equal(byLesson.L1, undefined);
  assert.match(res.unassigned[0].reason, /Chưa có GV nào được đào tạo/);
});

test('ưu tiên trường chỉ áp dụng cho môn GV đã được đào tạo (mặc định) và có thể tắt', () => {
  const data = scenario({
    teachers: [T('A', { subjects: 'SCR' }), T('B', { subjects: 'RB' })],
    links: [D('A', 'S1', 2, 'Ưu tiên'), D('B', 'S1', 3)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  });
  assert.equal(run(data).byLesson.L1, 'B');
  assert.equal(run(data, { require_trained_subject: false, priority_requires_trained: false }).byLesson.L1, 'A');
});

test('không trùng giờ và có lý do khi không xếp được', () => {
  const { byLesson, res } = run(scenario({
    teachers: [T('A')],
    links: [D('A', 'S1', 1), D('A', 'S2', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45'), L('L2', 'S2', 'Thứ 2', '08:30', '09:15')],
  }));
  assert.equal(Object.keys(byLesson).length, 1);
  assert.equal(res.unassigned.length, 1);
  assert.match(res.unassigned[0].reason, /trùng giờ dạy/);
});

test('phải đủ thời gian di chuyển giữa 2 trường', () => {
  const data = scenario({
    teachers: [T('A')],
    links: [D('A', 'S1', 1), D('A', 'S2', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '07:30', '08:15'), L('L2', 'S2', 'Thứ 2', '08:25', '09:10')],
  });
  const tight = run(data, { min_gap_between_schools_min: 30 });
  assert.equal(tight.res.unassigned.length, 1);
  assert.match(tight.res.unassigned[0].reason, /di chuyển/);
  const loose = run(data, { min_gap_between_schools_min: 5 });
  assert.equal(loose.res.unassigned.length, 0);
});

test('giới hạn số trường và giờ dạy tối đa', () => {
  const schools = run(scenario({
    teachers: [T('A', { maxSchools: 2 })],
    links: [D('A', 'S1', 1), D('A', 'S2', 1), D('A', 'S3', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45'), L('L2', 'S2', 'Thứ 3', '08:00', '08:45'), L('L3', 'S3', 'Thứ 4', '08:00', '08:45')],
  }));
  assert.equal(schools.res.stats.assigned, 2);
  assert.match(schools.res.unassigned[0].reason, /số trường tối đa/);

  const hours = run(scenario({
    teachers: [T('A', { targetHours: 1, maxHours: 1 })],
    links: [D('A', 'S1', 1)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45'), L('L2', 'S1', 'Thứ 3', '08:00', '08:45')],
  }));
  assert.equal(hours.res.stats.assigned, 1);
  assert.match(hours.res.unassigned[0].reason, /giờ tối đa/);
});

test('tôn trọng lịch bận, "Không xếp", GV ngừng hoạt động', () => {
  const { byLesson } = run(scenario({
    teachers: [T('A'), T('B'), T('C', { active: false }), T('D')],
    links: [D('A', 'S1', 1), D('B', 'S1', 1, 'Không xếp'), D('C', 'S1', 0.5), D('D', 'S1', 8)],
    unavailability: [{ teacher: 'A', weekday: 'Thứ 2', start: '07:00', end: '11:00' }],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  }));
  assert.equal(byLesson.L1, 'D');
});

test('khoảng cách tối đa – trừ khi là trường ưu tiên', () => {
  const data = scenario({
    teachers: [T('A')],
    links: [D('A', 'S1', 40)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  });
  assert.equal(run(data).res.stats.assigned, 0);
  data.links[0].preference = 'Ưu tiên';
  assert.equal(run(data).res.stats.assigned, 1);
});

test('ước tính khoảng cách theo tọa độ khi chưa nhập khoảng cách', () => {
  const data = scenario({
    schools: [{ code: 'S1', name: 'S1', lat: 10.7769, lng: 106.7009 }],
    teachers: [T('NEAR', { lat: 10.78, lng: 106.70 }), T('FAR', { lat: 10.85, lng: 106.75 })],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  });
  const { c, byLesson } = run(data);
  assert.equal(byLesson.L1, 'NEAR');
  const d = G.teacherSchoolDistance(c, 'FAR', 'S1');
  assert.equal(d.source, 'estimate');
  assert.ok(d.km > 9 && d.km < 14, 'khoảng ' + d.km);
});

test('chế độ "điền" giữ phân công cũ; "xếp lại" giữ tiết đã ghim', () => {
  const data = scenario({
    teachers: [T('A'), T('B')],
    links: [D('A', 'S1', 1), D('B', 'S1', 10)],
    lessons: [
      L('L1', 'S1', 'Thứ 2', '08:00', '08:45', { teacher: 'B' }),
      L('L2', 'S1', 'Thứ 3', '08:00', '08:45', { teacher: 'B', locked: true }),
      L('L3', 'S1', 'Thứ 4', '08:00', '08:45'),
    ],
  });
  const fill = run(data, {}, { mode: 'fill' });
  assert.deepEqual(Object.keys(fill.byLesson), ['L3']);
  const rebuild = run(data, {}, { mode: 'rebuild' });
  assert.equal(rebuild.byLesson.L1, 'A');
  assert.equal(rebuild.byLesson.L2, undefined, 'tiết ghim không bị đổi');
  assert.equal(rebuild.res.stats.kept, 1);
});

test('chế độ "xếp lại" chỉ trong phạm vi trường được chọn', () => {
  const data = scenario({
    teachers: [T('A'), T('B')],
    links: [D('A', 'S1', 1), D('A', 'S2', 1), D('B', 'S1', 9), D('B', 'S2', 9)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45', { teacher: 'B' }), L('L2', 'S2', 'Thứ 2', '10:00', '10:45', { teacher: 'B' })],
  });
  const r = run(data, {}, { mode: 'rebuild', schools: ['S2'] });
  assert.deepEqual(r.byLesson, { L2: 'A' });
});

test('bước sửa chữa: hoán đổi để xếp được tiết bị kẹt', () => {
  const data = scenario({
    teachers: [T('A'), T('B')],
    links: [D('A', 'S1', 2), D('B', 'S1', 2), D('A', 'S2', 2), D('B', 'S2', 2, 'Không xếp')],
    unavailability: [{ teacher: 'B', weekday: 'Thứ 2', start: '07:00', end: '17:00' }],
    lessons: [
      L('L1a', 'S1', 'Thứ 2', '08:00', '09:00'),
      L('L1b', 'S1', 'Thứ 3', '08:00', '09:00'),
      L('L2', 'S2', 'Thứ 3', '08:00', '09:00'),
    ],
  });
  const { res, byLesson } = run(data, { balance_tolerance: 0 });
  assert.equal(res.stats.unassigned, 0);
  assert.deepEqual(byLesson, { L1a: 'A', L1b: 'B', L2: 'A' });
  assert.ok(res.stats.repaired >= 1);
});

test('cân bằng giờ dạy: chuyển bớt tiết từ GV vượt định mức', () => {
  const lessons = [];
  for (let i = 0; i < 8; i++) lessons.push(L('L' + i, 'S1', ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5'][i % 4], i < 4 ? '08:00' : '10:00', i < 4 ? '09:00' : '11:00'));
  const data = scenario({
    teachers: [T('A', { targetHours: 4, maxHours: 8 }), T('B', { targetHours: 4, maxHours: 8 })],
    links: [D('A', 'S1', 1), D('B', 'S1', 2)],
    lessons,
  });
  const { res } = run(data);
  const loads = Object.fromEntries(res.loads.map((l) => [l.teacher, l.load]));
  assert.equal(loads.A + loads.B, 8);
  assert.ok(loads.A <= 5 && loads.B >= 3, JSON.stringify(loads));
});

test('phát hiện trùng lịch và các cảnh báo', () => {
  const data = scenario({
    teachers: [T('A', { subjects: 'SCR', targetHours: 1, maxHours: 1, maxSchools: 1 }), T('B', { active: false })],
    links: [D('A', 'S3', 1, 'Không xếp')],
    unavailability: [{ teacher: 'A', weekday: 'Thứ 4', start: '07:00', end: '12:00' }],
    lessons: [
      L('L1', 'S1', 'Thứ 2', '08:00', '08:45', { teacher: 'A' }),
      L('L2', 'S2', 'Thứ 2', '08:30', '09:15', { teacher: 'A' }),
      L('L3', 'S2', 'Thứ 3', '08:00', '08:45', { teacher: 'A', subject: 'SCR' }),
      L('L4', 'S1', 'Thứ 3', '08:50', '09:30', { teacher: 'A', subject: 'SCR' }),
      L('L5', 'S3', 'Thứ 4', '08:00', '08:45', { teacher: 'A', subject: 'SCR' }),
      L('L6', 'S1', 'Thứ 5', '08:00', '08:45', { teacher: 'B' }),
      L('L7', 'S1', 'Thứ 5', '08:00', '08:45', { teacher: 'ZZZ' }),
      L('L8', 'S9', 'Thứ 5', '08:00', '08:45'),
      L('L9', 'S1', 'Thứ 5', '09:00', '08:00'),
    ],
  });
  const c = G.buildContext(data, {});
  const types = new Set(G.detectConflicts(c).map((x) => x.type));
  ['overlap', 'travel', 'unavailable', 'blocked', 'untrained', 'over_hours', 'too_many_schools', 'inactive', 'unknown_teacher', 'invalid']
    .forEach((t) => assert.ok(types.has(t), 'thiếu cảnh báo ' + t));
  const idx = G.conflictIndex(G.detectConflicts(c));
  assert.equal(idx.L1, 'error');
});

test('lịch trống theo ngày', () => {
  const data = scenario({
    teachers: [T('A'), T('B', { subjects: 'SCR' })],
    unavailability: [{ teacher: 'A', weekday: 'Thứ 2', start: '13:00', end: '15:00', reason: 'Họp' }],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '09:00', { teacher: 'A' })],
  });
  const c = G.buildContext(data, { day_start: '07:00', day_end: '17:30', min_free_minutes: 30 });
  const res = G.computeFreeSlots(c, 0, {});
  const a = res.rows.find((r) => r.teacher === 'A');
  assert.deepEqual(plain(a.free.map((f) => f.text)), ['07:00–08:00', '09:00–13:00', '15:00–17:30']);
  const fits = G.computeFreeSlots(c, 0, { from: 570, to: 630 }).rows.find((r) => r.teacher === 'A');
  assert.equal(fits.fitsRange, true);
  const busy = G.computeFreeSlots(c, 0, { from: 510, to: 570 }).rows.find((r) => r.teacher === 'A');
  assert.equal(busy.fitsRange, false);
  const onlyRB = G.computeFreeSlots(c, 0, { subject: 'RB' }).rows.map((r) => r.teacher);
  assert.deepEqual(plain(onlyRB), ['A']);
});

test('xếp hạng GV cho 1 tiết (gán tay / tìm GV dạy thay)', () => {
  const data = scenario({
    teachers: [T('A'), T('B'), T('C')],
    links: [D('A', 'S1', 1), D('B', 'S1', 3), D('C', 'S1', 2)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45', { teacher: 'A' }), L('L2', 'S2', 'Thứ 2', '08:00', '08:45', { teacher: 'C' })],
  });
  const c = G.buildContext(data, {});
  const ranked = G.rankCandidates(c, 'L1');
  assert.equal(ranked[0].teacher, 'A');
  assert.equal(ranked[0].current, true);
  const cRow = ranked.find((r) => r.teacher === 'C');
  assert.equal(cRow.feasible, false);
  assert.equal(cRow.reasonCode, 'overlap');
  assert.equal(ranked[ranked.length - 1].teacher, 'C');
});

test('dữ liệu mẫu Hà Nội: xếp đủ GV & trợ giảng, không vi phạm ràng buộc cứng', () => {
  const demo = G.buildDemoData(20260901);
  assert.equal(demo.schools.length, 45);
  assert.equal(demo.teachers.length, 80);
  assert.equal(demo.assistants.length, 75);
  const c = G.buildContext(demo, {});
  assert.ok(c.lessonList.every((l) => !l.invalid), 'chương trình lấy được từ sheet LopHoc');
  const t0 = Date.now();
  for (const role of ['teacher', 'assistant']) {
    const res = G.runAutoSchedule(c, { role, mode: 'fill' });
    assert.ok(res.stats.assigned / res.stats.considered > 0.97, role + ' ' + JSON.stringify(res.stats));
    res.proposals.forEach((p) => { c.lessons[p.lessonId][role] = p.teacher; });
    res.loads.forEach((l) => {
      assert.ok(l.load <= l.max + 1e-9, l.teacher + ' vượt giờ');
      assert.ok(l.schools.length <= 3, l.teacher + ' quá 3 trường');
    });
    assert.ok(res.proposals.every((p) => /^Điểm /.test(p.explain)));
  }
  assert.ok(Date.now() - t0 < 10000);
  // Không có lỗi nào: không trùng giờ, không GV chưa đào tạo, TG trong giờ rảnh…
  assert.deepEqual(plain(G.detectConflicts(c)), []);
  // Tiết không cần trợ giảng thì không xếp trợ giảng.
  assert.ok(c.lessonList.filter((l) => !l.needAssistant).every((l) => !l.assistant));
});

test('chương trình lấy theo lớp (LopHoc) và GV phải được đào tạo đúng chương trình', () => {
  const data = scenario({
    subjects: [{ code: 'G01', name: 'School - Grade 01' }, { code: 'G06', name: 'School - Grade 06' }],
    classes: [{ school: 'S1', className: '1A1', subject: 'G01' }, { school: 'S1', className: '6A1', subject: 'G06' }],
    teachers: [T('NEAR', { subjects: '' }), T('FAR', { subjects: '' })],
    training: [{ teacher: 'NEAR', subject: 'G06', status: 'Đạt' }, { teacher: 'FAR', subject: 'G01', status: 'Đạt' }, { teacher: 'NEAR', subject: 'G01', status: 'Đang đào tạo' }],
    links: [D('NEAR', 'S1', 1), D('FAR', 'S1', 20)],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45', { subject: '', className: '1A1' }), L('L2', 'S1', 'Thứ 2', '09:00', '09:45', { subject: '', className: '6A1' }),
      L('L3', 'S1', 'Thứ 3', '09:00', '09:45', { subject: '', className: '9Z9' })],
  });
  const { c, byLesson } = run(data);
  assert.equal(c.lessons.L1.subject, 'G01');
  assert.equal(byLesson.L1, 'FAR', 'GV gần nhưng "Đang đào tạo" G01 thì chưa được xếp');
  assert.equal(byLesson.L2, 'NEAR');
  assert.match(c.lessons.L3.invalid, /Chưa xác định chương trình/);
});

test('trợ giảng: chỉ xếp trong giờ rảnh, ưu tiên người ở gần trường', () => {
  const data = scenario({
    schools: [{ code: 'S1', name: 'S1', lat: 21.03, lng: 105.80 }],
    teachers: [T('GV1', { lat: 21.03, lng: 105.80 })],
    assistants: [
      { code: 'TG1', name: 'Gần nhưng bận', lat: 21.031, lng: 105.801 },
      { code: 'TG2', name: 'Gần vừa', lat: 21.04, lng: 105.81 },
      { code: 'TG3', name: 'Xa', lat: 21.10, lng: 105.90 },
    ],
    assistantFree: [
      { assistant: 'TG1', weekday: 'Thứ 2', start: '13:00', end: '17:00' },
      { assistant: 'TG2', weekday: 'Thứ 2', start: '07:00', end: '11:30' },
      { assistant: 'TG3', weekday: 'Thứ 2', start: '07:00', end: '17:00' },
    ],
    lessons: [
      L('L1', 'S1', 'Thứ 2', '08:00', '08:45'),
      L('L2', 'S1', 'Thứ 2', '14:00', '14:45'),
      L('L3', 'S1', 'Thứ 2', '15:00', '15:45', { needAssistant: 'Không' }),
    ],
  });
  const c = G.buildContext(data, {});
  const res = G.runAutoSchedule(c, { role: 'assistant', mode: 'fill' });
  const by = Object.fromEntries(res.proposals.map((p) => [p.lessonId, p.teacher]));
  assert.equal(by.L1, 'TG2', 'TG1 gần hơn nhưng không rảnh buổi sáng');
  assert.equal(by.L2, 'TG1');
  assert.equal(by.L3, undefined, 'tiết không cần trợ giảng');
  c.lessons.L1.assistant = 'TG1';
  assert.ok(G.detectConflicts(c).some((x) => x.type === 'not_free' && x.role === 'assistant'));
  const free = G.computeFreeSlots(c, 0, { role: 'assistant' }).rows.find((r) => r.teacher === 'TG2');
  assert.ok(free.free.every((f) => f.end <= 11 * 60 + 30), JSON.stringify(free.free));
});

test('link Google Maps → tọa độ; khoảng cách Google Maps được ưu tiên hơn ước tính', () => {
  const data = scenario({
    schools: [{ code: 'S1', name: 'S1', mapUrl: 'https://www.google.com/maps/place/Truong/@21.0,105.8,17z/data=!3d21.0301!4d105.8012' }],
    teachers: [T('A', { mapUrl: 'https://maps.google.com/?q=21.0501,105.8012' })],
    lessons: [L('L1', 'S1', 'Thứ 2', '08:00', '08:45')],
  });
  let c = G.buildContext(data, {});
  assert.equal(c.schools.S1.lat, 21.0301);
  assert.equal(G.teacherSchoolDistance(c, 'A', 'S1').source, 'estimate');
  const key = G.coordsKey_(c.people.A, c.schools.S1);
  data.distances = [{ person: 'A', school: 'S1', km: 3.4, minutes: 12, coords: key }];
  c = G.buildContext(data, {});
  const d = G.teacherSchoolDistance(c, 'A', 'S1');
  assert.equal(d.source, 'maps');
  assert.equal(d.km, 3.4);
  // Đổi vị trí nhà → số liệu cũ không còn đúng, quay về ước tính cho tới khi tính lại.
  data.teachers[0].mapUrl = 'https://maps.google.com/?q=21.0601,105.8012';
  c = G.buildContext(data, {});
  assert.equal(G.teacherSchoolDistance(c, 'A', 'S1').source, 'estimate');
});
