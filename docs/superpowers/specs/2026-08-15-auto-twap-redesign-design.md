# Thiết kế: Redesign Auto TWAP (cài đặt + quản lý)

Ngày: 2026-08-15

## Bối cảnh

Màn hình Cài đặt Auto TWAP hiện tại (`modal-auto-twap` trong `index.html`) yêu cầu người dùng tự
chọn phiên (ATO / Liên tục / ATC) và tự nhập tỷ trọng % cho từng phiên, tổng phải bằng 100%. Yêu cầu
mới là bỏ bước nhập tay này: hệ thống tự suy ra ATO/ATC có cần lập kế hoạch hay không dựa vào khung
giờ, và luôn chia đều khối lượng cho mọi lệnh trong kế hoạch (kể cả ATO/ATC), tuân thủ chẵn lô 100.

Màn hình Quản lý (xem lại cài đặt, `modal-auto-twap-review`) hiện chỉ hiển thị số liệu tổng hợp (số
lệnh kế hoạch, số lệnh đã sinh) mà không cho thấy từng lệnh trong kế hoạch đang ở trạng thái nào. Yêu
cầu mới là hiển thị chi tiết từng lệnh: đã đẩy hay chưa, đã khớp đến đâu.

## 1. Màn Cài đặt Auto TWAP (`modal-auto-twap`)

Bỏ hoàn toàn khối "Phân bổ lệnh theo phiên": 3 checkbox (`twap-chk-continuous/ato/atc`) và 3 ô nhập %
(`twap-pct-continuous/ato/atc`), cùng validate "tổng % phải bằng 100".

Giữ lại đúng 3 trường nhập:
- Thời gian bắt đầu (`twap-start-time`)
- Thời gian kết thúc (`twap-end-time`)
- Tần suất, phút (`twap-interval`)

Thêm khối xem trước **"Dự kiến"**, cập nhật real-time mỗi khi người dùng đổi 1 trong 3 trường trên
(giữ cơ chế `onAutoTwapInputsChanged` → `recalcAutoTwapPreview`), hiển thị:
- Số lệnh từng loại (ATO/Liên tục/ATC) và tổng số lệnh
- KL mỗi lệnh
- Nếu tần suất bị hệ thống tự điều chỉnh (xem mục 2): hiển thị thêm dòng ghi chú tần suất hiệu lực,
  VD: "Tần suất đã điều chỉnh: 30 phút (do khối lượng còn lại không đủ chia theo tần suất đã nhập)"

## 2. Thuật toán lập kế hoạch

Thay thế `computeTwapPushCount`, `computeTwapPerPushQty`, và phần validate/tính trong
`confirmAutoTwapSetup` bằng một hàm lập kế hoạch duy nhất, ví dụ `computeAutoTwapPlan(startMin,
endMin, interval, remBal)`, trả về `{ ato, atc, contCount, effectiveInterval, perOrderQty,
lastOrderQty, plan: [...], error }`.

Các mốc thời gian phiên giữ nguyên hằng số đã có: `TWAP_ATO_START=9:00`, `TWAP_ATO_END=9:15`,
`TWAP_CONT_START=9:15`, `TWAP_CONT_END=14:30`, `TWAP_LUNCH_START=11:30`, `TWAP_LUNCH_END=13:00`.
Bổ sung `TWAP_ATC_TIME = 14:30` (mốc lập kế hoạch cho lệnh ATC).

```
hasAto = startMin < TWAP_ATO_END               // < 9:15
hasAtc = endMin   >= TWAP_CONT_END              // >= 14:30 (đã xác nhận, thay vì 14:45)

clampedStart  = max(startMin, TWAP_CONT_START)
clampedEnd    = min(endMin, TWAP_CONT_END)
overlapLunch  = max(0, min(clampedEnd, LUNCH_END) - max(clampedStart, LUNCH_START))
availableMin  = max(0, clampedEnd - clampedStart - overlapLunch)

contCount  = availableMin > 0 ? floor(availableMin / interval) : 0
totalCount = contCount + (hasAto?1:0) + (hasAtc?1:0)

maxByLot100 = floor(remBal / 100)
requiredFixed = (hasAto?1:0) + (hasAtc?1:0)

nếu maxByLot100 < requiredFixed:
    → error: "REM BAL quá nhỏ, không đủ 100 cổ phiếu cho các lệnh ATO/ATC bắt buộc."
    (dừng, không lập kế hoạch)

nếu totalCount > maxByLot100:
    contCount = maxByLot100 - requiredFixed         // có thể bằng 0
    totalCount = contCount + requiredFixed
    effectiveInterval = contCount > 0 ? floor(availableMin / contCount) : null
    (đánh dấu "đã điều chỉnh" để hiển thị ghi chú ở mục 1)
ngược lại:
    effectiveInterval = interval

nếu totalCount === 0:
    → error: "Khung giờ/tần suất không hợp lệ, không lập được kế hoạch."

perOrderQty = floor(remBal / totalCount / 100) * 100    // KL của mọi lệnh trừ lệnh cuối
// Lệnh cuối cùng theo thời gian (ATC nếu có, ngược lại lệnh liên tục cuối cùng, ngược lại ATO)
lastOrderQty = remBal - perOrderQty * (totalCount - 1)   // nhận phần dư, đảm bảo khớp REM BAL
```

