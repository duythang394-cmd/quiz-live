# Quiz Live — thi đấu theo nhóm

Website quiz realtime gồm trang thí sinh, trang quản trị riêng, sảnh chờ, 30 câu hỏi, 8 giây/câu, chấm điểm và bảng xếp hạng cá nhân/nhóm.

## Chạy trên máy tính

Cần Node.js 20 trở lên.

```bash
npm install
```

Linux/macOS:

```bash
ADMIN_PASSWORD='dat-mat-khau-dai-va-kho-doan' npm start
```

Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD='dat-mat-khau-dai-va-kho-doan'
npm start
```

Mở `http://localhost:3000` cho thí sinh và `http://localhost:3000/admin.html` cho quản trị. Để thử trên cùng Wi-Fi, người khác truy cập `http://IP-MAY-TINH:3000` (cho phép Node.js qua firewall nếu được hỏi).

## Đưa lên mạng bằng Render

1. Tạo tài khoản GitHub và tạo repository mới.
2. Giải nén dự án, tải toàn bộ nội dung thư mục này lên repository (giữ `package.json`, `server.js`, `public/`, `render.yaml`). Không tải `node_modules` hay file `.env` lên GitHub.
3. Trong Render, chọn **New → Blueprint** và kết nối repository đó. Render sẽ đọc `render.yaml`.
4. Khi Render yêu cầu giá trị `ADMIN_PASSWORD`, đặt một mật khẩu dài, riêng tư và khó đoán. Không chia sẻ mật khẩu này cho thí sinh.
5. Deploy xong, mở URL `https://...onrender.com` cho thí sinh. Trang quản trị là URL đó cộng `/admin.html`.
6. Cấu hình hiện tại dùng persistent disk tại `/var/data` để giữ dữ liệu JSON qua lần khởi động lại. Persistent disk có thể yêu cầu gói trả phí trên nhà cung cấp; kiểm tra giá và điều kiện hiện hành trước khi xác nhận.

Nếu tạo Web Service thủ công thay vì Blueprint:
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment:** `ADMIN_PASSWORD` đặt mật khẩu; `DATA_DIR=/var/data`
- **Disk:** tạo persistent disk và mount tại `/var/data`.

## Dùng trang quản trị

1. Vào `/admin.html`, nhập mật khẩu `ADMIN_PASSWORD`.
2. Ở **Thiết lập nhóm**, nhập tên nhóm, mỗi dòng một nhóm, rồi bấm **Lưu danh sách nhóm**.
3. Ở **Ngân hàng câu hỏi**, nhập đủ 30 câu. Mỗi câu gồm nội dung, 4 đáp án và chọn đáp án đúng A/B/C/D. Bấm **Lưu 30 câu hỏi**.
4. Chia sẻ URL chính với thí sinh. Họ nhập họ tên và chọn nhóm đã tạo.
5. Khi sẵn sàng, bấm **Bắt đầu cuộc thi**. Tất cả thí sinh đang ở sảnh chờ sẽ thấy cùng câu hỏi và đồng hồ. Mỗi câu kéo dài 8 giây.
6. Sau câu 30, trang tự hiển thị bảng cá nhân, bảng nhóm và đáp án.

## Quy tắc tính điểm

- Trả lời đúng: 1.000 điểm cơ bản.
- Có thưởng tốc độ tối đa 500 điểm cho đáp án đúng được gửi sớm.
- Trả lời sai hoặc bỏ qua: 0 điểm.
- Điểm nhóm là tổng điểm của các thành viên thuộc nhóm đó. Bảng nhóm xếp theo tổng điểm; bảng cá nhân xếp theo điểm cá nhân.

## Lưu ý quan trọng

- Website được thiết kế cho một phiên thi diễn ra trên một tiến trình Node.js. Không chạy nhiều instance đồng thời vì trạng thái hiện được lưu trong JSON cục bộ.
- Thí sinh nên giữ nguyên tab trong suốt bài thi. Nếu đóng/trình duyệt tải lại, phiên trả lời hiện tại không có cơ chế khôi phục danh tính tự động.
- Dữ liệu gồm tên, nhóm, điểm và câu hỏi được lưu trong `DATA_DIR/state.json`. Chỉ thu thập thông tin cần thiết và bảo vệ URL quản trị/mật khẩu.
- Trước khi thi thật, hãy thử một vòng bằng 30 câu mẫu, kiểm tra âm lượng/mạng và xác nhận thời lượng 8 giây phù hợp.
