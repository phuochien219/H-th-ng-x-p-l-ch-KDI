# KDI Scheduler – Hệ thống xếp lịch giáo viên STEM tự động

Hệ thống xếp lịch giáo viên KDI Education đến dạy STEM tại hơn 70 trường đối tác, xây dựng trên **Google Apps Script**:

- **Dữ liệu** nằm trong một file **Google Sheets**. Mỗi bảng là một sheet, nên AC vẫn có thể xem và sửa trực tiếp như bảng tính quen thuộc.
- **Ứng dụng web** (Apps Script Web App) dùng để xem lịch, xếp lịch tự động, phân công và quản trị.
- **Đăng nhập** bằng email nội bộ `@kdi.edu.vn`, có phân quyền theo vai trò. Tài khoản quản trị gốc `hien.le@kdi.edu.vn` là người duy nhất được thêm hoặc bớt Admin.

---

## 1. Quy trình nghiệp vụ được chuẩn hóa

```
 Trường gửi TKB STEM ──► Sale nhập TKB (dán từ Excel / form)  ──►  sheet TKB
                                                                    │
 AC quản lý dữ liệu GV: môn đã đào tạo, xếp loại, nhà ở (tọa độ),  │
 trường ưu tiên, khoảng cách, lịch bận  ──►  sheet GiaoVien, GV_Truong, LichBan
                                                                    ▼
                         Hệ thống XẾP LỊCH TỰ ĐỘNG (xem trước → áp dụng → hoàn tác)
                                                                    ▼
      Xem lịch theo GV / theo trường · Cảnh báo trùng lịch · Lịch trống · Xuất Sheets · Gửi email cho GV
```

## 2. Tính năng chính

| Nhóm | Tính năng |
|---|---|
| **Xếp lịch tự động** | Xếp theo đúng thứ tự ưu tiên: (1) trường ưu tiên → (2) khoảng cách → (3) môn đã được đào tạo → (4) mỗi GV 2–3 trường → (5) cân bằng giờ dạy (khoảng 15h/tuần với GV thường, 10h/tuần với GV kiêm nhiệm). Có **xem trước**, **áp dụng**, **hoàn tác** và lịch sử 15 lần chạy gần nhất. Mỗi phân công kèm **giải thích điểm số**. |
| **Xem lịch** | Lịch tuần dạng lưới hoặc danh sách **theo từng giáo viên** và **theo từng trường**. Có in, tải CSV, dùng được trên điện thoại. |
| **Cảnh báo trùng lịch** | Phát hiện trùng giờ, không đủ thời gian di chuyển giữa 2 trường, xếp vào lịch bận, GV bị đánh dấu "Không xếp", vượt giờ, quá nhiều trường, môn chưa đào tạo, trường quá xa, mã GV/trường sai. Kiểm tra cả các thay đổi sửa tay trên Sheets. |
| **Lịch trống** | Xem khoảng trống của GV theo từng thứ trong tuần. Tìm GV rảnh trong một khung giờ tại một trường (đã tính thời gian di chuyển), lọc theo môn, quận, loại GV. |
| **Gán tay / tìm GV dạy thay** | Khi bấm vào một tiết, hệ thống xếp hạng mọi GV theo điểm, ghi rõ lý do GV nào không phù hợp, và cho gán bằng 1 cú bấm. Có thể 📌 **ghim** tiết để lần xếp tự động sau không đổi. |
| **Nhập liệu nhanh** | Tải **file Excel mẫu** (GV, trường, môn, trường ưu tiên, lịch bận, TKB, tài khoản), điền rồi **tải lên 1 lần**. Hệ thống kiểm tra từng dòng trước khi ghi. Sale cũng có thể dán TKB thẳng từ Excel. |
| **Phân tích** | Tổng quan: % tiết đã xếp, công suất GV, GV vượt/thiếu giờ. **Cung – cầu theo môn** (gợi ý môn cần đào tạo thêm GV) và **phân bố theo quận** (gợi ý khu vực cần tuyển GV). |
| **Xuất & thông báo** | Xuất toàn bộ lịch ra file Google Sheets mới (lưới theo GV, theo trường, tổng hợp giờ, chưa xếp, cảnh báo). **Gửi email lịch dạy** cho từng GV. |
| **Quản trị** | Người dùng & phân quyền, cấu hình trọng số/định mức, nhật ký mọi thao tác. |
| **Menu trong Google Sheets** | `🗓 KDI Xếp lịch`: xếp lịch nhanh, tô màu dòng trùng lịch ngay trên sheet TKB, khởi tạo cấu trúc, nạp dữ liệu mẫu. |

