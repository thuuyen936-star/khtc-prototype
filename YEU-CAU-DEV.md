# YÊU CẦU XÂY DỰNG APP KHTC — QUẢN LÝ LỆNH TỔNG & LỆNH CON

> Tài liệu đặc tả cho DEV, mô tả giao diện, tương tác người dùng và logic nghiệp vụ.
> Bản prototype tham chiếu: `index.html` + `data.js` (chạy `npx serve -p 5179`).

---

## PHẦN A — QUY ƯỚC CHUNG

### A1. Đơn vị và định dạng

| Loại dữ liệu | Lưu trữ (backend) | Hiển thị / Nhập liệu (UI) | Ví dụ |
|---|---|---|---|
| **Giá** | VND thực (số nguyên) | **Đơn vị nghìn đồng** | Lưu `24600` → hiện `24.6`; user gõ `15` = 15.000đ |
| **Khối lượng** | Số cổ phiếu | Có dấu phân cách hàng nghìn | `5000` → `5,000` |
| **Giá trị (Net/Filled Value)** | VND thực | VND thực, phân cách hàng nghìn | `123,000,000` |
| **Tỷ lệ %** | — | 2 chữ số thập phân + `%` | `21.00%` |

**Bắt buộc:** mọi phép tính nội bộ (Net Value, Filled Value, khớp chéo, giá bình quân) phải thực hiện trên **giá VND thực**, không dùng giá hiển thị. UI chỉ là lớp quy đổi.

### A2. Bảng màu trạng thái (badge pill)

Tất cả badge dùng chung style: `inline-block`, `padding 4px 10px`, `border-radius` nhỏ, `font-weight 600`.

| Ý nghĩa | Màu chữ | Nền |
|---|---|---|
| Đã gửi | teal `#1AB090` | `rgba(26,176,144,.14)` |
| Chờ xác nhận đặt | vàng `#FFCC00` | `rgba(255,204,0,.14)` |
| Chờ xử lý | xanh dương `#2681E0` | `rgba(38,129,224,.14)` |
| Chờ xác nhận sửa / hủy | vàng warning | `rgba(255,204,0,.16)` |
| Khớp hết / Khớp 1 phần | xanh lá `#26E07C` | `rgba(95,194,85,.14)` |
| Đã hủy | đỏ | `rgba(249,38,38,.14)` |
| Từ chối | đỏ sell | `rgba(219,59,64,.16)` |
| Đã sửa | tím `#C98AFF` | `rgba(201,138,255,.14)` |
| **Người đặt = Auto Twap** | tím `#C98AFF` | `rgba(201,138,255,.14)` |
| **Cảnh báo ngưỡng (% PR, % Khớp/TT)** | vàng warning | `rgba(255,204,0,.16)` |

Quy ước Mua/Bán: **Mua = xanh lá**, **Bán = đỏ** — áp dụng cho text, viền khung đặt lệnh, nút xác nhận.

### A3. Mô hình dữ liệu

**Lệnh tổng (Parent Order)**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `orderId` | string | Số hiệu lệnh tổng, duy nhất |
| `route` | enum | `Manual` / `Broker` |
| `checkPx` | string | Check price |
| `createTime` | time | |
| `instructions` | string | Instructions BBG |
| `status` | enum | Xem A4 |
| `side` | enum | `Mua` / `Bán` |
| `account`, `subaccount` | string | Tài khoản / Tiểu khoản |
| `symbol` | string | Mã CK |
| `qty` | int | Khối lượng đặt |
| `price` | int (VND) | LmtPx — giá giới hạn |
| `fillQty` | int | KL đã khớp (tính từ lệnh con) |
| `avgPx` | int (VND) | Giá khớp bình quân (tính từ lệnh con) |
| `vwap` | int (VND) | VWAP thị trường |
| `orderType` | enum | `LO` (Limit) / `MP` (Market) |
| `marketVol` | int | KL giao dịch toàn thị trường của mã CK |
| `note`, `tradeId` | string | |
| `autoTwap` | enum | `none` / `active` / `paused` / `cancelled` |

**Lệnh con (Child Order)**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `childId` | string | Duy nhất |
| `parentId` | string | FK → lệnh tổng |
| `account`, `subaccount`, `symbol` | string | Kế thừa từ lệnh tổng, **không sửa được** |
| `time` | time | Thời gian đặt |
| `side` | enum | Kế thừa lệnh tổng |
| `orderType` | enum | Kế thừa lệnh tổng |
| `trader` | string | Người đặt. `Auto Twap` = do hệ thống TWAP sinh |
| `qty` | int | KL đặt |
| `price` | int (VND) | Giá đặt |
| `matchQty` | int | KL đã khớp |
| `status` | enum | Xem A4 |

### A4. Trạng thái và vòng đời

**Lệnh tổng:**

