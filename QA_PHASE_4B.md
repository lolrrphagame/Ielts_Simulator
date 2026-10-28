# Phase 4B — Cambridge 19 Test 1 Reading Passage 3

Ngày kiểm tra: 28/10/2026.

## Đã hoàn thành

- Đối chiếu trực tiếp năm ảnh nguồn `page_24.png`–`page_28.png`. Chuyển Passage 3 thành 8 đoạn HTML có ID ổn định; nối đúng đoạn thứ năm qua ranh giới trang, giữ tiêu đề phụ, dấu nháy, dấu gạch và tên có dấu. Giữ cách viết của bản gốc, kể cả khác biệt chính tả Mỹ trong passage và Anh trong câu hỏi.
- Câu 27–30: radio một lựa chọn A–D với đủ nội dung lựa chọn thật.
- Câu 31–36: sáu dropdown inline A–J trong đoạn tóm tắt, kèm đủ mười cụm từ nguồn. Không nhầm thành ô tự nhập hoặc chỉ A–H.
- Câu 37–40: YES / NO / NOT GIVEN đúng yêu cầu gốc, không đổi thành TRUE / FALSE.
- Cả ba tab passage hiển thị đúng passage/câu hỏi tương ứng; ảnh nguồn vẫn tùy chọn, ẩn mặc định. Giữ câu trả lời và annotation khi đổi tab hoặc reload.
- Validator xác nhận **40 vị trí duy nhất từ 1 đến 40**, đủ từng passage và phrase bank khớp options. Certification kiểm tra key riêng trên server và gắn hash cho nguồn, nội dung, review certificate và key. Không gửi key về client.
- Hash phần dữ liệu Passage 1–2 trước/sau giống nhau. Không đổi ID annotation cũ. Bản sao nội dung trước sửa nằm trong `.local` đã ignore.

## Kiểm tra và lỗi đã sửa

- `npm run lint`: đạt.
- `npm test`: **15/15 đạt**.
- `npm run build`: đạt.
- `npm run test:e2e`: **15/15 đạt** sau sửa lỗi.
- E2E Reading điền đủ 40 vị trí bằng fixture key riêng, kiểm tra giá trị đã lưu, chuyển cả ba passage, lựa chọn đúng kiểu, note/highlight, reload và Unhighlight. Test bảo vệ các study draft có sẵn bằng lưu/khôi phục; không xóa bài làm người dùng.
- Sửa test Passage 2 vốn giả định nhóm chọn hai đang trống: test nay xử lý bài đã có lựa chọn rồi khôi phục trạng thái cũ khi kết thúc.
- Sửa toolbar annotation bị nằm ngoài viewport khi chọn một đoạn dài; giới hạn vị trí toolbar trong màn hình. E2E mới bao phủ đoạn thứ năm của Passage 3.
- Hồi quy Listening vẫn đạt 40/40, audio và autosave/timer/submission hoạt động; các luồng Writing, Speaking và private API tiếp tục đạt.
- `npm run audit:assets`: **342 tệp nguồn không thay đổi**. Nội dung chuyển đổi, review, backup và key vẫn riêng tư, ngoài `web/public`, được ignore. Không thay `.gitignore`, không commit/push.

## Trạng thái và giới hạn

- Không còn điểm chưa rõ được phát hiện khi đối chiếu văn bản, chỉ dẫn và dạng đáp án của Passage 3 với các ảnh nguồn hiện có.
- C19 T1 Reading hiện được chứng nhận đủ ba passage/40 vị trí. Catalog: **4 unit Verified / 44 unit Needs Review**; không tự xác minh các bộ khác.
- Reading có nội dung và lưu bài làm hoàn chỉnh, nhưng **chưa có engine nộp/chấm điểm hoặc countdown riêng cho Reading**. Route Exam cho nội dung Verified dùng workspace hiện có; đây không phải tuyên bố đã hoàn thiện mô phỏng toàn bộ kỳ thi Reading. Grading Listening không thay đổi.
- `QA_REPORT.md` là báo cáo giai đoạn trước; báo cáo này cập nhật trạng thái Reading sau Phase 4B.

## Tệp chính

- `web/src/lib/study-content.ts`: single-choice, phrase bank và validation đủ 40 vị trí.
- `web/src/lib/server/conversion-store.ts`: chứng nhận Reading, đối chiếu options/key và hash.
- `web/src/components/study-workspace.tsx`, `annotation-tools.tsx`, `web/src/app/globals.css`: renderer và vị trí toolbar.
- `web/tests/e2e/reading-passage3.spec.ts`, `web/tests/reading-content.test.ts`, cập nhật test hồi quy theo trạng thái Verified mới.
- `private-content/Cambridge19/T1_Reading/reviewed.json`, `reviewed-verification.json`, `verification.json`, `passage-3-review.json`: dữ liệu riêng, không đưa vào Git.

Mở `/exam/19/1/reading/practice?passage=3` sau khi chạy `npm run dev` trong `web/`.
