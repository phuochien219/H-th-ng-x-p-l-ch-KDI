# KDI Scheduler – Hệ thống xếp lịch giáo viên STEM tự động

Hệ thống xếp lịch giáo viên KDI Education đến dạy STEM tại hơn 70 trường đối tác, xây dựng trên **Google Apps Script**:

- **Dữ liệu** nằm trong một file **Google Sheets**. Mỗi bảng là một sheet, nên AC vẫn có thể xem và sửa trực tiếp như bảng tính quen thuộc.
- **Ứng dụng web** (Apps Script Web App) dùng để xem lịch, xếp lịch tự động, phân công và quản trị.
- **Đăng nhập** bằng email nội bộ `@kdi.edu.vn`, có phân quyền theo vai trò. Tài khoản quản trị gốc `hien.le@kdi.edu.vn` là người duy nhất được thêm hoặc bớt Admin.

---

## 1. Quy trình nghiệp vụ được chuẩn hóa

```
 Trường gửi TKB STEM ──► Sale nhập: lớp nào học CHƯƠNG TRÌNH gì (LopHoc) + TKB ──► sheet LopHoc, TKB
                                                                                     │
 AC quản lý GV: chương trình đã được ĐÀO TẠO (GV_DaoTao), xếp loại, link Google Maps │
 nhà, trường ưu tiên, lịch bận ──► GiaoVien, GV_DaoTao, GV_Truong, LichBan           │
 AC quản lý TRỢ GIẢNG: link Google Maps nhà, GIỜ RẢNH ──► TroGiang, TG_LichRanh       │
 Google Maps: tọa độ từ link + quãng đường XE MÁY nhà → trường ──► KhoangCach         ▼
                     Hệ thống XẾP LỊCH TỰ ĐỘNG cho GV và TRỢ GIẢNG (xem trước → áp dụng → hoàn tác)
                                                                                     ▼
   Lịch theo GV / TG / trường · Cảnh báo trùng lịch · Lịch trống · Xuất Sheets · Gửi email
```

## 2. Tính năng chính

| Nhóm | Tính năng |
|---|---|
| **Xếp lịch tự động – Giáo viên** | Chỉ xếp GV **đã được đào tạo đúng chương trình của lớp** (vd. School - Grade 03). Sau đó xếp theo thứ tự: (1) trường ưu tiên → (2) khoảng cách xe máy → (4) mỗi GV 2–3 trường → (5) cân bằng giờ dạy (khoảng 15h/tuần với GV thường, 10h/tuần với GV kiêm nhiệm). Lớp do **GV của trường** dạy thì không xếp GV KDI. |
| **Xếp lịch tự động – Trợ giảng** | Chỉ xếp trong **giờ rảnh** trợ giảng đã đăng ký, ưu tiên người **ở gần trường nhất** (quãng đường xe máy theo Google Maps), sau đó đến người đang hỗ trợ ở trường đó và cân bằng giờ. |
| **Google Maps** | Dán **link Google Maps** của trường / nhà GV / nhà TG. Hệ thống tự lấy tọa độ (kể cả link rút gọn `maps.app.goo.gl` hoặc địa chỉ chữ) và tính **quãng đường xe máy** (tránh đường cao tốc), lưu lại để dùng cho các lần xếp sau. |
| **Xem trước / hoàn tác** | Mỗi lần chạy đều có **xem trước**, **áp dụng**, **hoàn tác** và lịch sử 15 lần chạy gần nhất. Mỗi phân công kèm **giải thích điểm số**. |
| **Xem lịch** | Lịch tuần dạng lưới hoặc danh sách **theo từng GV, từng trợ giảng** và **theo từng trường** (kèm danh sách lớp – chương trình). Có in, tải CSV, dùng được trên điện thoại. |
| **Cảnh báo trùng lịch** | Phát hiện trùng giờ, không đủ thời gian di chuyển giữa 2 trường, xếp vào lịch bận, GV bị đánh dấu "Không xếp", vượt giờ, quá nhiều trường, môn chưa đào tạo, trường quá xa, mã GV/trường sai. Kiểm tra cả các thay đổi sửa tay trên Sheets. |
| **Lịch trống** | Xem khoảng trống của GV theo từng thứ trong tuần. Tìm GV rảnh trong một khung giờ tại một trường (đã tính thời gian di chuyển), lọc theo môn, quận, loại GV. |
| **Gán tay / tìm GV dạy thay** | Khi bấm vào một tiết, hệ thống xếp hạng mọi GV theo điểm, ghi rõ lý do GV nào không phù hợp, và cho gán bằng 1 cú bấm. Có thể 📌 **ghim** tiết để lần xếp tự động sau không đổi. |
| **Nhập liệu nhanh** | Tạo **file nhập liệu Google Sheets / Excel** có **danh sách thả xuống** cho mọi cột chuẩn hóa được (thứ, loại GV, xếp loại, mã trường, mã GV, mã TG, chương trình…). Điền rồi **tải lên 1 lần**; hệ thống kiểm tra từng dòng trước khi ghi. |
| **Ma trận đào tạo** | Bảng GV × chương trình, đếm số GV đạt so với số lớp đang học từng chương trình, chỉ ra chương trình cần đào tạo thêm GV. |
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
2. Quay lại Google Sheets và tải lại trang. Menu **🗓 KDI Xếp lịch** sẽ xuất hiện, cùng các sheet: `CauHinh`, `NguoiDung`, `MonHoc`, `TruongHoc`, `LopHoc`, `GiaoVien`, `GV_DaoTao`, `TroGiang`, `TG_LichRanh`, `GV_Truong`, `LichBan`, `KhoangCach`, `TKB`, `LichSuXep`, `LichSuXep_ChiTiet`, `NhatKy`.
3. *(Tùy chọn)* Chọn menu **🗓 KDI Xếp lịch → Nạp dữ liệu mẫu** để thử với dữ liệu Hà Nội: 45 trường, 80 GV, 75 trợ giảng, khoảng 690 tiết. **Thao tác này xóa dữ liệu hiện có.**

