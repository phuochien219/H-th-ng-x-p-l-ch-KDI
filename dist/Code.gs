/**
 * KDI Scheduler 1.2.0 – bản gộp 1 file (tự động tạo bởi tools/build-bundle.js).
 * KHÔNG sửa trực tiếp file này – sửa trong thư mục apps-script/ rồi chạy: npm run build
 */

/* ======================= Config.gs ======================= */
/**
 * KDI Scheduler – Cấu hình chung.
 *
 * Toàn bộ file .gs dùng chung một global scope (Apps Script V8), vì vậy các
 * hằng số ở đây được dùng trực tiếp trong các file khác.
 */

var APP = {
  NAME: 'KDI Scheduler',
  TITLE: 'KDI Education – Hệ thống xếp lịch STEM',
  VERSION: '1.2.0',
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

var YES_NO = ['Có', 'Không'];
var TRAINING_STATUS = ['Đạt', 'Đang đào tạo'];

/**
 * Các tham số cấu hình (lưu ở sheet CauHinh). Admin chỉnh trong trang "Cấu hình".
 * Trọng số w_* quyết định thứ tự ưu tiên khi chọn GV:
 *   (1) trường ưu tiên  >  (2) khoảng cách  >  (3) chương trình đã đào tạo
 *   >  (4) số trường/GV  >  (5) cân bằng giờ dạy  > xếp loại chất lượng.
 */
var SETTINGS_SPEC = [
  { key: 'target_hours_full_time', group: 'Định mức', label: 'Giờ dạy trung bình/tuần – GV thường', type: 'number', def: 15 },
  { key: 'target_hours_part_time', group: 'Định mức', label: 'Giờ dạy trung bình/tuần – GV kiêm nhiệm', type: 'number', def: 10 },
  { key: 'target_hours_assistant', group: 'Định mức', label: 'Giờ trợ giảng trung bình/tuần – Trợ giảng', type: 'number', def: 10 },
  { key: 'max_hours_tolerance', group: 'Định mức', label: 'Được vượt định mức tối đa (giờ/tuần)', type: 'number', def: 3 },
  { key: 'preferred_max_schools', group: 'Định mức', label: 'Số trường nên dạy / GV (mềm)', type: 'number', def: 2 },
  { key: 'hard_max_schools', group: 'Định mức', label: 'Số trường tối đa / GV (cứng)', type: 'number', def: 3 },
  { key: 'assistant_max_schools', group: 'Định mức', label: 'Số trường tối đa / Trợ giảng', type: 'number', def: 3 },
  { key: 'load_unit', group: 'Định mức', label: 'Cách tính giờ dạy', type: 'select', def: 'hours',
    options: [['hours', 'Theo thời lượng thực tế (giờ:phút)'], ['periods', 'Theo số tiết (1 tiết = 1 giờ)']] },

  { key: 'max_distance_km', group: 'Khoảng cách & di chuyển', label: 'Khoảng cách tối đa nhà → trường (km, 0 = không giới hạn)', type: 'number', def: 25 },
  { key: 'unknown_distance_km', group: 'Khoảng cách & di chuyển', label: 'Khoảng cách giả định khi chưa có dữ liệu (km)', type: 'number', def: 15 },
  { key: 'road_factor', group: 'Khoảng cách & di chuyển', label: 'Hệ số đường chim bay → đường đi (chỉ dùng khi chưa có số liệu Google Maps)', type: 'number', def: 1.35 },
  { key: 'travel_speed_kmh', group: 'Khoảng cách & di chuyển', label: 'Tốc độ xe máy trung bình (km/h) để ước tính thời gian di chuyển', type: 'number', def: 20 },
  { key: 'min_gap_between_schools_min', group: 'Khoảng cách & di chuyển', label: 'Thời gian tối thiểu giữa 2 tiết ở 2 trường khác nhau (phút)', type: 'number', def: 30 },
  { key: 'maps_avoid_highways', group: 'Khoảng cách & di chuyển', label: 'Google Maps: tránh đường cao tốc (mô phỏng đường đi xe máy)', type: 'bool', def: true },
  { key: 'maps_api_key', group: 'Khoảng cách & di chuyển', label: 'Google Maps API key (tùy chọn – có key sẽ dùng chế độ xe 2 bánh TWO_WHEELER và tính nhanh hơn)', type: 'text', def: '' },

  { key: 'require_trained_subject', group: 'Quy tắc xếp', label: 'BẮT BUỘC GV đã được đào tạo chương trình của lớp (khuyến nghị bật)', type: 'bool', def: true },
  { key: 'priority_requires_trained', group: 'Quy tắc xếp', label: 'Ưu tiên trường chỉ áp dụng cho chương trình GV đã được đào tạo', type: 'bool', def: true },
  { key: 'default_need_assistant', group: 'Quy tắc xếp', label: 'Mặc định mỗi tiết cần 1 trợ giảng (nếu lớp/tiết không ghi rõ)', type: 'bool', def: true },
  { key: 'balance_tolerance', group: 'Quy tắc xếp', label: 'Cân bằng giờ: chấp nhận giảm tối đa bao nhiêu điểm để chuyển tiết từ người quá tải sang người thiếu giờ', type: 'number', def: 60 },
  { key: 'day_start', group: 'Hiển thị', label: 'Giờ bắt đầu ngày làm việc', type: 'time', def: '07:00' },
  { key: 'day_end', group: 'Hiển thị', label: 'Giờ kết thúc ngày làm việc', type: 'time', def: '17:30' },
  { key: 'min_free_minutes', group: 'Hiển thị', label: 'Khoảng trống tối thiểu để tính là "rảnh" (phút)', type: 'number', def: 30 },
  { key: 'new_user_role', group: 'Tài khoản', label: 'Vai trò mặc định khi tài khoản @kdi.edu.vn đăng nhập lần đầu', type: 'select', def: 'viewer',
    options: [['viewer', 'Xem lịch'], ['pending', 'Chờ admin duyệt']] },

  { key: 'w_priority', group: 'Trọng số xếp lịch', label: '(1) Điểm cộng: trường ưu tiên xếp của GV', type: 'number', def: 1000 },
  { key: 'w_distance_per_km', group: 'Trọng số xếp lịch', label: '(2) Điểm trừ cho mỗi km khoảng cách (GV)', type: 'number', def: 20 },
  { key: 'w_trained', group: 'Trọng số xếp lịch', label: '(3) Điểm cộng: GV đã được đào tạo chương trình (khi không bắt buộc)', type: 'number', def: 100 },
  { key: 'w_same_school', group: 'Trọng số xếp lịch', label: '(4) Điểm cộng: đang dạy tại trường này', type: 'number', def: 50 },
  { key: 'w_extra_school', group: 'Trọng số xếp lịch', label: '(4) Điểm trừ: thêm trường vượt mức "nên dạy"', type: 'number', def: 80 },
  { key: 'w_same_day_school', group: 'Trọng số xếp lịch', label: '(4) Điểm cộng: đã có lịch ở trường này cùng ngày', type: 'number', def: 20 },
  { key: 'w_load_balance', group: 'Trọng số xếp lịch', label: '(5) Điểm cộng tối đa cho người còn thiếu giờ', type: 'number', def: 40 },
  { key: 'w_over_target_per_hour', group: 'Trọng số xếp lịch', label: '(5) Điểm trừ cho mỗi giờ vượt định mức', type: 'number', def: 30 },
  { key: 'w_same_class', group: 'Trọng số xếp lịch', label: 'Điểm cộng: đang dạy chính lớp này', type: 'number', def: 20 },
  { key: 'w_rating', group: 'Trọng số xếp lịch', label: 'Điểm cho mỗi bậc xếp loại (A=+2, B=+1, C=0, D=-1 bậc)', type: 'number', def: 10 },
  { key: 'w_ta_distance_per_km', group: 'Trọng số xếp lịch', label: 'Trợ giảng: điểm trừ cho mỗi km (càng lớn càng ưu tiên người ở gần)', type: 'number', def: 40 },
];

var REASON_LABELS = {
  inactive: 'Ngừng hoạt động',
  blocked: 'Bị đánh dấu "Không xếp" tại trường',
  untrained: 'Chưa được đào tạo chương trình',
  too_far: 'Quá xa',
  unavailable: 'Trùng lịch bận',
  not_free: 'Ngoài giờ rảnh đã đăng ký',
  overlap: 'Trùng giờ dạy',
  travel: 'Không đủ thời gian di chuyển',
  max_hours: 'Đã đủ giờ tối đa',
  max_schools: 'Đã đủ số trường tối đa',
};

/** Hai "nhóm nhân sự" được xếp lịch: GV đứng lớp và trợ giảng. */
var STAFF_ROLES = {
  teacher: { field: 'teacher', pool: 'teachers', short: 'GV', label: 'Giáo viên' },
  assistant: { field: 'assistant', pool: 'assistants', short: 'TG', label: 'Trợ giảng' },
};

/**
 * Cấu trúc các bảng dữ liệu (mỗi bảng = 1 sheet, dòng 1 là tiêu đề).
 * Cột được nhận diện theo TÊN TIÊU ĐỀ nên có thể đổi thứ tự cột hoặc thêm cột riêng.
 * type 'school' | 'teacher' | 'assistant' | 'person' | 'subject' = mã tham chiếu sang bảng khác
 * (file mẫu & Google Sheets sẽ có danh sách thả xuống tương ứng).
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
    sheet: 'MonHoc', key: 'code', label: 'Chương trình / Môn học', columns: [
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
      { key: 'mapUrl', header: 'Link Google Maps', type: 'map' },
      { key: 'address', header: 'Địa chỉ' },
      { key: 'district', header: 'Quận/Huyện', type: 'district' },
      { key: 'lat', header: 'Vĩ độ', type: 'number' },
      { key: 'lng', header: 'Kinh độ', type: 'number' },
      { key: 'contact', header: 'Người liên hệ' },
      { key: 'phone', header: 'SĐT liên hệ', type: 'phone' },
      { key: 'sale', header: 'Sale phụ trách' },
      { key: 'notes', header: 'Ghi chú' },
      { key: 'active', header: 'Hoạt động', type: 'bool', def: true },
    ],
  },
  classes: {
    sheet: 'LopHoc', key: ['school', 'className'], label: 'Lớp học & chương trình', columns: [
      { key: 'school', header: 'Mã trường', type: 'school', required: true },
      { key: 'className', header: 'Lớp', required: true },
      { key: 'grade', header: 'Khối' },
      { key: 'subject', header: 'Mã môn', type: 'subject', required: true },
      { key: 'needTeacher', header: 'Cần GV KDI', type: 'select', options: YES_NO },
      { key: 'needAssistant', header: 'Cần trợ giảng', type: 'select', options: YES_NO },
      { key: 'students', header: 'Sĩ số', type: 'number' },
      { key: 'notes', header: 'Ghi chú' },
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
      { key: 'mapUrl', header: 'Link Google Maps nhà', type: 'map', personal: true },
      { key: 'address', header: 'Địa chỉ nhà', personal: true },
      { key: 'district', header: 'Quận/Huyện', type: 'district' },
      { key: 'lat', header: 'Vĩ độ', type: 'number', personal: true },
      { key: 'lng', header: 'Kinh độ', type: 'number', personal: true },
      { key: 'targetHours', header: 'Giờ định mức', type: 'number' },
      { key: 'maxHours', header: 'Giờ tối đa', type: 'number' },
      { key: 'maxSchools', header: 'Số trường tối đa', type: 'number' },
      { key: 'notes', header: 'Ghi chú', personal: true },
      { key: 'active', header: 'Hoạt động', type: 'bool', def: true },
    ],
  },
  training: {
    sheet: 'GV_DaoTao', key: ['teacher', 'subject'], label: 'GV đã được đào tạo', columns: [
      { key: 'teacher', header: 'Mã GV', type: 'teacher', required: true },
      { key: 'subject', header: 'Mã môn', type: 'subject', required: true },
      { key: 'status', header: 'Trạng thái', type: 'select', options: TRAINING_STATUS, def: 'Đạt' },
      { key: 'date', header: 'Ngày đào tạo' },
      { key: 'notes', header: 'Ghi chú' },
    ],
  },
  assistants: {
    sheet: 'TroGiang', key: 'code', label: 'Trợ giảng', columns: [
      { key: 'code', header: 'Mã TG', required: true },
      { key: 'name', header: 'Họ tên', required: true },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'SĐT', type: 'phone', personal: true },
      { key: 'mapUrl', header: 'Link Google Maps nhà', type: 'map', personal: true },
      { key: 'address', header: 'Địa chỉ nhà', personal: true },
      { key: 'district', header: 'Quận/Huyện', type: 'district' },
      { key: 'lat', header: 'Vĩ độ', type: 'number', personal: true },
      { key: 'lng', header: 'Kinh độ', type: 'number', personal: true },
      { key: 'targetHours', header: 'Giờ mong muốn/tuần', type: 'number' },
      { key: 'maxHours', header: 'Giờ tối đa', type: 'number' },
      { key: 'maxSchools', header: 'Số trường tối đa', type: 'number' },
      { key: 'notes', header: 'Ghi chú', personal: true },
      { key: 'active', header: 'Hoạt động', type: 'bool', def: true },
    ],
  },
  assistantFree: {
    sheet: 'TG_LichRanh', key: 'id', label: 'Lịch rảnh của trợ giảng', columns: [
      { key: 'id', header: 'ID', auto: true },
      { key: 'assistant', header: 'Mã TG', type: 'assistant', required: true },
      { key: 'weekday', header: 'Thứ', type: 'weekday', required: true },
      { key: 'start', header: 'Rảnh từ', type: 'time', required: true },
      { key: 'end', header: 'Rảnh đến', type: 'time', required: true },
      { key: 'notes', header: 'Ghi chú' },
    ],
  },
  links: {
    sheet: 'GV_Truong', key: ['teacher', 'school'], label: 'Trường ưu tiên / không xếp', columns: [
      { key: 'teacher', header: 'Mã GV', type: 'person', required: true },
      { key: 'school', header: 'Mã trường', type: 'school', required: true },
      { key: 'preference', header: 'Ưu tiên', type: 'select', options: PREFERENCES },
      { key: 'distance', header: 'Khoảng cách (km)', type: 'number' },
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
  distances: {
    sheet: 'KhoangCach', key: ['person', 'school'], label: 'Khoảng cách Google Maps', columns: [
      { key: 'person', header: 'Mã GV/TG' },
      { key: 'school', header: 'Mã trường' },
      { key: 'km', header: 'Khoảng cách (km)', type: 'number' },
      { key: 'minutes', header: 'Thời gian (phút)', type: 'number' },
      { key: 'source', header: 'Nguồn' },
      { key: 'coords', header: 'Tọa độ đã tính' },
      { key: 'updatedAt', header: 'Cập nhật lúc' },
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
      { key: 'subject', header: 'Mã môn', type: 'subject' },
      { key: 'periods', header: 'Số tiết', type: 'number', def: 1 },
      { key: 'room', header: 'Phòng' },
      { key: 'needTeacher', header: 'Cần GV KDI', type: 'select', options: YES_NO },
      { key: 'teacher', header: 'Mã GV', type: 'teacher' },
      { key: 'needAssistant', header: 'Cần TG', type: 'select', options: YES_NO },
      { key: 'assistant', header: 'Mã TG', type: 'assistant' },
      { key: 'locked', header: 'Ghim', type: 'bool', def: false },
      { key: 'source', header: 'Nguồn xếp' },
      { key: 'explain', header: 'Giải thích' },
      { key: 'explainTA', header: 'Giải thích TG' },
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
      { key: 'role', header: 'Vai trò' },
      { key: 'before', header: 'Người trước' },
      { key: 'after', header: 'Người đề xuất' },
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

/* ======================= Utils.gs ======================= */
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

/**
 * Lấy tọa độ từ link Google Maps hoặc chuỗi "vĩ độ, kinh độ". Trả về {lat, lng} hoặc null.
 * Hiểu các dạng: .../place/Ten/@21.03,105.85,17z/data=...!3d21.0301!4d105.8512
 *   ...?q=21.03,105.85   .../search/21.03,+105.85   "21.0301, 105.8512"
 * Link rút gọn (maps.app.goo.gl) hoặc địa chỉ chữ cần tra cứu qua mạng → xem Maps.gs.
 */
function parseMapsLink(v) {
  var s = str(v);
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch (e) { /* giữ nguyên */ }
  var patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // vị trí chính xác của địa điểm
    /[?&](?:q|query|ll|destination|center|daddr)=(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/,
    /\/(?:search|place|dir)\/(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // tâm khung bản đồ
    /^\s*\(?\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*\)?\s*$/,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = s.match(patterns[i]);
    if (m) {
      var lat = Number(m[1]);
      var lng = Number(m[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}

/** Link dạng rút gọn / địa chỉ chữ cần tra cứu qua mạng. */
function needsRemoteLookup(v) {
  return !!str(v) && !parseMapsLink(v);
}

/** Link Google Maps mở được từ tọa độ (để hiển thị). */
function mapsUrlFromCoords(lat, lng) {
  return 'https://www.google.com/maps?q=' + lat + ',' + lng;
}

/* ======================= Db.gs ======================= */
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

/* ======================= Scheduler.gs ======================= */
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

/* ======================= Conflicts.gs ======================= */
/**
 * Phát hiện trùng lịch / cảnh báo, tính lịch trống và số liệu tổng quan.
 * (thuần JavaScript – kiểm thử được bằng Node)
 */

var CONFLICT_TYPES = {
  overlap: { label: 'Trùng giờ dạy', severity: 'error' },
  unavailable: { label: 'Trùng lịch bận của GV', severity: 'error' },
  blocked: { label: 'GV bị "Không xếp" tại trường', severity: 'error' },
  inactive: { label: 'GV đã ngừng hoạt động', severity: 'error' },
  unknown_teacher: { label: 'Mã GV/TG không tồn tại', severity: 'error' },
  not_free: { label: 'Trợ giảng ngoài giờ rảnh', severity: 'error' },
  invalid: { label: 'Dữ liệu TKB lỗi', severity: 'error' },
  travel: { label: 'Không đủ thời gian di chuyển giữa 2 trường', severity: 'warning' },
  over_hours: { label: 'Vượt giờ dạy tối đa', severity: 'warning' },
  too_many_schools: { label: 'Dạy quá nhiều trường', severity: 'warning' },
  untrained: { label: 'GV chưa được đào tạo chương trình', severity: 'error' },
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

  Object.keys(STAFF_ROLES).forEach(function (role) {
    var R = STAFF_ROLES[role];
    var pool = poolOf_(ctx, role);
    var who = R.short;
    var verb = role === 'assistant' ? 'trợ giảng' : 'dạy';
    function addR(type, data) { data.role = role; add(type, data); }

    var byPerson = {};
    ctx.lessonList.forEach(function (l) {
      var code = l[R.field];
      if (l.invalid || !code) return;
      if (!pool[code]) {
        addR('unknown_teacher', { lessons: [l.id], teacher: code, school: l.school, weekday: l.weekday,
          message: 'Tiết ' + lessonBrief_(ctx, l) + ' được gán mã ' + who + ' "' + code + '" không có trong danh sách ' + R.label.toLowerCase() });
        return;
      }
      (byPerson[code] = byPerson[code] || []).push(l);
    });

    Object.keys(byPerson).sort().forEach(function (code) {
      var t = pool[code];
      var list = byPerson[code];
      var load = 0;
      var schools = {};
      if (!t.active) {
        addR('inactive', { teacher: code, lessons: list.map(function (l) { return l.id; }),
          message: t.name + ' (' + who + ') đã ngừng hoạt động nhưng vẫn còn ' + list.length + ' tiết được gán' });
      }
      list.forEach(function (l) {
        load += l.load;
        schools[l.school] = true;
        var link = ctx.links[code + '|' + l.school];
        if (link && link.preference === 'blocked') {
          addR('blocked', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
            message: t.name + ' bị đánh dấu "Không xếp" nhưng đang ' + verb + ' ' + lessonBrief_(ctx, l) });
        }
        t.unavailable[l.weekday].forEach(function (u) {
          if (overlaps(l.start, l.end, u.start, u.end)) {
            addR('unavailable', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
              message: t.name + ' có lịch bận ' + fmtTime(u.start) + '–' + fmtTime(u.end) + (u.reason ? ' (' + u.reason + ')' : '') +
                ' nhưng được xếp ' + lessonBrief_(ctx, l) });
          }
        });
        if (t.free && !insideFree_(t, l)) {
          addR('not_free', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
            message: t.name + ' (TG) được xếp ngoài giờ rảnh đã đăng ký: ' + lessonBrief_(ctx, l) });
        }
        if (role === 'teacher' && l.subject && !hasSubject_(t, l.subject)) {
          addR('untrained', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
            message: t.name + ' chưa được đào tạo ' + subjectName_(ctx, l.subject) + ' – ' + lessonBrief_(ctx, l) });
        }
        var d = teacherSchoolDistance(ctx, code, l.school);
        var prio = link && link.preference === 'priority';
        if (!prio && ctx.S.max_distance_km > 0 && d.km !== null && d.km > ctx.S.max_distance_km) {
          addR('too_far', { teacher: code, school: l.school, lessons: [l.id], weekday: l.weekday,
            message: t.name + ' (' + who + ') cách ' + (ctx.schools[l.school] || {}).name + ' khoảng ' + d.km + ' km (> ' + ctx.S.max_distance_km + ' km)' });
        }
      });

      // Trùng giờ & thời gian di chuyển trong từng ngày.
      for (var wd = 0; wd < 7; wd++) {
        var day = list.filter(function (l) { return l.weekday === wd; })
          .sort(function (x, y) { return x.start - y.start || x.end - y.end; });
        for (var i = 0; i < day.length; i++) {
          for (var j = i + 1; j < day.length; j++) {
            var a = day[i];
            var b = day[j];
            if (overlaps(a.start, a.end, b.start, b.end)) {
              addR('overlap', { teacher: code, lessons: [a.id, b.id], weekday: wd, school: a.school,
                message: t.name + ' (' + who + ') bị trùng lịch ' + weekdayLabel(wd) + ': ' + fmtTime(a.start) + '–' + fmtTime(a.end) + ' tại ' +
                  (ctx.schools[a.school] || {}).name + (a.className ? ' (' + a.className + ')' : '') + ' và ' +
                  fmtTime(b.start) + '–' + fmtTime(b.end) + ' tại ' + (ctx.schools[b.school] || {}).name + (b.className ? ' (' + b.className + ')' : '') });
            } else if (a.school !== b.school && j === i + 1) {
              var gap = b.start - a.end;
              var need = schoolTravelMinutes(ctx, a.school, b.school);
              if (gap < need) {
                addR('travel', { teacher: code, lessons: [a.id, b.id], weekday: wd, school: b.school,
                  message: t.name + ' (' + who + ') chỉ có ' + gap + ' phút để đi từ ' + (ctx.schools[a.school] || {}).name + ' (' + fmtTime(a.end) +
                    ') đến ' + (ctx.schools[b.school] || {}).name + ' (' + fmtTime(b.start) + '), cần khoảng ' + need + ' phút' });
              }
            }
          }
        }
      }

      if (load > t.max + 1e-9) {
        addR('over_hours', { teacher: code, lessons: [], message: t.name + ' (' + t.typeLabel + ') ' + verb + ' ' + round1(load) + 'h/tuần, vượt mức tối đa ' + t.max + 'h (định mức ' + t.target + 'h)' });
      }
      var nSchools = Object.keys(schools).length;
      if (nSchools > t.maxSchools) {
        addR('too_many_schools', { teacher: code, lessons: [], message: t.name + ' (' + who + ') đang ' + verb + ' ' + nSchools + ' trường (tối đa ' + t.maxSchools + '): ' +
          Object.keys(schools).map(function (x) { return (ctx.schools[x] || {}).name || x; }).join(', ') });
      }
    });
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
  var role = roleOf_(opts.role);
  var pool = poolOf_(ctx, role);
  var st = stateFromAssignments(ctx, null, role);
  var rows = [];
  Object.keys(pool).sort().forEach(function (code) {
    var t = pool[code];
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
    // Trợ giảng có đăng ký giờ rảnh: chỉ tính trong các khung đó.
    var windows = t.free ? t.free[weekday].map(function (f) { return [f.start, f.end]; }) : [[dayStart, dayEnd]];
    if (t.free) {
      var outside = [];
      var c0 = dayStart;
      mergeIntervals(windows).forEach(function (w) { if (w[0] > c0) outside.push([c0, w[0]]); c0 = Math.max(c0, w[1]); });
      if (c0 < dayEnd) outside.push([c0, dayEnd]);
      outside.forEach(function (o) { busy.push({ start: o[0], end: o[1], kind: 'unavailable', label: 'Không đăng ký rảnh' }); });
      busy.sort(function (a, b) { return a.start - b.start; });
    }
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
      teacher: code, role: role, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district,
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
  var st = stateFromAssignments(ctx, null, 'teacher');
  var stA = stateFromAssignments(ctx, null, 'assistant');
  var lessons = ctx.lessonList.filter(function (l) { return !l.invalid; });
  var needT = lessons.filter(function (l) { return l.needTeacher; });
  var assigned = needT.filter(function (l) { return l.teacher && ctx.teachers[l.teacher]; });
  var needTA = lessons.filter(function (l) { return l.needAssistant; });
  var withTA = needTA.filter(function (l) { return l.assistant && ctx.assistants[l.assistant]; });
  var activeAssistants = Object.keys(ctx.assistants).map(function (c) { return ctx.assistants[c]; }).filter(function (t) { return t.active; });
  var activeTeachers = Object.keys(ctx.teachers).map(function (c) { return ctx.teachers[c]; }).filter(function (t) { return t.active; });
  var activeSchools = Object.keys(ctx.schools).filter(function (c) { return ctx.schools[c].active; });

  var loads = activeTeachers.map(function (t) {
    var ts = st[t.code];
    var status = ts.load > t.max + 1e-9 ? 'over' : ts.load > t.target + 1e-9 ? 'high' : ts.load >= t.target * 0.8 ? 'ok' : ts.load > 0 ? 'low' : 'none';
    return { teacher: t.code, name: t.name, type: t.typeLabel, load: round1(ts.load), target: t.target, max: t.max,
      schools: Object.keys(ts.schools).length, status: status };
  }).sort(function (a, b) { return b.load / b.target - a.load / a.target; });
  var assistantLoads = activeAssistants.map(function (t) {
    var ts = stA[t.code];
    var status = ts.load > t.max + 1e-9 ? 'over' : ts.load > t.target + 1e-9 ? 'high' : ts.load >= t.target * 0.8 ? 'ok' : ts.load > 0 ? 'low' : 'none';
    return { teacher: t.code, role: 'assistant', name: t.name, type: t.typeLabel, load: round1(ts.load), target: t.target, max: t.max,
      schools: Object.keys(ts.schools).length, status: status };
  }).sort(function (a, b) { return b.load / b.target - a.load / a.target; });

  var unassignedBySchool = {};
  lessons.forEach(function (l) {
    if (!l.needTeacher || (l.teacher && ctx.teachers[l.teacher])) return;
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
      needTeacher: needT.length,
      schoolTeacher: lessons.length - needT.length,
      assigned: assigned.length,
      unassigned: needT.length - assigned.length,
      locked: lessons.filter(function (l) { return l.locked; }).length,
      invalid: ctx.lessonList.length - lessons.length,
      totalHours: round1(totalHours),
      capacity: round1(capacity),
      errors: conflicts.filter(function (c) { return c.severity === 'error'; }).length,
      warnings: conflicts.filter(function (c) { return c.severity === 'warning'; }).length,
      overloaded: loads.filter(function (l) { return l.status === 'over'; }).length,
      underloaded: loads.filter(function (l) { return l.status === 'low' || l.status === 'none'; }).length,
      assistants: activeAssistants.length,
      needTA: needTA.length,
      withTA: withTA.length,
      missingTA: needTA.length - withTA.length,
    },
    loads: loads,
    assistantLoads: assistantLoads,
    unassignedBySchool: Object.keys(unassignedBySchool).map(function (s) {
      return { school: s, name: (ctx.schools[s] || {}).name || s, count: unassignedBySchool[s] };
    }).sort(function (a, b) { return b.count - a.count; }),
    subjects: Object.keys(subjectStats).map(function (k) { return subjectStats[k]; }).sort(function (a, b) { return (b.hoursPerTrained || 999) - (a.hoursPerTrained || 999); }),
    districts: Object.keys(districts).map(function (k) { var d = districts[k]; d.hours = round1(d.hours); return d; })
      .sort(function (a, b) { return b.schools - a.schools; }),
  };
}

/* ======================= Auth.gs ======================= */
/**
 * Xác thực & phân quyền.
 *
 * Cách 1 (khuyến nghị): Web App triển khai "Execute as: Me" + "Who has access:
 * Anyone within kdi.edu.vn" → Google tự đăng nhập bằng tài khoản Workspace
 * @kdi.edu.vn, script đọc email qua Session.getActiveUser().
 *
 * Cách 2 (dự phòng): nếu không đọc được email (vd. triển khai cho "Anyone"),
 * người dùng nhập email @kdi.edu.vn → nhận mã 6 số qua email → nhận phiên đăng nhập.
 */

var OTP_TTL_SEC = 600;
var SESSION_TTL_SEC = 21600; // 6 giờ – giới hạn tối đa của CacheService

function hasPerm(user, perm) {
  if (!user || !user.role) return false;
  var roles = PERMISSIONS[perm];
  return !!roles && roles.indexOf(user.role) >= 0;
}

function permsOf_(role) {
  return Object.keys(PERMISSIONS).filter(function (p) { return PERMISSIONS[p].indexOf(role) >= 0; });
}

function activeGoogleEmail_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  return normEmail(email);
}

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join('');
}

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}

/** Xác định người dùng hiện tại. Trả về { status, ...thông tin } */
function resolveUser_(token) {
  var email = activeGoogleEmail_();
  var via = 'google';
  if (!email && token) {
    var cached = CacheService.getScriptCache().get('sess_' + hash_(String(token)));
    if (cached) { email = normEmail(cached); via = 'otp'; }
  }
  if (!email) return { status: 'anonymous' };
  if (!isAllowedEmail(email)) return { status: 'forbidden', email: email };

  var user = Db.findByKey('users', email);
  if (!user) user = createUserOnFirstLogin_(email);
  if (!toBool(user.active, true)) return { status: 'disabled', email: email };

  var role = isSuperAdmin(email) ? 'admin' : (ROLES[user.role] ? user.role : 'pending');
  touchLastLogin_(user);
  var teacher = findTeacherByEmail_(email);
  return {
    status: role === 'pending' ? 'pending' : 'ok',
    email: email,
    name: user.name || (teacher ? teacher.name : email.split('@')[0]),
    role: role,
    roleLabel: ROLES[role],
    isSuperAdmin: isSuperAdmin(email),
    teacherCode: teacher ? str(teacher.code).toUpperCase() : '',
    via: via,
    perms: permsOf_(role),
  };
}

/** GV hoặc trợ giảng có email này (để tự nhận diện "Lịch của tôi"). */
function findTeacherByEmail_(email) {
  var tables = ['teachers', 'assistants'];
  for (var k = 0; k < tables.length; k++) {
    var rows = Db.read(tables[k]);
    for (var i = 0; i < rows.length; i++) {
      if (normEmail(rows[i].email) === email) return rows[i];
    }
  }
  return null;
}

function createUserOnFirstLogin_(email) {
  return withLock_(function () {
    var existing = Db.findByKey('users', email);
    if (existing) return existing;
    var role;
    if (isSuperAdmin(email)) role = 'admin';
    else if (findTeacherByEmail_(email)) role = 'teacher';
    else role = getSettings_().new_user_role || 'viewer';
    var teacher = findTeacherByEmail_(email);
    var user = { email: email, name: teacher ? teacher.name : '', role: role, active: true, addedBy: 'Tự đăng ký', createdAt: nowString(), lastLogin: nowString() };
    Db.append('users', [user]);
    audit_(email, 'Tài khoản mới', 'NguoiDung', 'Vai trò: ' + ROLES[role]);
    return Db.findByKey('users', email) || user;
  });
}

function touchLastLogin_(user) {
  var cache = CacheService.getScriptCache();
  var key = 'seen_' + hash_(user.email);
  if (cache.get(key)) return;
  cache.put(key, '1', 3600);
  try {
    withLock_(function () {
      var u = Db.findByKey('users', normEmail(user.email));
      if (u) Db.update('users', [{ _row: u._row, lastLogin: nowString() }]);
    });
  } catch (e) {
    // Không quan trọng – bỏ qua nếu đang bận.
  }
}

/* --------------------------- Đăng nhập bằng mã OTP --------------------------- */

function requestLoginCode_(email) {
  email = normEmail(email);
  if (!isAllowedEmail(email)) throw new Error('Chỉ chấp nhận email nội bộ @' + APP.ALLOWED_DOMAINS.join(', @'));
  var cache = CacheService.getScriptCache();
  var rlKey = 'otp_rl_' + hash_(email);
  if (cache.get(rlKey)) throw new Error('Vui lòng đợi 60 giây trước khi yêu cầu mã mới.');
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp_' + hash_(email), JSON.stringify({ h: hash_(code + secret_()), n: 0 }), OTP_TTL_SEC);
  cache.put(rlKey, '1', 60);
  MailApp.sendEmail({
    to: email,
    subject: '[KDI Scheduler] Mã đăng nhập: ' + code,
    htmlBody: '<p>Xin chào,</p><p>Mã đăng nhập hệ thống xếp lịch KDI của bạn là: <b style="font-size:20px">' + code +
      '</b></p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>',
  });
  var res = { sent: true, email: email };
  if (PropertiesService.getScriptProperties().getProperty('DEV_SHOW_OTP') === 'true') res.devCode = code;
  return res;
}

function verifyLoginCode_(email, code) {
  email = normEmail(email);
  if (!isAllowedEmail(email)) throw new Error('Email không hợp lệ.');
  var cache = CacheService.getScriptCache();
  var key = 'otp_' + hash_(email);
  var raw = cache.get(key);
  if (!raw) throw new Error('Mã đã hết hạn hoặc chưa được gửi. Vui lòng yêu cầu mã mới.');
  var data = JSON.parse(raw);
  if (data.n >= 5) {
    cache.remove(key);
    throw new Error('Nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.');
  }
  if (hash_(String(code).trim() + secret_()) !== data.h) {
    data.n++;
    cache.put(key, JSON.stringify(data), OTP_TTL_SEC);
    throw new Error('Mã không đúng.');
  }
  cache.remove(key);
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  cache.put('sess_' + hash_(token), email, SESSION_TTL_SEC);
  return { token: token };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + hash_(String(token)));
  return { ok: true };
}

/* ----------------------------- Quản lý người dùng ----------------------------- */

function listUsers_() {
  return Db.read('users').map(function (u) {
    return {
      email: normEmail(u.email), name: u.name, role: isSuperAdmin(u.email) ? 'admin' : u.role,
      roleLabel: ROLES[isSuperAdmin(u.email) ? 'admin' : u.role] || u.role,
      active: toBool(u.active, true), addedBy: u.addedBy, createdAt: u.createdAt, lastLogin: u.lastLogin,
      isSuperAdmin: isSuperAdmin(u.email),
    };
  }).sort(function (a, b) { return a.email < b.email ? -1 : 1; });
}

/**
 * Thêm/sửa người dùng. Quy tắc:
 *  - Chỉ email @kdi.edu.vn.
 *  - Chỉ super admin (hien.le@kdi.edu.vn) được cấp hoặc thu hồi quyền admin.
 *  - Không ai được đổi vai trò/khóa tài khoản super admin.
 */
function saveUser_(actor, input) {
  var email = normEmail(input.email);
  if (!isAllowedEmail(email)) throw new Error('Chỉ thêm được email nội bộ @' + APP.ALLOWED_DOMAINS.join(', @'));
  var role = String(input.role || 'viewer');
  if (!ROLES[role]) throw new Error('Vai trò không hợp lệ.');
  return withLock_(function () {
    var existing = Db.findByKey('users', email);
    if (isSuperAdmin(email)) {
      if (role !== 'admin' || input.active === false) throw new Error('Không thể thay đổi vai trò hoặc khóa tài khoản quản trị gốc.');
    }
    var touchesAdmin = role === 'admin' || (existing && existing.role === 'admin');
    if (touchesAdmin && !actor.isSuperAdmin) {
      throw new Error('Chỉ quản trị gốc (' + APP.SUPER_ADMIN + ') mới được cấp/thu hồi quyền Admin.');
    }
    var active = input.active === undefined ? true : !!input.active;
    if (existing) {
      Db.update('users', [{ _row: existing._row, name: str(input.name) || existing.name, role: role, active: active }]);
      audit_(actor, 'Cập nhật người dùng', email, 'Vai trò: ' + ROLES[role] + (active ? '' : ' (khóa)'));
    } else {
      Db.append('users', [{ email: email, name: str(input.name), role: role, active: active, addedBy: actor.email, createdAt: nowString(), lastLogin: '' }]);
      audit_(actor, 'Thêm người dùng', email, 'Vai trò: ' + ROLES[role]);
    }
    return listUsers_();
  });
}

function deleteUser_(actor, email) {
  email = normEmail(email);
  if (isSuperAdmin(email)) throw new Error('Không thể xóa tài khoản quản trị gốc.');
  if (email === actor.email) throw new Error('Không thể tự xóa tài khoản của mình.');
  return withLock_(function () {
    var u = Db.findByKey('users', email);
    if (!u) throw new Error('Không tìm thấy người dùng.');
    if (u.role === 'admin' && !actor.isSuperAdmin) throw new Error('Chỉ quản trị gốc mới được xóa Admin.');
    Db.remove('users', [u._row]);
    audit_(actor, 'Xóa người dùng', email, '');
    return listUsers_();
  });
}

/* ======================= Api.gs ======================= */
/**
 * API cho giao diện web: client gọi google.script.run.api(action, args, token).
 * Mọi thao tác đi qua một điểm duy nhất để kiểm tra đăng nhập + phân quyền tập trung.
 * Kết quả trả về dạng chuỗi JSON (google.script.run không truyền được Date).
 */

function api(action, args, token) {
  var res;
  try {
    res = { ok: true, data: dispatch_(String(action || ''), args || {}, token || '') };
  } catch (e) {
    res = { ok: false, error: e && e.message ? e.message : String(e), code: (e && e.code) || '' };
    if (!e || !e.userFacing) console.error('API ' + action + ': ' + (e && e.stack ? e.stack : e));
  }
  return JSON.stringify(res);
}

function userError_(msg, code) {
  var e = new Error(msg);
  e.userFacing = true;
  if (code) e.code = code;
  return e;
}

function dispatch_(action, args, token) {
  if (action === 'auth.requestCode') return requestLoginCode_(args.email);
  if (action === 'auth.verifyCode') return verifyLoginCode_(args.email, args.code);
  if (action === 'auth.logout') return logout_(token);

  var user = resolveUser_(token);
  if (action === 'auth.me') return publicUser_(user);
  // Khởi động: gộp "ai đang đăng nhập" + dữ liệu ban đầu vào 1 lần gọi.
  if (action === 'app.start') return user.status === 'ok' ? bootstrap_(args, user) : { user: publicUser_(user) };
  if (user.status !== 'ok') throw userError_(authMessage_(user), 'AUTH');

  var def = ACTIONS[action];
  if (!def) throw userError_('Thao tác không hợp lệ: ' + action);
  var perms = def.perm ? [].concat(def.perm) : [];
  if (perms.length && !perms.some(function (p) { return hasPerm(user, p); })) {
    throw userError_('Bạn không có quyền thực hiện thao tác này (vai trò: ' + user.roleLabel + ').', 'FORBIDDEN');
  }
  return def.fn(args, user);
}

function authMessage_(user) {
  switch (user.status) {
    case 'anonymous': return 'Vui lòng đăng nhập bằng email @' + APP.ALLOWED_DOMAINS[0] + '.';
    case 'forbidden': return 'Tài khoản ' + user.email + ' không thuộc KDI. Chỉ chấp nhận email @' + APP.ALLOWED_DOMAINS.join(', @') + '.';
    case 'disabled': return 'Tài khoản ' + user.email + ' đã bị khóa. Liên hệ quản trị viên.';
    case 'pending': return 'Tài khoản ' + user.email + ' đang chờ quản trị viên phân quyền.';
    default: return 'Chưa đăng nhập.';
  }
}

function publicUser_(user) {
  var out = { status: user.status, email: user.email || '' };
  if (user.role) {
    out.name = user.name;
    out.role = user.role;
    out.roleLabel = user.roleLabel;
    out.isSuperAdmin = user.isSuperAdmin;
    out.teacherCode = user.teacherCode;
    out.perms = user.perms;
    out.via = user.via;
  }
  if (user.status !== 'ok') out.message = authMessage_(user);
  return out;
}

/* ------------------------------- Tiện ích ------------------------------- */

var CONTEXT_TABLES = ['subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'distances', 'lessons'];

function loadAll_() {
  var data = {};
  CONTEXT_TABLES.forEach(function (t) { data[t] = Db.read(t); });
  return data;
}

function context_() {
  return buildContext(loadAll_(), getSettings_());
}

function personName_(ctx, code) {
  var p = ctx.people[code];
  return p ? p.name : (code ? code + ' (?)' : '');
}

function lessonDto_(ctx, l, cidx) {
  var s = ctx.schools[l.school];
  var subj = ctx.subjects[l.subject];
  return {
    id: l.id, school: l.school, schoolName: s ? s.name : l.school, district: s ? s.district : '',
    weekday: l.weekday, weekdayLabel: weekdayLabel(l.weekday), start: l.start, end: l.end,
    startText: fmtTime(l.start), endText: fmtTime(l.end), className: l.className, grade: l.grade,
    subject: l.subject, subjectName: subj ? subj.name : l.subject, color: subj ? subj.color : '', subjectFromClass: l.subjectFromClass,
    periods: l.periods, room: l.room, teacher: l.teacher, teacherName: personName_(ctx, l.teacher),
    needTeacher: l.needTeacher, needTeacherRaw: l.needTeacherRaw || '', needAssistant: l.needAssistant, needAssistantRaw: l.needRaw || '', assistant: l.assistant, assistantName: personName_(ctx, l.assistant),
    locked: l.locked, source: l.source, explain: l.explain, explainTA: l.explainTA || '', notes: l.notes, load: round1(l.load),
    invalid: l.invalid, conflict: cidx ? (cidx[l.id] || '') : '',
  };
}

function teacherInfo_(ctx, t, user) {
  var o = {
    code: t.code, role: t.role, roleLabel: STAFF_ROLES[t.role].label, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district,
    subjects: t.subjects.map(function (c) { return { code: c, name: subjectName_(ctx, c) }; }),
    target: t.target, max: t.max, maxSchools: t.maxSchools, active: t.active,
  };
  if (hasPerm(user, 'view_personal') || (user.teacherCode && user.teacherCode === t.code)) {
    var raw = Db.findByKey(STAFF_ROLES[t.role].pool, t.code) || {};
    o.email = raw.email || '';
    o.phone = raw.phone || '';
    o.address = raw.address || '';
    o.mapUrl = raw.mapUrl || (hasCoords_(t) ? mapsUrlFromCoords(t.lat, t.lng) : '');
    o.notes = raw.notes || '';
  }
  return o;
}

/** Lịch của 1 người (GV hoặc trợ giảng). */
function teacherSchedule_(ctx, code, user) {
  code = str(code).toUpperCase();
  var t = ctx.people[code];
  if (!t) throw userError_('Không tìm thấy giáo viên / trợ giảng ' + code);
  var field = STAFF_ROLES[t.role].field;
  var conflicts = detectConflicts(ctx).filter(function (c) { return c.teacher === code; });
  var cidx = conflictIndex(conflicts);
  var lessons = ctx.lessonList.filter(function (l) { return !l.invalid && l[field] === code; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start; });
  var personal = hasPerm(user, 'view_personal');
  var bySchool = {};
  lessons.forEach(function (l) {
    var e = bySchool[l.school] = bySchool[l.school] || { code: l.school, name: (ctx.schools[l.school] || {}).name, lessons: 0, hours: 0 };
    e.lessons++;
    e.hours += l.load;
  });
  var schools = Object.keys(bySchool).map(function (k) {
    var e = bySchool[k];
    e.hours = round1(e.hours);
    e.priority = isPriority_(ctx, code, k);
    if (personal) {
      var d = teacherSchoolDistance(ctx, code, k);
      e.distance = d.km;
      e.distanceSource = d.source;
    }
    return e;
  });
  var load = lessons.reduce(function (s, l) { return s + l.load; }, 0);
  var out = {
    teacher: teacherInfo_(ctx, t, user),
    lessons: lessons.map(function (l) { return lessonDto_(ctx, l, cidx); }),
    load: round1(load), schools: schools, conflicts: conflicts,
    unavailable: [], free: null,
  };
  t.unavailable.forEach(function (list, wd) {
    list.forEach(function (u) {
      out.unavailable.push({ weekday: wd, weekdayLabel: weekdayLabel(wd), start: u.start, end: u.end, startText: fmtTime(u.start), endText: fmtTime(u.end), reason: personal ? u.reason : '' });
    });
  });
  if (t.free) {
    out.free = [];
    t.free.forEach(function (list, wd) {
      list.forEach(function (f) { out.free.push({ weekday: wd, weekdayLabel: weekdayLabel(wd), start: f.start, end: f.end, startText: fmtTime(f.start), endText: fmtTime(f.end) }); });
    });
  }
  if (personal) {
    out.priorityLinks = Object.keys(ctx.links).filter(function (k) { return k.indexOf(code + '|') === 0 && ctx.links[k].preference; })
      .map(function (k) {
        var sc = k.split('|')[1];
        return { school: sc, name: (ctx.schools[sc] || {}).name || sc, preference: ctx.links[k].preference };
      });
    out.nearestSchools = Object.keys(ctx.schools).filter(function (sc) { return ctx.schools[sc].active; })
      .map(function (sc) {
        var d = teacherSchoolDistance(ctx, code, sc);
        return { school: sc, name: ctx.schools[sc].name, district: ctx.schools[sc].district, distance: d.km, source: d.source, minutes: d.minutes || null, priority: isPriority_(ctx, code, sc) };
      })
      .filter(function (x) { return x.distance !== null; })
      .sort(function (a, b) { return a.distance - b.distance; }).slice(0, 8);
  }
  return out;
}

function schoolSchedule_(ctx, code, user) {
  code = str(code).toUpperCase();
  var s = ctx.schools[code];
  if (!s) throw userError_('Không tìm thấy trường ' + code);
  var conflicts = detectConflicts(ctx);
  var cidx = conflictIndex(conflicts);
  var lessons = ctx.lessonList.filter(function (l) { return l.school === code; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start || (a.className < b.className ? -1 : 1); });
  function staff(field) {
    var map = {};
    lessons.forEach(function (l) {
      var c = l[field];
      if (!c) return;
      var p = ctx.people[c];
      var e = map[c] = map[c] || { code: c, name: p ? p.name : c, type: p ? p.typeLabel : '', lessons: 0, hours: 0 };
      e.lessons++;
      e.hours += l.load;
    });
    return Object.keys(map).map(function (k) { map[k].hours = round1(map[k].hours); return map[k]; });
  }
  var classes = Object.keys(ctx.classes).filter(function (k) { return k.indexOf(code + '|') === 0; }).map(function (k) {
    var c = ctx.classes[k];
    return { className: k.split('|')[1], grade: c.grade, subject: c.subject, subjectName: subjectName_(ctx, c.subject), needAssistant: c.needAssistant, needTeacher: c.needTeacher };
  });
  var raw = Db.findByKey('schools', code) || {};
  return {
    school: {
      code: s.code, name: s.name, district: s.district, level: raw.level || '', address: raw.address || '',
      mapUrl: raw.mapUrl || (hasCoords_(s) ? mapsUrlFromCoords(s.lat, s.lng) : ''),
      contact: raw.contact || '', phone: raw.phone || '', sale: raw.sale || '', notes: raw.notes || '', active: s.active,
    },
    lessons: lessons.map(function (l) { return lessonDto_(ctx, l, cidx); }),
    teachers: staff('teacher'),
    assistants: staff('assistant'),
    classes: classes,
    unassigned: lessons.filter(function (l) { return !l.invalid && l.needTeacher && !l.teacher; }).length,
    missingTA: lessons.filter(function (l) { return !l.invalid && l.needAssistant && !l.assistant; }).length,
    conflicts: conflicts.filter(function (c) {
      return (c.lessons || []).some(function (id) { return ctx.lessons[id] && ctx.lessons[id].school === code; });
    }),
  };
}

/* ------------------------------ Tiết dạy (TKB) ------------------------------ */

/** Chuẩn hóa dữ liệu 1 tiết từ form/dán Excel. Trả về { obj, error }. */
function normalizeLessonInput_(ctx, input) {
  var school = str(input.school).toUpperCase();
  if (!ctx.schools[school]) return { error: 'Mã trường "' + school + '" không tồn tại' };
  var wd = parseWeekday(input.weekday);
  if (wd < 0) return { error: 'Thứ "' + input.weekday + '" không hợp lệ' };
  var start = parseTime(input.start);
  var end = parseTime(input.end);
  if (start === null) return { error: 'Giờ bắt đầu "' + input.start + '" không hợp lệ' };
  if (end === null) return { error: 'Giờ kết thúc "' + input.end + '" không hợp lệ' };
  if (end <= start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu' };
  var subject = str(input.subject).toUpperCase();
  var cls = ctx.classes[school + '|' + str(input.className).toUpperCase()];
  if (!subject && !cls) return { error: 'Thiếu chương trình/môn: lớp "' + str(input.className) + '" chưa khai báo trong sheet LopHoc, hãy ghi Mã môn' };
  if (subject && !ctx.subjects[subject]) {
    var found = findSubjectByName_(ctx, input.subject);
    if (!found) return { error: 'Môn "' + input.subject + '" không có trong danh mục môn học (dùng mã môn hoặc tên môn)' };
    subject = found;
  }
  var periods = toNum(input.periods);
  var need = str(input.needAssistant);
  if (need) {
    var n = removeDiacritics_(need).toLowerCase();
    need = /^(co|x|true|1|yes)$/.test(n) ? 'Có' : /^(khong|false|0|no)$/.test(n) ? 'Không' : '';
  }
  return {
    obj: {
      school: school, weekday: weekdayLabel(wd), start: fmtTime(start), end: fmtTime(end),
      className: str(input.className), grade: str(input.grade) || (cls ? cls.grade : ''), subject: subject,
      periods: periods === null ? 1 : periods, room: str(input.room), notes: str(input.notes), needAssistant: need,
      needTeacher: str(input.needTeacher) ? (yesNo_(input.needTeacher, true) ? 'Có' : 'Không') : '',
    },
  };
}

/** Tìm mã môn theo tên: khớp đúng tên, hoặc tên chứa từ khóa nếu chỉ có 1 môn khớp. */
function findSubjectByName_(ctx, text) {
  var q = removeDiacritics_(str(text)).toLowerCase();
  if (!q) return '';
  var codes = Object.keys(ctx.subjects);
  var exact = codes.filter(function (k) { return removeDiacritics_(ctx.subjects[k].name).toLowerCase() === q; });
  if (exact.length === 1) return exact[0];
  var partial = codes.filter(function (k) { return removeDiacritics_(ctx.subjects[k].name).toLowerCase().indexOf(q) >= 0; });
  return partial.length === 1 ? partial[0] : '';
}

function saveLesson_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var input = args.lesson || {};
    var norm = normalizeLessonInput_(ctx, input);
    if (norm.error) throw userError_(norm.error);
    var obj = norm.obj;
    obj.updatedAt = nowString();
    obj.updatedBy = user.email;
    var id = str(input.id);
    var existing = id ? ctx.lessons[id] : null;
    if (id && !existing) throw userError_('Không tìm thấy tiết ' + id);
    var wantTeacher = 'teacher' in input ? str(input.teacher).toUpperCase() : (existing ? existing.teacher : '');
    if (wantTeacher !== (existing ? existing.teacher : '')) {
      if (!hasPerm(user, 'assign')) throw userError_('Bạn không có quyền phân công giáo viên.', 'FORBIDDEN');
      if (wantTeacher && !ctx.teachers[wantTeacher]) throw userError_('Mã GV "' + wantTeacher + '" không tồn tại');
      obj.teacher = wantTeacher;
      obj.source = wantTeacher ? 'Thủ công' : '';
      obj.explain = '';
    }
    var wantTA = 'assistant' in input ? str(input.assistant).toUpperCase() : (existing ? existing.assistant : '');
    if (wantTA !== (existing ? existing.assistant : '')) {
      if (!hasPerm(user, 'assign')) throw userError_('Bạn không có quyền phân công trợ giảng.', 'FORBIDDEN');
      if (wantTA && !ctx.assistants[wantTA]) throw userError_('Mã trợ giảng "' + wantTA + '" không tồn tại');
      obj.assistant = wantTA;
      obj.explainTA = '';
    }
    if ('locked' in input && hasPerm(user, 'assign')) obj.locked = !!input.locked;
    if (existing) {
      obj._row = existing.row;
      Db.update('lessons', [obj]);
      audit_(user, 'Sửa tiết', id, obj);
    } else {
      id = nextIds_('lessons', 'TKB', 1)[0];
      obj.id = id;
      if (!('teacher' in obj)) obj.teacher = '';
      if (!('assistant' in obj)) obj.assistant = '';
      if (!('locked' in obj)) obj.locked = false;
      Db.append('lessons', [obj]);
      audit_(user, 'Thêm tiết', id, obj);
    }
    return { id: id, warnings: lessonWarnings_(id) };
  });
}

/** Cảnh báo liên quan đến 1 tiết sau khi lưu/gán. */
function lessonWarnings_(id) {
  Db.clearCache();
  var ctx = context_();
  return detectConflicts(ctx).filter(function (c) {
    var l = ctx.lessons[id];
    return (c.lessons || []).indexOf(id) >= 0 ||
      (l && !(c.lessons || []).length && c.teacher && (c.teacher === l.teacher || c.teacher === l.assistant));
  }).map(function (c) { return { severity: c.severity, label: c.label, message: c.message }; });
}

function bulkAddLessons_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var rows = args.rows || [];
    if (!rows.length) throw userError_('Không có dòng nào để thêm.');
    if (rows.length > 2000) throw userError_('Tối đa 2000 dòng mỗi lần.');
    var objs = [];
    var errors = [];
    rows.forEach(function (r, i) {
      var input = Object.assign({}, r);
      if (args.school && !input.school) input.school = args.school;
      var norm = normalizeLessonInput_(ctx, input);
      if (norm.error) { errors.push('Dòng ' + (i + 1) + ': ' + norm.error); return; }
      var o = norm.obj;
      o.teacher = '';
      o.locked = false;
      o.updatedAt = nowString();
      o.updatedBy = user.email;
      objs.push(o);
    });
    if (errors.length && !args.skipErrors) return { added: 0, removed: 0, errors: errors };
    var removed = 0;
    if (args.replaceSchool && args.school) {
      var code = str(args.school).toUpperCase();
      var rowsToRemove = Db.read('lessons').filter(function (l) { return str(l.school).toUpperCase() === code; }).map(function (l) { return l._row; });
      Db.remove('lessons', rowsToRemove);
      removed = rowsToRemove.length;
    }
    var ids = nextIds_('lessons', 'TKB', objs.length);
    objs.forEach(function (o, i) { o.id = ids[i]; });
    Db.append('lessons', objs);
    audit_(user, 'Nhập TKB', args.school || 'nhiều trường', 'Thêm ' + objs.length + ' tiết' + (removed ? ', xóa ' + removed + ' tiết cũ' : ''));
    return { added: objs.length, removed: removed, errors: errors };
  });
}

