# Kiểm kê tài sản cục bộ — Phase 2

Ngày kiểm kê: 27/10/2026. Chỉ đọc dữ liệu tại thư mục gốc `D:/Ielts_Simulators`; không sửa, chuyển, OCR ghi đè hoặc sao chép tài sản vào ứng dụng/public. Báo cáo máy đọc được: [asset-inventory.json](asset-inventory.json).

## Định dạng thực tế

| Nhóm | Cambridge 19 | Cambridge 20 | Cambridge 21 |
| --- | --- | --- | --- |
| Đáp án | 8 JSON | 8 JSON | 8 JSON |
| Listening | `T1_Listening.json` … `T4_Listening.json` | cùng quy ước | cùng quy ước |
| Reading (chỉ kiểm kê) | 4 JSON | 4 JSON | 4 JSON |
| Audio | 16 MP3 theo phần | 16 M4A theo phần | 4 MP3 nguyên bài |
| Quy ước audio | `T{test}S{section}.mp3` | `T{test}S{section}.m4a` | `Cambridge 21 - Test {test}.mp3` |
| MIME phục vụ | `audio/mpeg` | `audio/mp4` | `audio/mpeg` |
| Đề trong `private-assets/pdfs` | PNG từng trang | PNG từng trang | PNG từng trang |

Tổng cộng 342 tệp: 24 JSON, 20 MP3, 16 M4A, 281 PNG và 1 `.DS_Store`. Không tìm thấy PDF trong các thư mục đã kiểm kê. `.DS_Store` được giữ nguyên, không đưa vào manifest phục vụ.

Tất cả 24 JSON hợp lệ UTF-8, mỗi tệp có đúng khóa `1`–`40`, giá trị là mảng chuỗi không rỗng. Chuỗi có dấu được đọc bằng UTF-8; không tự “sửa encoding” theo cách hiển thị của PowerShell. Mảng có thể chứa các biến thể được chấp nhận hoặc một tập đáp án không có thứ tự. Không thể dùng một cách chấm chung “mỗi câu nhận bất kỳ phần tử nào” cho cả hai loại.

Mỗi bản ghi audio được đọc metadata bằng `music-metadata`, kiểm tra có duration hợp lệ, lưu MIME, dung lượng và thời lượng. Ảnh PNG được kiểm tra chữ ký nhị phân. Các tên trang được sắp theo số, tránh xếp `page_10` trước `page_9`. Số trong tên tệp không đồng nhất với số trang in trên sách.

## Ánh xạ Listening

| Bài | Tệp PNG (số trong tên file) | Nhóm chọn hai (cặp số câu) |
| --- | --- | --- |
| 19–1 | 9–14 | 21–22, 23–24 |
| 19–2 | 32–38 | 17–18, 19–20 |
| 19–3 | 54–60 | 17–18, 19–20 |
| 19–4 | 77–82 | 11–12, 13–14 |
| 20–1 | 5–11 | 17–18 (xung đột), 19–20, 21–22, 23–24, 25–26 |
| 20–2 | 41–47 | không có nhóm trong key |
| 20–3 | 79–86 | không có nhóm trong key |
| 20–4 | 116–122 | 11–12, 13–14, 21–22, 23–24 |
| 21–1 | 11–16 | 21–22, 23–24 |
| 21–2 | 33–38 | 11–12, 13–14, 21–22, 23–24, 25–26 |
| 21–3 | 55–60 | 11–12, 13–14, 21–22, 23–24 |
| 21–4 | 76–81 | 11–12, 13–14 |

Nhóm chọn hai đã được đối chiếu trực quan với các ảnh nguồn: 19–1 trang 12; 19–2 trang 35; 19–3 trang 57; 19–4 trang 78; 20–1 trang 7–8; 20–4 trang 117,119; 21–1 trang 14; 21–2 trang 34,36; 21–3 trang 56,58; 21–4 trang 77. Metadata không chứa nguyên văn đề hay đáp án.

