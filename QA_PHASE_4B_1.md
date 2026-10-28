# Phase 4B.1 — Reading UX

Ngày kiểm tra: 28/10/2026.

## Thay đổi

- Reading không tự mở bản nháp chung khi vào từ thư viện. Chọn **Start New Attempt** để tạo mã lượt làm mới với đáp án, highlight và ghi chú trống; chọn **Resume Attempt** để tiếp tục một lượt đã lưu.
- Mỗi lượt có file lưu, revision và localStorage key riêng. Tạo lượt mới không xóa hoặc sao chép đáp án của lượt trước. Reload URL của lượt đang mở vẫn khôi phục bài đó.
- Bài cũ trước thay đổi này được giữ nguyên dưới tên **Previous saved draft** trong danh sách Resume. Không đoán hoặc xóa những câu trả lời cũ vì chúng có thể là bài làm có chủ ý.
- Phrase bank A–J gọn trong hai cột; mỗi chữ/cụm từ xuất hiện đúng một lần. Sáu dropdown câu 31–36 vẫn inline, chỉ hiển thị chữ A–J, không lặp chữ hoặc ghép lại nội dung cụm từ.
- Giữ nguyên nội dung ba passage, 40 ánh xạ câu hỏi và tất cả tài sản chuyển đổi riêng tư. Listening/Writing/Speaking giữ hành vi hiện có.

## Cách ly dữ liệu kiểm thử

- `npm test` tạo thư mục `.local/test-runs/unit-<uuid>` mới cho mỗi lần chạy.
- Playwright tạo `.local/test-runs/e2e-<uuid>`; server test, access secret, Reading/Listening attempts và study drafts đều dùng cùng thư mục riêng đó.
- Production mặc định vẫn dùng `.local`, với dữ liệu cũ không di chuyển. Biến server-only `IELTS_DATA_ROOT` được runner thiết lập; HTTP không được chọn đường dẫn lưu.
- So sánh SHA-256 trước/sau: **14 tệp phiên thật không thay đổi**. Audit nguồn: **342 tệp không thay đổi**. Không sửa `.gitignore`, không commit/push.

## Kết quả QA

- Lint và production build đạt; không còn cảnh báo tracing filesystem toàn project.
- **16/16 unit tests đạt**: lượt mới trống, revision độc lập, bảo toàn legacy draft, từ chối ID/path/mode sai, đủ 40 vị trí và bảo vệ key.
- **16/16 E2E đạt**: tạo hai lượt độc lập, kiểm tra toàn bộ các ô ở cả ba passage đều trống khi bắt đầu mới, lưu/resume đúng lượt và annotation, reload, hai cột phrase bank trên desktop/mobile, mười nhãn A–J và sáu dropdown không trùng.
- Hồi quy Listening vẫn chấm 40/40; audio, timer, offline autosave, Writing, Speaking và API riêng tư đều đạt.
- Một lỗi đồng bộ trong test mới đã được sửa: chờ lượt mới tải xong trước khi đọc ID trong URL. Không có lỗi còn lại trong các luồng đã kiểm thử.

Tệp chính: `reading-attempt-picker.tsx`, `content-review.tsx`, `reading-attempts.ts`, `study-drafts.ts`, `local-data.ts`, `private-api.ts`, CSS và cấu hình/runner kiểm thử. Không sửa văn bản nguồn hoặc private answer keys.