function deleteLessons_(args, user) {
  return withLock_(function () {
    var ids = (args.ids || []).map(str);
    var rows = Db.read('lessons').filter(function (l) { return ids.indexOf(str(l.id)) >= 0; });
    Db.remove('lessons', rows.map(function (l) { return l._row; }));
    audit_(user, 'Xóa tiết', ids.join(', '), rows.length + ' tiết');
    return { deleted: rows.length };
  });
}

/** Gán / bỏ gán GV (role 'teacher') hoặc trợ giảng (role 'assistant') cho 1 tiết. */
function assignLesson_(args, user) {
  var role = roleOf_(args.role);
  var R = STAFF_ROLES[role];
  return withLock_(function () {
    var ctx = context_();
    var id = str(args.id);
    var l = ctx.lessons[id];
    if (!l) throw userError_('Không tìm thấy tiết ' + id);
    var code = str(args[R.field] !== undefined ? args[R.field] : args.teacher).toUpperCase();
    var explain = '';
    if (code) {
      var t = poolOf_(ctx, role)[code];
      if (!t) throw userError_('Mã ' + R.short + ' "' + code + '" không tồn tại');
      var st = stateFromAssignments(ctx, id, role);
      explain = 'Gán tay. ' + explainText(scoreCandidate(ctx, st, t, l));
    }
    var patch = { _row: l.row, updatedAt: nowString(), updatedBy: user.email };
    patch[R.field] = code;
    if (role === 'teacher') { patch.source = code ? 'Thủ công' : ''; patch.explain = explain; }
    else patch.explainTA = explain;
    if ('locked' in args) patch.locked = !!args.locked;
    Db.update('lessons', [patch]);
    audit_(user, (code ? 'Gán ' : 'Bỏ gán ') + R.short, id, (l[R.field] || '–') + ' → ' + (code || '–'));
    return { id: id, warnings: code ? lessonWarnings_(id) : [] };
  });
}

