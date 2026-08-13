# Score Auto-Fill Extension

Tiện ích Chrome hỗ trợ chấm điểm nhanh hơn, tự nhận diện đúng chế độ theo vai trò đang sử dụng và hiện panel thao tác phù hợp.

## Cài đặt

1. Mở Chrome, vào `chrome://extensions`.
2. Bật **Chế độ nhà phát triển** (Developer mode) ở góc trên phải.
3. Bấm **Tải tiện ích đã giải nén** (Load unpacked), chọn thư mục `EProject-Score-AutoFill`.
4. (Chỉ cần nếu muốn test trên file HTML tải về) Vào chi tiết extension, bật **Cho phép truy cập URL tệp** (Allow access to file URLs).

## Chế độ chấm điểm chi tiết

Khi mở phiếu chấm điểm của từng người, panel "⚡ Auto điền điểm" xuất hiện.

**Điền điểm theo nhóm (tự nhận diện)**
- Panel tự đọc số nhóm tiêu chí và tên nhóm ngay trên phiếu đang mở, tự sinh ra đúng số ô nhập tương ứng — không cố định trước một bộ nhóm cụ thể nào.
- Nếu bộ tiêu chí thay đổi (đổi tên nhóm, gộp/tách nhóm, thêm/bớt nhóm...), panel tự bắt kịp mà không cần chỉnh sửa gì thêm, chỉ cần mở lại phiếu.
- Nhập điểm trung bình mong muốn vào ô của nhóm tương ứng rồi bấm **Điền** (hoặc Enter). Extension điền cùng một giá trị vào toàn bộ ô điểm thuộc nhóm đó, đảm bảo điểm trung bình đúng bằng giá trị nhập, và tuân theo giới hạn thang điểm sẵn có.
- Nếu phiếu có nhiều nhóm, danh sách ô nhập sẽ cuộn được để panel gọn gàng.

**Điền ghi chú hàng loạt**
- Nhập nội dung vào ô "Ghi chú" rồi bấm **Điền** (hoặc Enter) để áp dụng cho tất cả ô ghi chú theo từng tiêu chí trên phiếu.
- Có tuỳ chọn áp dụng luôn cho ô ghi chú chung.
- Nút **Điền tất cả** điền cùng lúc mọi nhóm điểm đã phát hiện được lẫn ghi chú (bỏ qua ô nào để trống).

**Copy / dán giữa các phiếu**
- Copy toàn bộ điểm và ghi chú của phiếu đang mở.
- Dán lại vào phiếu khác — khớp theo từng tiêu chí, chỉ chính xác khi 2 phiếu dùng chung bộ tiêu chí.

## Chế độ tổng hợp theo nhóm

Khi mở trang tổng hợp điểm của cả một nhóm, panel "⚡ Ghi chú hàng loạt" xuất hiện, liệt kê các thành viên trong nhóm kèm checkbox.

- Mặc định tất cả được tick chọn. Có thể chọn/bỏ chọn riêng từng người nếu chỉ muốn áp dụng cho một số thành viên.
- Nhập nội dung rồi bấm **Điền cho người đã chọn** (hoặc Ctrl+Enter) để điền cùng một nội dung ghi chú cho tất cả các mục đã chọn.
- Extension chỉ điền vào ô, **không tự lưu** — vẫn cần thao tác lưu thủ công như bình thường.

**Gợi ý nhận xét**
- Nút **💡 Điền gợi ý nhận xét** điền sẵn nội dung mẫu, chung chung vào các ô nhận xét bắt buộc để có sẵn ý tưởng, đỡ phải viết từ đầu.
- Mặc định chỉ điền vào ô còn trống, **không đè lên nội dung đã viết**. Có tuỳ chọn ghi đè nếu muốn thay thế toàn bộ.
- Đây chỉ là nội dung mẫu để gợi ý — **cần đọc lại và chỉnh sửa cho đúng với từng trường hợp cụ thể** trước khi lưu.

## Chế độ duyệt điểm

Khi mở trang có cột "Duyệt" cho từng thành viên trong nhóm, panel "⚡ Duyệt điểm hàng loạt" xuất hiện, liệt kê những người đang chờ duyệt kèm checkbox (mặc định chọn hết).

- Bỏ chọn riêng ai đó nếu chưa muốn duyệt, hoặc dùng **Chọn tất cả / Bỏ chọn tất cả**.
- Bấm **✅ Duyệt tất cả sinh viên đã chọn**: chỉ hiện **một** hộp thoại xác nhận duy nhất cho toàn bộ lượt chọn, thay vì phải xác nhận riêng từng người như thao tác gốc.
- Sau khi xác nhận, extension xử lý lần lượt từng người đã chọn và hiển thị **một** thông báo tổng kết duy nhất (số lượng thành công / các trường hợp lỗi nếu có), rồi tự tải lại trang để cập nhật trạng thái.
- Nếu tất cả thành viên trong nhóm đã được duyệt từ trước, panel chỉ hiển thị thông tin, không có nút thao tác.

## Lưu ý chung

- Ở chế độ chấm điểm chi tiết và chế độ tổng hợp theo nhóm, extension chỉ điền vào ô — **không tự lưu**, luôn để bạn kiểm tra lại trước khi lưu.
- Riêng thao tác duyệt điểm là hành động ghi nhận ngay lập tức sau khi xác nhận (gộp nhiều lượt duyệt vào một lần xác nhận), vì đây vốn là một thao tác xác nhận hàng loạt theo yêu cầu, không phải điền nháp.
- Dữ liệu copy được lưu tạm trong bộ nhớ trình duyệt, tồn tại đến khi bạn copy đè lượt khác.
