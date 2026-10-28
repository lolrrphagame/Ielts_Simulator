# QA — IELTS Simulator, 28/10/2026

## Kết quả thực tế

- Cambridge 19 / Test 1 / Reading Passage 2: đã đối chiếu `page_19.png`–`page_23.png`, giữ 7 đoạn A–G, tiêu đề phụ và chú thích. Ghép các dòng scan thành đoạn HTML; giữ nguyên từ ngữ, dấu sở hữu, dấu gạch nối và số năm theo ảnh nguồn.
- Câu 14–19: ghép đoạn A–G, cho phép lặp chữ. Câu 20–21 và 22–23: hai nhóm chọn đúng hai lựa chọn A–E. Câu 24–26: ba ô inline trong đoạn tóm tắt. Đối chiếu giá trị lựa chọn với key riêng trên server; không đưa key vào nội dung client.
- Điều hướng Passage 1/2/3 hoạt động; hai cột chỉ hiển thị passage/câu hỏi đang chọn. Passage đang mở được giữ trong URL khi reload. Điều chỉnh độ rộng bằng thanh kéo, bàn phím hoặc slider. Scan ẩn mặc định; danh sách trang nguồn thay đổi theo passage.
- Highlight/Underline/Copy/Add Note, click vào annotation để Unhighlight hoặc Edit Note; xóa một highlight không xóa underline chồng lên. Câu trả lời và annotation vẫn lưu qua chuyển passage/reload. ID của Passage 1 không thay đổi.
- Các sửa trước đó được giữ: 15 vị trí ký tự trong Listening đã đối chiếu nguồn (dấu sở hữu, dấu nháy, £, dấu khoảng câu hỏi); không thay toàn bộ `?`. Thay thế cùng độ dài để giữ offset annotation. Listening có input gọn và dropdown chữ cái; Writing có hai task text, biểu đồ crop riêng và zoom; Speaking hiển thị một part mỗi lần.

## Kiểm thử

- `npm run lint`: đạt.
- `npm run build`: đạt.
- `npm test`: **14/14 đạt**.
- `npm run test:e2e`: **14/14 đạt**. Bao gồm Passage 2 đủ 13 ô, giới hạn chọn hai, passage switching, scan tùy chọn, reload, Unhighlight, mobile; kiểm thử hồi quy Listening 40/40, audio 19/20/21, timer, offline autosave, server scoring và API riêng tư; Writing editor/chart và Speaking notes/timer.
- `npm run audit:assets`: 342 tệp nguồn gốc không đổi.
- Nội dung chuyển đổi/certificate/backup nằm trong thư mục riêng đã ignore; `.gitignore` không bị sửa trong đợt này. Không reset, commit hoặc push. Các test lưu/khôi phục study draft đã tồn tại và chỉ xóa attempt do test tạo.

## Phạm vi xác minh và phần còn lại

- Reading **Passage 1–2 / câu 1–26** được xác minh bằng certificate gắn hash. **Passage 3 / câu 27–40 vẫn Needs Review**; nút điều hướng mở trạng thái và ảnh nguồn tùy chọn. Không đánh dấu toàn bộ Reading Verified, không mở full Reading Exam.
- Toàn bộ catalog vẫn có **3 unit Verified / 45 unit Needs Review**: Listening, Writing và Speaking của C19 T1 là ba unit Verified. Xác minh một phần Reading không được tính thành xác minh cả unit.
- Không phát hiện lỗi hồi quy trong bộ kiểm thử đã chạy. Những OCR chưa đối chiếu ở các bộ khác vẫn cần review; lệnh kiểm tra chất lượng chỉ gắn cờ, không tự đoán ký tự hoặc xác minh văn bản.
- Reading hiện lưu bài làm, chưa có nộp/chấm điểm riêng cho toàn bài Reading. Grading Listening hiện có vẫn hoạt động. Speaking recording/playback chưa bật; giao diện và preparation timer đã có, không AI grading. Writing không tự chấm điểm.

## Nhóm tệp thay đổi

- `web/src/lib/study-content.ts`, `web/src/lib/server/reviewed-study.ts`, `conversion-store.ts`: schema câu hỏi, kiểm tra provenance/certificate và tải nội dung riêng.
- `web/src/components/study-workspace.tsx`, `annotation-tools.tsx`, `content-review.tsx`, `listening/question-document.tsx`, `web/src/app/globals.css`: workspace từng kỹ năng, passage navigation, lựa chọn nhóm, annotation và bố cục.
- `web/src/lib/ocr-quality.ts`, `web/scripts/convert-content.ts`, `web/package.json`: kiểm tra OCR bảo thủ, giữ crop đã duyệt và báo cáo trạng thái.
- `web/tests/reading-content.test.ts`, `web/tests/e2e/reading-passage2.spec.ts`, `refinement.spec.ts`, cùng cập nhật các test hiện có.
- Riêng tư: `private-content/Cambridge19/T1_Reading/reviewed.json`, `reviewed-verification.json`, `passage-2-review.json`; các sửa nội dung Listening/Writing và backup được giữ ngoài Git.

Mở `http://127.0.0.1:3000/exam/19/1/reading/practice?passage=2` sau khi chạy `npm run dev` trong `web/`.