function lockLessons_(args, user) {
  return withLock_(function () {
    var ids = (args.ids || []).map(str);
    var items = Db.read('lessons').filter(function (l) { return ids.indexOf(str(l.id)) >= 0; })
      .map(function (l) { return { _row: l._row, locked: !!args.locked }; });
    Db.update('lessons', items);
    audit_(user, args.locked ? 'Ghim tiết' : 'Bỏ ghim tiết', ids.join(', '), '');
    return { updated: items.length };
  });
}

/* --------------------------- Xếp lịch tự động --------------------------- */

var RUN_STATUS = { preview: 'Xem trước', applied: 'Đã áp dụng', reverted: 'Đã hoàn tác', discarded: 'Đã hủy' };

/** args: { mode, schools, roles: ['teacher', 'assistant'] } */
function runAuto_(args, user) {
  var roles = (args.roles && args.roles.length ? args.roles : ['teacher', 'assistant']).filter(function (r) { return STAFF_ROLES[r]; });
  if (!roles.length) throw userError_('Chọn ít nhất 1 nhóm cần xếp (GV hoặc trợ giảng).');
  return withLock_(function () {
    var ctx = context_();
    var t0 = Date.now();
    var id = 'RUN-' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd-HHmmss');
    var items = [];
    var byRole = {};
    var loads = [];
    var mode = args.mode === 'rebuild' ? 'rebuild' : 'fill';
    roles.forEach(function (role) {
      var result = runAutoSchedule(ctx, { role: role, mode: mode, schools: args.schools });
      byRole[role] = result.stats;
      result.loads.forEach(function (l) { loads.push([l.teacher, l.load, l.target, l.max, l.schools.length, role]); });
      result.proposals.forEach(function (p) {
        items.push({ runId: id, lessonId: p.lessonId, role: role, before: p.before, after: p.teacher, score: p.score, explain: p.explain });
      });
      result.unassigned.forEach(function (u) {
        items.push({ runId: id, lessonId: u.lessonId, role: role, before: u.before, after: '', score: '', explain: u.reason });
      });
    });
    var stats = {};
    Object.keys(byRole).forEach(function (r) {
      Object.keys(byRole[r]).forEach(function (k) { stats[k] = (stats[k] || 0) + byRole[r][k]; });
    });
    var summary = { stats: stats, byRole: byRole, roles: roles, ms: Date.now() - t0, scope: args.schools && args.schools.length ? args.schools : 'all', loads: loads };
    var modeLabel = (mode === 'rebuild' ? 'Xếp lại toàn bộ' : 'Điền tiết trống') + ' – ' + roles.map(function (r) { return STAFF_ROLES[r].short; }).join(' + ');
    Db.append('runs', [{ id: id, createdAt: nowString(), createdBy: user.email, mode: modeLabel, status: RUN_STATUS.preview, summary: JSON.stringify(summary) }]);
    Db.append('runItems', items);
    pruneRuns_();
    audit_(user, 'Chạy xếp lịch (xem trước)', id, byRole);
    return getRun_({ id: id }, user);
  });
}