> Đã cài bản cũ? Sau khi chép code mới, chạy lại `setupSheets` một lần: hệ thống tự thêm sheet và cột mới, dữ liệu cũ được giữ nguyên.

### Bước 4 – Triển khai ứng dụng web
1. Trong trình soạn Apps Script: **Triển khai → Triển khai mới → Loại: Ứng dụng web**.
2. **Thực thi với tư cách:** *Tôi* (chủ sở hữu file).
3. **Người có quyền truy cập:** *Bất kỳ ai trong KDI Education (kdi.edu.vn)*.
4. Bấm **Triển khai**, rồi chép đường link `.../exec` gửi cho mọi người hoặc ghim lên Google Sites nội bộ.

Khi đó, người dùng mở link đang đăng nhập Google bằng tài khoản `@kdi.edu.vn` sẽ **vào thẳng, không cần mật khẩu riêng**. Mỗi lần sửa code cần vào **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** để cập nhật.

> **Phương án dự phòng – đăng nhập bằng mã OTP:** nếu không đọc được email từ phiên Google (ví dụ khi triển khai cho "Bất kỳ ai"), màn hình đăng nhập sẽ yêu cầu nhập email `@kdi.edu.vn`. Hệ thống gửi **mã 6 số** qua email (mã có hiệu lực 10 phút, sai tối đa 5 lần, phiên đăng nhập kéo dài 6 giờ).

### Bước 5 – Nhập dữ liệu thật
1. Vào web → **Nhập dữ liệu từ Excel** → bấm **📄 Tạo file nhập liệu (Google Sheets)**.
   - File tạo ra kèm dữ liệu hiện có. Mọi cột chuẩn hóa được đều có **danh sách thả xuống**; cột mã trường/GV/TG/chương trình lấy danh sách từ chính các sheet trong file.
   - Có thể điền online, hoặc bấm **Tải về dạng Excel**.
   - Bản Excel tĩnh có sẵn: [`mau-du-lieu/Mau_nhap_lieu_KDI.xlsx`](mau-du-lieu/Mau_nhap_lieu_KDI.xlsx).
