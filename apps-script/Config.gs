/**
 * KDI Scheduler – Cấu hình chung.
 *
 * Toàn bộ file .gs dùng chung một global scope (Apps Script V8), vì vậy các
 * hằng số ở đây được dùng trực tiếp trong các file khác.
 */

var APP = {
  NAME: 'KDI Scheduler',
  TITLE: 'KDI Education – Hệ thống xếp lịch STEM',
  VERSION: '1.1.0',
  // Chỉ email thuộc các domain này được đăng nhập.
  ALLOWED_DOMAINS: ['kdi.edu.vn'],
  // Tài khoản quản trị gốc: luôn là admin, là người duy nhất được thêm/bớt admin.
  SUPER_ADMIN: 'hien.le@kdi.edu.vn',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  // Số lần chạy xếp lịch được giữ lại để hoàn tác.
  KEEP_RUNS: 15,
};

/** Vai trò người dùng. */
var ROLES = {
  admin: 'Quản trị (Admin)',
  scheduler: 'Chuyên viên xếp lịch (AC)',
  sale: 'Sale',
  teacher: 'Giáo viên',
  viewer: 'Xem lịch',
  pending: 'Chờ duyệt',
};

/** Quyền → các vai trò được phép. */
var PERMISSIONS = {
  view_schedule: ['admin', 'scheduler', 'sale', 'viewer'],
  view_personal: ['admin', 'scheduler'], // SĐT, địa chỉ, khoảng cách của GV
  edit_timetable: ['admin', 'scheduler', 'sale'], // nhập TKB từ trường
  edit_schools: ['admin', 'scheduler', 'sale'],
  edit_teachers: ['admin', 'scheduler'],
  assign: ['admin', 'scheduler'], // gán/đổi GV cho tiết dạy
  auto_schedule: ['admin', 'scheduler'],
  export: ['admin', 'scheduler', 'sale', 'viewer'],
  send_email: ['admin', 'scheduler'],
  manage_users: ['admin'],
  manage_settings: ['admin'],
  view_audit: ['admin'],
};

var WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

var TEACHER_TYPES = ['Thường', 'Kiêm nhiệm'];
var RATINGS = ['A', 'B', 'C', 'D'];
var PREFERENCES = ['Ưu tiên', 'Không xếp'];

/**
 * Các tham số cấu hình (lưu ở sheet CauHinh). Admin chỉnh trong trang "Cấu hình".
 * Trọng số w_* quyết định thứ tự ưu tiên khi chọn GV:
 *   (1) trường ưu tiên  >  (2) khoảng cách  >  (3) môn đã đào tạo
 *   >  (4) số trường/GV  >  (5) cân bằng giờ dạy  > xếp loại chất lượng.
 */
