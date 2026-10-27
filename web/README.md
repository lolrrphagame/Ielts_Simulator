# IELTS Simulator — Phase 3

Next.js App Router + TypeScript + Tailwind CSS. Thư viện Cambridge 19/20/21 và Listening engine chạy riêng trên máy.

## Khởi động

```bash
cd web
npm install
npm run audit:assets
npm run dev
```

Mở **http://127.0.0.1:3000**. Production: `npm run build` rồi `npm start`. Dev/start sử dụng custom server bind loopback, không công khai tài sản.

## Đã triển khai

- Thư viện chọn Cambridge, Test 1–4, bốn kỹ năng, Practice/Exam; Back to Library giữ lựa chọn.
- Listening: ảnh đề gốc cạnh phiếu trả lời, navigation 1–40, bookmark, MP3/M4A theo phần và MP3 nguyên bài.
- Cambridge 19 Test 1 có ánh xạ đầy đủ ô nhập, chọn một, chọn hai, ghép chữ/bản đồ và trang nguồn. Các bài khác dùng ảnh gốc + phiếu trả lời và nhóm chọn hai đã audit.
- Practice không giới hạn thời gian; Exam có countdown dựa trên audio thực tế + hai phút review, tự nộp và khóa đáp án khi hết giờ.
- Draft localStorage, autosave server, phục hồi sau reload, phát hiện xung đột nhiều tab, nộp bài idempotent và chấm trên server.
- API audio/ảnh được bảo vệ bằng kiểm tra socket/Host/Origin và phiên cookie; streaming hỗ trợ byte-range. Không gửi key đáp án về client.

Cambridge 20 Test 1 có xung đột nguồn ở câu 17–18: lưu nhưng không chấm hai câu này, tổng điểm tối đa 38. Không đoán hoặc sửa dữ liệu gốc. Reading/Writing/Speaking có workspace xem nguồn và lưu bài nháp; không có AI grading hay quy đổi band. Chỉ nội dung Verified được mở trong Exam Mode.

## Kiểm tra

```bash
npm run test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run audit:assets
```

Xem [audit tài sản](docs/asset-audit.md), [manifest kiểm kê](docs/asset-inventory.json) và [kiến trúc, bảo vệ, kiểm thử](docs/listening-engine.md).

Tài sản `../audio/`, `../answers/`, `../private-assets/` giữ nguyên ngoài `web/public`, chỉ đọc tại runtime. Bài làm, secret và hash baseline nằm trong `.local/` đã được ignore. Không triển khai thư mục tài sản hoặc dữ liệu `.local/` lên hosting. Đây là ứng dụng một người dùng trên máy, không phải hệ thống chống gian lận hoặc DRM.

## Pipeline nội dung Phase 3

Đã OCR 281 trang / 48 bộ đề-kỹ năng. Cambridge 19 Test 1 Listening có đủ bốn phần HTML tương tác, inline gaps, lựa chọn thật, bản đồ nguồn và annotation. Speaking của cùng test có ba task card đã đối chiếu. 46 bộ còn lại cần duyệt và ánh xạ câu hỏi; chưa phải đề thi tương tác hoàn chỉnh.

Mở `/review` để đối chiếu nguồn và bản chuyển đổi. Chạy `npm run content:batch` để chạy lại batch có cache; `npm run content:report` cập nhật trạng thái. Xem [hướng dẫn pipeline](docs/content-pipeline.md) và [trạng thái thực tế](../CONTENT_CONVERSION_STATUS.md). Toàn bộ nội dung chuyển đổi nằm trong `../private-content/` đã ignore, ngoài `public`.