function pruneRuns_() {
  var runs = Db.read('runs');
  if (runs.length <= APP.KEEP_RUNS) return;
  var old = runs.slice(0, runs.length - APP.KEEP_RUNS);
  var oldIds = {};
  old.forEach(function (r) { oldIds[r.id] = true; });
  var itemRows = Db.read('runItems').filter(function (it) { return oldIds[it.runId]; }).map(function (it) { return it._row; });
  Db.remove('runItems', itemRows);
  Db.remove('runs', old.map(function (r) { return r._row; }));
}

function getRun_(args, user) {
  var run = Db.findByKey('runs', str(args.id));
  if (!run) throw userError_('Không tìm thấy lần xếp lịch ' + args.id);
  var ctx = context_();
  var summary = {};
  try { summary = JSON.parse(run.summary || '{}'); } catch (e) { summary = {}; }
  var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; }).map(function (it) {
    var l = ctx.lessons[str(it.lessonId)];
    var dto = l ? lessonDto_(ctx, l, null) : { id: it.lessonId, schoolName: '(tiết đã bị xóa)' };
    var after = str(it.after).toUpperCase();
    var before = str(it.before).toUpperCase();
    var role = roleOf_(str(it.role) || 'teacher');
    return {
      lesson: dto, role: role, roleShort: STAFF_ROLES[role].short,
      before: before, beforeName: before ? personName_(ctx, before) : '',
      after: after, afterName: after ? personName_(ctx, after) : '',
      score: it.score, explain: it.explain, assigned: !!after, changed: after !== before,
    };
  });
  var loads = (summary.loads || []).map(function (a) {
    return { teacher: a[0], name: personName_(ctx, a[0]), load: a[1], target: a[2], max: a[3], schools: a[4], role: a[5] || 'teacher' };
  });
  return {
    id: run.id, createdAt: run.createdAt, createdBy: run.createdBy, mode: run.mode, status: run.status,
    appliedAt: run.appliedAt, appliedBy: run.appliedBy, stats: summary.stats || {}, byRole: summary.byRole || null,
    ms: summary.ms, scope: summary.scope, items: items, loads: loads,
  };
}

function runItemRole_(it) {
  return roleOf_(str(it.role) || 'teacher');
}

function applyRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.preview) throw userError_('Lần xếp này đang ở trạng thái "' + run.status + '", không thể áp dụng.');
    var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; });
    var lessons = {};
    Db.read('lessons').forEach(function (l) { lessons[str(l.id)] = l; });
    var patches = [];
    var skipped = 0;
    var now = nowString();
    items.forEach(function (it) {
      var role = runItemRole_(it);
      var field = STAFF_ROLES[role].field;
      var l = lessons[str(it.lessonId)];
      var before = str(it.before).toUpperCase();
      // Bỏ qua nếu tiết đã bị xóa / ghim / đổi người sau lúc chạy thử.
      if (!l || toBool(l.locked) || str(l[field]).toUpperCase() !== before) { skipped++; return; }
      var after = str(it.after).toUpperCase();
      var text = after ? it.explain : 'Chưa xếp được – ' + it.explain;
      var patch = { _row: l._row, updatedAt: now, updatedBy: user.email };
      patch[field] = after;
      if (role === 'teacher') { patch.source = after ? 'Tự động' : ''; patch.explain = text; }
      else patch.explainTA = text;
      patches.push(patch);
    });
    Db.update('lessons', patches);
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.applied, appliedAt: now, appliedBy: user.email }]);
    audit_(user, 'Áp dụng xếp lịch', run.id, 'Cập nhật ' + patches.length + ' phân công, bỏ qua ' + skipped);
    return { applied: patches.length, skipped: skipped };
  });
}

function revertRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.applied) throw userError_('Chỉ hoàn tác được lần xếp đã áp dụng.');
    var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; });
    var lessons = {};
    Db.read('lessons').forEach(function (l) { lessons[str(l.id)] = l; });
    var patches = [];
    var skipped = 0;
    var now = nowString();
    items.forEach(function (it) {
      var role = runItemRole_(it);
      var field = STAFF_ROLES[role].field;
      var l = lessons[str(it.lessonId)];
      if (!l || str(l[field]).toUpperCase() !== str(it.after).toUpperCase()) { skipped++; return; }
      var before = str(it.before).toUpperCase();
      var patch = { _row: l._row, updatedAt: now, updatedBy: user.email };
      patch[field] = before;
      if (role === 'teacher') { patch.source = before ? 'Hoàn tác' : ''; patch.explain = ''; } else patch.explainTA = '';
      patches.push(patch);
    });
    Db.update('lessons', patches);
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.reverted }]);
    audit_(user, 'Hoàn tác xếp lịch', run.id, 'Khôi phục ' + patches.length + ' phân công, bỏ qua ' + skipped);
    return { reverted: patches.length, skipped: skipped };
  });
}

function discardRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.preview) throw userError_('Chỉ hủy được bản xem trước.');
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.discarded }]);
    return { ok: true };
  });
}

function runHistory_() {
  return Db.read('runs').reverse().map(function (r) {
    var stats = {};
    try { stats = JSON.parse(r.summary || '{}').stats || {}; } catch (e) { stats = {}; }
    return { id: r.id, createdAt: r.createdAt, createdBy: r.createdBy, mode: r.mode, status: r.status, appliedAt: r.appliedAt, appliedBy: r.appliedBy, stats: stats };
  });
}

/* --------------------------- Danh mục dữ liệu --------------------------- */

var DATA_TABLES = {
  subjects: { view: 'view_schedule', edit: 'edit_teachers' },
  schools: { view: 'view_schedule', edit: 'edit_schools' },
  classes: { view: 'view_schedule', edit: 'edit_timetable' },
  teachers: { view: 'view_schedule', edit: 'edit_teachers' },
  training: { view: 'view_schedule', edit: 'edit_teachers' },
  assistants: { view: 'view_schedule', edit: 'edit_teachers' },
  assistantFree: { view: 'view_schedule', edit: 'edit_teachers' },
  links: { view: 'view_personal', edit: 'edit_teachers' },
  unavailability: { view: 'view_personal', edit: 'edit_teachers' },
  distances: { view: 'view_personal', edit: 'manage_settings' },
};
/** Bảng có ID tự sinh: tiền tố ID. */
var AUTO_ID_PREFIX = { unavailability: 'LB', assistantFree: 'LR' };

function tableMeta_(table, user) {
  var personal = hasPerm(user, 'view_personal');
  return TABLES[table].columns.filter(function (c) { return personal || !c.personal; }).map(function (c) {
    return { key: c.key, header: c.header, type: c.type || 'text', options: c.options || null, required: !!c.required, auto: !!c.auto, def: c.def };
  });
}

function dataList_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.view)) throw userError_('Bạn không có quyền xem dữ liệu này.', 'FORBIDDEN');
  var meta = tableMeta_(table, user);
  var rows = Db.read(table).map(function (r) {
    var o = { _key: Db.keyOf(table, r) };
    meta.forEach(function (c) { o[c.key] = r[c.key]; });
    return o;
  });
  return { table: table, label: TABLES[table].label, key: TABLES[table].key, columns: meta, rows: rows, canEdit: hasPerm(user, conf.edit) };
}

var CODE_FIELDS = { code: true, teacher: true, school: true, subject: true, assistant: true, person: true };

function dataSave_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.edit)) throw userError_('Bạn không có quyền sửa dữ liệu này.', 'FORBIDDEN');
  return withLock_(function () {
    var rec = normalizeRecord_(table, args.record || {});
    validateRefs_(table, rec);
    var originalKey = str(args.originalKey);
    var autoId = AUTO_ID_PREFIX[table];
    var newKey = Db.keyOf(table, Object.assign({}, rec, autoId ? { id: originalKey } : {}));
    var existing = originalKey ? Db.findByKey(table, originalKey) : null;
    if (originalKey && !existing) throw userError_('Bản ghi không còn tồn tại (có thể đã bị xóa).');
    if (existing) {
      if (!autoId && newKey !== originalKey) {
        throw userError_('Không đổi được mã/khóa của bản ghi. Hãy tạo bản ghi mới rồi xóa bản ghi cũ.');
      }
      rec._row = existing._row;
      Db.update(table, [rec]);
      audit_(user, 'Sửa ' + TABLES[table].label, originalKey, rec);
    } else {
      if (autoId) {
        rec.id = nextIds_(table, autoId, 1)[0];
        newKey = rec.id;
      } else if (Db.findByKey(table, newKey)) {
        throw userError_('Đã tồn tại bản ghi với mã/khóa "' + newKey + '".');
      }
      TABLES[table].columns.forEach(function (c) {
        if (!(c.key in rec) && c.def !== undefined) rec[c.key] = c.def;
      });
      Db.append(table, [rec]);
      audit_(user, 'Thêm ' + TABLES[table].label, newKey, rec);
    }
    return { key: newKey };
  });
}

/** Chuẩn hóa 1 bản ghi danh mục từ form / file Excel (chỉ các trường có trong input). */
function normalizeRecord_(table, input) {
  var rec = {};
  TABLES[table].columns.forEach(function (c) {
    if (!(c.key in input) || c.auto) return;
    var v = input[c.key];
    if (c.type === 'bool') v = toBool(v, c.def);
    else if (c.type === 'number') {
      if (str(v) && toNum(v) === null) throw userError_(c.header + ': "' + v + '" không phải là số');
      v = toNum(v);
      if (v === null) v = '';
    } else if (c.type === 'time') {
      var t = parseTime(v);
      if (str(v) && t === null) throw userError_(c.header + ': giờ "' + v + '" không hợp lệ (vd. 07:30)');
      v = t === null ? '' : fmtTime(t);
    } else if (c.type === 'weekday') {
      var w = parseWeekday(v);
      if (w < 0) throw userError_(c.header + ': thứ "' + v + '" không hợp lệ (Thứ 2 … Thứ 7, Chủ nhật)');
      v = weekdayLabel(w);
    } else if (c.type === 'subjects') v = (Array.isArray(v) ? v : splitList(v)).map(function (x) { return str(x).toUpperCase(); }).join(', ');
    else v = str(v);
    if (CODE_FIELDS[c.key] && typeof v === 'string') v = v.toUpperCase();
    if (c.key === 'email') v = normEmail(v);
    if (c.required && (v === '' || v === null)) throw userError_('Thiếu thông tin bắt buộc: ' + c.header);
    if (c.options && v) {
      var match = c.options.filter(function (o) { return removeDiacritics_(o).toLowerCase() === removeDiacritics_(v).toLowerCase(); })[0];
      if (!match) throw userError_(c.header + ': giá trị "' + v + '" không hợp lệ (chọn: ' + c.options.join(', ') + ')');
      v = match;
    }
    rec[c.key] = v;
  });
  if ((table === 'unavailability' || table === 'assistantFree') && rec.start && rec.end && parseTime(rec.end) <= parseTime(rec.start)) {
    throw userError_('Giờ kết thúc phải sau giờ bắt đầu.');
  }
  // Link Google Maps → tự lấy Vĩ độ/Kinh độ (link rút gọn / địa chỉ chữ: tra cứu khi bấm "Cập nhật Google Maps").
  if ('mapUrl' in rec && TABLES[table].columns.some(function (c) { return c.key === 'lat'; })) {
    var hasLatLng = str(input.lat) !== '' && str(input.lng) !== '' && 'lat' in rec && rec.lat !== '';
    var parsed = parseMapsLink(rec.mapUrl);
    if (parsed) { rec.lat = parsed.lat; rec.lng = parsed.lng; }
    else if (rec.mapUrl && !hasLatLng) { rec.lat = ''; rec.lng = ''; }
  }
  return rec;
}