```
Chờ xác nhận đặt ──ACK──> Chờ xử lý ──(có lệnh con đầu tiên)──> Đã gửi
        │                     │                                    │
     REJECT              Hủy Fix Net                        (khớp dần)
        ↓                     ↓                                    ↓
    Từ chối               Đã hủy                    Khớp 1 phần ──> Khớp hết

Chờ xác nhận sửa ──ACK──> Đã gửi        Chờ xác nhận hủy ──ACK──> Đã hủy
```

- **Nhóm trạng thái hoạt động (active)**: `Chờ xử lý`, `Đã gửi`, `Khớp 1 phần` → cho phép đặt lệnh con.
- **Nhóm trạng thái kết thúc**: `Đã hủy`, `Khớp hết`, `Từ chối` → chỉ xem, khóa mọi thao tác trừ Detail.
- **Nhóm chờ xác nhận**: `Chờ xác nhận đặt/sửa/hủy` → chỉ ACK/REJECT theo quy tắc B3.

> **Quy tắc ưu tiên trạng thái:** hệ thống chỉ tự chuyển trạng thái giữa `Đã gửi` ⇄ `Khớp 1 phần` ⇄ `Khớp hết` theo khối lượng khớp. **Không** được tự ghi đè các trạng thái vòng đời (`Chờ xác nhận *`, `Chờ xử lý`, `Đã hủy`, `Từ chối`).

**Lệnh con:** `Đã gửi` → `Khớp 1 phần` → `Khớp hết`; hoặc → `Đã hủy` / `Đã sửa`.

### A5. Công thức tính toán (BẮT BUỘC)

Tất cả chỉ số của lệnh tổng được **tổng hợp trực tiếp từ danh sách lệnh con**, không lưu rời rạc:

| Chỉ số | Công thức |
|---|---|
| **Fill Qty** | `Σ matchQty` của **mọi** lệnh con (kể cả đã hủy/đã sửa — phần đã khớp là khớp thật) |
| **REM PL** (Rem Placed) | `Σ (qty − matchQty)` của lệnh con **còn hiệu lực** (loại trừ `Đã hủy` **và** `Đã sửa`) |
| **REM BAL** | `Qty − Fill Qty − REM PL` |
| **KL hủy** | `Σ (qty − matchQty)` của lệnh con `Đã hủy` — chỉ tính phần **chưa khớp** |
| **Avg Px** | `Σ(matchQty × price) / Σ matchQty`; nếu Fill Qty = 0 → để trống (không hiện `0`) |
| **% COMP** | `Fill Qty / Qty × 100` |
| **% Khớp/TT** | `Fill Qty / marketVol × 100` |
| **% PR** | `Avg Px / VWAP − 1` (×100). Chỉ hiện khi Fill Qty > 0 |
| **Net Value** | `Qty × LmtPx` |
| **Filled Value** | `Fill Qty × Avg Px` |

> ⚠️ **Hai lỗi đã phát hiện trong prototype — DEV phải tránh:**
> 1. Lệnh con `Đã sửa` **không được** tính vào REM PL (nếu tính sẽ trùng với dòng lệnh con mới sinh ra sau khi sửa).
> 2. Khi hủy lệnh con đã khớp 1 phần, KL hủy chỉ cộng phần **chưa khớp** (`qty − matchQty`), không cộng toàn bộ `qty`.

### A6. Ngưỡng cảnh báo

| Chỉ số | Ngưỡng | Xử lý khi vượt |
|---|---|---|
| **% PR** | `\|% PR\| > 1%` | Đổi sang badge vàng warning |
| **% Khớp/TT** | `> 20%` | Đổi sang badge vàng warning |

Ngưỡng phải **cấu hình được** (không hardcode).

---

## PHẦN B — ĐẶC TẢ CHỨC NĂNG

## 1. MÀN HÌNH CHÍNH

Bố cục dọc 3 panel:

```
┌─ PANEL 1: Bloomberg và lệnh tổng ───────────────┐
│  [Toolbar 9 nút] + Bảng lệnh tổng (27 cột)      │
├─ PANEL 2: Khu vực Đặt lệnh ─────────────────────┤
│  Form nhập lệnh (tổng / con) + nút Đặt lệnh     │
├─ PANEL 3: Sổ lệnh con trong ngày ───────────────┤
│  Bảng lệnh con (13 cột), lọc theo lệnh tổng     │
└─────────────────────────────────────────────────┘
```

### 1.1. Panel 1 — Bảng "Bloomberg và lệnh tổng"

**Toolbar (trái → phải):** `ACK` · `REJECT` · `Đặt lệnh tổng` · `Sửa lệnh tổng` · `Huỷ từ Fix Net` · `Done 4 Day` · `Detail` · `Auto TWAP` · `Refresh`

Quy ước màu nút:
- **ACK**: xanh lá · **REJECT / Huỷ từ Fix Net**: đỏ
- Các nút còn lại: nền xám, **chữ màu title** (trắng ở dark mode), **không viền màu**
- Trạng thái đang bật (`Đặt lệnh tổng`, `Sửa lệnh tổng` khi đang thao tác): nền gradient xanh dương primary
- Disabled: nền xám, chữ xám mờ, `cursor: not-allowed`, không bắt sự kiện click