## 3. Phân quyền

| Vai trò | Quyền |
|---|---|
| **Admin** | Toàn quyền: quản lý người dùng, cấu hình, nhật ký. **Chỉ quản trị gốc `hien.le@kdi.edu.vn` được cấp hoặc thu hồi quyền Admin.** Không ai thay đổi hay khóa được tài khoản gốc. |
| **Chuyên viên xếp lịch (AC)** | Quản lý GV, trường, môn, khoảng cách, lịch bận và TKB; chạy xếp lịch, phân công, xuất và gửi lịch. |
| **Sale** | Nhập và sửa TKB, thông tin trường; xem lịch. *Không* phân công GV. |
| **Xem lịch** *(mặc định cho tài khoản mới)* | Xem lịch theo GV/trường, lịch trống, cảnh báo. SĐT, địa chỉ và khoảng cách của GV được ẩn. |
| **Giáo viên** | Chỉ xem lịch dạy của chính mình. Hệ thống tự nhận diện khi email đăng nhập trùng cột `Email` trong sheet `GiaoVien`. |
| **Chờ duyệt** | Đăng nhập được nhưng chưa xem được gì. Bật trong Cấu hình nếu muốn mọi tài khoản mới phải chờ Admin duyệt. |

Mọi email không có đuôi `@kdi.edu.vn` đều bị từ chối, ở cả giao diện lẫn phía máy chủ.

---

## 4. Cài đặt (khoảng 15 phút, không cần lập trình)

### Bước 1 – Tạo file Google Sheets và mã Apps Script
1. Đăng nhập Google bằng tài khoản **@kdi.edu.vn** (nên dùng `hien.le@kdi.edu.vn`, vì chủ sở hữu script là người chạy mọi thao tác).
2. Tạo một Google Sheets mới, đặt tên ví dụ `KDI – Dữ liệu xếp lịch STEM`.
3. Trong file đó, chọn **Tiện ích mở rộng → Apps Script**.

### Bước 2 – Chép mã nguồn (cách đơn giản nhất)
Dùng các file trong thư mục [`dist/`](dist):

| Trong trình soạn Apps Script | Chép nội dung từ |
|---|---|
| File `Code.gs` (có sẵn, xóa nội dung cũ) | `dist/Code.gs` |
| **+ → HTML**, đặt tên `Index` | `dist/Index.html` |
| **+ → HTML**, đặt tên `Styles` | `dist/Styles.html` |
| **+ → HTML**, đặt tên `Client` | `dist/Client.html` |
| **+ → HTML**, đặt tên `Views` | `dist/Views.html` |
| `appsscript.json` *(bật "Hiển thị tệp kê khai" trong Cài đặt dự án)* | `dist/appsscript.json` |