/** Tập mã đang có (để kiểm tra tham chiếu nhanh khi nhập nhiều dòng). */
function refSets_() {
  var sets = { teachers: {}, schools: {}, subjects: {}, assistants: {} };
  Object.keys(sets).forEach(function (t) {
    Db.read(t).forEach(function (r) { sets[t][str(r.code).toUpperCase()] = true; });
  });
  return sets;
}

var REF_TYPES = {
  school: { sets: ['schools'], label: 'Mã trường' },
  teacher: { sets: ['teachers'], label: 'Mã GV' },
  assistant: { sets: ['assistants'], label: 'Mã trợ giảng' },
  person: { sets: ['teachers', 'assistants'], label: 'Mã GV/TG' },
  subject: { sets: ['subjects'], label: 'Mã môn' },
};

/** Kiểm tra các cột mã tham chiếu (trường, GV, TG, môn) có tồn tại. */
function validateRefs_(table, rec, refs) {
  refs = refs || refSets_();
  TABLES[table].columns.forEach(function (c) {
    var rt = REF_TYPES[c.type];
    var v = rec[c.key];
    if (!rt || v === undefined || v === '') return;
    if (!rt.sets.some(function (set) { return refs[set][v]; })) throw userError_(rt.label + ' "' + v + '" không tồn tại.');
  });
  if (table === 'teachers' && rec.subjects) {
    var bad = splitList(rec.subjects).filter(function (c) { return !refs.subjects[c]; });
    if (bad.length) throw userError_('Mã môn không tồn tại: ' + bad.join(', '));
  }
  if ((table === 'teachers' || table === 'assistants') && rec.email && !isAllowedEmail(rec.email)) {
    throw userError_('Email phải là email @' + APP.ALLOWED_DOMAINS[0]);
  }
  if (table === 'assistants' && rec.code && refs.teachers[rec.code]) throw userError_('Mã TG "' + rec.code + '" trùng với mã một GV – hãy dùng mã khác (vd. TG001).');
  if (table === 'teachers' && rec.code && refs.assistants[rec.code]) throw userError_('Mã GV "' + rec.code + '" trùng với mã một trợ giảng.');
}

function dataDelete_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.edit)) throw userError_('Bạn không có quyền xóa dữ liệu này.', 'FORBIDDEN');
  return withLock_(function () {
    var key = str(args.key);
    var rec = Db.findByKey(table, key);
    if (!rec) throw userError_('Không tìm thấy bản ghi.');
    var refField = { teachers: 'teacher', schools: 'school', subjects: 'subject', assistants: 'assistant' }[table];
    if (refField) {
      var used = Db.read('lessons').filter(function (l) { return str(l[refField]).toUpperCase() === key; }).length;
      if (used) throw userError_('Đang được dùng trong ' + used + ' tiết của TKB. Hãy chuyển "Hoạt động" sang tắt thay vì xóa.');
      if (table === 'subjects' || table === 'schools') {
        var usedC = Db.read('classes').filter(function (c) { return str(c[refField]).toUpperCase() === key; }).length;
        if (usedC) throw userError_('Đang được dùng trong ' + usedC + ' lớp (sheet LopHoc).');
      }
    }
    Db.remove(table, [rec._row]);
    audit_(user, 'Xóa ' + TABLES[table].label, key, '');
    return { deleted: 1 };
  });
}

/* ------------------------------ Danh sách tổng hợp ------------------------------ */

function overviewLists_(args, user) {
  var ctx = context_();
  var conflicts = detectConflicts(ctx);
  var confByTeacher = {};
  var confBySchool = {};
  conflicts.forEach(function (c) {
    if (c.teacher) confByTeacher[c.teacher] = (confByTeacher[c.teacher] || 0) + 1;
    (c.lessons || []).forEach(function (id) {
      var l = ctx.lessons[id];
      if (l) confBySchool[l.school] = (confBySchool[l.school] || 0) + 1;
    });
  });
  var people = [];
  Object.keys(STAFF_ROLES).forEach(function (role) {
    var st = stateFromAssignments(ctx, null, role);
    var pool = poolOf_(ctx, role);
    Object.keys(pool).sort().forEach(function (code) {
      var t = pool[code];
      var ts = st[code];
      var lessonsCount = ts.byDay.reduce(function (s, d) { return s + d.length; }, 0);
      people.push({ code: code, role: role, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district, active: t.active,
        load: round1(ts.load), target: t.target, max: t.max, lessons: lessonsCount, schools: Object.keys(ts.schools).length,
        conflicts: confByTeacher[code] || 0 });
    });
  });
  var schoolStats = {};
  ctx.lessonList.forEach(function (l) {
    var e = schoolStats[l.school] = schoolStats[l.school] || { lessons: 0, assigned: 0, teachers: {}, hours: 0, needTA: 0, withTA: 0 };
    e.lessons++;
    e.hours += l.load;
    if (!l.needTeacher || (l.teacher && ctx.teachers[l.teacher])) e.assigned++;
    if (l.teacher && ctx.teachers[l.teacher]) e.teachers[l.teacher] = true;
    if (!l.invalid && l.needAssistant) { e.needTA++; if (l.assistant && ctx.assistants[l.assistant]) e.withTA++; }
  });
  var schools = Object.keys(ctx.schools).sort().map(function (code) {
    var s = ctx.schools[code];
    var e = schoolStats[code] || { lessons: 0, assigned: 0, teachers: {}, hours: 0, needTA: 0, withTA: 0 };
    return { code: code, name: s.name, district: s.district, active: s.active, lessons: e.lessons, assigned: e.assigned,
      hours: round1(e.hours), teachers: Object.keys(e.teachers).length, needTA: e.needTA, withTA: e.withTA, conflicts: confBySchool[code] || 0 };
  });
  return { teachers: people, schools: schools };
}

function listLessons_(args, user) {
  var ctx = context_();
  var cidx = conflictIndex(detectConflicts(ctx));
  return ctx.lessonList.map(function (l) { return lessonDto_(ctx, l, cidx); })
    .sort(function (a, b) { return a.school < b.school ? -1 : a.school > b.school ? 1 : (a.weekday - b.weekday) || ((a.start || 0) - (b.start || 0)); });
}

function bootstrap_(args, user) {
  var out = {
    user: publicUser_(user),
    app: { name: APP.NAME, title: APP.TITLE, version: APP.VERSION, superAdmin: APP.SUPER_ADMIN, domains: APP.ALLOWED_DOMAINS },
    roles: ROLES, weekdays: WEEKDAYS, teacherTypes: TEACHER_TYPES, ratings: RATINGS, preferences: PREFERENCES,
    lookups: { schools: [], teachers: [], assistants: [], classes: [], subjects: [], districts: [] },
    staffRoles: STAFF_ROLES, yesNo: YES_NO,
  };
  var s = getSettings_();
  out.settings = { day_start: s.day_start, day_end: s.day_end, load_unit: s.load_unit, min_free_minutes: s.min_free_minutes };
  out.lookups.subjects = Db.read('subjects').map(function (x) { return { code: str(x.code).toUpperCase(), name: x.name, color: x.color }; });
  if (hasPerm(user, 'view_schedule') || hasPerm(user, 'edit_timetable')) {
    var districts = {};
    out.lookups.schools = Db.read('schools').map(function (x) {
      if (x.district) districts[x.district] = true;
      return { code: str(x.code).toUpperCase(), name: x.name, district: x.district, active: toBool(x.active, true) };
    });
    out.lookups.teachers = Db.read('teachers').map(function (x) {
      if (x.district) districts[x.district] = true;
      return { code: str(x.code).toUpperCase(), name: x.name, type: x.type, district: x.district, active: toBool(x.active, true) };
    });
    out.lookups.assistants = Db.read('assistants').map(function (x) {
      if (x.district) districts[x.district] = true;
      return { code: str(x.code).toUpperCase(), name: x.name, type: 'Trợ giảng', district: x.district, active: toBool(x.active, true) };
    });
    out.lookups.classes = Db.read('classes').map(function (x) {
      return { school: str(x.school).toUpperCase(), className: str(x.className), grade: str(x.grade), subject: str(x.subject).toUpperCase(), needAssistant: str(x.needAssistant) };
    });
    out.lookups.districts = Object.keys(districts).sort();
  }
  return out;
}

/* --------------------------------- Bảng hành động --------------------------------- */

var ACTIONS = {
  'bootstrap': { fn: bootstrap_ },
  'dashboard': {
    perm: 'view_schedule', fn: function () {
      var ctx = context_();
      var conflicts = detectConflicts(ctx);
      var d = computeDashboard(ctx, conflicts);
      d.topConflicts = conflicts.slice(0, 12);
      return d;
    },
  },
  'overview.lists': { perm: 'view_schedule', fn: overviewLists_ },
  'schedule.teacher': { perm: 'view_schedule', fn: function (a, u) { return teacherSchedule_(context_(), a.code, u); } },
  'schedule.school': { perm: 'view_schedule', fn: function (a, u) { return schoolSchedule_(context_(), a.code, u); } },
  'schedule.me': {
    fn: function (a, u) {
      if (!u.teacherCode) throw userError_('Email của bạn chưa được gắn với hồ sơ giáo viên nào (cột Email trong sheet GiaoVien).');
      return teacherSchedule_(context_(), u.teacherCode, u);
    },
  },
  'schedule.free': {
    perm: 'view_schedule', fn: function (a, u) {
      var wd = Number(a.weekday);
      if (!(wd >= 0 && wd <= 6)) throw userError_('Thứ không hợp lệ.');
      var from = parseTime(a.from);
      var to = parseTime(a.to);
      if (from !== null && to !== null && to <= from) throw userError_('Khoảng giờ không hợp lệ.');
      var res = computeFreeSlots(context_(), wd, { role: a.role, from: from, to: to, subject: a.subject, district: a.district, type: a.type, school: a.school });
      if (!hasPerm(u, 'view_personal')) res.rows.forEach(function (r) { r.distance = null; r.busy.forEach(function (b) { if (b.kind === 'unavailable') b.label = 'Bận'; }); });
      return res;
    },
  },
  'conflicts.list': {
    perm: 'view_schedule', fn: function () {
      var ctx = context_();
      return detectConflicts(ctx).map(function (c) {
        c.teacherName = c.teacher && ctx.people[c.teacher] ? ctx.people[c.teacher].name : '';
        c.schoolName = c.school && ctx.schools[c.school] ? ctx.schools[c.school].name : '';
        c.weekdayLabel = c.weekday !== undefined ? weekdayLabel(c.weekday) : '';
        return c;
      });
    },
  },
  'lessons.list': { perm: ['view_schedule', 'edit_timetable'], fn: listLessons_ },
  'lessons.save': { perm: 'edit_timetable', fn: saveLesson_ },
  'lessons.bulkAdd': { perm: 'edit_timetable', fn: bulkAddLessons_ },
  'lessons.delete': { perm: 'edit_timetable', fn: deleteLessons_ },
  'lessons.assign': { perm: 'assign', fn: assignLesson_ },
  'lessons.lock': { perm: 'assign', fn: lockLessons_ },
  'lessons.candidates': {
    perm: 'assign', fn: function (a) {
      var ctx = context_();
      var l = ctx.lessons[str(a.id)];
      if (!l) throw userError_('Không tìm thấy tiết.');
      return { lesson: lessonDto_(ctx, l, null), role: roleOf_(a.role), candidates: rankCandidates(ctx, l.id, a.role) };
    },
  },
  'auto.run': { perm: 'auto_schedule', fn: runAuto_ },
  'auto.get': { perm: 'auto_schedule', fn: getRun_ },
  'auto.apply': { perm: 'auto_schedule', fn: applyRun_ },
  'auto.revert': { perm: 'auto_schedule', fn: revertRun_ },
  'auto.discard': { perm: 'auto_schedule', fn: discardRun_ },
  'auto.history': { perm: 'auto_schedule', fn: runHistory_ },
  'data.list': { fn: dataList_ },
  'data.save': { fn: dataSave_ },
  'data.delete': { fn: dataDelete_ },
  'users.list': { perm: 'manage_users', fn: function () { return listUsers_(); } },
  'users.save': { perm: 'manage_users', fn: function (a, u) { return saveUser_(u, a.user || {}); } },
  'users.delete': { perm: 'manage_users', fn: function (a, u) { return deleteUser_(u, a.email); } },
  'settings.get': {
    perm: 'manage_settings', fn: function () {
      var values = getSettings_();
      return SETTINGS_SPEC.map(function (s) { return Object.assign({}, s, { value: values[s.key] }); });
    },
  },
  'settings.save': {
    perm: 'manage_settings', fn: function (a, u) {
      return withLock_(function () {
        saveSettings_(a.values || {});
        audit_(u, 'Cập nhật cấu hình', 'CauHinh', a.values || {});
        return { ok: true };
      });
    },
  },
  'audit.list': {
    perm: 'view_audit', fn: function (a) {
      var rows = Db.read('audit');
      var limit = Math.min(Number(a.limit) || 300, 2000);
      return rows.slice(-limit).reverse().map(function (r) { return { at: r.at, user: r.user, action: r.action, entity: r.entity, details: r.details }; });
    },
  },
  'maps.update': { perm: 'edit_teachers', fn: function (a, u) { return updateMapsData_(u); } },
  'cache.refresh': { fn: function () { Db.invalidateSnapshot(); return { ok: true }; } },
  'import.spec': { fn: function (a, u) { return importSpec_(a, u); } },
  'import.data': { fn: function (a, u) { return importData_(a, u); } },
  'import.template': { perm: ['edit_timetable', 'edit_teachers', 'manage_users'], fn: function (a, u) { return makeImportTemplate_(a, u); } },
  'import.readSheet': { perm: ['edit_timetable', 'edit_teachers', 'manage_users'], fn: function (a, u) { return readImportSheet_(a, u); } },
  'export.sheet': { perm: 'export', fn: function (a, u) { return exportToSpreadsheet_(u); } },
  'email.schedules': { perm: 'send_email', fn: function (a, u) { return emailSchedules_(u, a.teachers || []); } },
};

/* ======================= Import.gs ======================= */
/**
 * Nhập dữ liệu hàng loạt từ file Excel mẫu (giao diện đọc file .xlsx trên trình duyệt,
 * gửi từng bảng lên đây). Mọi dòng được kiểm tra trước khi ghi; có lỗi thì không ghi
 * gì (trừ khi người dùng chọn "bỏ qua dòng lỗi").
 */

