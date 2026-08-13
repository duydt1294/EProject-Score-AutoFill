# EProject Score Auto-Fill

Extension Chrome hỗ trợ chấm điểm nhanh trên trang **EProject** (e360.poly.edu.vn).

## Cài đặt

1. Mở Chrome, vào `chrome://extensions`.
2. Bật **Chế độ nhà phát triển** (Developer mode) ở góc trên phải.
3. Bấm **Tải tiện ích đã giải nén** (Load unpacked), chọn thư mục `EProject-Score-AutoFill`.
4. (Chỉ cần nếu muốn test trên file HTML tải về) Vào chi tiết extension, bật **Cho phép truy cập URL tệp** (Allow access to file URLs).

## Cách dùng

Khi mở trang chấm điểm (URL `.../CommitteeMember/InputScore...` hoặc file HTML offline), một panel nhỏ "⚡ Auto điền điểm" sẽ xuất hiện góc trên phải trang.

**Điền điểm theo nhóm**
- Nhập điểm trung bình mong muốn vào 1 trong 3 ô: Tài liệu / Nhóm / Cá nhân, rồi bấm **Điền** (hoặc Enter).
- Extension sẽ điền cùng một giá trị vào tất cả các ô điểm (0-10) thuộc nhóm đó, đảm bảo điểm trung bình của nhóm đúng bằng giá trị bạn nhập.
- Có thể nhập cả 3 ô rồi bấm **Điền tất cả**.
- Điểm nhập được làm tròn 1 chữ số thập phân và giới hạn trong khoảng 0-10, giống quy tắc của trang gốc.

**Copy / dán điểm giữa các sinh viên**
- **Copy điểm SV này**: lưu toàn bộ điểm từng tiêu chí, ghi chú từng dòng và ghi chú chung của sinh viên đang mở.
- **Dán điểm vào SV này**: mở trang của sinh viên khác, bấm nút này để dán lại toàn bộ điểm/ghi chú đã copy (khớp theo mã tiêu chí, nên chỉ áp dụng đúng khi 2 phiếu có cùng bộ tiêu chí).

Sau khi điền/dán, tổng điểm và điểm quy đổi trên trang sẽ tự cập nhật như khi bạn gõ tay, vì extension kích hoạt lại đúng cơ chế tính điểm sẵn có của trang.

## Lưu ý

- Chưa tự động bấm nút "Lưu điểm" — bạn vẫn cần kiểm tra lại rồi tự lưu để tránh điền nhầm.
- Dữ liệu copy được lưu tạm trong bộ nhớ trình duyệt (`chrome.storage.local`), tồn tại đến khi bạn copy đè lượt khác.
