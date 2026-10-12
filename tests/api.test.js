'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, callApi } = require('./gas-env');

const SUPER = 'hien.le@kdi.edu.vn';

/** Môi trường mới đã khởi tạo + dữ liệu mẫu. */
function fresh(props) {
  const { ctx, env } = createGasEnv({ props });
  ctx.setupSheets();
  ctx.loadDemoData_();
  ctx.Db.clearCache();
  const call = (email, action, args, token) => callApi(ctx, env, email, action, args, token);
  // Tạo sẵn các tài khoản theo vai trò.
  ['scheduler', 'sale', 'viewer'].forEach((role) => {
    const r = call(SUPER, 'users.save', { user: { email: role + '@kdi.edu.vn', name: role, role } });
    assert.equal(r.ok, true, r.error);
  });
  return { ctx, env, call };
}

test('chỉ chấp nhận email @kdi.edu.vn', () => {
  const { call } = fresh();
  assert.equal(call('', 'auth.me').data.status, 'anonymous');
  const me = call('someone@gmail.com', 'auth.me').data;
  assert.equal(me.status, 'forbidden');
  const r = call('someone@gmail.com', 'dashboard');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'AUTH');
  assert.equal(call('x@kdi.edu.vn.evil.com', 'auth.me').data.status, 'forbidden');
});

test('tài khoản mới mặc định "Xem lịch": xem được, không sửa được', () => {
  const { call } = fresh();
  const me = call('new.staff@kdi.edu.vn', 'auth.me').data;
  assert.equal(me.status, 'ok');
  assert.equal(me.role, 'viewer');
  assert.equal(call('new.staff@kdi.edu.vn', 'dashboard').ok, true);
  const save = call('new.staff@kdi.edu.vn', 'lessons.save', { lesson: { school: 'TR001', weekday: 'Thứ 2', start: '08:00', end: '08:45', subject: 'RB' } });
  assert.equal(save.ok, false);
  assert.equal(save.code, 'FORBIDDEN');
  // Không thấy dữ liệu cá nhân của GV.
  const list = call('new.staff@kdi.edu.vn', 'data.list', { table: 'teachers' }).data;
  assert.ok(!list.columns.some((c) => c.key === 'phone' || c.key === 'address'));
  assert.equal(call('new.staff@kdi.edu.vn', 'data.list', { table: 'links' }).ok, false);
});

test('cấu hình "chờ duyệt" chặn tài khoản mới', () => {
  const { call } = fresh();
  assert.equal(call(SUPER, 'settings.save', { values: { new_user_role: 'pending' } }).ok, true);
  const me = call('pending.guy@kdi.edu.vn', 'auth.me').data;
  assert.equal(me.status, 'pending');
  assert.equal(call('pending.guy@kdi.edu.vn', 'dashboard').code, 'AUTH');
});

test('chỉ quản trị gốc được cấp/thu hồi quyền admin', () => {
  const { call } = fresh();
  const superMe = call(SUPER, 'auth.me').data;
  assert.equal(superMe.role, 'admin');
  assert.equal(superMe.isSuperAdmin, true);
  assert.equal(call(SUPER, 'users.save', { user: { email: 'admin2@kdi.edu.vn', role: 'admin' } }).ok, true);
  assert.equal(call('admin2@kdi.edu.vn', 'auth.me').data.role, 'admin');
  // Admin thường quản lý được user thường…
  assert.equal(call('admin2@kdi.edu.vn', 'users.save', { user: { email: 'ac2@kdi.edu.vn', role: 'scheduler' } }).ok, true);
  // …nhưng không cấp được admin, không hạ quyền admin khác.
  const r1 = call('admin2@kdi.edu.vn', 'users.save', { user: { email: 'admin3@kdi.edu.vn', role: 'admin' } });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /quản trị gốc/);
  assert.equal(call('admin2@kdi.edu.vn', 'users.save', { user: { email: 'admin2@kdi.edu.vn', role: 'viewer' } }).ok, false);
  // Không ai đổi được quản trị gốc.
  assert.equal(call(SUPER, 'users.save', { user: { email: SUPER, role: 'viewer' } }).ok, false);
  assert.equal(call(SUPER, 'users.delete', { email: SUPER }).ok, false);
  // Không thêm được email ngoài domain.
  assert.equal(call(SUPER, 'users.save', { user: { email: 'a@gmail.com', role: 'viewer' } }).ok, false);
  // Người không phải admin không quản lý user.
  assert.equal(call('scheduler@kdi.edu.vn', 'users.list').code, 'FORBIDDEN');
  // Khóa tài khoản.
  assert.equal(call(SUPER, 'users.save', { user: { email: 'viewer@kdi.edu.vn', role: 'viewer', active: false } }).ok, true);
  assert.equal(call('viewer@kdi.edu.vn', 'auth.me').data.status, 'disabled');
});