/** Thứ tự nhập quan trọng: môn → trường → GV → liên kết → lịch bận → TKB → tài khoản. */
var IMPORT_TABLES = {
  subjects: { perm: 'edit_teachers' },
  schools: { perm: 'edit_schools' },
  classes: { perm: 'edit_timetable' },
  teachers: { perm: 'edit_teachers' },
  training: { perm: 'edit_teachers' },
  assistants: { perm: 'edit_teachers' },
  assistantFree: { perm: 'edit_teachers' },
  links: { perm: 'edit_teachers' },
  unavailability: { perm: 'edit_teachers' },
  lessons: { perm: 'edit_timetable' },
  users: { perm: 'manage_users' },
};
var IMPORT_ORDER = ['subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'lessons', 'users'];
var IMPORT_SKIP_COLUMNS = {
  lessons: ['source', 'explain', 'explainTA', 'updatedAt', 'updatedBy'],
  users: ['addedBy', 'createdAt', 'lastLogin'],
  unavailability: ['id'],
  assistantFree: ['id'],
  schools: ['lat', 'lng'],
  teachers: ['lat', 'lng'],
  assistants: ['lat', 'lng'],
};
/** Sheet & cột chứa danh sách mã để làm danh sách thả xuống. */
var REF_SOURCE = { school: 'schools', teacher: 'teachers', assistant: 'assistants', subject: 'subjects' };
var USER_ROLE_OPTIONS = ['Admin', 'AC', 'Sale', 'Xem lịch', 'Giáo viên', 'Chờ duyệt'];
var MAX_IMPORT_ROWS = 5000;

function importColumns_(table) {
  var skip = IMPORT_SKIP_COLUMNS[table] || [];
  return TABLES[table].columns.filter(function (c) { return skip.indexOf(c.key) < 0; }).map(function (c) {
    var col = { key: c.key, header: c.header, type: c.type || 'text', required: !!c.required, options: c.options || null };
    if (table === 'users' && c.key === 'role') col.options = USER_ROLE_OPTIONS;
    if (table === 'lessons' && c.key === 'id') col.hint = 'Để trống khi thêm tiết mới; giữ ID để cập nhật tiết đã có';
    col.hint = col.hint || columnHint_(col);
    return col;
  });
}

function columnHint_(c) {
  switch (c.type) {
    case 'weekday': return 'Thứ 2, Thứ 3, …, Thứ 7, Chủ nhật';
    case 'time': return 'Giờ:phút, vd. 07:30';
    case 'bool': return 'TRUE (có) / FALSE (không)';
    case 'subjects': return 'Mã môn, nhiều môn cách nhau dấu phẩy (vd. RB, SCR)';
    case 'teacher': return 'Chọn mã GV (danh sách lấy từ sheet GiaoVien)';
    case 'assistant': return 'Chọn mã trợ giảng (danh sách lấy từ sheet TroGiang)';
    case 'person': return 'Mã GV hoặc mã trợ giảng';
    case 'school': return 'Chọn mã trường (danh sách lấy từ sheet TruongHoc)';
    case 'subject': return 'Chọn mã chương trình (danh sách lấy từ sheet MonHoc)';
    case 'map': return 'Dán link Google Maps (Chia sẻ → Sao chép đường liên kết) – hệ thống tự lấy tọa độ';
    case 'district': return 'Quận/Huyện';
    case 'number': return 'Số (dùng dấu chấm hoặc phẩy cho phần thập phân)';
    case 'color': return 'Mã màu, vd. #e8590c';
    case 'phone': return 'Số điện thoại';
    default: return c.options ? 'Chọn: ' + c.options.join(' / ') : '';
  }
}

/** Mô tả các bảng người dùng được phép nhập + dòng ví dụ (dùng để tạo file mẫu). */
function importSpec_(args, user) {
  var demo = buildDemoData(20260901);
  var examples = {
    subjects: demo.subjects,
    schools: demo.schools.slice(0, 3),
    classes: demo.classes.filter(function (c) { return c.school === 'TR001' || c.school === 'TR030'; }).slice(0, 6),
    teachers: demo.teachers.slice(0, 3),
    training: demo.training.filter(function (t) { return ['GV001', 'GV002', 'GV003'].indexOf(t.teacher) >= 0; }),
    assistants: demo.assistants.slice(0, 3),
    assistantFree: demo.assistantFree.filter(function (f) { return ['TG001', 'TG002'].indexOf(f.assistant) >= 0; }),
    links: [demo.links[0], demo.links.filter(function (l) { return l.preference === 'Không xếp'; })[0]],
    unavailability: demo.unavailability.slice(0, 2),
    lessons: demo.lessons.filter(function (l) { return l.school === 'TR001'; }).slice(0, 4).map(function (l) { return Object.assign({}, l, { id: '' }); }),
    users: [
      { email: 'ten.ac@kdi.edu.vn', name: 'Nguyễn Văn A', role: 'AC', active: true },
      { email: 'ten.sale@kdi.edu.vn', name: 'Trần Thị B', role: 'Sale', active: true },
    ],
  };
  return IMPORT_ORDER.filter(function (t) { return hasPerm(user, IMPORT_TABLES[t].perm); }).map(function (t) {
    var cols = importColumns_(t);
    return {
      table: t, sheet: TABLES[t].sheet, label: TABLES[t].label, columns: cols,
      examples: examples[t].map(function (r) {
        return cols.map(function (c) {
          var v = r[c.key];
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          return v === undefined || v === null ? '' : String(v);
        });
      }),
      canReplace: t !== 'users',
    };
  });
}

/**
 * args: { table, rows: [{key: value, _line}], mode: 'upsert' | 'replace', dryRun, skipErrors }
 *   - upsert: thêm mới + cập nhật bản ghi trùng mã (cột không có trong file được giữ nguyên)
 *   - replace: xóa dữ liệu cũ của bảng (TKB: chỉ của các trường có trong file) rồi nhập mới
 */
function importData_(args, user) {
  var table = String(args.table || '');
  var conf = IMPORT_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ: ' + table);
  if (!hasPerm(user, conf.perm)) throw userError_('Bạn không có quyền nhập dữ liệu "' + TABLES[table].label + '".', 'FORBIDDEN');
  var rows = args.rows || [];
  if (!rows.length) throw userError_('Sheet "' + TABLES[table].sheet + '" không có dòng dữ liệu nào.');
  if (rows.length > MAX_IMPORT_ROWS) throw userError_('Tối đa ' + MAX_IMPORT_ROWS + ' dòng mỗi bảng.');
  var mode = args.mode === 'replace' ? 'replace' : 'upsert';
  if (table === 'users' && mode === 'replace') throw userError_('Tài khoản chỉ hỗ trợ thêm mới / cập nhật.');
  return withLock_(function () {
    var res;
    if (table === 'lessons') res = importLessons_(rows, mode, args, user);
    else if (table === 'users') res = importUsers_(rows, args, user);
    else res = importGeneric_(table, rows, mode, args, user);
    res.table = table;
    res.label = TABLES[table].label;
    res.total = rows.length;
    res.mode = mode;
    if (res.written) {
      audit_(user, 'Nhập dữ liệu từ Excel', TABLES[table].sheet,
        (mode === 'replace' ? 'Thay thế' : 'Thêm/cập nhật') + ': thêm ' + res.inserted + ', cập nhật ' + res.updated +
        (res.removed ? ', xóa ' + res.removed : '') + (res.errors.length ? ', bỏ qua ' + res.errors.length + ' dòng lỗi' : ''));
    }
    return res;
  });
}

function lineOf_(raw, i) {
  return raw && raw._line ? raw._line : i + 2;
}

function shouldWrite_(args, errors) {
  return !args.dryRun && (!errors.length || args.skipErrors);
}

function importGeneric_(table, rows, mode, args, user) {
  var refs = refSets_();
  var current = Db.read(table);
  var existing = {};
  if (mode === 'upsert') current.forEach(function (r) { existing[Db.keyOf(table, r)] = r; });
  var seen = {};
  var errors = [];
  var inserts = [];
  var updates = [];
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var rec = normalizeRecord_(table, raw);
      TABLES[table].columns.forEach(function (c) {
        if (c.required && !c.auto && !(c.key in rec)) throw userError_('Thiếu cột bắt buộc: ' + c.header);
      });
      validateRefs_(table, rec, refs);
      if (!AUTO_ID_PREFIX[table]) {
        var key = Db.keyOf(table, rec);
        if (seen[key]) throw userError_('Trùng mã "' + key + '" với dòng ' + seen[key]);
        seen[key] = line;
        if (existing[key]) {
          rec._row = existing[key]._row;
          updates.push(rec);
          return;
        }
      }
      TABLES[table].columns.forEach(function (c) {
        if (!(c.key in rec) && c.def !== undefined) rec[c.key] = c.def;
      });
      inserts.push(rec);
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var res = { inserted: inserts.length, updated: updates.length, removed: mode === 'replace' ? current.length : 0, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  if (AUTO_ID_PREFIX[table] && inserts.length) {
    var ids = nextIds_(table, AUTO_ID_PREFIX[table], inserts.length);
    inserts.forEach(function (r, k) { r.id = ids[k]; });
  }
  if (mode === 'replace') {
    Db.replaceAll(table, inserts);
  } else {
    Db.update(table, updates);
    Db.append(table, inserts);
  }
  res.written = true;
  return res;
}

function importLessons_(rows, mode, args, user) {
  var ctx = context_();
  var canAssign = hasPerm(user, 'assign');
  var errors = [];
  var inserts = [];
  var updates = [];
  var schoolsInFile = {};
  var now = nowString();
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var norm = normalizeLessonInput_(ctx, raw);
      if (norm.error) throw userError_(norm.error);
      var o = norm.obj;
      var t = str(raw.teacher).toUpperCase();
      if (t) {
        if (!canAssign) throw userError_('Bạn không có quyền phân công GV – hãy để trống cột "Mã GV".');
        if (!ctx.teachers[t]) throw userError_('Mã GV "' + t + '" không tồn tại.');
        o.teacher = t;
        o.source = 'Thủ công';
        o.explain = '';
      }
      var ta = str(raw.assistant).toUpperCase();
      if (ta) {
        if (!canAssign) throw userError_('Bạn không có quyền phân công trợ giảng – hãy để trống cột "Mã TG".');
        if (!ctx.assistants[ta]) throw userError_('Mã TG "' + ta + '" không tồn tại.');
        o.assistant = ta;
        o.explainTA = '';
      }
      if (canAssign && str(raw.locked) !== '') o.locked = toBool(raw.locked, false);
      o.updatedAt = now;
      o.updatedBy = user.email;
      schoolsInFile[o.school] = true;
      var id = str(raw.id);
      if (mode === 'upsert' && id && ctx.lessons[id]) {
        o._row = ctx.lessons[id].row;
        updates.push(o);
      } else {
        if (!('teacher' in o)) o.teacher = '';
        if (!('assistant' in o)) o.assistant = '';
        if (!('locked' in o)) o.locked = false;
        inserts.push(o);
      }
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var removeRows = [];
  if (mode === 'replace') {
    removeRows = Db.read('lessons').filter(function (l) { return schoolsInFile[str(l.school).toUpperCase()]; }).map(function (l) { return l._row; });
  }
  var res = { inserted: inserts.length, updated: updates.length, removed: removeRows.length, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  Db.update('lessons', updates);
  Db.remove('lessons', removeRows);
  if (inserts.length) {
    var ids = nextIds_('lessons', 'TKB', inserts.length);
    inserts.forEach(function (o, k) { o.id = ids[k]; });
    Db.append('lessons', inserts);
  }
  res.written = true;
  return res;
}

/** "AC", "Chuyên viên xếp lịch (AC)", "scheduler" … → mã vai trò. */
function parseRole_(v) {
  var s = removeDiacritics_(str(v)).toLowerCase();
  if (!s) return 'viewer';
  var aliases = {
    admin: 'admin', 'quan tri': 'admin', 'quan tri vien': 'admin',
    ac: 'scheduler', 'xep lich': 'scheduler', 'chuyen vien xep lich': 'scheduler',
    sale: 'sale', 'kinh doanh': 'sale',
    'giao vien': 'teacher', gv: 'teacher',
    'xem lich': 'viewer', xem: 'viewer',
    'cho duyet': 'pending',
  };
  if (aliases[s]) return aliases[s];
  var keys = Object.keys(ROLES);
  for (var i = 0; i < keys.length; i++) {
    if (s === keys[i] || s === removeDiacritics_(ROLES[keys[i]]).toLowerCase()) return keys[i];
  }
  return '';
}

function importUsers_(rows, args, user) {
  var existing = {};
  Db.read('users').forEach(function (u) { existing[normEmail(u.email)] = u; });
  var seen = {};
  var errors = [];
  var inserts = [];
  var updates = [];
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var email = normEmail(raw.email);
      if (!isAllowedEmail(email)) throw userError_('Email "' + str(raw.email) + '" không phải email @' + APP.ALLOWED_DOMAINS[0]);
      if (seen[email]) throw userError_('Trùng email với dòng ' + seen[email]);
      seen[email] = line;
      if (isSuperAdmin(email)) throw userError_('Không thay đổi tài khoản quản trị gốc qua file nhập.');
      var role = parseRole_(raw.role);
      if (!role) throw userError_('Vai trò "' + raw.role + '" không hợp lệ (chọn: ' + USER_ROLE_OPTIONS.join(', ') + ')');
      var old = existing[email];
      if ((role === 'admin' || (old && old.role === 'admin')) && !user.isSuperAdmin) {
        throw userError_('Chỉ quản trị gốc (' + APP.SUPER_ADMIN + ') được cấp/thu hồi quyền Admin.');
      }
      var active = str(raw.active) === '' ? true : toBool(raw.active, true);
      if (old) {
        updates.push({ _row: old._row, name: str(raw.name) || old.name, role: role, active: active });
      } else {
        inserts.push({ email: email, name: str(raw.name), role: role, active: active, addedBy: user.email, createdAt: nowString(), lastLogin: '' });
      }
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var res = { inserted: inserts.length, updated: updates.length, removed: 0, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  Db.update('users', updates);
  Db.append('users', inserts);
  res.written = true;
  return res;
}

/* ----------------------- File nhập liệu trên Google Sheets ----------------------- */

/** Giá trị 1 ô khi xuất ra file nhập liệu. */
function cellForTemplate_(c, v) {
  if (c.type === 'bool') return v === true || v === 'TRUE' ? 'TRUE' : v === false || v === '' || v === undefined ? (c.def ? 'TRUE' : 'FALSE') : String(v);
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Tạo file Google Sheets để nhập liệu: mỗi bảng 1 sheet, kèm dữ liệu hiện có (nếu hệ thống
 * chưa có dữ liệu thì kèm dòng ví dụ). Cột mã (trường, GV, TG, chương trình) có danh sách thả
 * xuống lấy từ chính các sheet trong file → thêm trường/GV mới là chọn được ngay.
 * Trả về link mở trực tiếp + link tải dạng Excel.
 */
function makeImportTemplate_(args, user) {
  var spec = importSpec_({}, user);
  var name = 'KDI – File nhập liệu – ' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'dd/MM/yyyy HH:mm');
  var out = SpreadsheetApp.create(name);
  var guide = out.getSheets()[0];
  guide.setName('HuongDan');
  var lines = [
    ['HƯỚNG DẪN NHẬP DỮ LIỆU – KDI SCHEDULER'],
    ['1. Mỗi sheet là 1 bảng. Giữ nguyên TÊN SHEET và DÒNG TIÊU ĐỀ. Cột tiêu đề màu cam là bắt buộc.'],
    ['2. Ô có mũi tên ▼: bấm để CHỌN từ danh sách (Thứ, loại GV, mã trường, mã GV, mã TG, chương trình…). Không gõ tay để tránh sai dữ liệu.'],
    ['3. Danh sách mã lấy trực tiếp từ các sheet MonHoc, TruongHoc, GiaoVien, TroGiang trong file này – thêm dòng mới ở đó là chọn được ngay ở sheet khác.'],
    ['4. Vị trí trường / nhà GV / nhà TG: mở Google Maps → chọn địa điểm → Chia sẻ → Sao chép đường liên kết → dán vào cột "Link Google Maps".'],
    ['5. Lớp nào học chương trình gì: khai báo ở sheet LopHoc. Ở sheet TKB có thể để trống "Mã môn" – hệ thống tự lấy theo lớp.'],
    ['6. GV đã được đào tạo chương trình nào: mỗi dòng ở sheet GV_DaoTao là 1 GV × 1 chương trình (Trạng thái "Đạt" mới được xếp dạy).'],
    ['7. Trợ giảng: khai báo ở TroGiang, giờ rảnh ở TG_LichRanh (mỗi dòng 1 khung giờ rảnh trong tuần).'],
    ['8. Điền xong: vào web → Nhập dữ liệu từ Excel → dán link file này (hoặc tải về dạng .xlsx rồi chọn file) → Kiểm tra → Nhập dữ liệu.'],
  ];
  guide.getRange(1, 1, lines.length, 1).setValues(lines);
  guide.getRange(1, 1).setFontWeight('bold');
  guide.setColumnWidth(1, 900);

  var sheets = {};
  var MAXROWS = 3000;
  spec.forEach(function (t) {
    var sh = out.insertSheet(t.sheet);
    sheets[t.table] = { sheet: sh, cols: t.columns };
    var current = Db.read(t.table);
    var rows = current.length ? current.map(function (r) {
      return t.columns.map(function (c) { return cellForTemplate_(c, t.table === 'users' && c.key === 'role' ? roleLabelShort_(r.role) : r[c.key]); });
    }) : t.examples;
    var need = Math.max(rows.length + 1, MAXROWS);
    if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    if (t.columns.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), t.columns.length - sh.getMaxColumns());
    t.columns.forEach(function (c, i) {
      if (c.type === 'time' || c.type === 'weekday' || c.type === 'phone' || REF_SOURCE[c.type] || c.key === 'code' || c.key === 'id') {
        sh.getRange(2, i + 1, need - 1, 1).setNumberFormat('@');
      }
    });
    var head = sh.getRange(1, 1, 1, t.columns.length).setValues([t.columns.map(function (c) { return c.header; })]);
    head.setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f3b73');
    t.columns.forEach(function (c, i) {
      if (c.required) sh.getRange(1, i + 1).setBackground('#c2410c');
      sh.setColumnWidth(i + 1, Math.max(90, Math.min(260, c.header.length * 9 + 30)));
    });
    sh.setFrozenRows(1);
    if (rows.length) sh.getRange(2, 1, rows.length, t.columns.length).setValues(rows);
  });

  // Danh sách thả xuống.
  Object.keys(sheets).forEach(function (table) {
    var sh = sheets[table].sheet;
    sheets[table].cols.forEach(function (c, i) {
      var range = sh.getRange(2, i + 1, MAXROWS - 1, 1);
      var rule = null;
      var list = c.type === 'weekday' ? WEEKDAYS : c.type === 'bool' ? ['TRUE', 'FALSE'] : c.options;
      var src = REF_SOURCE[c.type];
      if (list) {
        rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
      } else if (src && sheets[src] && table !== src) {
        rule = SpreadsheetApp.newDataValidation().requireValueInRange(sheets[src].sheet.getRange(2, 1, MAXROWS - 1, 1), true).setAllowInvalid(false).build();
      } else if (c.type === 'person') {
        var codes = Db.read('teachers').concat(Db.read('assistants')).map(function (r) { return str(r.code).toUpperCase(); }).filter(Boolean);
        if (codes.length && codes.length <= 500) rule = SpreadsheetApp.newDataValidation().requireValueInList(codes, true).setAllowInvalid(true).build();
      }
      if (rule) range.setDataValidation(rule);
    });
  });
  try { out.addEditor(user.email); } catch (e) { /* người dùng là chủ sở hữu */ }
  audit_(user, 'Tạo file nhập liệu', name, out.getUrl());
  return { url: out.getUrl(), xlsxUrl: 'https://docs.google.com/spreadsheets/d/' + out.getId() + '/export?format=xlsx', name: name };
}

function roleLabelShort_(role) {
  return { admin: 'Admin', scheduler: 'AC', sale: 'Sale', viewer: 'Xem lịch', teacher: 'Giáo viên', pending: 'Chờ duyệt' }[role] || 'Xem lịch';
}

/** Đọc toàn bộ các sheet của 1 file Google Sheets (link) để nhập. */
function readImportSheet_(args, user) {
  var url = str(args.url);
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) throw userError_('Link Google Sheets không hợp lệ.');
  var ss;
  try { ss = SpreadsheetApp.openById(m[1]); } catch (e) {
    throw userError_('Không mở được file. Hãy chia sẻ file cho ' + Session.getEffectiveUser().getEmail() + ' (quyền xem) rồi thử lại.');
  }
  return {
    name: ss.getName(),
    sheets: ss.getSheets().map(function (sh) {
      var lr = sh.getLastRow();
      var lc = sh.getLastColumn();
      return { name: sh.getName(), aoa: lr && lc ? sh.getRange(1, 1, lr, lc).getDisplayValues() : [] };
    }),
  };
}


/* ======================= Maps.gs ======================= */
/**
 * GOOGLE MAPS: lấy tọa độ từ link Google Maps và tính khoảng cách đi XE MÁY
 * từ nhà GV / trợ giảng đến trường.
 *
 * - Không cần API key: dùng dịch vụ Maps có sẵn của Apps Script (chế độ lái xe,
 *   TRÁNH ĐƯỜNG CAO TỐC – xe máy không được đi cao tốc nên đây là quãng đường xe máy).
 * - Có API key (Cấu hình → maps_api_key): dùng Routes API chế độ TWO_WHEELER (xe 2 bánh),
 *   tính theo ma trận nên nhanh hơn nhiều.
 * - Kết quả lưu ở sheet KhoangCach kèm tọa độ đã dùng; khi đổi link/tọa độ hệ thống tự tính lại.
 * - Mỗi lần chạy tối đa ~4 phút (giới hạn Apps Script 6 phút); giao diện web tự gọi lại
 *   cho tới khi xong.
 */

var MAPS_TIME_BUDGET_MS = 240000;
var MAPS_FLUSH_EVERY = 40;
var MAPS_SOURCE_DIRECTIONS = 'Google Maps – xe máy (tránh cao tốc)';
var MAPS_SOURCE_ROUTES = 'Google Routes API – xe 2 bánh';

/** Tra tọa độ cho link rút gọn (maps.app.goo.gl), link không chứa tọa độ, hoặc địa chỉ chữ. */
function resolveCoordsRemote_(text) {
  var direct = parseMapsLink(text);
  if (direct) return direct;
  var s = str(text);
  if (/^https?:\/\//i.test(s)) {
    var url = s;
    for (var i = 0; i < 5; i++) {
      var resp = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      var headers = resp.getHeaders() || {};
      var loc = headers.Location || headers.location;
      if (!loc) break;
      var p = parseMapsLink(loc);
      if (p) return p;
      url = loc;
    }
    var place = placeTextFromUrl_(url);
    return place ? geocode_(place) : null;
  }
  return geocode_(s);
}

/** Tên địa điểm trong link dạng .../maps/place/Ten+Truong/... hoặc ?q=Ten+Truong */
function placeTextFromUrl_(url) {
  var m = String(url).match(/\/maps\/place\/([^/@?]+)/) || String(url).match(/\/maps\/search\/([^/@?]+)/) || String(url).match(/[?&](?:q|query)=([^&]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1].replace(/\+/g, ' '); }
}

function geocode_(text) {
  var r = Maps.newGeocoder().setRegion('vn').setLanguage('vi').geocode(text);
  if (r && r.status === 'OK' && r.results && r.results.length) {
    var loc = r.results[0].geometry.location;
    return { lat: Math.round(loc.lat * 1e6) / 1e6, lng: Math.round(loc.lng * 1e6) / 1e6 };
  }
  return null;
}

/** Quãng đường 1 cặp điểm qua dịch vụ Maps của Apps Script. {km, minutes} hoặc null. */
function directionsDistance_(from, to, avoidHighways) {
  var finder = Maps.newDirectionFinder()
    .setOrigin(from.lat, from.lng)
    .setDestination(to.lat, to.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING);
  if (avoidHighways) finder.setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS);
  var res = finder.getDirections();
  if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) return null;
  var leg = res.routes[0].legs[0];
  return { km: round1(leg.distance.value / 1000), minutes: Math.round(leg.duration.value / 60) };
}