2. Điền dữ liệu theo thứ tự các sheet (sheet **HuongDan** giải thích từng cột):
   - **MonHoc** – chương trình (`G01` = School - Grade 01 … `G09`, `GK` = School - Grade .K).
   - **TruongHoc** – trường học. Cột **Link Google Maps**: trên Google Maps chọn trường → **Chia sẻ → Sao chép đường liên kết** → dán vào.
   - **LopHoc** – mỗi lớp học **chương trình gì**, có **cần GV KDI** không (Không = GV của trường dạy) và **cần trợ giảng** không.
   - **GiaoVien** – thông tin GV, link Google Maps nhà.
   - **GV_DaoTao** – mỗi dòng là 1 GV × 1 chương trình đã được đào tạo. Chỉ trạng thái **Đạt** mới được xếp dạy.
   - **TroGiang** + **TG_LichRanh** – trợ giảng và các khung **giờ rảnh** trong tuần.
   - **GV_Truong** – trường ưu tiên / không xếp (không bắt buộc).
   - **LichBan** – giờ bận của GV.
   - **TKB** – thời khóa biểu. Cột Mã môn có thể để trống, hệ thống tự lấy theo lớp.
   - **NguoiDung** – tài khoản nhân viên (`AC`, `Sale`, `Xem lịch`, `Giáo viên`, `Admin`).
3. Trên web: dán link file Google Sheets (hoặc chọn file Excel) → **Kiểm tra (chưa ghi)** → **Nhập dữ liệu**.
4. Vào **Danh mục dữ liệu → Trường học** → bấm **🗺 Cập nhật Google Maps** để hệ thống lấy tọa độ và tính quãng đường xe máy. Lần đầu có thể mất vài lượt chạy, mỗi lượt khoảng 4 phút; giao diện tự chạy tiếp cho đến khi xong.

**Hai cách nhập:**
- **Thêm mới + cập nhật theo mã** *(mặc định)*: dòng trùng mã sẽ cập nhật bản ghi cũ.
- **Thay thế**: xóa dữ liệu cũ rồi nhập lại. Riêng TKB chỉ thay thế TKB của các trường có trong file.

---

## 5. Thuật toán xếp lịch

### Ràng buộc cứng – không bao giờ vi phạm khi hệ thống tự xếp
- Một GV không dạy 2 tiết trùng giờ. Giữa 2 tiết ở **2 trường khác nhau** phải đủ thời gian di chuyển: tối thiểu 30 phút, hoặc lâu hơn tùy khoảng cách giữa 2 trường (tốc độ 20 km/h).
- **GV phải được đào tạo đúng chương trình của lớp** (GV_DaoTao, trạng thái "Đạt"). Đây là mặc định; có thể tắt trong Cấu hình.
- Lớp do GV của trường dạy (**Cần GV KDI = Không**) thì không xếp GV KDI.
- Không xếp vào **lịch bận**. Không xếp GV bị đánh dấu **"Không xếp"** tại trường. Không xếp GV ngừng hoạt động.
- **Trợ giảng:** chỉ xếp vào tiết **cần trợ giảng**, và tiết phải nằm trọn trong một khung **giờ rảnh** đã đăng ký.
- Không vượt **giờ tối đa/tuần**: định mức + 3h, có thể chỉnh riêng cho từng GV.
- Không vượt **số trường tối đa**: 3 trường, có thể chỉnh riêng cho từng GV.
- Không vượt **khoảng cách tối đa** (25 km), trừ trường ưu tiên của GV.

### Tiêu chí ưu tiên, xếp theo đúng thứ tự KDI yêu cầu
Mỗi cặp (GV, tiết) được chấm điểm. Trọng số mặc định khiến tiêu chí đứng trước gần như luôn thắng tiêu chí đứng sau:

| Thứ tự | Tiêu chí | Điểm mặc định |
|---|---|---|
| (1) | Trường ưu tiên xếp của GV | **+1000** |
| (2) | Khoảng cách nhà GV → trường (Google Maps, xe máy) | **−20 / km** |
| (3) | GV đã được đào tạo chương trình | bắt buộc (hoặc +100 nếu tắt chế độ bắt buộc) |
| (4) | GV đang dạy ở trường đó / đã có lịch ở trường cùng ngày | +50 / +20 |
| (4) | Thêm trường vượt mức "nên dạy" (2 trường) | −80 |
| (5) | GV còn thiếu giờ so với định mức (10h/15h) | tối đa +40 |
| (5) | Vượt định mức | −30 / giờ |
| — | Xếp loại chất lượng A/B/C/D | +20 / +10 / 0 / −10 |