> Cách dành cho lập trình viên: dùng [clasp](https://github.com/google/clasp). Chép `.clasp.json.example` thành `.clasp.json`, điền `scriptId`, rồi chạy `npm run push` (đẩy thư mục `apps-script/`).

### Bước 3 – Khởi tạo dữ liệu
1. Trong trình soạn Apps Script, chọn hàm `setupSheets` rồi bấm **Chạy**, và cấp quyền khi được hỏi.
2. Quay lại Google Sheets và tải lại trang. Menu **🗓 KDI Xếp lịch** sẽ xuất hiện, cùng các sheet: `CauHinh`, `NguoiDung`, `MonHoc`, `TruongHoc`, `GiaoVien`, `GV_Truong`, `LichBan`, `TKB`, `LichSuXep`, `LichSuXep_ChiTiet`, `NhatKy`.
3. *(Tùy chọn)* Chọn menu **🗓 KDI Xếp lịch → Nạp dữ liệu mẫu** để thử với 72 trường, 110 GV và 1.450 tiết. **Thao tác này xóa dữ liệu hiện có.**

### Bước 4 – Triển khai ứng dụng web
1. Trong trình soạn Apps Script: **Triển khai → Triển khai mới → Loại: Ứng dụng web**.
2. **Thực thi với tư cách:** *Tôi* (chủ sở hữu file).
3. **Người có quyền truy cập:** *Bất kỳ ai trong KDI Education (kdi.edu.vn)*.
4. Bấm **Triển khai**, rồi chép đường link `.../exec` gửi cho mọi người hoặc ghim lên Google Sites nội bộ.

Khi đó, người dùng mở link đang đăng nhập Google bằng tài khoản `@kdi.edu.vn` sẽ **vào thẳng, không cần mật khẩu riêng**. Mỗi lần sửa code cần vào **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** để cập nhật.

> **Phương án dự phòng – đăng nhập bằng mã OTP:** nếu không đọc được email từ phiên Google (ví dụ khi triển khai cho "Bất kỳ ai"), màn hình đăng nhập sẽ yêu cầu nhập email `@kdi.edu.vn`. Hệ thống gửi **mã 6 số** qua email (mã có hiệu lực 10 phút, sai tối đa 5 lần, phiên đăng nhập kéo dài 6 giờ).

### Bước 5 – Nhập dữ liệu thật (bằng file Excel)
1. Vào web → **Nhập dữ liệu từ Excel** → bấm **Tải file mẫu Excel**. Có thể dùng luôn file [`mau-du-lieu/Mau_nhap_lieu_KDI.xlsx`](mau-du-lieu/Mau_nhap_lieu_KDI.xlsx); file này có sẵn danh sách chọn sổ xuống.
2. Mở file bằng Excel. Sheet **HuongDan** giải thích từng cột. Điền vào các sheet sau và xóa các dòng ví dụ (chữ nghiêng màu xám):
   - **MonHoc**: môn STEM, mã môn ngắn (ví dụ RB = Robotics).
   - **TruongHoc**: trường học. Tọa độ lấy từ Google Maps: nhấp phải vào vị trí trường, bấm vào dòng số đầu tiên của menu.
   - **GiaoVien**: Loại GV (`Thường`/`Kiêm nhiệm`), xếp loại, các môn đã đào tạo (ví dụ `RB, SCR`), email @kdi.edu.vn.
   - **GV_Truong**: trường **Ưu tiên** hoặc **Không xếp** của từng GV, kèm khoảng cách. Không bắt buộc, vì hệ thống tự ước tính khoảng cách từ tọa độ.
   - **LichBan**: giờ bận của GV.
   - **TKB**: thời khóa biểu STEM của các trường.
   - **NguoiDung**: tài khoản nhân viên. Vai trò ghi `AC`, `Sale`, `Xem lịch`, `Giáo viên` hoặc `Admin`.
3. Lưu file → chọn file trên web → **Kiểm tra (chưa ghi)**. Hệ thống báo lỗi theo **số dòng Excel**.
4. Bấm **Nhập dữ liệu**. Có 2 cách nhập:
   - **Thêm mới + cập nhật theo mã** *(mặc định)*: dòng trùng mã sẽ cập nhật bản ghi cũ, cột không có trong file giữ nguyên.
   - **Thay thế**: xóa dữ liệu cũ rồi nhập lại. Riêng TKB chỉ thay thế TKB của các trường có trong file.

Sau đó có thể xem và sửa tiếp trong **Danh mục dữ liệu**, hoặc sửa trực tiếp trên Google Sheets.

---

## 5. Thuật toán xếp lịch

### Ràng buộc cứng – không bao giờ vi phạm khi hệ thống tự xếp
- Một GV không dạy 2 tiết trùng giờ. Giữa 2 tiết ở **2 trường khác nhau** phải đủ thời gian di chuyển: tối thiểu 30 phút, hoặc lâu hơn tùy khoảng cách giữa 2 trường (tốc độ 20 km/h).
- Không xếp vào **lịch bận**. Không xếp GV bị đánh dấu **"Không xếp"** tại trường. Không xếp GV ngừng hoạt động.
- Không vượt **giờ tối đa/tuần**: định mức + 3h, có thể chỉnh riêng cho từng GV.
- Không vượt **số trường tối đa**: 3 trường, có thể chỉnh riêng cho từng GV.
- Không vượt **khoảng cách tối đa** (25 km), trừ trường ưu tiên của GV.
- *(Tùy chọn)* Bắt buộc GV đã được đào tạo môn.

### Tiêu chí ưu tiên, xếp theo đúng thứ tự KDI yêu cầu
Mỗi cặp (GV, tiết) được chấm điểm. Trọng số mặc định khiến tiêu chí đứng trước gần như luôn thắng tiêu chí đứng sau:

| Thứ tự | Tiêu chí | Điểm mặc định |
|---|---|---|
| (1) | Trường ưu tiên xếp của GV | **+1000** |
| (2) | Khoảng cách nhà GV → trường | **−20 / km** |
| (3) | GV đã được đào tạo môn | **+100** (tương đương 5 km) |
| (4) | GV đang dạy ở trường đó / đã có lịch ở trường cùng ngày | +50 / +20 |
| (4) | Thêm trường vượt mức "nên dạy" (2 trường) | −80 |
| (5) | GV còn thiếu giờ so với định mức (10h/15h) | tối đa +40 |
| (5) | Vượt định mức | −30 / giờ |
| — | Xếp loại chất lượng A/B/C/D | +20 / +10 / 0 / −10 |

Admin chỉnh được mọi trọng số trong **Cấu hình xếp lịch**.

### Các bước chạy
1. **Bước 1 – Trường ưu tiên:** xếp trước các tiết có GV ưu tiên, chỉ chọn trong nhóm GV ưu tiên đã được đào tạo đúng môn.
2. **Bước 2 – Xếp theo trường:** trường càng khó (ít GV phù hợp, ở xa) càng được xếp trước. Các tiết của cùng trường xếp liền nhau để gom GV, giúp mỗi GV dạy ít trường.
3. **Bước 3 – Sửa chữa:** với tiết chưa xếp được, thử chuyển 1 tiết đang chặn sang GV khác để giải phóng chỗ.
4. **Bước 4 – Cân bằng giờ dạy:** chuyển bớt tiết từ GV vượt định mức sang GV còn thiếu giờ, nếu điểm không giảm quá ngưỡng.

Tiết không xếp được sẽ có **lý do cụ thể**, ví dụ: *"Không có GV phù hợp: 8 GV trùng giờ dạy; 3 GV đã đủ giờ tối đa; 40 GV quá xa (> 25 km)"*.

> Với dữ liệu mẫu (72 trường, 110 GV, 1.450 tiết/tuần), hệ thống xếp đủ 100% số tiết trong khoảng 1 giây, không có trùng lịch. Mỗi GV dạy 1–3 trường và không ai vượt giờ tối đa.

**Lưu ý cấu hình:** mặc định, điểm "trường ưu tiên" chỉ áp dụng cho các môn GV **đã được đào tạo**. Nhờ đó GV ưu tiên không phải nhận dạy môn chưa được đào tạo. Muốn ưu tiên tuyệt đối theo trường, tắt tùy chọn này trong Cấu hình.

---

## 6. Vận hành hằng tuần (gợi ý cho AC)
1. Sale nhập hoặc cập nhật TKB mới của trường (**Thời khóa biểu → Dán TKB từ Excel**).
2. AC vào **Xếp lịch tự động → Điền tiết trống → Chạy thử**, kiểm tra tab *Chưa xếp được* và *Giờ dạy*, rồi bấm **Áp dụng**.
3. Xem **Cảnh báo trùng lịch** và xử lý các mục màu đỏ.
4. Với tiết cần giữ cố định, mở tiết đó và bấm **📌 Ghim**.
5. Khi có GV nghỉ đột xuất, vào **Lịch trống** (nhập khung giờ và trường) hoặc mở tiết đó để xem danh sách GV thay thế phù hợp nhất.
6. Bấm **Gửi lịch cho GV** để gửi email, hoặc **Xuất Google Sheets** để gửi cho trường.
7. Đầu học kỳ mới: tạo bản sao file Google Sheets để lưu trữ học kỳ cũ.

## 7. Tốc độ & giới hạn của Google Apps Script
- **Lưu tạm dữ liệu:** dữ liệu được lưu tạm 5 phút nên các trang mở nhanh hơn nhiều so với đọc trực tiếp Google Sheets mỗi lần.
  - Thao tác trên web có hiệu lực ngay.
  - Sửa tay trên Google Sheets cũng được cập nhật ngay nhờ trigger `onEdit`. Riêng thao tác **xóa dòng** trên Sheets cần bấm **⟳ Làm mới** ở góc trên ứng dụng, hoặc chờ tối đa 5 phút.
- Lần mở đầu tiên trong ngày thường chậm hơn (khoảng 2–4 giây) vì Google phải "khởi động" script. Đây là đặc điểm của Apps Script.

- Mỗi lần chạy tối đa 6 phút (thuật toán hiện chạy khoảng 1–2 giây). Gửi email bị giới hạn khoảng 1.500 email/ngày với Google Workspace.
- Dữ liệu đọc trực tiếp từ Sheets, nên mỗi thao tác mất khoảng 1–3 giây. Hệ thống dùng `LockService` để 2 người cập nhật cùng lúc không ghi đè nhau.
- Mã OTP và phiên đăng nhập OTP lưu trong `CacheService`, có thể hết hạn sớm hơn 6 giờ.

---

## 8. Dành cho lập trình viên

```
apps-script/         Mã nguồn Apps Script (đẩy bằng clasp)
  Config.gs          Hằng số, vai trò, quyền, cấu hình mặc định, cấu trúc các sheet
  Utils.gs           Hàm tiện ích (giờ, thứ, khoảng cách, email…)
  Db.gs              Đọc/ghi Google Sheets theo tên cột, khóa ghi đồng thời, nhật ký
  Scheduler.gs       ★ Thuật toán xếp lịch, chấm điểm, xếp hạng GV cho 1 tiết
  Conflicts.gs       Phát hiện trùng lịch, lịch trống, số liệu tổng quan
  Auth.gs            Đăng nhập (Google Workspace / OTP), phân quyền, quản lý người dùng
  Api.gs             Điểm vào duy nhất api(action, args, token) + kiểm tra quyền tập trung
  Import.gs          Nhập dữ liệu hàng loạt từ file Excel (kiểm tra từng dòng)
  Export.gs          Xuất Google Sheets, gửi email lịch dạy
  Setup.gs           Menu trong Sheets, khởi tạo sheet, dữ liệu mẫu
  WebApp.gs          doGet()
  Index/Styles/Client/Views.html   Giao diện web (JavaScript thuần, không thư viện ngoài)
dist/                Bản gộp 1 file Code.gs để chép–dán (tạo bằng npm run build)
mau-du-lieu/         File Excel mẫu (tạo lại: python3 tools/make_template_xlsx.py)
tests/               Bộ giả lập Apps Script + kiểm thử (Node ≥ 18, không cần cài gói)
tools/dev-server.js  Chạy giao diện trên máy cá nhân với dữ liệu mẫu, không cần Google
```

```bash
npm test          # chạy toàn bộ kiểm thử (thuật toán, phân quyền, API, bản gộp)
npm run dev       # mở http://localhost:8080 – có thanh chọn tài khoản để thử từng vai trò
npm run build     # tạo lại dist/ sau khi sửa apps-script/
```

**Bảo mật:** mọi hàm công khai trong Apps Script đều gọi được từ trình duyệt qua `google.script.run`. Vì vậy các hàm nội bộ được đặt tên kết thúc bằng `_` (Apps Script chặn gọi các hàm này từ client). Các hàm menu kiểm tra quyền của người gọi bằng `requireSheetRole_`, còn mọi thao tác của web đi qua `api()` và được kiểm tra quyền tại đó.

**Hướng phát triển gợi ý:** đồng bộ lịch dạy vào Google Calendar của GV; lấy khoảng cách thực tế bằng Google Maps (`Maps.newDirectionFinder`); quản lý nhiều học kỳ trong cùng một file; cho GV tự đăng ký lịch bận và chờ AC duyệt; theo dõi chấm công và dạy thay.