/** Ma trận khoảng cách qua Routes API (cần API key). Trả về {'i|j': {km, minutes}}. */
function routesMatrix_(origins, destinations, apiKey, avoidHighways) {
  function wp(p) { return { waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } }; }
  function call(mode) {
    var body = { origins: origins.map(wp), destinations: destinations.map(wp), travelMode: mode };
    if (mode === 'DRIVE') body.routeModifiers = { avoidHighways: !!avoidHighways };
    var resp = UrlFetchApp.fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' },
    });
    return { code: resp.getResponseCode(), text: resp.getContentText() };
  }
  var r = call('TWO_WHEELER');
  if (r.code !== 200) r = call('DRIVE'); // khu vực chưa hỗ trợ xe 2 bánh
  if (r.code !== 200) throw new Error('Routes API lỗi ' + r.code + ': ' + r.text.slice(0, 200));
  var out = {};
  JSON.parse(r.text).forEach(function (e) {
    if (e.condition && e.condition !== 'ROUTE_EXISTS') return;
    if (e.distanceMeters === undefined) return;
    out[e.originIndex + '|' + e.destinationIndex] = { km: round1(e.distanceMeters / 1000), minutes: Math.round(parseFloat(e.duration || '0') / 60) };
  });
  return out;
}

/** Bước 1: điền Vĩ độ/Kinh độ cho các dòng có link Google Maps nhưng chưa có tọa độ. */
function fillCoordsFromLinks_(deadline) {
  var res = { updated: 0, failed: [] };
  ['schools', 'teachers', 'assistants'].forEach(function (table) {
    var pending = Db.read(table).filter(function (r) {
      return str(r.mapUrl) && (toNum(r.lat) === null || toNum(r.lng) === null);
    });
    var found = [];
    pending.forEach(function (r) {
      if (Date.now() > deadline) return;
      var p = null;
      try { p = resolveCoordsRemote_(r.mapUrl); } catch (e) { p = null; }
      if (p) found.push({ code: str(r.code).toUpperCase(), lat: p.lat, lng: p.lng });
      else res.failed.push(TABLES[table].label + ' ' + r.code + ' (' + str(r.name) + ')');
    });
    if (!found.length) return;
    withLock_(function () {
      var byCode = {};
      Db.read(table).forEach(function (r) { byCode[str(r.code).toUpperCase()] = r; });
      Db.update(table, found.filter(function (f) { return byCode[f.code]; }).map(function (f) {
        return { _row: byCode[f.code]._row, lat: f.lat, lng: f.lng };
      }));
    });
    res.updated += found.length;
  });
  return res;
}

/** Các cặp người–trường cần tính (chưa có số liệu hoặc tọa độ đã đổi), gần trước. */
function pendingDistancePairs_(ctx) {
  var limit = ctx.S.max_distance_km > 0 ? ctx.S.max_distance_km : 40;
  var schools = Object.keys(ctx.schools).map(function (c) { return ctx.schools[c]; })
    .filter(function (s) { return s.active && hasCoords_(s); });
  var pairs = [];
  Object.keys(ctx.people).forEach(function (code) {
    var p = ctx.people[code];
    if (!p.active || !hasCoords_(p)) return;
    schools.forEach(function (s) {
      var straight = haversineKm(p.lat, p.lng, s.lat, s.lng);
      if (straight > limit) return; // đường chim bay đã quá xa → chắc chắn quá xa
      var key = coordsKey_(p, s);
      var gm = ctx.maps[code + '|' + s.code];
      if (gm && gm.coords === key) return;
      pairs.push({ person: p, school: s, key: key, straight: straight });
    });
  });
  pairs.sort(function (a, b) { return a.straight - b.straight; });
  return pairs;
}

function saveDistances_(rows) {
  if (!rows.length) return;
  withLock_(function () {
    var existing = {};
    Db.read('distances').forEach(function (r) { existing[str(r.person).toUpperCase() + '|' + str(r.school).toUpperCase()] = r; });
    var updates = [];
    var inserts = [];
    rows.forEach(function (r) {
      var e = existing[r.person + '|' + r.school];
      if (e) updates.push(Object.assign({ _row: e._row }, r));
      else inserts.push(r);
    });
    Db.update('distances', updates);
    Db.append('distances', inserts);
  });
}

/**
 * Cập nhật tọa độ + khoảng cách. Gọi lặp lại tới khi remaining = 0.
 * Trả về { coordsUpdated, coordsFailed, computed, remaining, failedPairs, source, quotaExceeded }
 */
function updateMapsData_(user) {
  var started = Date.now();
  var deadline = started + MAPS_TIME_BUDGET_MS;
  var coords = fillCoordsFromLinks_(started + MAPS_TIME_BUDGET_MS / 3);
  Db.clearCache();
  var ctx = context_();
  var pairs = pendingDistancePairs_(ctx);
  var apiKey = str(ctx.S.maps_api_key);
  var source = apiKey ? MAPS_SOURCE_ROUTES : MAPS_SOURCE_DIRECTIONS;
  var buffer = [];
  var computed = 0;
  var failed = 0;
  var quotaExceeded = false;
  var now = nowString();
  function record(pair, r) {
    buffer.push({ person: pair.person.code, school: pair.school.code, km: r.km, minutes: r.minutes, source: source, coords: pair.key, updatedAt: now });
    computed++;
    if (buffer.length >= MAPS_FLUSH_EVERY) { saveDistances_(buffer); buffer = []; }
  }
  var i = 0;
  try {
    if (apiKey) {
      // Gom theo người: 1 người × tối đa 25 trường mỗi lần gọi ma trận.
      while (i < pairs.length && Date.now() < deadline) {
        var origin = pairs[i].person;
        var group = [];
        while (i < pairs.length && pairs[i].person === origin && group.length < 25) group.push(pairs[i++]);
        // Lấy thêm các cặp khác của cùng người (danh sách đã sắp theo khoảng cách nên có thể không liền nhau).
        for (var k = i; k < pairs.length && group.length < 25; k++) {
          if (pairs[k].person === origin) { group.push(pairs[k]); pairs.splice(k, 1); k--; }
        }
        var m = routesMatrix_([origin], group.map(function (g) { return g.school; }), apiKey, ctx.S.maps_avoid_highways);
        group.forEach(function (g, j) {
          var r = m['0|' + j];
          if (r) record(g, r); else failed++;
        });
      }
    } else {
      while (i < pairs.length && Date.now() < deadline) {
        var pair = pairs[i++];
        var r = directionsDistance_(pair.person, pair.school, ctx.S.maps_avoid_highways);
        if (r) record(pair, r); else failed++;
      }
    }
  } catch (e) {
    if (/too many times|quota|giới hạn/i.test(String(e && e.message))) quotaExceeded = true;
    else { saveDistances_(buffer); throw e; }
  }
  saveDistances_(buffer);
  var remaining = Math.max(0, pairs.length - i);
  audit_(user, 'Cập nhật Google Maps', 'KhoangCach', 'Tọa độ: ' + coords.updated + ', khoảng cách: ' + computed + ', còn lại: ' + remaining);
  return {
    coordsUpdated: coords.updated, coordsFailed: coords.failed, computed: computed, failedPairs: failed,
    remaining: quotaExceeded ? remaining : remaining, total: pairs.length, source: source, quotaExceeded: quotaExceeded,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/** Menu trong Google Sheets. */
function menuUpdateMaps() {
  var ui = SpreadsheetApp.getUi();
  var user = requireSheetRole_('edit_teachers');
  var r = updateMapsData_(user);
  ui.alert('Google Maps',
    'Đã cập nhật tọa độ: ' + r.coordsUpdated + (r.coordsFailed.length ? ' (không đọc được ' + r.coordsFailed.length + ' link)' : '') +
    '\nĐã tính khoảng cách: ' + r.computed + ' cặp GV/TG – trường' +
    (r.remaining ? '\nCòn ' + r.remaining + ' cặp – hãy chạy lại chức năng này (hoặc dùng nút trên web, tự chạy tiếp).' : '\nĐã xong toàn bộ.') +
    (r.quotaExceeded ? '\n⚠ Đã hết hạn mức Google Maps hôm nay – chạy tiếp vào ngày mai.' : ''),
    ui.ButtonSet.OK);
}

/* ======================= Export.gs ======================= */
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

/* ======================= Setup.gs ======================= */
/**
 * Khởi tạo bảng dữ liệu, menu trong Google Sheets và dữ liệu mẫu.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🗓 KDI Xếp lịch')
    .addItem('Mở ứng dụng web', 'menuOpenWebApp')
    .addSeparator()
    .addItem('Xếp lịch tự động (điền tiết trống)', 'menuAutoSchedule')
    .addItem('Kiểm tra trùng lịch (tô màu sheet TKB)', 'menuHighlightConflicts')
    .addItem('Cập nhật tọa độ & khoảng cách Google Maps (xe máy)', 'menuUpdateMaps')
    .addSeparator()
    .addItem('Khởi tạo / kiểm tra cấu trúc bảng', 'setupSheets')
    .addItem('Nạp dữ liệu mẫu (XÓA dữ liệu hiện có)', 'menuLoadDemoData')
    .addToUi();
}

/**
 * Trigger đơn giản: khi ai đó sửa trực tiếp trên Google Sheets thì xóa dữ liệu lưu tạm
 * để ứng dụng web hiển thị ngay dữ liệu mới.
 */
function onEdit(e) {
  try { CacheService.getScriptCache().remove('snap_meta'); } catch (err) { /* bỏ qua */ }
}

/**
 * Các hàm gọi từ menu là hàm "công khai" nên client web cũng gọi được qua
 * google.script.run → luôn kiểm tra quyền của người đang thao tác.
 * Ngoại lệ: lần cài đặt đầu tiên (chưa có sheet NguoiDung).
 */
function requireSheetRole_(perm) {
  if (!Db.sheet('users', false)) {
    return { email: activeGoogleEmail_() || 'cài đặt', isSuperAdmin: true, role: 'admin', status: 'ok' };
  }
  var u = resolveUser_('');
  if (u.status !== 'ok' || !hasPerm(u, perm)) {
    throw new Error('Bạn không có quyền dùng chức năng này. Hãy đăng nhập Google bằng tài khoản @' + APP.ALLOWED_DOMAINS[0] +
      ' có vai trò phù hợp (' + (u.email || 'chưa xác định email') + ').');
  }
  return u;
}

/** Tạo các sheet còn thiếu, tiêu đề, danh sách chọn, cấu hình mặc định, tài khoản admin gốc. */
function setupSheets() {
  requireSheetRole_('manage_settings');
  return withLock_(function () {
    Object.keys(TABLES).forEach(function (table) { Db.ensureHeaders(table); });
    applyValidations_();

    var existing = {};
    Db.read('settings').forEach(function (r) { existing[r.key] = true; });
    Db.append('settings', SETTINGS_SPEC.filter(function (s) { return !existing[s.key]; }).map(function (s) {
      return { key: s.key, value: s.def, description: s.label };
    }));

    if (!Db.findByKey('users', normEmail(APP.SUPER_ADMIN))) {
      Db.append('users', [{ email: APP.SUPER_ADMIN, name: 'Quản trị gốc', role: 'admin', active: true, addedBy: 'Hệ thống', createdAt: nowString(), lastLogin: '' }]);
    }
    if (!Db.read('subjects').length) Db.append('subjects', DEFAULT_SUBJECTS);
    migrateLegacyTraining_();
    toast_('Đã khởi tạo cấu trúc dữ liệu.');
    return true;
  });
}

/** Chương trình STEM mặc định (theo khối lớp, giống TKB thực tế của KDI). */
var DEFAULT_SUBJECTS = [
  { code: 'G01', name: 'School - Grade 01', description: 'Chương trình STEM khối 1', color: '#e8590c' },
  { code: 'G02', name: 'School - Grade 02', description: 'Chương trình STEM khối 2', color: '#f08c00' },
  { code: 'G03', name: 'School - Grade 03', description: 'Chương trình STEM khối 3', color: '#2f9e44' },
  { code: 'G04', name: 'School - Grade 04', description: 'Chương trình STEM khối 4', color: '#0c8599' },
  { code: 'G05', name: 'School - Grade 05', description: 'Chương trình STEM khối 5', color: '#1c7ed6' },
  { code: 'G06', name: 'School - Grade 06', description: 'Chương trình STEM khối 6', color: '#4263eb' },
  { code: 'G07', name: 'School - Grade 07', description: 'Chương trình STEM khối 7', color: '#7048e8' },
  { code: 'G08', name: 'School - Grade 08', description: 'Chương trình STEM khối 8', color: '#ae3ec9' },
  { code: 'G09', name: 'School - Grade 09', description: 'Chương trình STEM khối 9', color: '#c2255c' },
  { code: 'GK', name: 'School - Grade .K', description: 'Chương trình K (Tin học/Khoa học máy tính)', color: '#495057' },
];

/** Danh sách thả xuống ngay trên các sheet dữ liệu (kể cả mã tham chiếu sang sheet khác). */
/** Bản 1.0/1.1 lưu "Môn đã đào tạo" trong sheet GiaoVien → chuyển sang GV_DaoTao (1 dòng / GV × môn). */
function migrateLegacyTraining_() {
  var sh = Db.sheet('teachers', false);
  if (!sh || sh.getLastRow() < 2) return 0;
  var grid = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = grid[0].map(str);
  var cSub = head.indexOf('Môn đã đào tạo');
  var cCode = head.indexOf('Mã GV');
  if (cSub < 0 || cCode < 0) return 0;
  var have = {};
  Db.read('training').forEach(function (r) { have[str(r.teacher).toUpperCase() + '|' + str(r.subject).toUpperCase()] = true; });
  var add = [];
  for (var r = 1; r < grid.length; r++) {
    var code = str(grid[r][cCode]).toUpperCase();
    splitList(grid[r][cSub]).forEach(function (subj) {
      subj = subj.toUpperCase();
      if (!code || have[code + '|' + subj]) return;
      have[code + '|' + subj] = true;
      add.push({ teacher: code, subject: subj, status: 'Đạt', date: '', notes: 'Chuyển từ cột "Môn đã đào tạo"' });
    });
  }
  Db.append('training', add);
  return add.length;
}

function applyValidations_() {
  var codeRanges = {};
  ['schools', 'teachers', 'assistants', 'subjects'].forEach(function (t) {
    var sh = Db.sheet(t, true);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(str);
    var col = headers.indexOf(TABLES[t].columns[0].header) + 1;
    codeRanges[t] = sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
  });
  var refSource = { school: 'schools', teacher: 'teachers', assistant: 'assistants', subject: 'subjects' };
  Object.keys(TABLES).forEach(function (table) {
    var d = TABLES[table];
    var sh = Db.sheet(table, true);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(str);
    var maxRows = Math.max(sh.getMaxRows() - 1, 1);
    d.columns.forEach(function (c) {
      var col = headers.indexOf(c.header) + 1;
      if (col < 1) return;
      var range = sh.getRange(2, col, maxRows, 1);
      var list = c.type === 'weekday' ? WEEKDAYS : (table === 'users' && c.key === 'role') ? Object.keys(ROLES) : c.options;
      // Ô checkbox (cột kiểu bool) được tạo khi thêm dòng (Db.append) – không chèn cho cả
      // cột vì Sheets sẽ ghi FALSE vào mọi ô trống và làm sai vị trí dòng cuối.
      if (list) {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build());
      } else if (refSource[c.type] && refSource[c.type] !== table) {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(codeRanges[refSource[c.type]], true).setAllowInvalid(true).build());
      }
    });
  });
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'KDI Scheduler', 5); } catch (e) { /* chạy ngoài Sheets */ }
}