test('giáo viên đăng nhập bằng email của mình chỉ xem lịch của mình', () => {
  const { call, ctx } = fresh();
  const t = ctx.Db.read('teachers')[0];
  const me = call(t.email, 'auth.me').data;
  assert.equal(me.role, 'teacher');
  assert.equal(me.teacherCode, t.code);
  const mine = call(t.email, 'schedule.me');
  assert.equal(mine.ok, true, mine.error);
  assert.equal(mine.data.teacher.code, t.code);
  assert.equal(call(t.email, 'dashboard').code, 'FORBIDDEN');
  assert.equal(call(t.email, 'schedule.teacher', { code: 'GV002' }).code, 'FORBIDDEN');
});

test('Sale nhập TKB nhưng không được phân công GV', () => {
  const { call } = fresh();
  const add = call('sale@kdi.edu.vn', 'lessons.save', { lesson: { school: 'tr001', weekday: 'T3', start: '7h30', end: '8h15', subject: 'Robotics', className: '5A9' } });
  assert.equal(add.ok, true, add.error);
  const id = add.data.id;
  assert.match(id, /^TKB-\d{6}$/);
  const lessons = call('sale@kdi.edu.vn', 'lessons.list').data;
  const l = lessons.find((x) => x.id === id);
  assert.equal(l.school, 'TR001');
  assert.equal(l.weekdayLabel, 'Thứ 3');
  assert.equal(l.startText, '07:30');
  assert.equal(l.subject, 'RB');
  assert.equal(call('sale@kdi.edu.vn', 'lessons.assign', { id, teacher: 'GV001' }).code, 'FORBIDDEN');
  assert.equal(call('sale@kdi.edu.vn', 'lessons.save', { lesson: Object.assign({}, l, { teacher: 'GV001', start: l.startText, end: l.endText, weekday: l.weekdayLabel }) }).code, 'FORBIDDEN');
  // Sửa giờ (giữ GV) thì được.
  const edit = call('sale@kdi.edu.vn', 'lessons.save', { lesson: { id, school: 'TR001', weekday: 'Thứ 3', start: '09:00', end: '09:45', subject: 'RB', className: '5A9' } });
  assert.equal(edit.ok, true, edit.error);
  // Dữ liệu sai bị từ chối.
  const bad = call('sale@kdi.edu.vn', 'lessons.save', { lesson: { school: 'TR001', weekday: 'Thứ 9', start: '09:00', end: '09:45', subject: 'RB' } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Thứ/);
});

test('nhập TKB hàng loạt (dán từ Excel) và thay thế TKB cũ của trường', () => {
  const { call } = fresh();
  const before = call('sale@kdi.edu.vn', 'lessons.list').data.filter((l) => l.school === 'TR002').length;
  assert.ok(before > 0);
  const rows = [
    { weekday: 'Thứ 2', start: '07:30', end: '08:05', className: '1A1', grade: '1', subject: 'RB' },
    { weekday: 'thứ hai', start: '08:15', end: '08:50', className: '1A2', grade: '1', subject: 'SCR' },
    { weekday: 'Thứ 8', start: '08:15', end: '08:50', className: '1A3', grade: '1', subject: 'SCR' },
  ];
  const strict = call('sale@kdi.edu.vn', 'lessons.bulkAdd', { school: 'TR002', rows, replaceSchool: true });
  assert.equal(strict.ok, true);
  assert.equal(strict.data.added, 0, 'có lỗi thì không thêm gì');
  assert.equal(strict.data.errors.length, 1);
  const ok = call('sale@kdi.edu.vn', 'lessons.bulkAdd', { school: 'TR002', rows: rows.slice(0, 2), replaceSchool: true });
  assert.equal(ok.data.added, 2);
  assert.equal(ok.data.removed, before);
  assert.equal(call('sale@kdi.edu.vn', 'lessons.list').data.filter((l) => l.school === 'TR002').length, 2);
});

test('xếp lịch tự động: xem trước → áp dụng → hoàn tác', () => {
  const { call } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  assert.equal(call('viewer@kdi.edu.vn', 'auto.run', { mode: 'fill' }).code, 'FORBIDDEN');
  const run = call(AC, 'auto.run', { mode: 'fill' });
  assert.equal(run.ok, true, run.error);
  assert.equal(run.data.status, 'Xem trước');
  assert.ok(run.data.stats.assigned > 1000);
  // Xem trước chưa làm thay đổi TKB.
  assert.equal(call(AC, 'lessons.list').data.filter((l) => l.teacher).length, 0);

  const applied = call(AC, 'auto.apply', { id: run.data.id });
  assert.equal(applied.ok, true, applied.error);
  assert.equal(applied.data.applied, run.data.items.length);
  const lessons = call(AC, 'lessons.list').data;
  assert.equal(lessons.filter((l) => l.teacher).length, run.data.stats.assigned);
  assert.ok(lessons.filter((l) => l.teacher).every((l) => l.source === 'Tự động' && /^Điểm/.test(l.explain)));
  const conflicts = call(AC, 'conflicts.list').data;
  assert.equal(conflicts.filter((c) => c.severity === 'error').length, 0);
  // Không áp dụng lại được.
  assert.equal(call(AC, 'auto.apply', { id: run.data.id }).ok, false);

  // Gán tay 1 tiết rồi hoàn tác: tiết gán tay được giữ nguyên.
  const target = lessons.find((l) => l.teacher);
  const cands = call(AC, 'lessons.candidates', { id: target.id }).data.candidates;
  const other = cands.find((c) => c.feasible && !c.current);
  assert.ok(other);
  assert.equal(call(AC, 'lessons.assign', { id: target.id, teacher: other.teacher }).ok, true);
  const reverted = call(AC, 'auto.revert', { id: run.data.id });
  assert.equal(reverted.ok, true, reverted.error);
  assert.equal(reverted.data.skipped, 1);
  const after = call(AC, 'lessons.list').data;
  assert.equal(after.filter((l) => l.teacher).length, 1);
  assert.equal(after.find((l) => l.id === target.id).teacher, other.teacher);
  const history = call(AC, 'auto.history').data;
  assert.equal(history[0].status, 'Đã hoàn tác');
});

test('áp dụng bỏ qua tiết đã thay đổi sau khi xem trước', () => {
  const { call } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  const run = call(AC, 'auto.run', { mode: 'fill' }).data;
  const item = run.items.find((i) => i.assigned);
  assert.equal(call(AC, 'lessons.assign', { id: item.lesson.id, teacher: 'GV001', locked: true }).ok, true);
  const res = call(AC, 'auto.apply', { id: run.id }).data;
  assert.equal(res.skipped, 1);
  const l = call(AC, 'lessons.list').data.find((x) => x.id === item.lesson.id);
  assert.equal(l.teacher, 'GV001');
  assert.equal(l.locked, true);
});

test('gán tay có cảnh báo khi trùng lịch', () => {
  const { call } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  const lessons = call(AC, 'lessons.list').data;
  // 2 tiết cùng giờ ở 2 trường khác nhau.
  let pair = null;
  for (const a of lessons) {
    const b = lessons.find((x) => x.school !== a.school && x.weekday === a.weekday && x.start === a.start);
    if (b) { pair = [a, b]; break; }
  }
  assert.ok(pair);
  assert.equal(call(AC, 'lessons.assign', { id: pair[0].id, teacher: 'GV005' }).data.warnings.length >= 0, true);
  const r = call(AC, 'lessons.assign', { id: pair[1].id, teacher: 'GV005' });
  assert.equal(r.ok, true);
  assert.ok(r.data.warnings.some((w) => /trùng lịch/.test(w.message)), JSON.stringify(r.data.warnings));
  const t = call(AC, 'schedule.teacher', { code: 'GV005' }).data;
  assert.ok(t.conflicts.some((c) => c.type === 'overlap'));
  assert.ok(t.lessons.every((l) => l.conflict === 'error'));
});

test('quản lý danh mục: kiểm tra dữ liệu & ràng buộc tham chiếu', () => {
  const { call } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  const bad = call(AC, 'data.save', { table: 'teachers', record: { code: 'GV999', name: 'Test', subjects: ['RB', 'XYZ'] } });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /XYZ/);
  const badEmail = call(AC, 'data.save', { table: 'teachers', record: { code: 'GV999', name: 'Test', email: 'a@gmail.com' } });
  assert.equal(badEmail.ok, false);
  const ok = call(AC, 'data.save', { table: 'teachers', record: { code: 'gv999', name: 'Test GV', type: 'Kiêm nhiệm', rating: 'A', subjects: ['RB', 'SCR'], active: true } });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.data.key, 'GV999');
  const dup = call(AC, 'data.save', { table: 'teachers', record: { code: 'GV999', name: 'Trùng' } });
  assert.equal(dup.ok, false);
  const edit = call(AC, 'data.save', { table: 'teachers', originalKey: 'GV999', record: { code: 'GV999', name: 'Đã sửa', rating: 'B' } });
  assert.equal(edit.ok, true, edit.error);
  const row = call(AC, 'data.list', { table: 'teachers' }).data.rows.find((r) => r.code === 'GV999');
  assert.equal(row.name, 'Đã sửa');
  assert.equal(row.subjects, 'RB, SCR');
  // Lịch bận + liên kết trường.
  assert.equal(call(AC, 'data.save', { table: 'unavailability', record: { teacher: 'GV999', weekday: 'Thứ 4', start: '13:00', end: '12:00' } }).ok, false);
  const ub = call(AC, 'data.save', { table: 'unavailability', record: { teacher: 'GV999', weekday: 'Thứ 4', start: '13:00', end: '17:00', reason: 'Học' } });
  assert.equal(ub.ok, true, ub.error);
  assert.match(ub.data.key, /^LB-/);
  assert.equal(call(AC, 'data.save', { table: 'links', record: { teacher: 'GV999', school: 'TR404' } }).ok, false);
  assert.equal(call(AC, 'data.save', { table: 'links', record: { teacher: 'GV999', school: 'TR001', distance: '3,5', preference: 'Ưu tiên' } }).ok, true);
  // Sale không sửa GV nhưng sửa được trường.
  assert.equal(call('sale@kdi.edu.vn', 'data.save', { table: 'teachers', record: { code: 'GV998', name: 'X' } }).code, 'FORBIDDEN');
  assert.equal(call('sale@kdi.edu.vn', 'data.save', { table: 'schools', record: { code: 'TR900', name: 'TH Mới' } }).ok, true);
  // Không xóa trường đang có TKB.
  const del = call(AC, 'data.delete', { table: 'schools', key: 'TR001' });
  assert.equal(del.ok, false);
  assert.match(del.error, /Hoạt động/);
  assert.equal(call(AC, 'data.delete', { table: 'schools', key: 'TR900' }).ok, true);
});