var SETTINGS_SPEC = [
  { key: 'target_hours_full_time', group: 'Định mức', label: 'Giờ dạy trung bình/tuần – GV thường', type: 'number', def: 15 },
  { key: 'target_hours_part_time', group: 'Định mức', label: 'Giờ dạy trung bình/tuần – GV kiêm nhiệm', type: 'number', def: 10 },
  { key: 'max_hours_tolerance', group: 'Định mức', label: 'Được vượt định mức tối đa (giờ/tuần)', type: 'number', def: 3 },
  { key: 'preferred_max_schools', group: 'Định mức', label: 'Số trường nên dạy / GV (mềm)', type: 'number', def: 2 },
  { key: 'hard_max_schools', group: 'Định mức', label: 'Số trường tối đa / GV (cứng)', type: 'number', def: 3 },
  { key: 'load_unit', group: 'Định mức', label: 'Cách tính giờ dạy', type: 'select', def: 'hours',
    options: [['hours', 'Theo thời lượng thực tế (giờ:phút)'], ['periods', 'Theo số tiết (1 tiết = 1 giờ)']] },

  { key: 'max_distance_km', group: 'Khoảng cách & di chuyển', label: 'Khoảng cách tối đa nhà GV → trường (km, 0 = không giới hạn)', type: 'number', def: 25 },
  { key: 'unknown_distance_km', group: 'Khoảng cách & di chuyển', label: 'Khoảng cách giả định khi chưa có dữ liệu (km)', type: 'number', def: 15 },
  { key: 'road_factor', group: 'Khoảng cách & di chuyển', label: 'Hệ số quy đổi đường chim bay → đường đi thực tế', type: 'number', def: 1.3 },
  { key: 'travel_speed_kmh', group: 'Khoảng cách & di chuyển', label: 'Tốc độ di chuyển trung bình (km/h)', type: 'number', def: 20 },
  { key: 'min_gap_between_schools_min', group: 'Khoảng cách & di chuyển', label: 'Thời gian tối thiểu giữa 2 tiết ở 2 trường khác nhau (phút)', type: 'number', def: 30 },

  { key: 'require_trained_subject', group: 'Quy tắc xếp', label: 'Bắt buộc GV đã được đào tạo môn (nếu tắt: chỉ ưu tiên)', type: 'bool', def: false },
  { key: 'priority_requires_trained', group: 'Quy tắc xếp', label: 'Ưu tiên trường chỉ áp dụng cho các môn GV đã được đào tạo', type: 'bool', def: true },
  { key: 'balance_tolerance', group: 'Quy tắc xếp', label: 'Cân bằng giờ: chấp nhận giảm tối đa bao nhiêu điểm để chuyển tiết từ GV quá tải sang GV thiếu giờ', type: 'number', def: 60 },
  { key: 'day_start', group: 'Hiển thị', label: 'Giờ bắt đầu ngày làm việc', type: 'time', def: '07:00' },
  { key: 'day_end', group: 'Hiển thị', label: 'Giờ kết thúc ngày làm việc', type: 'time', def: '17:30' },
  { key: 'min_free_minutes', group: 'Hiển thị', label: 'Khoảng trống tối thiểu để tính là "rảnh" (phút)', type: 'number', def: 30 },
  { key: 'new_user_role', group: 'Tài khoản', label: 'Vai trò mặc định khi tài khoản @kdi.edu.vn đăng nhập lần đầu', type: 'select', def: 'viewer',
    options: [['viewer', 'Xem lịch'], ['pending', 'Chờ admin duyệt']] },

  { key: 'w_priority', group: 'Trọng số xếp lịch', label: '(1) Điểm cộng: trường ưu tiên xếp của GV', type: 'number', def: 1000 },
  { key: 'w_distance_per_km', group: 'Trọng số xếp lịch', label: '(2) Điểm trừ cho mỗi km khoảng cách', type: 'number', def: 20 },
  { key: 'w_trained', group: 'Trọng số xếp lịch', label: '(3) Điểm cộng: GV đã được đào tạo môn', type: 'number', def: 100 },
  { key: 'w_same_school', group: 'Trọng số xếp lịch', label: '(4) Điểm cộng: GV đang dạy tại trường này', type: 'number', def: 50 },
  { key: 'w_extra_school', group: 'Trọng số xếp lịch', label: '(4) Điểm trừ: thêm trường vượt mức "nên dạy"', type: 'number', def: 80 },
  { key: 'w_same_day_school', group: 'Trọng số xếp lịch', label: '(4) Điểm cộng: đã có lịch ở trường này cùng ngày', type: 'number', def: 20 },
  { key: 'w_load_balance', group: 'Trọng số xếp lịch', label: '(5) Điểm cộng tối đa cho GV còn thiếu giờ', type: 'number', def: 40 },
  { key: 'w_over_target_per_hour', group: 'Trọng số xếp lịch', label: '(5) Điểm trừ cho mỗi giờ vượt định mức', type: 'number', def: 30 },
  { key: 'w_same_class', group: 'Trọng số xếp lịch', label: 'Điểm cộng: GV đang dạy chính lớp này', type: 'number', def: 20 },
  { key: 'w_rating', group: 'Trọng số xếp lịch', label: 'Điểm cho mỗi bậc xếp loại (A=+2, B=+1, C=0, D=-1 bậc)', type: 'number', def: 10 },
];

