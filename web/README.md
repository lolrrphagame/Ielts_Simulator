# IELTS Simulator — Phase 1

Giao diện Next.js App Router + TypeScript + Tailwind CSS, chạy cục bộ trong `web/`.

## Chạy dự án

```bash
cd web
npm install
npm run dev
```

Mở http://localhost:3000. Kiểm tra bản production bằng `npm run lint`, `npm run build`, sau đó `npm start`.

## Chức năng

- Chọn Cambridge 19/20/21, Test 1–4 và Listening/Reading/Writing/Speaking.
- Chọn Practice Mode hoặc Exam Mode; phần tóm tắt và nút bắt đầu cập nhật theo lựa chọn.
- Điều hướng tới `/exam/[volume]/[test]/[skill]/[mode]`, ví dụ `/exam/21/4/speaking/exam`.
- 96 tổ hợp hợp lệ được sinh từ catalog; tham số không hợp lệ được xử lý bằng trang 404.
- Back to Library khôi phục cả bốn lựa chọn qua query string.
- Bố cục ưu tiên desktop, chuyển thành một cột trên màn hình nhỏ; có radio controls dùng được bằng bàn phím, focus ring và skip link.

## Cấu trúc

- `src/lib/catalog.ts`: catalog chỉ chứa metadata, kiểu dữ liệu, kiểm tra tham số và hàm tạo URL.
- `src/components/library.tsx`: trạng thái lựa chọn và giao diện thư viện.
- `src/components/choice-group.tsx`: nhóm radio tái sử dụng với generic TypeScript.
- `src/components/site-shell.tsx`: header, navigation và footer dùng chung.
- `src/components/icon.tsx`: biểu tượng SVG nội bộ.
- `src/app/exam/[volume]/[test]/[skill]/[mode]/page.tsx`: trang giữ chỗ của phiên luyện tập.
- `src/app/globals.css`: giao diện trắng–xanh, minh họa CSS và responsive styles.

## Phạm vi Phase 1

Các trang bài thi chỉ là placeholder. Chưa có câu hỏi, đáp án Cambridge, phát audio, ghi âm, đồng hồ thi, nộp bài hoặc chấm điểm AI. Practice Mode và Exam Mode hiện là lựa chọn cấu hình, chưa thực thi quy tắc thi.

`audio/`, `answers/` và `private-assets/` ở ngoài ứng dụng, không được import hoặc sao chép vào `web/public`. Các hình bìa trên giao diện là minh họa CSS, không phải bìa sách chính thức. Không cần dịch vụ bên ngoài hoặc tải font khi build.