function menuOpenWebApp() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
  var html = url
    ? '<p style="font-family:Arial">Mở ứng dụng: <a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p style="font-family:Arial">Chưa triển khai Web App. Vào <b>Triển khai (Deploy) → Triển khai mới → Ứng dụng web</b> (xem README).</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(120), 'KDI Scheduler');
}

function menuAutoSchedule() {
  var ui = SpreadsheetApp.getUi();
  var user = requireSheetRole_('auto_schedule');
  var run = runAuto_({ mode: 'fill' }, user);
  var s = run.stats;
  var msg = 'Xếp được ' + s.assigned + '/' + s.considered + ' tiết trống (giữ nguyên ' + s.kept + ' tiết đã có GV).\n' +
    'Chưa xếp được: ' + s.unassigned + ' tiết. Dữ liệu lỗi: ' + s.invalid + ' tiết.\n\nÁp dụng kết quả vào sheet TKB?';
  if (ui.alert('Kết quả xếp lịch', msg, ui.ButtonSet.YES_NO) === ui.Button.YES) {
    var res = applyRun_({ id: run.id }, user);
    ui.alert('Đã áp dụng ' + res.applied + ' tiết. Có thể hoàn tác trong ứng dụng web (mục Xếp lịch tự động).');
  } else {
    discardRun_({ id: run.id }, user);
  }
}

function menuHighlightConflicts() {
  var ui = SpreadsheetApp.getUi();
  requireSheetRole_('auto_schedule');
  var ctx = context_();
  var conflicts = detectConflicts(ctx);
  var idx = conflictIndex(conflicts);
  var sh = Db.sheet('lessons', true);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow >= 2) {
    var colors = [];
    var rowColor = {};
    ctx.lessonList.forEach(function (l) {
      if (idx[l.id] === 'error') rowColor[l.row] = '#ffc9c9';
      else if (idx[l.id] === 'warning') rowColor[l.row] = '#fff3bf';
      else if (!l.teacher) rowColor[l.row] = '#e7f5ff';
    });
    for (var r = 2; r <= lastRow; r++) {
      var c = rowColor[r] || '#ffffff';
      var row = [];
      for (var k = 0; k < lastCol; k++) row.push(c);
      colors.push(row);
    }
    sh.getRange(2, 1, lastRow - 1, lastCol).setBackgrounds(colors);
  }
  var errors = conflicts.filter(function (c) { return c.severity === 'error'; }).length;
  ui.alert('Kiểm tra trùng lịch',
    'Lỗi (đỏ): ' + errors + '\nCảnh báo (vàng): ' + (conflicts.length - errors) + '\nTiết chưa có GV: tô xanh nhạt.\n\nXem chi tiết trong ứng dụng web → Cảnh báo.',
    ui.ButtonSet.OK);
}

function menuLoadDemoData() {
  var ui = SpreadsheetApp.getUi();
  requireSheetRole_('manage_settings');
  if (ui.alert('Nạp dữ liệu mẫu', 'Thao tác này XÓA toàn bộ dữ liệu trường, GV, TKB hiện có và thay bằng dữ liệu mẫu. Tiếp tục?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  setupSheets();
  loadDemoData_();
  ui.alert('Đã nạp dữ liệu mẫu. Mở ứng dụng web → "Xếp lịch tự động" để chạy thử.');
}

function loadDemoData_() {
  var demo = buildDemoData(20260901);
  withLock_(function () {
    ['subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'lessons']
      .forEach(function (t) { Db.replaceAll(t, demo[t]); });
    Db.replaceAll('distances', []);
    Db.replaceAll('runs', []);
    Db.replaceAll('runItems', []);
  });
  return demo;
}

/* ------------------------------ Dữ liệu mẫu ------------------------------ */

function mulberry32_(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sinh dữ liệu mẫu (Hà Nội) – hàm thuần, cùng seed cho cùng kết quả. */
function buildDemoData(seed) {
  var rnd = mulberry32_(seed || 1);
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function between(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function jitter(v, d) { return Math.round((v + (rnd() * 2 - 1) * d) * 100000) / 100000; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function mapUrl(lat, lng) { return 'https://www.google.com/maps?q=' + lat + ',' + lng; }

  var districts = [
    ['Ba Đình', 21.0350, 105.8190], ['Hoàn Kiếm', 21.0285, 105.8542], ['Đống Đa', 21.0180, 105.8290],
    ['Hai Bà Trưng', 21.0060, 105.8580], ['Hoàng Mai', 20.9740, 105.8630], ['Thanh Xuân', 20.9930, 105.8110],
    ['Cầu Giấy', 21.0330, 105.7940], ['Long Biên', 21.0470, 105.8890], ['Tây Hồ', 21.0680, 105.8200],
    ['Nam Từ Liêm', 21.0130, 105.7650], ['Bắc Từ Liêm', 21.0700, 105.7600], ['Hà Đông', 20.9710, 105.7790],
    ['Đông Anh', 21.1370, 105.8490], ['Gia Lâm', 21.0280, 105.9380],
  ];
  var subjects = DEFAULT_SUBJECTS.map(function (x) { return Object.assign({}, x); });
  var primary = ['G01', 'G02', 'G03', 'G04', 'G05'];
  var secondary = ['G06', 'G07', 'G08', 'G09'];

  var names = ['Kim Đồng', 'Chu Văn An', 'Nguyễn Tri Phương', 'Ái Mộ A', 'Đô Thị Việt Hưng', 'Việt Nam - Cuba', 'Tràng An',
    'Hoàng Mai', 'Đô thị Sài Đồng', 'Tây Mỗ 3', 'Nguyễn Trung Trực', 'Lý Thường Kiệt', 'Thăng Long', 'Đoàn Thị Điểm', 'Nam Thành Công',
    'Dịch Vọng', 'Yên Hòa', 'Lê Ngọc Hân', 'Phúc Xá', 'Giảng Võ', 'Phúc Lợi', 'Phương Canh', 'Nguyễn Quý Đức', 'Sài Đồng',
    'Trung Văn', 'Đại Mỗ', 'Ngọc Lâm', 'Mỹ Đình 1', 'Mỹ Đình 2', 'Nguyễn Bỉnh Khiêm', 'Phan Bội Châu', 'Nguyễn Gia Thiều',
    'Lê Quý Đôn', 'Cát Linh', 'Nguyễn Huy Tưởng', 'Lý Nam Đế', 'Nguyễn Trường Tộ', 'Đại Kim', 'Ngô Quyền', 'Tây Mỗ',
    'Thanh Xuân Trung', 'Khương Đình', 'Định Công', 'Hoàng Liệt', 'Đông Anh'];
  var schools = [];
  names.forEach(function (n, i) {
    var d = districts[(i * 5) % districts.length];
    var th = i < 21;
    var lat = jitter(d[1], 0.015);
    var lng = jitter(d[2], 0.015);
    schools.push({
      code: 'TR' + pad(i + 1, 3), name: (th ? 'TH ' : 'THCS ') + n, level: th ? 'Tiểu học' : 'THCS',
      mapUrl: mapUrl(lat, lng), address: 'Phường ' + pick(['Láng Hạ', 'Kim Mã', 'Dịch Vọng', 'Bồ Đề', 'Mỹ Đình', 'Văn Quán', 'Định Công']) + ', ' + d[0],
      district: d[0], lat: lat, lng: lng, contact: 'Cô ' + pick(['Lan', 'Hoa', 'Mai', 'Hương', 'Thảo', 'Ngọc']),
      phone: '09' + between(10000000, 99999999), sale: pick(['sale1@kdi.edu.vn', 'sale2@kdi.edu.vn']), notes: '', active: true,
    });
  });

  // Lớp học & chương trình: TH học G01–G05, THCS học G06–G09; một số trường học chương trình K.
  var classes = [];
  schools.forEach(function (s, i) {
    var grades = s.level === 'Tiểu học' ? primary : secondary;
    var useK = s.level === 'THCS' && i % 4 === 0;
    shuffle(grades.slice()).slice(0, between(2, grades.length)).sort().forEach(function (subj) {
      var g = Number(subj.slice(1));
      var n = between(3, 6);
      for (var k = 1; k <= n; k++) {
        classes.push({ school: s.code, className: g + 'A' + k, grade: String(g), subject: useK ? 'GK' : subj,
          needAssistant: rnd() < 0.85 ? 'Có' : 'Không', students: between(30, 45), notes: '' });
      }
    });
  });

  var families = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Phan', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Đinh', 'Lương'];
  var middles = ['Thị', 'Văn', 'Thu', 'Thanh', 'Minh', 'Ngọc', 'Hồng', 'Khánh', 'Bảo', 'Phương'];
  var givens = ['Anh', 'Chi', 'Dung', 'Giang', 'Hà', 'Hằng', 'Hiền', 'Hương', 'Linh', 'Mai', 'My', 'Nga', 'Nhung', 'Phương',
    'Thảo', 'Trang', 'Tú', 'Vân', 'Yến', 'Huyền', 'Tâm', 'Hải', 'Nam', 'Sơn', 'Tuấn'];
  function person(prefix, k) {
    var fam = pick(families);
    var giv = pick(givens);
    var d = districts[Math.floor(rnd() * districts.length)];
    var lat = jitter(d[1], 0.02);
    var lng = jitter(d[2], 0.02);
    return {
      code: prefix + pad(k, 3), name: fam + ' ' + pick(middles) + ' ' + giv,
      email: removeDiacritics_(giv).toLowerCase() + '.' + removeDiacritics_(fam).toLowerCase() + '.' + prefix.toLowerCase() + pad(k, 3) + '@kdi.edu.vn',
      phone: '09' + between(10000000, 99999999), mapUrl: mapUrl(lat, lng),
      address: 'Ngõ ' + between(1, 300) + ' ' + pick(['Xuân Thủy', 'Nguyễn Trãi', 'Giải Phóng', 'Nguyễn Văn Cừ', 'Láng', 'Trần Duy Hưng']) + ', ' + d[0],
      district: d[0], lat: lat, lng: lng,
    };
  }

  var teachers = [];
  var training = [];
  var unavailability = [];
  for (var k = 1; k <= 80; k++) {
    var t = person('GV', k);
    var partTime = k % 3 === 0;
    var r = rnd();
    teachers.push(Object.assign(t, {
      type: partTime ? 'Kiêm nhiệm' : 'Thường', rating: r < 0.2 ? 'A' : r < 0.65 ? 'B' : r < 0.95 ? 'C' : 'D',
      targetHours: '', maxHours: '', maxSchools: '', notes: partTime ? 'Kiêm nhiệm công tác văn phòng' : '', active: k !== 80,
    }));
    // GV tiểu học (k lẻ) được đào tạo các khối 1–5, GV THCS được đào tạo khối 6–9 / K.
    var pool = k % 2 === 1 ? primary : secondary.concat(['GK']);
    shuffle(pool.slice()).slice(0, between(2, pool.length)).forEach(function (subj) {
      training.push({ teacher: t.code, subject: subj, status: rnd() < 0.93 ? 'Đạt' : 'Đang đào tạo', date: '2025-0' + between(6, 9) + '-15', notes: '' });
    });
    if (partTime) {
      var wd = between(0, 4);
      var morning = rnd() < 0.5;
      unavailability.push({ id: 'LB-' + pad(unavailability.length + 1, 6), teacher: t.code, weekday: WEEKDAYS[wd],
        start: morning ? '07:00' : '13:00', end: morning ? '11:30' : '17:00', reason: 'Công tác văn phòng' });
    }
  }

  var assistants = [];
  var assistantFree = [];
  for (var a = 1; a <= 75; a++) {
    var ta = person('TG', a);
    assistants.push(Object.assign(ta, { targetHours: '', maxHours: '', maxSchools: '', notes: rnd() < 0.5 ? 'Sinh viên' : '', active: true }));
    shuffle([0, 1, 2, 3, 4]).slice(0, between(3, 5)).sort().forEach(function (wd) {
      var kind = pick(['sáng', 'chiều', 'cả ngày', 'cả ngày']);
      var start = kind === 'chiều' ? '13:00' : '07:00';
      var end = kind === 'sáng' ? '11:45' : '17:00';
      assistantFree.push({ id: 'LR-' + pad(assistantFree.length + 1, 6), assistant: ta.code, weekday: WEEKDAYS[wd], start: start, end: end, notes: 'Rảnh ' + kind });
    });
  }

  // Trường ưu tiên: ~1/3 GV có 1 trường ưu tiên gần nhà dạy đúng chương trình đã đào tạo.
  var links = [];
  teachers.forEach(function (t, idx) {
    if (idx % 3 !== 0) return;
    var trained = training.filter(function (x) { return x.teacher === t.code && x.status === 'Đạt'; }).map(function (x) { return x.subject; });
    var near = schools.map(function (s) { return { s: s, d: haversineKm(t.lat, t.lng, s.lat, s.lng) }; })
      .filter(function (x) { return classes.some(function (c) { return c.school === x.s.code && trained.indexOf(c.subject) >= 0; }); })
      .sort(function (p, q) { return p.d - q.d; });
    if (near.length) links.push({ teacher: t.code, school: near[0].s.code, preference: 'Ưu tiên', distance: '', notes: 'Trường đề nghị giữ GV' });
  });
  links.push({ teacher: 'GV007', school: 'TR003', preference: 'Không xếp', distance: '', notes: 'Trường phản hồi chưa phù hợp' });

  // Thời khóa biểu: mỗi lớp 1 buổi/tuần (một số lớp 2 tiết gộp).
  var thSlots = [[460, 495], [500, 535], [560, 595], [620, 655], [810, 845], [850, 885], [905, 940], [950, 985]];
  var thcsSlots = [[450, 495], [505, 550], [565, 610], [620, 665], [820, 865], [875, 920], [935, 980]];
  var lessons = [];
  schools.forEach(function (s) {
    var mine = classes.filter(function (c) { return c.school === s.code; });
    var slots = s.level === 'Tiểu học' ? thSlots : thcsSlots;
    var days = shuffle([0, 1, 2, 3, 4]).slice(0, between(2, 4)).sort();
    var cells = [];
    days.forEach(function (wd) { slots.forEach(function (sl, si) { cells.push({ wd: wd, sl: sl, si: si }); }); });
    shuffle(cells);
    mine.forEach(function (c, i) {
      var cell = cells[i % cells.length];
      var double = rnd() < 0.08 && cell.si + 1 < slots.length;
      lessons.push({
        id: '', school: s.code, weekday: WEEKDAYS[cell.wd], start: fmtTime(cell.sl[0]),
        end: fmtTime(double ? slots[cell.si + 1][1] : cell.sl[1]), className: c.className, grade: c.grade,
        subject: '', periods: double ? 2 : 1, room: 'Phòng STEM', teacher: '', needAssistant: '', assistant: '', locked: false,
        source: '', explain: '', explainTA: '', notes: '', updatedAt: '', updatedBy: 'demo',
      });
    });
  });
  lessons.sort(function (x, y) {
    return x.school < y.school ? -1 : x.school > y.school ? 1 : parseWeekday(x.weekday) - parseWeekday(y.weekday) || parseTime(x.start) - parseTime(y.start);
  });
  lessons.forEach(function (l, i) { l.id = 'TKB-' + pad(i + 1, 6); });

  return {
    subjects: subjects, schools: schools, classes: classes, teachers: teachers, training: training,
    assistants: assistants, assistantFree: assistantFree, links: links, unavailability: unavailability, lessons: lessons,
  };
}

/* ======================= WebApp.gs ======================= */
/**
 * Điểm vào Web App.
 */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = APP.TITLE;
  return t.evaluate()
    .setTitle('KDI – Xếp lịch STEM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Dùng trong template: <?!= include('Styles'); ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
