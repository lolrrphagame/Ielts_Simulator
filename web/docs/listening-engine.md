# Listening engine — vận hành và kiểm thử

## Chạy cục bộ

```bash
cd web
npm install
npm run audit:assets
npm run dev
```

Mở **http://127.0.0.1:3000**, chọn Listening. Bản production: `npm run build` rồi `npm start`. Hai lệnh dev/start chạy `scripts/local-server.mjs` và chỉ bind `127.0.0.1`. Không chạy `next start --hostname 0.0.0.0`, reverse proxy, tunnel hoặc triển khai cùng tài sản lên hosting. Nếu bỏ qua custom server, API riêng tư từ chối truy cập vì không có xác thực nội bộ.

Ứng dụng dùng một tiến trình Node, một người dùng cục bộ. Không hỗ trợ chia sẻ tài khoản, nhiều máy, chống gian lận hoặc nhiều worker server. `PORT` có thể thay đổi (1024–65535). Khóa truy cập và bài làm được lưu trong `web/.local/`, đã được Git ignore. Không commit thư mục này. Custom server không dùng chế độ standalone của Next.js.

## Ranh giới bảo vệ

1. Kiểm tra **địa chỉ socket thực**, Host đúng cổng, Origin và Fetch Metadata ở custom server; không chỉ tin header `Host`. Từ chối các header proxy `Forwarded`/`X-Forwarded-*`.
2. `POST /api/local-session` chỉ chấp nhận Origin trùng khớp; tạo cookie HttpOnly, SameSite=Strict. Không trả khóa vào JavaScript/HTML.
3. Server xóa header xác thực nội bộ từ mọi request đầu vào, chỉ gắn lại khi cookie đúng. API dùng so sánh constant-time với secret runtime, mặc định từ chối nếu không có secret.
4. API `/api/private/...` là đường duy nhất đọc ảnh/audio/đáp án. Có `private, no-store`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`; không có CORS cho bên ngoài. URL media được allowlist từ manifest, kiểm tra realpath trong repository; không nhận đường dẫn file tùy ý.
5. Streaming dùng `createReadStream`, không nạp cả MP3 vào RAM. Hỗ trợ GET/HEAD, byte-range đơn, suffix, `206`, `Content-Range`, `416`. Ảnh dùng URL bảo vệ trực tiếp, không qua Next Image optimizer/cache.

Đây là biện pháp giới hạn truy cập cục bộ, **không phải DRM**. Người có quyền truy cập máy hoặc tài khoản hệ điều hành có thể đọc tài sản, draft và secret. Một người dùng cục bộ có thể mở nhiều trình duyệt; không có tài khoản tách biệt. Không tái sử dụng thiết kế này cho môi trường Internet. Cookie HTTP phù hợp loopback; không tuyên bố bảo vệ cho hosting công khai.

## Trạng thái bài làm

- `schema.ts` định nghĩa test/audio/question/answer/attempt/result và kiểm tra runtime cho JSON, test ID, payload câu trả lời, số câu, bookmark, vị trí audio.
- `structure.ts` chỉ chứa cấu trúc từ audit; đề gốc được đọc qua ảnh bảo vệ, không chép câu hỏi vào source công khai.
- `assets.ts` tạo manifest runtime cho đủ 12 bài; `grading.ts` chấm thuần dữ liệu; `attempts.ts` lưu file JSON bằng ghi file tạm + rename và hàng đợi theo attempt ID.
- Client lưu draft ngay khi thay đổi vào localStorage. Đồng bộ server sau 600 ms và thử lại định kỳ 10 giây khi còn dữ liệu chưa lưu. Vị trí audio lưu khoảng mỗi 5 giây; sau reload có thể phát lại tối đa khoảng đó. Lỗi storage hoặc mạng hiển thị rõ.
- Server revision ngăn tab cũ ghi đè tab mới: trả `409`; giao diện khóa chỉnh sửa và yêu cầu reload. Draft chỉ phục hồi nếu revision khớp với server. Nếu server mới hơn, dùng phiên server. Phiên khác nhau theo bài và chế độ.
- Practice không có deadline; được pause/seek/chọn recording. Exam dùng deadline tuyệt đối do server tạo; UI tính thời gian bằng đồng hồ server + `performance.now()`, không reset khi reload. Audio nối tiếp phần, không hiện seek controls trong Exam. Người học nhấn Play audio để tuân theo autoplay policy của trình duyệt.
- Bấm Begin bắt đầu deadline, kể cả khi chưa nhấn Play. Thời gian là tổng duration thực của audio + 120 giây review, ghi rõ trước khi bắt đầu.
- Hết giờ: khóa input và dừng audio, yêu cầu nộp tự động. Server bỏ qua snapshot đến muộn, chấm **bản đã lưu trên server**; chỉnh đồng hồ hay deadline phía client không kéo dài thời gian. Nếu tab/server đóng, trạng thái hết giờ được hoàn tất ở lần truy cập tiếp theo; không có background scheduler. Nếu mất kết nối lúc hết giờ, bản draft chưa sync không được cộng vào bài thi đã hết hạn.
- Submit có xác nhận, kết quả bất biến/idempotent; reload không mở lại bài đã nộp. Bấm Start a new attempt tạo ID mới, giữ file kết quả cũ. Browser lưu tham chiếu đến attempt mới nhất; chưa có trang lịch sử bài làm.

## Kiểm thử

```bash
npm run test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run audit:assets
```

Playwright khởi động production server ở loopback port 3100; cần build trước. Test đọc key cục bộ tại runtime, không hardcode hoặc in đáp án. Chỉ xóa các attempt do test tạo. Không lưu trace/screenshot vào báo cáo; ảnh QA thủ công (nếu có) chỉ ở `.local/`.

- Unit/integration: schema sai, path traversal, chuẩn hóa, chấm đủ 40 câu 19–1 từ key, đảo/trùng đáp án nhóm, câu bỏ trống, manifest 12 bài, metadata thực, xung đột 20–1, Range/416, socket/Host/Origin/proxy, ghi file, revision cạnh tranh, deadline và nộp lặp.
- Browser: Cambridge 19 T1 mở audio MP3, nhập câu, bookmark, resume, chọn nhóm, chấm, khóa đáp án, Back to Library; API bảo vệ/range/MIME; deadline qua reload và auto-submit; mobile 390 px; draft khi offline; trình duyệt giải mã/phát M4A và MP3 nguyên bài, tự chuyển phần.
- Audit cuối đối chiếu hash với baseline để xác nhận tài sản riêng tư không thay đổi.

## Giới hạn được giữ rõ

Cambridge 19 T1 được ánh xạ đầy đủ control và trang. Các bài khác dùng scan + phiếu đáp án; không giả định đã chuyển toàn bộ đề thành text có cấu trúc. Ảnh scan chưa có bản chép văn bản hỗ trợ screen reader. Điểm là kết quả so sánh key địa phương, không phải band IELTS hay AI grading. Reading/Writing/Speaking vẫn là placeholder của Phase 1.