var REASON_LABELS = {
  inactive: 'GV ngừng hoạt động',
  blocked: 'Bị đánh dấu "Không xếp" tại trường',
  untrained: 'Chưa được đào tạo môn',
  too_far: 'Quá xa',
  unavailable: 'Trùng lịch bận',
  overlap: 'Trùng giờ dạy',
  travel: 'Không đủ thời gian di chuyển',
  max_hours: 'Đã đủ giờ tối đa',
  max_schools: 'Đã đủ số trường tối đa',
};

/**
 * Cấu trúc các bảng dữ liệu (mỗi bảng = 1 sheet, dòng 1 là tiêu đề).
 * Cột được nhận diện theo TÊN TIÊU ĐỀ nên có thể đổi thứ tự cột hoặc thêm cột riêng.
 */
var TABLES = {
  settings: {
    sheet: 'CauHinh', key: 'key', columns: [
      { key: 'key', header: 'Khóa' },
      { key: 'value', header: 'Giá trị' },
      { key: 'description', header: 'Mô tả' },
    ],
  },
  users: {
    sheet: 'NguoiDung', key: 'email', label: 'Người dùng', columns: [
      { key: 'email', header: 'Email' },
      { key: 'name', header: 'Họ tên' },
      { key: 'role', header: 'Vai trò' },
      { key: 'active', header: 'Hoạt động', type: 'bool' },
      { key: 'addedBy', header: 'Người thêm' },
      { key: 'createdAt', header: 'Ngày tạo' },
      { key: 'lastLogin', header: 'Đăng nhập gần nhất' },
    ],
  },
  subjects: {
    sheet: 'MonHoc', key: 'code', label: 'Môn học', columns: [
      { key: 'code', header: 'Mã môn', required: true },
      { key: 'name', header: 'Tên môn', required: true },
      { key: 'description', header: 'Mô tả' },
      { key: 'color', header: 'Màu', type: 'color' },
    ],
  },
  schools: {
    sheet: 'TruongHoc', key: 'code', label: 'Trường học', columns: [
      { key: 'code', header: 'Mã trường', required: true },
      { key: 'name', header: 'Tên trường', required: true },
      { key: 'level', header: 'Cấp học', type: 'select', options: ['Mầm non', 'Tiểu học', 'THCS', 'THPT', 'Liên cấp'] },
      { key: 'address', header: 'Địa chỉ' },
      { key: 'district', header: 'Quận/Huyện' },
      { key: 'lat', header: 'Vĩ độ', type: 'number' },
      { key: 'lng', header: 'Kinh độ', type: 'number' },
      { key: 'contact', header: 'Người liên hệ' },
      { key: 'phone', header: 'SĐT liên hệ', type: 'phone' },
      { key: 'sale', header: 'Sale phụ trách' },
      { key: 'notes', header: 'Ghi chú' },
      { key: 'active', header: 'Hoạt động', type: 'bool', def: true },
    ],
  },
  teachers: {
    sheet: 'GiaoVien', key: 'code', label: 'Giáo viên', columns: [
      { key: 'code', header: 'Mã GV', required: true },
      { key: 'name', header: 'Họ tên', required: true },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'SĐT', type: 'phone', personal: true },
      { key: 'type', header: 'Loại GV', type: 'select', options: TEACHER_TYPES, def: 'Thường' },
      { key: 'rating', header: 'Xếp loại', type: 'select', options: RATINGS, def: 'B' },
      { key: 'address', header: 'Địa chỉ nhà', personal: true },
      { key: 'district', header: 'Quận/Huyện' },
      { key: 'lat', header: 'Vĩ độ', type: 'number', personal: true },
      { key: 'lng', header: 'Kinh độ', type: 'number', personal: true },
      { key: 'subjects', header: 'Môn đã đào tạo', type: 'subjects' },
      { key: 'targetHours', header: 'Giờ định mức', type: 'number' },
      { key: 'maxHours', header: 'Giờ tối đa', type: 'number' },
      { key: 'maxSchools', header: 'Số trường tối đa', type: 'number' },
      { key: 'notes', header: 'Ghi chú', personal: true },
      { key: 'active', header: 'Hoạt động', type: 'bool', def: true },
    ],
  },
  links: {
    sheet: 'GV_Truong', key: ['teacher', 'school'], label: 'Trường ưu tiên & khoảng cách', columns: [
      { key: 'teacher', header: 'Mã GV', type: 'teacher', required: true },
      { key: 'school', header: 'Mã trường', type: 'school', required: true },
      { key: 'distance', header: 'Khoảng cách (km)', type: 'number' },
      { key: 'preference', header: 'Ưu tiên', type: 'select', options: PREFERENCES },
      { key: 'notes', header: 'Ghi chú' },
    ],
  },
  unavailability: {
    sheet: 'LichBan', key: 'id', label: 'Lịch bận của GV', columns: [
      { key: 'id', header: 'ID', auto: true },
      { key: 'teacher', header: 'Mã GV', type: 'teacher', required: true },
      { key: 'weekday', header: 'Thứ', type: 'weekday', required: true },
      { key: 'start', header: 'Từ', type: 'time', required: true },
      { key: 'end', header: 'Đến', type: 'time', required: true },
      { key: 'reason', header: 'Lý do' },
    ],
  },
  lessons: {
    sheet: 'TKB', key: 'id', label: 'Thời khóa biểu STEM', columns: [
      { key: 'id', header: 'ID', auto: true },
      { key: 'school', header: 'Mã trường', type: 'school', required: true },
      { key: 'weekday', header: 'Thứ', type: 'weekday', required: true },
      { key: 'start', header: 'Bắt đầu', type: 'time', required: true },
      { key: 'end', header: 'Kết thúc', type: 'time', required: true },
      { key: 'className', header: 'Lớp' },
      { key: 'grade', header: 'Khối' },
      { key: 'subject', header: 'Mã môn', type: 'subject', required: true },
      { key: 'periods', header: 'Số tiết', type: 'number', def: 1 },
      { key: 'room', header: 'Phòng' },
      { key: 'teacher', header: 'Mã GV', type: 'teacher' },
      { key: 'locked', header: 'Ghim', type: 'bool', def: false },
      { key: 'source', header: 'Nguồn xếp' },
      { key: 'explain', header: 'Giải thích' },
      { key: 'notes', header: 'Ghi chú' },
      { key: 'updatedAt', header: 'Cập nhật lúc' },
      { key: 'updatedBy', header: 'Cập nhật bởi' },
    ],
  },
  runs: {
    sheet: 'LichSuXep', key: 'id', columns: [
      { key: 'id', header: 'ID' },
      { key: 'createdAt', header: 'Thời gian' },
      { key: 'createdBy', header: 'Người chạy' },
      { key: 'mode', header: 'Chế độ' },
      { key: 'status', header: 'Trạng thái' },
      { key: 'summary', header: 'Tóm tắt' },
      { key: 'appliedAt', header: 'Áp dụng lúc' },
      { key: 'appliedBy', header: 'Áp dụng bởi' },
    ],
  },
  runItems: {
    sheet: 'LichSuXep_ChiTiet', columns: [
      { key: 'runId', header: 'ID lần xếp' },
      { key: 'lessonId', header: 'ID tiết' },
      { key: 'before', header: 'GV trước' },
      { key: 'after', header: 'GV đề xuất' },
      { key: 'score', header: 'Điểm' },
      { key: 'explain', header: 'Giải thích' },
    ],
  },
  audit: {
    sheet: 'NhatKy', columns: [
      { key: 'at', header: 'Thời gian' },
      { key: 'user', header: 'Người dùng' },
      { key: 'action', header: 'Hành động' },
      { key: 'entity', header: 'Đối tượng' },
      { key: 'details', header: 'Chi tiết' },
    ],
  },
};

/** Cột lưu dạng văn bản (để "07:30" hay "Thứ 2" không bị Sheets tự đổi kiểu). */
var TEXT_COLUMNS = { weekday: true, time: true, phone: true };
