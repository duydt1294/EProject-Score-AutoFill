# EProject Score Auto-Fill

Extension Chrome hỗ trợ chấm điểm nhanh trên trang **EProject** (e360.poly.edu.vn) và trên các bản HTML tải về offline có cùng cấu trúc. Tự động nhận diện đúng panel theo từng role.

## Cài đặt

1. Mở Chrome, vào `chrome://extensions`.
2. Bật **Chế độ nhà phát triển** (Developer mode) ở góc trên phải.
3. Bấm **Tải tiện ích đã giải nén** (Load unpacked), chọn thư mục `EProject-Score-AutoFill`.
4. (Chỉ cần nếu muốn test trên file HTML tải về) Vào chi tiết extension, bật **Cho phép truy cập URL tệp** (Allow access to file URLs).

## Role: Ủy viên (trang InputScore)

Khi mở trang chấm điểm chi tiết từng sinh viên (`.../CommitteeMember/InputScore...`), panel "⚡ Auto điền điểm" xuất hiện góc trên phải.

**Điền điểm theo nhóm (tự nhận diện, không hardcode)**
- Panel tự đọc số nhóm tiêu chí và tên nhóm ngay trên phiếu đang mở (dựa vào `data-criteriatype` và tên tiêu chí), rồi tự sinh ra đúng số ô nhập tương ứng — không cố định 3 nhóm Tài liệu/Nhóm/Cá nhân như trước.
- Nếu trường/môn đổi bộ tiêu chí (đổi tên nhóm, gộp/tách nhóm, thêm/bớt nhóm...), panel sẽ tự bắt kịp mà không cần sửa code — chỉ cần mở lại trang.
- Nhập điểm trung bình mong muốn vào ô của nhóm tương ứng rồi bấm **Điền** (hoặc Enter). Extension điền cùng một giá trị vào tất cả ô điểm (0-10) thuộc nhóm đó, đảm bảo điểm trung bình đúng bằng giá trị nhập.
- Điểm được làm tròn 1 chữ số thập phân và giới hạn 0-10, giống quy tắc của trang gốc.
- Nếu phiếu có nhiều nhóm, danh sách ô nhập sẽ cuộn được để panel không quá dài.

**Điền ghi chú hàng loạt**
- Nhập nội dung vào ô "Ghi chú" rồi bấm **Điền** (hoặc Enter): áp dụng cho tất cả ô ghi chú theo từng tiêu chí trên phiếu.
- Tick "Áp dụng cho cả Ghi chú chung" nếu muốn điền luôn ô ghi chú chung.
- Nút **Điền tất cả (điểm + ghi chú)** điền cùng lúc mọi nhóm điểm đã phát hiện được lẫn ghi chú (bỏ qua ô nào để trống).

**Copy / dán điểm giữa các sinh viên**
- **Copy điểm + ghi chú SV này**: lưu toàn bộ điểm từng tiêu chí, ghi chú từng dòng và ghi chú chung của sinh viên đang mở.
- **Dán điểm + ghi chú vào SV này**: mở trang sinh viên khác, bấm nút này để dán lại (khớp theo mã tiêu chí, chỉ đúng khi 2 phiếu cùng bộ tiêu chí).

## Role: Thư ký hội đồng (trang CheckIn / tổng hợp điểm nhóm)

Khi mở trang tổng hợp điểm cả nhóm (`.../CommitteeSecretary/CheckIn...`), panel "⚡ Ghi chú hàng loạt" xuất hiện, liệt kê toàn bộ sinh viên trong nhóm kèm checkbox.

- Mặc định tất cả sinh viên được tick chọn. Dùng **Chọn tất cả / Bỏ chọn tất cả** hoặc tick/bỏ tick riêng từng sinh viên nếu chỉ muốn áp dụng cho một số em.
- Nhập nội dung vào ô văn bản rồi bấm **Điền cho SV đã chọn** (hoặc Ctrl+Enter) để điền cùng một nội dung vào ô "Ghi chú nộp bài" của tất cả sinh viên đã chọn.
- Extension chỉ điền vào ô, **không tự lưu** — bạn vẫn cần bấm icon Save ở từng dòng để lưu ghi chú, đúng như thao tác gốc của trang.

**Gợi ý nhận xét hội đồng**
- Nút **💡 Điền gợi ý nhận xét hội đồng** điền sẵn nội dung mẫu, chung chung vào 5 ô nhận xét bắt buộc (Tính nghiên cứu, Tính ứng dụng, Điểm mạnh, Hạn chế, Kết luận) để có sẵn ý tưởng, đỡ phải viết từ đầu.
- Mặc định chỉ điền vào ô còn trống, **không đè lên nội dung bạn đã viết**. Tick "Ghi đè nội dung đã có" nếu muốn thay thế toàn bộ bằng nội dung mẫu.
- Ô "Ghi chú khác" (không bắt buộc) không bị điền vì không nằm trong 5 ô bắt buộc.
- Đây chỉ là nội dung mẫu để gợi ý — **bắt buộc đọc lại và chỉnh sửa cho đúng với từng đề tài** trước khi bấm Lưu nhận xét.

## Lưu ý chung

- Extension không tự động bấm nút lưu ở bất kỳ trang nào — luôn để bạn kiểm tra lại trước khi lưu.
- Dữ liệu copy (ở role Ủy viên) được lưu tạm trong `chrome.storage.local`, tồn tại đến khi bạn copy đè lượt khác.