test('lịch theo GV/trường, lịch trống, tổng quan', () => {
  const { call } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  const run = call(AC, 'auto.run', { mode: 'fill' }).data;
  call(AC, 'auto.apply', { id: run.id });
  const dash = call('viewer@kdi.edu.vn', 'dashboard').data;
  assert.equal(dash.counts.schools, 72);
  assert.ok(dash.loads.length > 100);
  const t = call('viewer@kdi.edu.vn', 'schedule.teacher', { code: 'GV001' }).data;
  assert.equal(t.teacher.phone, undefined, 'viewer không thấy SĐT');
  const tAC = call(AC, 'schedule.teacher', { code: 'GV001' }).data;
  assert.ok(tAC.teacher.phone);
  assert.ok(tAC.nearestSchools.length > 0);
  const s = call('viewer@kdi.edu.vn', 'schedule.school', { code: 'TR001' }).data;
  assert.ok(s.lessons.length > 0);
  const free = call('viewer@kdi.edu.vn', 'schedule.free', { weekday: 0, from: '08:00', to: '09:00', school: 'TR001' }).data;
  assert.ok(free.rows.length > 50);
  assert.ok(free.rows[0].fitsRange);
  assert.equal(free.rows[0].distance, null, 'viewer không thấy khoảng cách');
  const lists = call('viewer@kdi.edu.vn', 'overview.lists').data;
  assert.equal(lists.schools.length, 72);
});