**Xung đột cần giữ nguyên:** Cambridge 20 Test 1, ảnh `page_7.png` có tiêu đề/số câu không nhất quán ở nhóm 17–18 và nhãn lựa chọn D–H, trong khi hướng dẫn và JSON sử dụng A–E. Không suy đoán phép đổi nhãn. Engine lưu hai câu nhưng đánh dấu `unscored`, tổng điểm tối đa của bài này là 38. Giao diện hiển thị cảnh báo trước khi bắt đầu và ở kết quả. Muốn giải quyết cần nguồn chính xác hơn; không chỉnh sửa tài sản hiện có.

## Cambridge 19 Test 1 — đối chiếu đầy đủ cấu trúc

| Câu | Dạng tương tác | Ảnh nguồn |
| --- | --- | --- |
| 1–10 | nhập từ/số | page_9.png |
| 11–15 | chọn một A–C | page_10.png |
| 16–20 | chọn chữ A–H cho bản đồ | page_11.png |
| 21–22, 23–24 | chọn hai A–E theo nhóm | page_12.png |
| 25–30 | ghép chữ A–H | page_13.png |
| 31–40 | nhập một từ | page_14.png |

Audio tương ứng `T1S1.mp3`–`T1S4.mp3`; tổng thời lượng metadata khoảng 1.744,953 giây. Timer mô phỏng là `ceil(tổng audio) + 120`, tức 1.865 giây (31:05). Đây là quy tắc mô phỏng của ứng dụng dựa trên file thực tế, không khẳng định thời gian chính thức. Không tự cắt hoặc đặt mốc phần cho audio nguyên bài Cambridge 21.

11 bài còn lại dùng toàn bộ ảnh gốc cùng phiếu trả lời 40 câu. Các nhóm chọn hai đã được đối chiếu; câu đơn dùng ô nhập chữ/từ/số để không suy đoán loại câu và giới hạn lựa chọn từ đáp án. Người học chọn trang nguồn thủ công. Chỉ 19–1 có ánh xạ tự động câu → trang và đầy đủ dạng control đã xác minh. Chưa thẩm định ngữ nghĩa từng đáp án bằng việc nghe toàn bộ 12 bài; JSON hiện có là nguồn chấm, không phải dữ liệu mới do ứng dụng tạo.

## Quy tắc chấm và dữ liệu thiếu

- Server đọc JSON khi chấm; không gửi key hoặc đáp án chuẩn về trình duyệt, kể cả sau khi nộp. Chỉ trả điểm thô và trạng thái từng câu/nhóm.
- Chuẩn hóa Unicode NFKC, chữ thường, khoảng trắng đầu/cuối và nhiều khoảng trắng. Không thêm từ đồng nghĩa, bỏ dấu, bỏ dấu thập phân, tự đổi số hoặc tự mở rộng số ít/số nhiều.
- Nhóm chọn hai chấm theo tập hợp; đảo thứ tự được chấp nhận, lựa chọn lặp không được tính hai lần. Có điểm từng phần.
- Giữ các biến thể tường minh trong JSON kể cả khi cách viết có nhiều từ. Không tự loại một biến thể đã có trong key bằng quy tắc đếm từ suy đoán.
- Thiếu audio, thiếu ảnh, JSON sai cấu trúc hoặc không đọc được duration: API trả lỗi, không tạo đề/đáp án thay thế. Thay đổi tài sản trong khi server đang chạy cần khởi động lại vì metadata được cache trong bộ nhớ.

## Bất biến và quyền riêng tư

`npm run audit:assets` băm SHA-256 toàn bộ 342 tệp. Lần đầu tạo `.local/asset-baseline.json`; các lần sau báo lỗi nếu thêm/xóa/thay đổi tệp. Baseline được tạo trong quá trình thực hiện Phase 2 sau các thao tác đọc ban đầu, trước kiểm thử engine; tài sản không bị ghi trong toàn bộ quá trình.

`docs/asset-inventory.json` chỉ chứa metadata. Key, ảnh và audio vẫn nằm ngoài `web/public`; không được import vào bundle, prerender HTML, hoặc đưa lên dịch vụ ngoài. Đường dẫn tuyệt đối không xuất hiện trong API manifest. Xem [listening-engine.md](listening-engine.md) để biết cơ chế bảo vệ và giới hạn vận hành cục bộ.