**Trợ giảng** được chấm điểm riêng:
- Khoảng cách xe máy nhà → trường: **−40 / km**, tức là ưu tiên người ở gần.
- Đang hỗ trợ ở trường đó: +50.
- Đã có lịch ở trường đó cùng ngày: +20.
- Cân bằng giờ: hướng tới 10h/tuần.

Admin chỉnh được mọi trọng số trong **Cấu hình xếp lịch**.

**Nguồn khoảng cách**, theo thứ tự ưu tiên:
1. Số nhập tay ở GV_Truong.
2. Quãng đường xe máy Google Maps ở sheet KhoangCach (tự tính lại khi đổi link/vị trí).
3. Ước tính theo đường chim bay × 1,35, dùng khi chưa tính Google Maps.

**Google Maps và đường xe máy:**
- Mặc định dùng dịch vụ Maps có sẵn của Apps Script, không cần API key, chế độ lái xe **tránh đường cao tốc**. Xe máy không được đi cao tốc nên quãng đường này sát với đường đi thực tế của xe máy.
- Nếu admin nhập **Google Maps API key** trong Cấu hình, hệ thống dùng Routes API chế độ **TWO_WHEELER** (xe 2 bánh) và tính nhanh hơn nhiều.
- Hạn mức miễn phí của Apps Script khoảng vài nghìn lượt mỗi ngày với Google Workspace. Hết hạn mức thì hệ thống dừng và lưu phần đã tính, hôm sau bấm lại để tính tiếp.

### Các bước chạy
1. **Bước 1 – Trường ưu tiên:** xếp trước các tiết có GV ưu tiên, chỉ chọn trong nhóm GV ưu tiên đã được đào tạo đúng môn.
2. **Bước 2 – Xếp theo trường:** trường càng khó (ít GV phù hợp, ở xa) càng được xếp trước. Các tiết của cùng trường xếp liền nhau để gom GV, giúp mỗi GV dạy ít trường.
3. **Bước 3 – Sửa chữa:** với tiết chưa xếp được, thử chuyển 1 tiết đang chặn sang GV khác để giải phóng chỗ.
4. **Bước 4 – Cân bằng giờ dạy:** chuyển bớt tiết từ GV vượt định mức sang GV còn thiếu giờ, nếu điểm không giảm quá ngưỡng.

Tiết không xếp được sẽ có **lý do cụ thể**, ví dụ: *"Không có GV phù hợp: 8 GV trùng giờ dạy; 3 GV đã đủ giờ tối đa; 40 GV quá xa (> 25 km)"*.

> Thử với TKB thực tế Hà Nội (44 trường, 742 tiết/tuần): hệ thống xếp đủ 718/718 tiết cần GV KDI và 714/714 tiết cần trợ giảng trong khoảng 1 giây. Không có trùng lịch, không GV nào dạy chương trình chưa được đào tạo, không trợ giảng nào bị xếp ngoài giờ rảnh.



---

## 6. Vận hành hằng tuần (gợi ý cho AC)
1. Sale nhập hoặc cập nhật TKB mới của trường (**Thời khóa biểu → Dán TKB từ Excel**).
2. Có GV/TG mới hoặc đổi địa chỉ: dán link Google Maps rồi bấm **🗺 Cập nhật Google Maps**.
3. AC vào **Xếp lịch tự động**, chọn **Giáo viên + Trợ giảng → Điền tiết trống → Chạy thử**. Kiểm tra tab *Chưa xếp được* và *Giờ dạy*, rồi bấm **Áp dụng**.
4. Xem **Cảnh báo trùng lịch** và xử lý các mục màu đỏ.
5. Với tiết cần giữ cố định, mở tiết đó và bấm **📌 Ghim**.
6. Khi có GV/TG nghỉ đột xuất, vào **Lịch trống** (chọn GV hoặc Trợ giảng, nhập khung giờ và trường), hoặc mở tiết đó để xem danh sách người thay thế phù hợp nhất.
7. Bấm **Gửi lịch qua email**, hoặc **Xuất Google Sheets** để gửi cho trường.
8. Đầu học kỳ mới: tạo bản sao file Google Sheets để lưu trữ học kỳ cũ.

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
  Import.gs          Nhập dữ liệu hàng loạt; tạo file nhập liệu Google Sheets có danh sách thả xuống
  Maps.gs            Google Maps: tọa độ từ link, quãng đường xe máy nhà → trường
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