test('đăng nhập bằng mã OTP khi không có phiên Google', () => {
  const { call, env } = fresh({ DEV_SHOW_OTP: 'false' });
  assert.equal(call('', 'auth.requestCode', { email: 'a@gmail.com' }).ok, false);
  const req = call('', 'auth.requestCode', { email: 'Viewer@KDI.edu.vn' });
  assert.equal(req.ok, true, req.error);
  assert.equal(req.data.devCode, undefined);
  assert.equal(env.sentMail.length, 1);
  const code = env.sentMail[0].subject.match(/(\d{6})/)[1];
  assert.equal(call('', 'auth.requestCode', { email: 'viewer@kdi.edu.vn' }).ok, false, 'chống spam 60s');
  assert.equal(call('', 'auth.verifyCode', { email: 'viewer@kdi.edu.vn', code: '000000' === code ? '111111' : '000000' }).ok, false);
  const v = call('', 'auth.verifyCode', { email: 'viewer@kdi.edu.vn', code });
  assert.equal(v.ok, true, v.error);
  const token = v.data.token;
  assert.equal(call('', 'auth.verifyCode', { email: 'viewer@kdi.edu.vn', code }).ok, false, 'mã chỉ dùng 1 lần');
  const me = call('', 'auth.me', {}, token).data;
  assert.equal(me.status, 'ok');
  assert.equal(me.email, 'viewer@kdi.edu.vn');
  assert.equal(me.via, 'otp');
  assert.equal(call('', 'dashboard', {}, token).ok, true);
  call('', 'auth.logout', {}, token);
  assert.equal(call('', 'auth.me', {}, token).data.status, 'anonymous');
});