**Sinh danh sách `plan[]`** (mỗi phần tử: `{ seq, session, timeMin, qty }`, sắp theo thời gian tăng dần):
- Nếu `hasAto`: 1 phần tử `session:'ato'`, `timeMin: TWAP_ATO_START` (09:00)
- `contCount` phần tử `session:'continuous'`, thời điểm = `clampedStart + i*effectiveInterval` với
  `i = 0..contCount-1`; nếu một thời điểm rơi vào `[LUNCH_START, LUNCH_END)` thì dời tới
  `LUNCH_END` rồi tiếp tục cộng dồn từ đó cho các lệnh sau (tính liên tục, không cộng dồn lệch pha)
- Nếu `hasAtc`: 1 phần tử `session:'atc'`, `timeMin: TWAP_ATC_TIME` (14:30)

Gán `qty = perOrderQty` cho mọi phần tử trừ phần tử cuối cùng trong mảng (theo thời gian) nhận
`qty = lastOrderQty`.

## 3. Lưu trữ cấu hình (`autoTwapConfigs[orderId]`)

Thay cấu trúc cũ (`sessions: {continuous, ato, atc}` theo %) bằng:

```js
{
  startTime, endTime, interval,       // như cũ — giá trị người dùng nhập
  effectiveInterval,                  // tần suất thực tế dùng để lập kế hoạch (có thể khác interval)
  plannedCount,                       // = plan.length, giữ để tương thích chỗ đang đọc plannedCount
  plan: [ { seq, session, timeMin, qty }, ... ]
}
```

`countAutoTwapGeneratedOrders` giữ nguyên (đếm lệnh con trader "Auto Twap" đã sinh cho lệnh tổng).

## 4. Màn Quản lý (`modal-auto-twap-review`)

Bỏ dòng "Phân bổ phiên" (`twapview-sessions`). Các dòng tổng hợp còn lại (Trạng thái, Thời gian bắt
đầu/kết thúc, Tần suất, Số lệnh theo kế hoạch, Số lệnh đã sinh) giữ nguyên; dòng Tần suất hiển thị
`effectiveInterval` kèm ghi chú "(đã tự điều chỉnh)" nếu khác `interval` gốc.

Thêm bảng mới **"Chi tiết kế hoạch đặt lệnh"**, mỗi dòng ứng với 1 phần tử trong `plan[]`, 6 cột:

| STT | Phiên | Thời gian dự kiến | KL kế hoạch | TT đẩy lệnh | TT khớp |
|---|---|---|---|---|---|

- **Phiên**: nhãn hiển thị — ATO / Liên tục / ATC
- **Thời gian dự kiến**: `timeMin` format `HH:mm`
- **KL kế hoạch**: `qty`, định dạng như các cột số lượng khác (`formatQty`)
- **TT đẩy lệnh**: "Chưa đẩy" / "Đã đẩy" — xác định bằng cách khớp tuần tự `plan[]` với các lệnh con
  có `trader === 'Auto Twap'` của cùng lệnh tổng, theo đúng thứ tự sinh (phần tử thứ i của plan ứng
  với lệnh con Auto Twap thứ i, nếu tồn tại)
- **TT khớp**: nếu chưa đẩy → "—"; nếu đã đẩy → lấy trạng thái lệnh con tương ứng, map:
  `Chờ khớp → "Chưa khớp"`, `Khớp 1 phần → "Khớp 1 phần"`, `Khớp hết → "Khớp hết"` (các trạng thái
  hủy/từ chối khác nếu phát sinh thì hiển thị nguyên trạng thái đó)

## 5. Đồng bộ dữ liệu mẫu

3 lệnh seed hiện có (`LT20260615-01`, `LT20260615-02`, `LT20260619-01`) đang gọi `seedAutoTwapConfig`
với tham số `contPct` (kiểu cũ). Cập nhật hàm seed để dùng `computeAutoTwapPlan` mới (bỏ tham số
`contPct`), và kiểm tra lại các lệnh con mẫu có `trader: 'Auto Twap'` trong `data.js` cho 3 lệnh tổng
này — số lượng/khối lượng lệnh con mẫu cần khớp hợp lý với `plan[]` mới được tính ra (điều chỉnh nếu
lệch, theo đúng cách đã làm ở các lượt sửa dữ liệu trước — ví dụ vụ tick-size `CO20260615-10`).

## Ngoài phạm vi

- Không đổi hành vi Tạm dừng/Tiếp tục (`toggleAutoTwapPauseResume`) hay các quy tắc khoá Auto TWAP
  khi có ACK sửa/hủy — các luồng này giữ nguyên, chỉ đọc lại `plan[]` mới khi cần tính lại.
- Không thêm cơ chế tự động sinh lệnh con thật theo lịch (`plan[].timeMin`) — đây là prototype hiển
  thị dữ liệu mẫu, không có scheduler chạy nền.