**Thứ tự 27 cột:**

`●` (chấm trạng thái) → Route → Chk Px → Account → BBG Account → Instructions BBG → Status → Side → Sec → Qty → LmtPx → **AUTO TWAP** → Fill Qty → Avg Px → VWAP → **% PR** → % COMP → % Khớp/TT → REM BAL → **REM PL** → **KL hủy** → Net Value → Filled Value → Số hiệu lệnh → Create Time → Trade ID → Ghi chú

Màu header: các cột **Fill Qty → Số hiệu lệnh** màu xanh dương (nhóm chỉ số tính toán); các cột còn lại (gồm Qty, LmtPx, AUTO TWAP, Create Time, Trade ID, Ghi chú) màu xám.

**Tương tác:**

| Thao tác | Kết quả |
|---|---|
| Click 1 dòng | Chọn dòng (chấm trạng thái sáng, dòng highlight) → nạp thông tin xuống khu vực Đặt lệnh; lọc Sổ lệnh con theo lệnh tổng đó |
| Click lại dòng đang chọn | Bỏ chọn, khóa khung đặt lệnh, bỏ lọc lệnh con |
| Click header cột | Sắp xếp tăng/giảm (chỉ 1 cột tại 1 thời điểm) |
| Kéo-thả header | Đổi vị trí cột |
| Gõ vào ô tìm kiếm (hàng dưới header) | Lọc theo cột đó, cộng dồn nhiều cột |

- Dòng **"Đã hủy" vẫn phải chọn được** để xem Detail và Sổ lệnh con (chỉ khóa các nút thao tác).
- Bảng hiển thị vừa 10 dòng, cuộn dọc khi nhiều hơn; cuộn ngang khi tràn cột.

### 1.2. Panel 2 — Khu vực Đặt lệnh

**Các trường (theo thứ tự Tab 1→10):**

| # | Trường | Kiểu | Ghi chú |
|---|---|---|---|
| 1-2 | Mua / Bán | Toggle 2 nút | Enter/Space để chọn khi focus |
| 3 | Tài khoản | Search input + autocomplete | Gợi ý `Số TK - Tên TK`, lọc theo ký tự nhập |
| 4 | Tiểu khoản | Select | Lọc theo Tài khoản đang chọn |
| 5 | Chứng khoán | Input (uppercase) | |
| 6 | Loại lệnh | Select | `Limit` / `Market` |
| 7 | Giá | Input số | Đơn vị nghìn |
| 8 | Khối lượng | Input số | |
| 9 | Đặt lệnh | Button | Nhãn/màu đổi theo ngữ cảnh |
| 10 | Refresh | Button | |

**Viền khung:** xanh lá khi đang thao tác lệnh **Mua**, đỏ khi **Bán**; không viền màu khi khung bị khóa.

**Nhãn nút chính** đổi theo ngữ cảnh: `Đặt lệnh Mua/Bán` → `Sửa lệnh Mua/Bán` (khi đang sửa lệnh tổng hoặc lệnh con).

**3 chế độ của khung:**