test('cấu hình, nhật ký, xuất Google Sheets, gửi email', () => {
  const { call, env } = fresh();
  const AC = 'scheduler@kdi.edu.vn';
  assert.equal(call(AC, 'settings.get').code, 'FORBIDDEN');
  const settings = call(SUPER, 'settings.get').data;
  assert.ok(settings.find((s) => s.key === 'target_hours_full_time').value === 15);
  assert.equal(call(SUPER, 'settings.save', { values: { target_hours_full_time: '16', require_trained_subject: true } }).ok, true);
  const after = call(SUPER, 'settings.get').data;
  assert.equal(after.find((s) => s.key === 'target_hours_full_time').value, 16);
  assert.equal(after.find((s) => s.key === 'require_trained_subject').value, true);

  const run = call(AC, 'auto.run', { mode: 'fill' }).data;
  call(AC, 'auto.apply', { id: run.id });
  const exp = call('viewer@kdi.edu.vn', 'export.sheet');
  assert.equal(exp.ok, true, exp.error);
  const out = env.created[env.created.length - 1];
  assert.deepEqual(out.getSheets().map((s) => s.getName()), ['Lịch theo GV', 'Lịch theo trường', 'Chi tiết TKB', 'Tổng hợp giờ dạy', 'Chưa xếp GV', 'Cảnh báo']);
  assert.ok(out.editors.includes('viewer@kdi.edu.vn'));
  assert.ok(out.getSheetByName('Lịch theo GV').getLastRow() > 100);

  assert.equal(call('viewer@kdi.edu.vn', 'email.schedules', { teachers: ['GV001'] }).code, 'FORBIDDEN');
  const before = env.sentMail.length;
  const mail = call(AC, 'email.schedules', { teachers: ['GV001', 'GV002'] });
  assert.equal(mail.ok, true, mail.error);
  assert.equal(env.sentMail.length - before, mail.data.sent);
  assert.match(env.sentMail[env.sentMail.length - 1].htmlBody, /Lịch dạy|lịch dạy/);

  const logs = call(SUPER, 'audit.list').data;
  assert.ok(logs.some((l) => l.action === 'Áp dụng xếp lịch'));
  assert.ok(logs.some((l) => l.action === 'Cập nhật cấu hình'));
});

test('xóa nhiều tiết và giữ đúng cấu trúc sheet', () => {
  const { call, ctx } = fresh();
  const lessons = call('sale@kdi.edu.vn', 'lessons.list').data;
  const ids = lessons.slice(0, 5).map((l) => l.id).concat([lessons[100].id]);
  const r = call('sale@kdi.edu.vn', 'lessons.delete', { ids });
  assert.equal(r.data.deleted, 6);
  const left = call('sale@kdi.edu.vn', 'lessons.list').data;
  assert.equal(left.length, lessons.length - 6);
  assert.ok(!left.some((l) => ids.includes(l.id)));
  ctx.Db.clearCache();
  assert.equal(ctx.Db.read('lessons').length, left.length);
});