| Chế độ | Kích hoạt khi | Trạng thái các trường |
|---|---|---|
| **Khóa hoàn toàn** | Chưa chọn lệnh tổng nào và chưa bấm "Đặt lệnh tổng" | Tất cả disabled (xám mờ) |
| **Đặt lệnh tổng** | Bấm nút "Đặt lệnh tổng" | Tất cả mở, focus vào nút Mua |
| **Đặt lệnh con** | Chọn 1 lệnh tổng đang active | Tài khoản/Tiểu khoản/Chứng khoán/**Loại lệnh** khóa (kế thừa lệnh tổng); Giá/KL mở |

### 1.3. Panel 3 — Sổ lệnh con trong ngày

**Tab:** `Sổ lệnh con trong ngày` | `Danh mục chứng khoán`. Tab đang chọn có **vạch chỉ báo phía trên**, màu title, nằm sát mép trên của container.

**13 cột:** Thao tác (`Sửa` / `Hủy` + checkbox hủy hàng loạt) → Tài khoản → Tài khoản BBG → Mã CK → Thời gian → Lệnh → Trạng thái → Kiểu lệnh → **Người đặt** → KL đặt → Giá đặt → KL khớp → KL còn lại

- **Người đặt**: nếu là `Auto Twap` → hiển thị badge **màu tím**; nếu là user thường → chữ thường.
- Nút `Sửa`/`Hủy` bị disabled khi lệnh con ở trạng thái `Đã hủy`, `Đã sửa`, `Khớp hết`, `Chờ xác nhận`.
- Có nút mở rộng panel toàn màn hình.

---

## 2. MÀN HÌNH DETAIL

Mở bằng nút `Detail` (chỉ enable khi đã chọn 1 lệnh tổng — **kể cả lệnh Đã hủy**).

**Nội dung:**

```
📊 BloomBerg - Thông tin lệnh khớp chi tiết
Số hiệu lệnh tổng: <orderId>
┌──────────────────────────────────────┐
│ Tài khoản        │ Tiểu khoản        │
├──────────────────────────────────────┤
│ Loại lệnh │ Mã CK │ Qty │ Fill Qty   │
│ Rem Bal │ Rem Placed │ LMT PX │ AVG PX│
├──────────────────────────────────────┤
│ Instructions Bloomberg               │
│ Ghi chú                    [✏️ sửa]  │
├──────────────────────────────────────┤
│ Bảng lịch sử lệnh con:               │
│ Thời gian│KL đặt│KL khớp│Giá│KL chờ  │
│ xử lý│Trạng thái                     │
└──────────────────────────────────────┘
```

**Yêu cầu:**
- Nhãn dùng đúng thuật ngữ: **Qty, Fill Qty, Rem Bal, Rem Placed, LMT PX, AVG PX** (không dùng "KL chặn/KL khớp/Giá chặn").
- `Rem Bal` và `Rem Placed` là **2 chỉ số khác nhau**, phải bind đúng dữ liệu tương ứng.
- **Sửa Ghi chú:** click icon bút → chuyển thành input → Enter hoặc blur để lưu, Escape để hủy. **Sau khi lưu phải đồng bộ ngay ra cột "Ghi chú" của bảng lệnh tổng bên ngoài.**
- Bảng lịch sử liệt kê **đúng các lệnh con thật** của lệnh tổng (không tách giả lập từ Fill Qty).

---

## 3. ĐẶT LỆNH TỔNG & XÁC NHẬN (ACK / REJECT)

### 3.1. Đặt lệnh tổng

**Luồng:** Bấm `Đặt lệnh tổng` → khung mở, bỏ chọn dòng đang chọn, focus nút Mua → nhập đủ trường → bấm `Đặt lệnh Mua/Bán` → **màn hình xác nhận** → `Xác nhận đặt Mua/Bán` → sinh dòng lệnh tổng mới.

**Màn hình xác nhận (chuẩn dùng chung cho mọi popup lệnh):**
```
┌─────────────────────────┐
│ Xác nhận đặt lệnh    ✕  │
│         HPG             │  ← Mã CK, căn giữa, cỡ lớn
│        [MUA]            │  ← badge Mua/Bán, căn giữa
│ Tài khoản    │ ...      │
│ Tiểu khoản   │ ...      │
│ Giá / Khối lượng / Ghi chú│
│ ✔ Đã xác thực           │
│ [Quay lại] [Xác nhận đặt Mua] │  ← nút xác nhận màu theo Mua/Bán
└─────────────────────────┘
```

**Lệnh tổng mới sinh ra:** `status = Chờ xác nhận đặt`, `route = Broker`, `autoTwap = none`, Fill Qty = 0.

**Loại lệnh Market:** khi chọn `Market` ở chế độ Đặt lệnh tổng → trường Giá **tự động điền Giá Trần (nếu Mua) / Giá Sàn (nếu Bán)** theo Mã CK và **khóa không cho sửa**; Tab từ Loại lệnh nhảy thẳng sang Khối lượng. Đổi Mua/Bán hoặc đổi Mã CK khi đang Market → tự cập nhật lại giá. Chuyển về `Limit` → mở khóa ô Giá.

### 3.2. ACK / REJECT

Nút `ACK` dùng chung cho 3 tình huống, **enable khi lệnh đang chọn ở trạng thái chờ xác nhận**:

| Trạng thái lệnh | ACK mở popup | Kết quả sau xác nhận |
|---|---|---|
| `Chờ xác nhận đặt` | Popup ACK (chọn Check Px 1/2/3) | → `Chờ xử lý`, ghi Chk Px |
| `Chờ xác nhận sửa` | Popup "Xác nhận sửa lệnh tổng" | → `Đã gửi` **+ nếu Auto TWAP đang `active` → tự chuyển `paused`** (xem mục 7.4) |
| `Chờ xác nhận hủy` | Popup "Hủy lệnh từ FixNet" | → `Đã hủy` + hủy toàn bộ lệnh con + Auto TWAP → `cancelled` |

`REJECT` chỉ enable với `Chờ xác nhận đặt` → chuyển `Từ chối`.

**Ma trận enable nút toolbar theo trạng thái:**

| Trạng thái | ACK | REJECT | Sửa lệnh tổng | Huỷ Fix Net | Done 4 Day | Detail |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Chờ xác nhận đặt | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Chờ xác nhận sửa/hủy | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Chờ xử lý | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Đã gửi / Khớp 1 phần | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Khớp hết / Đã hủy / Từ chối** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

> Mọi nút trên (trừ Done 4 Day, Refresh) chỉ enable khi **có 1 dòng lệnh tổng đang được chọn**.

---

## 4. SỬA / HỦY LỆNH TỔNG

### 4.1. Sửa lệnh tổng

**Luồng:** Chọn lệnh tổng → bấm `Sửa lệnh tổng` (nút chuyển nền primary) → khung đặt lệnh chuyển chế độ sửa:
- **Giá và Khối lượng được fill sẵn giá trị gốc của lệnh tổng**, con trỏ tự đặt tại ô Giá.
- Tài khoản / Tiểu khoản / Chứng khoán **khóa** (style disabled xám mờ, hover hiện `not-allowed`).
- Loại lệnh / Giá / Khối lượng **cho phép sửa**.
- Nút chính đổi thành `Sửa lệnh Mua/Bán`, **chỉ enable khi Giá hoặc KL thực sự thay đổi**.

→ Bấm `Sửa lệnh Mua/Bán` → popup xác nhận hiển thị **Giá/KL trước sửa và sau sửa** → xác nhận.

**Sau khi xác nhận:** cập nhật ngay Giá/KL/Net Value của lệnh tổng, **lệnh giữ nguyên trạng thái hoạt động, không qua bước chờ ACK**; khung quay lại chế độ Đặt lệnh con.

### 4.2. Hủy lệnh tổng (Huỷ từ Fix Net)

Bấm `Huỷ từ Fix Net` → popup "**Hủy lệnh từ FixNet**" (tiêu đề **màu đỏ**, header Mã CK + badge Mua/Bán, nút `Xác nhận hủy Mua/Bán` màu theo Mua/Bán).

**Sau khi xác nhận:**
- Lệnh tổng → `Đã hủy`
- **Toàn bộ lệnh con còn hiệu lực → `Đã hủy`**
- **Nếu Auto TWAP đang `active`/`paused` → chuyển `cancelled`**, khóa nút Auto TWAP

---

## 5. ĐẶT / SỬA / HỦY LỆNH CON

### 5.1. Đặt lệnh con

**Điều kiện:** đã chọn 1 lệnh tổng ở trạng thái active (`Chờ xử lý`/`Đã gửi`/`Khớp 1 phần`) **và** `REM BAL > 0` **và** Auto TWAP **không** ở trạng thái `active`.

**Hành vi khung nhập:**
- Tự fill Mua/Bán, Tài khoản (hiện đủ `Số TK - Tên TK`), Tiểu khoản, Chứng khoán, **Loại lệnh** — tất cả **khóa, kế thừa từ lệnh tổng**.
- Giá fill sẵn theo giá lệnh tổng, Khối lượng để trống (user tự nhập).
- Nếu Loại lệnh kế thừa là `Market` → Giá tự điền Trần/Sàn và khóa.
- Con trỏ bắt đầu tại ô Giá (hoặc Khối lượng nếu Giá bị khóa).

**Validate:**
- KL đặt ≤ `Qty` của lệnh tổng
- KL đặt ≤ `REM BAL`
- Giá lệnh con: **Mua ≤ LmtPx**, **Bán ≥ LmtPx** *(khuyến nghị bổ sung — prototype chưa chặn)*

**Popup xác nhận** hiển thị: Mã CK, Mua/Bán, KL, Giá đặt, Giá trị, **Giá TB dự kiến** (bình quân gia quyền các lệnh con còn hiệu lực + lệnh đang đặt).

**Sau khi tạo:** lệnh con `Đã gửi`, người đặt = user hiện tại; **nếu lệnh tổng đang `Chờ xử lý` → tự chuyển `Đã gửi`**; tính lại toàn bộ chỉ số tổng hợp.

### 5.2. Sửa lệnh con

Bấm `Sửa` trên dòng lệnh con → khung chuyển chế độ sửa (Giá/KL fill sẵn giá trị gốc, các trường khác khóa) → nút `Sửa lệnh Mua/Bán` chỉ enable khi có thay đổi → popup xác nhận hiện **Giá/KL trước–sau**.

**Cơ chế sửa = hủy + đặt mới:**
- Dòng gốc → trạng thái **`Đã sửa`** (badge tím)
- Sinh **dòng lệnh con mới** với Giá/KL đã sửa, trạng thái `Đã gửi`
- ⚠️ Dòng `Đã sửa` **không tính vào REM PL** (tránh trùng)

Khi bấm `Sửa` lệnh con, phải **tự tắt** trạng thái đang bật của `Đặt lệnh tổng` / `Sửa lệnh tổng` (đưa 2 nút về trạng thái sẵn sàng).

### 5.3. Hủy lệnh con

- **Hủy đơn lẻ:** bấm `Hủy` → popup xác nhận (header Mã CK + Mua/Bán, nút `Xác nhận hủy Mua/Bán`) → lệnh con → `Đã hủy`, KL còn lại = 0.
- **Hủy hàng loạt:** bật chế độ tick chọn nhiều dòng → popup tổng hợp (Tài khoản, Tiểu khoản, Mã CK, **Số lượng lệnh hủy**, **Tổng KL hủy**) → xác nhận.
- **KL hủy chỉ tính phần chưa khớp** (`qty − matchQty`).

---

## 6. CÀI ĐẶT AUTO TWAP

### 6.1. Điều kiện mở

Nút `Auto TWAP` **enable** khi lệnh tổng đang chọn thỏa **một trong hai**:
- `autoTwap = none` **và** `REM BAL > 0` **và** trạng thái thuộc nhóm active → mở **màn cài đặt mới**
- `autoTwap = active` hoặc `paused` → mở **màn quản lý** (mục 7)

> Lệnh `Chờ xác nhận đặt` (chưa được phép đặt lệnh con) → **không cho cài Auto TWAP**.

### 6.2. Giao diện màn cài đặt

```
Cài đặt Auto TWAP                    ✕
            MWG
           [BÁN]
── Cấu hình chia lệnh ──────────────
Thời gian bắt đầu      [09:00]
Thời gian kết thúc     [11:00]
Tần suất (phút)        [15]
── Phân bổ lệnh theo phiên (REM BAL: 1,600) ──
☑ Khớp lệnh liên tục   [100] %
☐ ATO                  [   ] %
☐ ATC                  [   ] %
── Kết quả tính toán ───────────────
Số lần đẩy lệnh (phiên liên tục)   7
KL mỗi lệnh (phiên liên tục)     200
[thông báo lỗi]
        [Hủy]  [Xác nhận]
```

**Quy tắc nhập:**
- **Thời gian bắt đầu**: mặc định = giờ hiện tại, cho phép sửa.
- **Thời gian kết thúc**, **Tần suất (phút)**: broker tự nhập.
- Mỗi phiên được tick sẽ mở ô nhập **tỷ trọng %**; **tổng các phiên phải = 100%**.
- **Nếu Thời gian bắt đầu > 9h15 → khóa checkbox ATO** (tự bỏ tick nếu đang tick).

### 6.3. Khung giờ phiên & công thức

| Phiên | Khung giờ |
|---|---|
| ATO | 09:00 – 09:15 |
| Khớp lệnh liên tục | 09:15 – 14:30 (**trừ nghỉ trưa 11:30 – 13:00**) |
| ATC | 14:30 – 14:45 |

```
clampedStart   = max(startTime, 09:15)
clampedEnd     = min(endTime,   14:30)
overlapLunch   = phần giao của [clampedStart, clampedEnd] với [11:30, 13:00]
availableMin   = max(0, clampedEnd − clampedStart − overlapLunch)

Số lần đẩy lệnh = floor(availableMin / Tần suất)     (tối thiểu 1 nếu availableMin > 0)
KL phiên liên tục = REM BAL × %liên tục
KL mỗi lệnh       = round(KL phiên liên tục / Số lần đẩy / 100) × 100   ← BỘI SỐ 100
```

> **Bắt buộc:** KL mỗi lệnh TWAP phải là **bội số của 100** (lô chẵn).

### 6.4. Validate khi xác nhận

| Điều kiện | Thông báo |
|---|---|
| Thiếu giờ bắt đầu / kết thúc | "Vui lòng nhập Thời gian bắt đầu / kết thúc." |
| Giờ kết thúc ≤ giờ bắt đầu | "Thời gian kết thúc phải sau Thời gian bắt đầu." |
| Tần suất ≤ 0 | "Vui lòng nhập Tần suất (phút) hợp lệ." |
| Không tick phiên nào | "Vui lòng chọn ít nhất 1 phiên phân bổ lệnh." |
| Phiên đã tick nhưng % ≤ 0 | "Vui lòng nhập tỷ trọng % hợp lệ cho các phiên đã chọn." |
| Tổng % ≠ 100 | "Tổng tỷ trọng % các phiên phải bằng 100% (hiện tại: X%)." |

**Sau khi xác nhận:** lưu cấu hình, `autoTwap` → `active` (nếu trước đó là `none`); nếu đang sửa cấu hình của lệnh `active`/`paused` thì **giữ nguyên trạng thái hiện tại**.

### 6.5. Sinh lệnh con tự động

Theo cấu hình, hệ thống tự đẩy lệnh con vào hệ thống với:
- **Người đặt = `Auto Twap`** (hiển thị badge tím)
- KL mỗi lệnh = KL đã tính ở 6.3, là bội số 100
- Giá theo Loại lệnh của lệnh tổng

---

## 7. QUẢN LÝ LỆNH AUTO TWAP

### 7.1. Màn hình quản lý

Mở khi bấm `Auto TWAP` trên lệnh đã cài đặt:

```
Auto TWAP                            ✕
            MWG
           [BÁN]
┌────────────────────────────────────┐
│ Trạng thái            Hoạt động    │ ← xanh lá / Tạm dừng: vàng
│ Thời gian bắt đầu     09:00        │
│ Thời gian kết thúc    11:00        │
│ Tần suất              15 phút      │
│ Phân bổ phiên         Liên tục 100%│
│ Số lệnh theo kế hoạch 7 lệnh       │
│ Số lệnh đã sinh       3 lệnh       │ ← đếm lệnh con có người đặt = Auto Twap
└────────────────────────────────────┘
      [Sửa]      [Tạm dừng]
```

**Nút:**

| Nút | Màu | Hành vi |
|---|---|---|
| **Sửa** | primary (xanh dương) | Mở lại màn cài đặt, **điền sẵn cấu hình cũ**; lưu xong giữ nguyên trạng thái active/paused |
| **Tạm dừng** | gradient **vàng warning**, chữ trắng | Chỉ hiện khi đang `active` → chuyển `paused` |
| **Tiếp tục** | gradient **xanh lá** | Chỉ hiện khi đang `paused` → chuyển `active` + **tính lại kế hoạch** |

> Màn này **không có nút "Đóng"** ở hàng action (chỉ dùng dấu ✕ ở góc).

### 7.2. Ràng buộc đặt lệnh con theo trạng thái TWAP

| Trạng thái Auto TWAP | Broker đặt lệnh con thủ công |
|---|---|
| `active` (Hoạt động) | ❌ **Không được** — khóa Loại lệnh/Giá/KL, tooltip: *"Auto TWAP đang Hoạt động — không thể tự đặt lệnh con (tạm dừng Auto TWAP để đặt tay)"* |
| `paused` (Tạm dừng) | ✅ Được phép |
| `cancelled` / `none` | Theo quy tắc thường (mục 5.1) |

### 7.3. Tính lại kế hoạch khi bấm "Tiếp tục"

Khi chuyển `paused` → `active`, hệ thống **tính lại số lệnh còn phải sinh** dựa trên **REM BAL hiện tại** (đã thay đổi do lệnh con khớp thêm hoặc do broker đặt tay trong lúc tạm dừng):

```
KL phiên liên tục còn lại = REM BAL hiện tại × %liên tục   (làm tròn bội số 100)
Số lệnh còn lại = ceil(KL còn lại / KL mỗi lệnh)
Số lệnh theo kế hoạch = Số lệnh còn lại + (ATO?1:0) + (ATC?1:0)
```

### 7.4. Tự động chuyển trạng thái

| Sự kiện | Auto TWAP chuyển thành |
|---|---|
| ACK đồng ý yêu cầu **sửa lệnh tổng** (khi đang `active`) | → `paused` (broker phải xem lại kế hoạch, bấm "Tiếp tục" để tính lại theo tham số mới) |
| Lệnh tổng **bị hủy** (Fix Net / ACK hủy) | → `cancelled` |

### 7.5. Cột AUTO TWAP trên bảng lệnh tổng

| Giá trị | Hiển thị |
|---|---|
| `active` | badge **"Hoạt động"** — xanh lá |
| `paused` | badge **"Tạm dừng"** — vàng warning |
| `cancelled` | badge **"Đã hủy"** — đỏ |
| `none` | chữ **"None"** — xám, không nền |

---

## 8. YÊU CẦU KỸ THUẬT KHÁC

### 8.1. Bàn phím & trải nghiệm nhập liệu

**Tab order** trong khu vực đặt lệnh: Mua(1) → Bán(2) → Tài khoản(3) → Tiểu khoản(4) → Chứng khoán(5) → Loại lệnh(6) → Giá(7) → Khối lượng(8) → Đặt lệnh(9) → Refresh(10).
- Tab tại **Refresh** → quay lại **Mua** (vòng lặp trong khung).
- Tab tại **Ghi chú** → sang **Đặt lệnh** (nếu nút đang enable).
- Trường bị disabled tự động bị bỏ qua khi Tab.

**Ô Tài khoản (autocomplete):** `↓`/`↑` di chuyển giữa các dòng gợi ý (có vòng lặp), `Enter` chọn dòng đang highlight.

**Ô Giá / Khối lượng — quy tắc nhập lại giá trị:**
- Khi focus (Tab vào, hoặc **click lần đầu**, kể cả khi ô đã được code focus sẵn) → **select all**; ký tự số đầu tiên gõ vào **thay thế toàn bộ** giá trị cũ.
- **Double/triple-click** vẫn giữ ý định thay thế toàn bộ.
- Chỉ khi user **chủ động click lần thứ 2 vào một vị trí cụ thể**, hoặc dùng phím `←`/`→`/`Home`/`End` → mới chuyển sang chế độ sửa tại chỗ (chèn ký tự).
- Rời khỏi ô (blur) → **tự format** số có dấu phân cách hàng nghìn (Giá theo đơn vị nghìn, KL theo số nguyên).

> ⚠️ **Bài học từ prototype:** không được chỉ dựa vào sự kiện `focus` để bật cờ "thay thế" — khi ô **đã** được `.focus()` bằng code (lúc vào chế độ Sửa lệnh), gọi `.focus()` lần nữa **không phát sinh sự kiện nào**, dẫn đến số gõ vào bị **chèn thêm** vào số cũ (VD: `24,600` gõ `25000` → `24,60025000`). Phải bật cờ **tường minh** tại chỗ điền dữ liệu và **chặn ký tự đầu tiên ở `keydown`**, không phụ thuộc vùng chọn của trình duyệt.

**Phím tắt cho mọi popup:** `Enter` = nút Xác nhận, `Escape` = nút Quay lại/Hủy.

### 8.2. Chuẩn hóa màn hình xác nhận

Mọi popup thao tác lệnh (đặt/sửa/hủy — cả lệnh tổng và lệnh con) dùng chung cấu trúc header: **Mã CK căn giữa dòng trên, badge Mua/Bán căn giữa dòng dưới**; nút xác nhận **màu theo Mua/Bán** và ghi rõ hành động (`Xác nhận đặt Mua`, `Xác nhận sửa Bán`, `Xác nhận hủy Mua`...).

### 8.3. Giao diện & Responsive

- Hỗ trợ **Light / Dark mode** (toggle), dùng CSS custom properties cho toàn bộ màu.
- Font-size tokens: hero 20px, large 16px, medium 14px, small 12px, tiny 10px.
- Responsive: bảng cuộn ngang khi tràn; panel-header xuống dòng; các nút thu nhỏ padding ở màn hình hẹp.
- Bảng cho phép **kéo-thả đổi vị trí cột** và **sort theo cột**.

### 8.4. Nguyên tắc tính toán & đồng bộ

- **Không lưu trùng dữ liệu tổng hợp**: Fill Qty / REM BAL / REM PL / KL hủy / % COMP / % Khớp/TT / Filled Value phải **tính lại từ danh sách lệnh con** mỗi khi có thay đổi (đặt/sửa/hủy/khớp lệnh con).
- Mọi thay đổi trên lệnh con phải **trigger tính lại lệnh tổng cha** và cập nhật lại trạng thái enable của các nút toolbar, khung đặt lệnh, nút Auto TWAP.
- Sửa Ghi chú trong Detail phải đồng bộ ngay ra bảng ngoài.

### 8.5. Các hạng mục prototype chưa xử lý — cần làm rõ trước khi code

| Hạng mục | Ghi chú |
|---|---|
| Nút **Done 4 Day** | Chưa có logic — cần đặc tả nghiệp vụ |
| Nút **Refresh** (toolbar bảng lệnh tổng) | Chưa có logic — dự kiến tải lại dữ liệu từ server |
| Trạng thái lệnh con **`Chờ xác nhận`** | Đã định nghĩa màu nhưng **chưa có luồng nào sinh ra** — cần làm rõ khi nào lệnh con rơi vào trạng thái này |
| Ràng buộc **giá lệnh con vs LmtPx** | Prototype chưa chặn; khuyến nghị chặn (Mua ≤ LmtPx, Bán ≥ LmtPx) |
| Cơ chế **khớp lệnh thật** | Prototype chỉ giả lập cross-match đơn giản cho lệnh Mua; thực tế lấy từ hệ thống khớp lệnh |
| **Đẩy lệnh Auto TWAP theo lịch** | Prototype chỉ ghi nhận cấu hình; bản thật cần scheduler chạy nền theo `startTime`/`interval` |
| Phân quyền người dùng | Chưa đặc tả — cần làm rõ ai được ACK/REJECT, ai được cài Auto TWAP |

---

## PHỤ LỤC — DỮ LIỆU MẪU (đã chuẩn hóa)

10 lệnh tổng phủ đủ các trạng thái và tình huống:

| Order ID | Trạng thái | Auto TWAP | Tình huống demo |
|---|---|---|---|
| LT20260615-01 | Khớp 1 phần | Hoạt động | Nhiều lệnh con, có hủy, có khớp 1 phần |
| LT20260615-02 | Đã gửi | Tạm dừng | TWAP tạm dừng, còn REM BAL 500 để chạy tiếp |
| LT20260616-01 | Chờ xác nhận đặt | None | Chưa ACK → không cho đặt lệnh con / cài TWAP |
| LT20260616-02 | Chờ xử lý | None | Đã ACK, chưa có lệnh con |
| LT20260617-01 | Chờ xác nhận sửa | None | Chờ ACK yêu cầu sửa |
| LT20260617-02 | Đã hủy | None | Vẫn chọn được để xem Detail |
| LT20260617-03 | Khớp hết | None | **% PR = +1.57% → vượt cảnh báo 1%** |
| LT20260617-04 | Chờ xác nhận hủy | None | Chờ ACK yêu cầu hủy |
| LT20260618-01 | Khớp 1 phần | None | Khớp 1 phần thông thường |
| LT20260619-01 | Khớp 1 phần | Hoạt động | **3 lệnh con do Auto TWAP sinh + 1 lệnh broker đặt tay** |

Toàn bộ dữ liệu đã được kiểm tra tự động đảm bảo: `Fill Qty`, `Avg Px` khớp với lệnh con; `REM BAL ≥ 0`; tổng KL lệnh con ≤ Qty; giá lệnh con không vi phạm LmtPx; trạng thái nhất quán với khối lượng khớp; lệnh có Auto TWAP đều còn REM BAL > 0.
