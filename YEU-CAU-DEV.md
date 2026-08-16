# YÊU CẦU XÂY DỰNG APP KHTC — QUẢN LÝ LỆNH TỔNG & LỆNH CON

> Tài liệu đặc tả cho DEV, mô tả giao diện, tương tác người dùng và logic nghiệp vụ.
> Bản prototype tham chiếu: `index.html` + `data.js` (chạy `npx serve -p 5179`).
>
> **File này là nguồn duy nhất.** Không giữ bản `.docx` song song trong repo — hai bản
> sẽ lệch nhau và DEV đọc nhầm bản cũ. Cần bản Word để gửi ra ngoài thì xuất từ file này
> tại thời điểm gửi.

---

## PHẦN A — QUY ƯỚC CHUNG

### A1. Đơn vị và định dạng

| Loại dữ liệu | Lưu trữ (backend) | Hiển thị / Nhập liệu (UI) | Ví dụ |
|---|---|---|---|
| **Giá** (đặt lệnh: LmtPx, Chk Px…) | VND thực (số nguyên) | **Đơn vị nghìn đồng**, tối đa **2** chữ số thập phân | Lưu `24600` → hiện `24.6`; user gõ `15` = 15.000đ |
| **Avg Px** (giá khớp bình quân) | VND thực, **cho phép lẻ** | Đơn vị nghìn đồng, tối đa **6** chữ số thập phân | Lưu `24570.333333` → hiện `24.570333` |
| **VWAP** | VND thực, **cho phép lẻ** | Đơn vị nghìn đồng, tối đa **4** chữ số thập phân | Lưu `24615.256789` → hiện `24.6153` |
| **Khối lượng** | Số cổ phiếu | Có dấu phân cách hàng nghìn | `5000` → `5,000` |
| **Giá trị (Net/Filled Value)** | VND thực | VND thực, phân cách hàng nghìn, **làm tròn về đồng** | `123,000,000` |
| **Tỷ lệ %** | — | 2 chữ số thập phân + `%` | `21.00%` |

> **Avg Px và VWAP là giá bình quân gia quyền nên hầu như luôn lẻ** — backend phải trả về số thực,
> không làm tròn về số nguyên VND. Dùng `maximumFractionDigits` (không phải `minimumFractionDigits`)
> nên giá chẵn vẫn hiện gọn: `24570` → `24.57`, không phải `24.570000`.

**Bắt buộc:** mọi phép tính nội bộ (Net Value, Filled Value, khớp chéo, giá bình quân) phải thực hiện trên **giá VND thực**, không dùng giá hiển thị. UI chỉ là lớp quy đổi.

### A2. Bảng màu trạng thái (badge pill)

Tất cả badge dùng chung style: `inline-block`, `padding 4px 10px`, `border-radius` nhỏ, `font-weight 600`.

| Ý nghĩa | Màu chữ | Nền |
|---|---|---|
| Đã gửi | teal `#1AB090` | `rgba(26,176,144,.14)` |
| Chờ xác nhận đặt | vàng warning | `rgba(255,204,0,.16)` |
| Chờ xử lý | xanh dương `#2681E0` | `rgba(38,129,224,.14)` |
| Chờ xác nhận sửa / hủy | vàng warning | `rgba(255,204,0,.16)` |
| Khớp hết / Khớp 1 phần | xanh lá `#26E07C` | `rgba(95,194,85,.14)` |
| Đã hủy | đỏ | `rgba(249,38,38,.14)` |
| Từ chối | đỏ sell | `rgba(219,59,64,.16)` |
| Đã sửa | tím `#C98AFF` | `rgba(201,138,255,.14)` |
| **Người đặt = Auto Twap** | tím `#C98AFF` | `rgba(201,138,255,.14)` |
| **Cảnh báo ngưỡng (% PR, % Khớp/TT)** | vàng warning | `rgba(255,204,0,.16)` |

Quy ước Mua/Bán: **Mua = xanh lá**, **Bán = đỏ** — áp dụng cho text, viền khung đặt lệnh, nút xác nhận.

**Nhãn hiển thị viết tắt (cột Status):** `Chờ xác nhận` rút gọn thành `CXN` để vừa bề rộng cột —
`Chờ xác nhận đặt` → `CXN đặt`, `Chờ xác nhận sửa` → `CXN sửa`, `Chờ xác nhận hủy` → `CXN hủy`.
Đây **chỉ là nhãn hiển thị**; toàn bộ tên trạng thái dùng trong bảng A5/A6, sơ đồ vòng đời A4 và các
ca kiểm thử bên dưới vẫn dùng tên đầy đủ — đó là giá trị lưu trữ mà mọi logic so sánh, không phải
chuỗi hiển thị trên UI.

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
| `avgPx` | **decimal** (VND) | Giá khớp bình quân (tính từ lệnh con) — **không làm tròn**, xem A1 |
| `vwap` | **decimal** (VND) | VWAP thị trường — **không làm tròn**, xem A1 |
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
| `matchTime` | time | Thời gian khớp — **chỉ có khi** `status` là `Khớp 1 phần` / `Khớp hết`; lệnh chưa khớp để trống |
| `side` | enum | Kế thừa lệnh tổng |
| `orderType` | enum | Kế thừa lệnh tổng |
| `trader` | string | Người đặt. `Auto Twap` = do hệ thống TWAP sinh |
| `qty` | int | KL đặt |
| `price` | int (VND) | Giá đặt. Lệnh `LO` khớp đúng giá đặt ⇒ "Giá khớp" ở màn Detail = `price` |
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
| **Avg Px** | `Σ(matchQty × price) / Σ matchQty` — **không làm tròn**, hiển thị tới 6 chữ số thập phân; nếu Fill Qty = 0 → để trống (không hiện `0`) |
| **% COMP** | `Fill Qty / Qty × 100` |
| **% Khớp/TT** | `Fill Qty / marketVol × 100` |
| **% PR** | Chênh lệch Avg Px so với VWAP, **mang dấu theo chất lượng khớp**:<br>• Lệnh **Mua**: `−(Avg Px / VWAP − 1) × 100` → âm khi `Avg Px > VWAP`<br>• Lệnh **Bán**: `(Avg Px / VWAP − 1) × 100` → âm khi `Avg Px < VWAP`<br>Dấu âm luôn nghĩa là khớp **bất lợi**. Chỉ hiện khi Fill Qty > 0 và VWAP > 0 |
| **Net Value** | `Qty × LmtPx` |
| **Filled Value** | `Fill Qty × Avg Px` |

> ⚠️ **Hai lỗi đã phát hiện trong prototype — DEV phải tránh:**
> 1. Lệnh con `Đã sửa` **không được** tính vào REM PL (nếu tính sẽ trùng với dòng lệnh con mới sinh ra sau khi sửa).
> 2. Khi hủy lệnh con đã khớp 1 phần, KL hủy chỉ cộng phần **chưa khớp** (`qty − matchQty`), không cộng toàn bộ `qty`.

### A6. Ngưỡng cảnh báo

| Chỉ số | Ngưỡng | Xử lý khi vượt |
|---|---|---|
| **% PR** | `% PR < -0.6%` | Đổi sang badge vàng warning |
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

**14 cột:** Thao tác (`Sửa` / `Hủy` + checkbox hủy hàng loạt) → Tài khoản → Tài khoản BBG → Mã CK → Thời gian → Lệnh → Trạng thái → Kiểu lệnh → **Người đặt** → KL đặt → Giá đặt → **Giá khớp** → KL khớp → KL còn lại

- **Người đặt**: nếu là `Auto Twap` → hiển thị badge **màu tím**; nếu là user thường → chữ thường.
- **Giá khớp**: để trống nếu chưa khớp. Lệnh LO thủ công = giá đặt; lệnh Auto Twap = giá thị trường mô phỏng (xem mục 6.3).
- Nút `Sửa`/`Hủy` bị disabled khi lệnh con ở trạng thái `Đã hủy`, `Đã sửa`, `Khớp hết`, `Chờ xác nhận`.
- **Hủy lệnh con (đơn lẻ hoặc hàng loạt) bị khóa nếu Auto TWAP của lệnh tổng đang "Hoạt động"** — phải bấm "Tạm dừng" trước, tương tự quy tắc đã áp dụng cho đặt lệnh con thủ công (xem mục 7.2).
- **Dòng "Tổng cộng" cố định cuối bảng** (dính đáy khi cuộn, giống `thead` dính đỉnh): tổng KL đặt/KL khớp/KL còn lại tính theo **các dòng đang hiển thị** — tức là theo lệnh tổng đang chọn và bộ lọc tìm kiếm cột hiện tại, không phải tổng toàn bộ dữ liệu.
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
│ Side │ Loại lệnh │ Mã CK │ Qty       │
│ Fill Qty │ Rem Bal │ Rem Placed      │
│ LMT PX │ AVG PX                      │
├──────────────────────────────────────┤
│ Instructions Bloomberg               │
│ Ghi chú                    [✏️ sửa]  │
├──────────────────────────────────────┤
│ Chi tiết lệnh khớp:                   │
│ Thời gian đặt│Thời gian khớp│KL đặt  │
│ KL khớp│Giá khớp│KL còn lại│Trạng thái│
└──────────────────────────────────────┘
```

**Yêu cầu:**
- **Side** (`Mua`/`Bán`) đứng **ngay trước Loại lệnh**, tô màu theo quy ước Mua/Bán (§A2): xanh lá / đỏ.
- Nhãn dùng đúng thuật ngữ: **Qty, Fill Qty, Rem Bal, Rem Placed, LMT PX, AVG PX** (không dùng "KL chặn/KL khớp/Giá chặn").
- `Rem Bal` và `Rem Placed` là **2 chỉ số khác nhau**, phải bind đúng dữ liệu tương ứng.
- **Sửa Ghi chú:** click icon bút → chuyển thành input → Enter hoặc blur để lưu, Escape để hủy. **Sau khi lưu phải đồng bộ ngay ra cột "Ghi chú" của bảng lệnh tổng bên ngoài.**
- **Bảng "Chi tiết lệnh khớp"** liệt kê **đúng các lệnh con thật** của lệnh tổng (không tách giả lập từ Fill Qty), và **chỉ những lệnh con đã có khối lượng khớp** — trạng thái `Khớp 1 phần` hoặc `Khớp hết`. Lệnh con `Đã gửi`, `Đã hủy`, `Đã sửa`, `Chờ xác nhận` không thuộc bảng này vì chưa phát sinh khớp thật. Không có lệnh nào khớp → hiện `Chưa có lệnh khớp`.
- **7 cột theo đúng thứ tự:** Thời gian đặt → Thời gian khớp → KL đặt → KL khớp → Giá khớp → KL còn lại → Trạng thái.
- **Sắp xếp các dòng theo Thời gian khớp tăng dần** (không phải thời gian đặt) — đúng trình tự lệnh khớp thực tế xảy ra.
- **Thời gian khớp** đọc từ trường `matchTime` của lệnh con (xem A3) — độc lập với `time` (thời gian đặt). Backend phải trả về **cả 2 mốc thời gian** cho lệnh con đã khớp.
- **KL đặt** = `qty`, **KL khớp** = `matchQty` của chính lệnh con đó.
- **Giá khớp**: lệnh `LO` thủ công khớp đúng giá đặt; lệnh Auto Twap khớp tại giá thị trường mô phỏng, có thể khác giá đặt và khác nhau giữa các lệnh (xem mục 6.3).
- **KL còn lại** = `Rem Bal + Rem Placed` của **cả lệnh tổng** ngay **sau** lần khớp này, không phải KL còn lại riêng của lệnh con đó. Công thức: `Qty − (tổng KL khớp cộng dồn của mọi lệnh con trong bảng, tính đến và bao gồm dòng này, theo thứ tự thời gian khớp)`. Cho biết lệnh tổng còn lại bao nhiêu tại từng mốc khớp trong lịch sử.

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

`REJECT` enable với cả 3 trạng thái chờ xác nhận, nhưng **kết quả khác nhau theo ý nghĩa**:
- `Chờ xác nhận đặt`: từ chối cả lệnh mới → chuyển hẳn `Từ chối` (vòng đời kết thúc).
- `Chờ xác nhận sửa` / `Chờ xác nhận hủy`: chỉ từ chối **yêu cầu** sửa/hủy — lệnh gốc vẫn còn hiệu lực,
  quay lại đúng trạng thái theo tiến độ khớp hiện tại (`Đã gửi` nếu chưa khớp gì, `Khớp 1 phần` nếu khớp
  một phần, `Khớp hết` nếu đã khớp hết) — cùng công thức suy trạng thái đang dùng ở mục A5.

**Ma trận enable nút toolbar theo trạng thái:**

| Trạng thái | ACK | REJECT | Sửa lệnh tổng | Huỷ Fix Net | Done 4 Day | Detail |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Chờ xác nhận đặt | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Chờ xác nhận sửa/hủy | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
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
- **Khi lệnh tổng có `Chk Px = 1`**: giá lệnh con không được vượt LmtPx — **Mua ≤ LmtPx**, **Bán ≥ LmtPx**.
  Với `Chk Px` khác `1` (`2`, `3`, hoặc chưa có) thì không áp dụng ràng buộc này.

**Popup xác nhận** hiển thị: Mã CK, Mua/Bán, KL, Giá đặt, Giá trị, **Giá TB dự kiến** (bình quân gia quyền các lệnh con còn hiệu lực + lệnh đang đặt).

**Sau khi tạo:** lệnh con `Đã gửi`, người đặt = user hiện tại; **nếu lệnh tổng đang `Chờ xử lý` → tự chuyển `Đã gửi`**; tính lại toàn bộ chỉ số tổng hợp. **Sau khi xác nhận xong, tự bỏ chọn lệnh tổng** (đưa khung đặt lệnh về trạng thái khóa) — khác với luồng Sửa lệnh con (5.2), vốn giữ nguyên lệnh tổng đang chọn.

### 5.2. Sửa lệnh con

Bấm `Sửa` trên dòng lệnh con → khung chuyển chế độ sửa (Giá/KL fill sẵn giá trị gốc, các trường khác khóa) → nút `Sửa lệnh Mua/Bán` chỉ enable khi có thay đổi → popup xác nhận hiện **Giá/KL trước–sau**.

Áp dụng **cùng ràng buộc giá** như Đặt lệnh con (5.1): nếu lệnh tổng có `Chk Px = 1`, giá sửa không được
vượt LmtPx (Mua ≤ LmtPx, Bán ≥ LmtPx) — vi phạm thì nút `Sửa lệnh Mua/Bán` vẫn khóa dù Giá/KL đã đổi.

**Cơ chế sửa = hủy + đặt mới:**
- Dòng gốc → trạng thái **`Đã sửa`** (badge tím)
- Sinh **dòng lệnh con mới** với Giá/KL đã sửa, trạng thái `Đã gửi`
- ⚠️ Dòng `Đã sửa` **không tính vào REM PL** (tránh trùng)

Khi bấm `Sửa` lệnh con, phải **tự tắt** trạng thái đang bật của `Đặt lệnh tổng` / `Sửa lệnh tổng` (đưa 2 nút về trạng thái sẵn sàng).

### 5.3. Hủy lệnh con

- **Điều kiện:** Auto TWAP của lệnh tổng **không** ở trạng thái `active` — nếu đang `Hoạt động`, cả hủy
  đơn lẻ lẫn hủy hàng loạt đều bị chặn (thông báo yêu cầu Tạm dừng Auto TWAP trước), tương tự điều kiện
  đặt lệnh con thủ công (5.1).
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
SCBFCA8060 - Tên tài khoản · Tiểu khoản PPL - PPL01
            MWG
           [BÁN]
── Cấu hình chia lệnh (REM BAL: 1,900) ──
Thời gian bắt đầu      [09] : [00]
Thời gian kết thúc     [14] : [45]   ← mặc định 14:45
Tần suất đẩy lệnh (nhỏ nhất)  [15]
── Dự kiến ──────────────────────────
Số lệnh        1 ATO + 7 liên tục = 8 lệnh
KL mỗi lệnh    200 – 300
Tần suất hiệu lực   15 phút
[thông báo lỗi]
      ✔ Đã xác thực
        [Hủy]  [Xác nhận]
```

**Quy tắc nhập:**
- **Thời gian bắt đầu**: mặc định = giờ hiện tại, cho phép sửa.
- **Thời gian kết thúc**: mặc định = **14:45** (chạy tới hết phiên ATC), broker chủ động sửa lại nếu muốn kết thúc sớm hơn.
- **Tần suất đẩy lệnh (nhỏ nhất)**: broker tự nhập. Tần suất chỉ là **ngưỡng tối thiểu** giữa 2 lần đẩy lệnh liên tục — hệ thống tự chọn số lần đẩy lệnh và tự dàn đều thời gian trong khung giờ khả dụng (xem 6.3), nên **tần suất hiệu lực thực tế thường khác** (luôn ≥ giá trị đã nhập), đây là hành vi bình thường chứ không phải ngoại lệ.
- **Ô giờ luôn hiển thị định dạng 24h**, tách thành **2 ô nhập riêng biệt** — ô **giờ** và ô **phút**, mỗi ô nhận **đúng 2 ký tự số**, ngăn cách bằng dấu `:` cố định. Không dùng `<input type="time">` gốc của trình duyệt vì định dạng 12h/24h của nó phụ thuộc locale hệ điều hành, không kiểm soát được bằng HTML/CSS/JS thuần; cũng không dùng 1 ô gộp `HH:MM` vì việc tự chèn dấu `:` kết hợp với vị trí con trỏ khiến ký tự mới bị chèn lẫn vào giá trị cũ khi gõ đè.
  - **Ô giờ chỉ nhận giá trị 00–24, ô phút chỉ nhận 00–59. Mọi ký tự làm giá trị vượt ra ngoài khoảng này đều KHÔNG được nhận** (bị chặn ngay lúc gõ, ô giữ nguyên giá trị cũ) — VD ở ô giờ đã có `2`, gõ tiếp `5` (thành `25`) thì phím `5` bị bỏ qua; gõ `4` (thành `24`) thì được nhận. Ký tự không phải số cũng bị chặn.
  - Gõ đủ **2 chữ số ở ô giờ → tự chuyển con trỏ sang ô phút** (và bôi đen sẵn để gõ tiếp là thay thế). Ô đã đủ 2 chữ số thì không nhận thêm ký tự.
  - Khi focus vào ô, **toàn bộ giá trị cũ được bôi đen** để gõ là thay thế (2 ô luôn được điền sẵn giờ hiện tại hoặc cấu hình cũ khi Sửa). Gõ đè lên phần đang bôi đen hoạt động đúng như ô nhập thông thường.
  - Khi rời ô, giá trị 1 chữ số tự đệm `0` cho đủ 2 chữ số (`9` → `09`).
  - **Hệ thống không bao giờ tự điền thêm ký tự người dùng không gõ**, và không bao giờ chèn thêm vào giá trị cũ khi người dùng đang gõ giá trị mới.
  - *Lưu ý kỹ thuật cho DEV:* **không** dùng vùng bôi đen (`selectionStart`/`selectionEnd`) làm căn cứ để biết "ký tự gõ vào là thay thế" — khi click vào ô, Chrome thu gọn vùng chọn **sau** khi hàm xử lý `focus`/`mouseup` đã bôi đen, nên tới lúc gõ thì vùng chọn đã sập về 1 điểm và ký tự mới bị chèn thêm. Phải dùng một **cờ trạng thái riêng** (bật khi vừa focus vào ô, tắt sau ký tự đầu tiên hoặc khi người dùng chủ động di chuyển con trỏ). Việc kiểm soát giá trị đặt ở **2 lớp**: `keydown` cho đường gõ tay (tự tính giá trị mới rồi gán, bỏ qua hẳn phím làm sai quy tắc) và `input` làm lưới an toàn cho các đường không đi qua `keydown` (dán, bộ gõ tiếng Việt/IME, tự động điền).
  - **Bắt buộc bỏ qua nhánh `keydown` khi bộ gõ tiếng Việt/IME đang soạn** (`e.isComposing`, hoặc `e.key === 'Process'`): lúc đó `e.key` không mang chữ số nên không xử lý được ở nhánh này, phải để rơi xuống lớp `input`. Nếu không, ký tự người dùng gõ sẽ không hiện ra.
  - **TUYỆT ĐỐI không ghi vào `value` của ô khi IME đang soạn.** Phải theo dõi `compositionstart`/`compositionend`: trong lúc soạn thì để nguyên ô, soạn xong (`compositionend`) mới chuẩn hoá giá trị. Ghi đè giữa lúc soạn sẽ **phá trạng thái soạn của bộ gõ** — ký tự vừa gõ biến mất và không gõ tiếp được cho tới khi click ra ngoài rồi click lại. Lỗi này **chỉ xuất hiện với bàn phím tiếng Việt**; bàn phím tiếng Anh không đi qua composition nên test bằng tiếng Anh sẽ không phát hiện được — **phải test riêng bằng bàn phím tiếng Việt**.
  - Lớp `input` phải **làm sạch** giá trị hiện tại (bỏ ký tự không phải số → cắt còn tối đa 2 chữ số → bỏ bớt chữ số cuối cho tới khi ≤ giá trị tối đa), **không** được khôi phục về một giá trị lưu sẵn: giá trị lưu sẵn có thể đã lỗi thời (vì các ô được điền bằng JS khi mở màn hình, không phát sinh sự kiện `input`) và sẽ làm ô bị **xoá trắng**.
  - Khi lớp `input` chạy trong lúc cờ "gõ là thay thế" vẫn đang bật (tức trình duyệt đã chèn thêm vào giá trị cũ thay vì thay thế), phải **tách lấy đúng phần vừa nhập** rồi bỏ giá trị cũ đi.
- Không còn checkbox/tỷ trọng % theo phiên — hệ thống **tự suy** ATO/ATC theo khung giờ (xem 6.3) và **tự lập kế hoạch** ngay khi broker gõ đủ 3 trường, hiển thị real-time ở khối "Dự kiến".
- "KL mỗi lệnh" hiển thị dạng **khoảng giá trị** (VD "200 – 300") khi phần dư khối lượng được rải cho một số lệnh cuối (xem 6.3) — chỉ hiện 1 số khi không có phần dư.
- **Dòng "✔ Đã xác thực"** đặt ngay trên hàng nút, giống chuẩn màn xác nhận (§3.1/§8.2). Màn này dùng
  chung cho cả **Cài đặt mới** và **Sửa** (mục 7.1 mở lại đúng modal này với cấu hình cũ điền sẵn), nên
  không cần lặp lại ở nơi khác.

### 6.3. Khung giờ phiên & công thức

| Phiên | Khung giờ | Điều kiện tự lập kế hoạch |
|---|---|---|
| ATO | 09:00 – 09:15 | Thời gian bắt đầu **< 09:15** |
| Khớp lệnh liên tục | 09:15 – 14:30 (**trừ nghỉ trưa 11:30 – 13:00**) | luôn tính nếu còn thời lượng khả dụng |
| ATC | 14:30 – 14:45 | Thời gian kết thúc **≥ 14:30** |

```
hasAto = startTime < 09:15
hasAtc = endTime   ≥ 14:30

clampedStart   = max(startTime, 09:15)
clampedEnd     = min(endTime,   14:30)
overlapLunch   = phần giao của [clampedStart, clampedEnd] với [11:30, 13:00]
availableMin   = max(0, clampedEnd − clampedStart − overlapLunch)

// Tần suất broker nhập chỉ là NGƯỠNG TỐI THIỂU giữa 2 lần đẩy lệnh — contCount là số lần đẩy lệnh liên
// tục TỐI ĐA vẫn thỏa ngưỡng này (floor đảm bảo availableMin/contCount luôn ≥ Tần suất đã nhập)
contCount  = floor(availableMin / Tần suất tối thiểu)
totalCount = contCount + (hasAto?1:0) + (hasAtc?1:0)

// Chẵn lô 100: nếu totalCount lệnh sẽ khiến 1 lệnh < 100 cổ phiếu, giảm số lệnh liên tục
maxByLot100 = floor(REM BAL / 100)
nếu totalCount > maxByLot100:
    contCount  = maxByLot100 − (hasAto?1:0) − (hasAtc?1:0)
    totalCount = contCount + (hasAto?1:0) + (hasAtc?1:0)

// Tần suất hiệu lực LUÔN được tính lại bằng cách dàn đều availableMin cho đúng contCount lệnh — không
// chỉ khi bị chẵn lô 100 ép giảm như trên, mà ở MỌI trường hợp — để lấp kín toàn bộ khung giờ khả dụng
// thay vì đặt lệnh cách đúng "Tần suất tối thiểu" rồi bỏ phí thời gian dư ở cuối khung giờ.
Tần suất hiệu lực = floor(availableMin / contCount)   ← hiển thị lại cho broker, không kèm ghi chú gì thêm

// Chia đều REM BAL cho MỌI lệnh trong kế hoạch (kể cả ATO/ATC)
KL mỗi lệnh (base)  = floor(REM BAL / totalCount / 100) × 100
phần dư             = REM BAL − KL mỗi lệnh × totalCount
số lệnh nhận thêm   = floor(phần dư / 100)
KL lệnh nhận thêm   = KL mỗi lệnh + 100

// Rải "số lệnh nhận thêm" lô 100 ĐỀU theo thời gian trong các lệnh liên tục (không dồn cụm ở cuối phiên):
// nếu có ATC, ATC luôn nhận đúng 1 lô (ATC luôn là lệnh cuối cùng trong ngày); phần dư còn lại rải đều
// trong N lệnh liên tục bằng thuật toán phân bố đều kinh điển — lệnh liên tục thứ i (0-indexed) nhận lô
// dư nếu floor((i+1)×K/N) > floor(i×K/N), với K = số lô dư cần rải trong phiên liên tục. ATO không tham
// gia rải — luôn nhận đúng KL cơ bản. Chênh lệch giữa lệnh lớn nhất/nhỏ nhất trong kế hoạch tối đa chỉ
// còn 1 lô 100 cổ phiếu (trước đây có thể lệch tới hàng chục lần khi REM BAL lớn/tần suất dày).
```

> **Bắt buộc:** KL mỗi lệnh TWAP phải là **bội số của 100** (lô chẵn), kể cả lệnh ATO/ATC.

### 6.4. Validate khi xác nhận

| Điều kiện | Thông báo |
|---|---|
| Thiếu giờ bắt đầu / kết thúc / tần suất ≤ 0 | "Vui lòng nhập đầy đủ Thời gian bắt đầu/kết thúc/Tần suất hợp lệ." |
| Giờ kết thúc ≤ giờ bắt đầu | (gộp vào thông báo trên) |
| REM BAL không đủ 100 cổ phiếu cho ATO/ATC bắt buộc | "REM BAL quá nhỏ, không đủ 100 cổ phiếu cho các lệnh ATO/ATC bắt buộc." |
| REM BAL không đủ 100 cổ phiếu (không có ATO/ATC bắt buộc, chỉ có lệnh liên tục) | "REM BAL quá nhỏ, không đủ 100 cổ phiếu để lập kế hoạch." |
| Khung giờ/Tần suất khiến tổng số lệnh = 0 | "Khung giờ/Tần suất không hợp lệ, không lập được kế hoạch." |

**Sau khi xác nhận:** lưu cấu hình gồm `startTime, endTime, interval, effectiveInterval, plannedCount, plan[]` (mỗi phần tử: `seq, session, timeMin, qty`); `autoTwap` → `active` (nếu trước đó là `none`); nếu đang sửa cấu hình của lệnh `active`/`paused` thì **giữ nguyên trạng thái hiện tại**.

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
SCBFCA8060 - Tên tài khoản · Tiểu khoản PPL - PPL01
            MWG
           [BÁN]
┌────────────────────────────────────┐
│ Trạng thái            Hoạt động    │ ← xanh lá / Tạm dừng: vàng
│ Thời gian bắt đầu     09:00        │
│ Thời gian kết thúc    11:00        │
│ Tần suất hiệu lực     15 phút      │
│ Số lệnh kế hoạch còn lại 5 lệnh    │
│ Số lệnh đã sinh       3 lệnh       │ ← đếm lệnh con có người đặt = Auto Twap
└────────────────────────────────────┘
      [Sửa]      [Tạm dừng]
── Lệnh đã đẩy (3) ──────────────────
STT  Thời gian đặt  KL đặt  KL khớp  Trạng thái
1    09:00          200     200      Khớp hết
2    09:15          200     100      Khớp 1 phần
3    09:30          200     0        Đã gửi
── Kế hoạch còn lại (5) ─────────────
STT  Phiên       Thời gian dự kiến  KL kế hoạch
1    Liên tục    09:45              300
...  Liên tục    ...                300
```

Màn hình hiển thị **2 bảng riêng biệt**, không gộp chung để tránh nhầm lẫn khối lượng:

- **"Lệnh đã đẩy"**: liệt kê trực tiếp các lệnh con `trader = Auto Twap` đã có thật (sắp theo thời gian
  đặt), kèm KL đặt/KL khớp/Trạng thái của từng lệnh — không suy diễn hay khớp vị trí với kế hoạch.
- **"Kế hoạch còn lại"**: chính là `plan[]` hiện tại — theo định nghĩa, khối lượng này tính từ REM BAL
  hiện tại (đã trừ đi phần đã đẩy), nên không dòng nào ở đây trùng với bảng "Lệnh đã đẩy" cả về giờ lẫn
  khối lượng. Không có cột trạng thái đẩy/khớp vì không dòng nào đã đẩy.
- **Nút "Sửa"/"Tạm dừng"/"Tiếp tục" đặt NGAY TRÊN 2 bảng** (không phải bên dưới) — vì kế hoạch có thể dài
  (nhiều lệnh), đặt nút ở trên đảm bảo luôn thao tác được mà không cần cuộn xuống. Khung modal giới hạn
  chiều cao (`max-height:88vh`) và tự cuộn dọc (`overflow-y:auto`) khi nội dung 2 bảng vượt quá khung
  hình, thay vì tràn ra ngoài màn hình.

**Nút:**

| Nút | Màu | Hành vi |
|---|---|---|
| **Sửa** | primary (xanh dương) | Mở lại màn cài đặt, **điền sẵn cấu hình cũ**; lưu xong giữ nguyên trạng thái active/paused. **Khoá (disabled)** nếu giờ máy hiện tại **≥ 14:30** (đã vào phiên ATC, không còn phiên liên tục nào để chỉnh), kèm tooltip giải thích. |
| **Tạm dừng** | gradient **vàng warning**, chữ trắng | Chỉ hiện khi đang `active` → chuyển `paused` |
| **Tiếp tục** | gradient **xanh lá** | Chỉ hiện khi đang `paused` → chuyển `active` + **tính lại kế hoạch còn lại** (xem 7.3) |

> Màn này **không có nút "Đóng"** ở hàng action (chỉ dùng dấu ✕ ở góc).

### 7.2. Ràng buộc đặt/hủy lệnh con theo trạng thái TWAP

| Trạng thái Auto TWAP | Đặt lệnh con thủ công | Hủy lệnh con (đơn lẻ/hàng loạt) |
|---|---|---|
| `active` (Hoạt động) | ❌ **Không được** — khóa Loại lệnh/Giá/KL, tooltip: *"Auto TWAP đang Hoạt động — không thể tự đặt lệnh con (tạm dừng Auto TWAP để đặt tay)"* | ❌ **Không được** — thông báo *"Auto TWAP đang Hoạt động — không thể hủy lệnh con (tạm dừng Auto TWAP trước khi hủy)"* |
| `paused` (Tạm dừng) | ✅ Được phép | ✅ Được phép |
| `cancelled` / `none` | Theo quy tắc thường (mục 5.1) | Theo quy tắc thường (mục 5.3) |

### 7.3. Tính lại kế hoạch khi bấm "Tiếp tục"

**Kế hoạch còn lại CHỈ được tính lại khi bấm "Tiếp tục"** (không tính lại ở bất kỳ thời điểm nào khác —
kể cả khi mở lại màn quản lý nhiều lần). Khi chuyển `paused` → `active`, hệ thống lập lại kế hoạch bằng
đúng công thức ở mục 6.3, dùng lại `startTime`/`endTime`/`interval` đã cài, **REM BAL hiện tại** (đã thay
đổi do lệnh con khớp thêm hoặc do broker đặt tay trong lúc tạm dừng), nhưng với một điểm khác biệt quan
trọng: **mốc bắt đầu lập kế hoạch không phải là `startTime` đã cấu hình, mà là giờ máy thật tại thời điểm
bấm "Tiếp tục"** (lấy giá trị lớn hơn giữa hai mốc đó). Các lệnh Auto Twap đã đẩy trước thời điểm này giữ
nguyên không đổi — đây là hành động sống, xảy ra tại 1 thời điểm thực, nên không hợp lý nếu kế hoạch mới
lại chứa các mốc giờ đã trôi qua.

Nếu lệnh ATC (chỉ có đúng 1 lệnh mỗi ngày) đã được đẩy trước đó, kế hoạch tính lại **không** lập thêm một
lệnh ATC nữa. Kết quả (`effectiveInterval`, `plannedCount`, `plan[]`) ghi đè lên cấu hình cũ; các lệnh con
Auto Twap đã sinh trước đó không bị xoá — luôn hiển thị nguyên vẹn ở bảng "Lệnh đã đẩy" (mục 7.1).

> Dữ liệu mẫu (`seedAutoTwapConfig`) là ngoại lệ: vì không qua thao tác "Tiếp tục" thật, kế hoạch còn lại
> của dữ liệu mẫu được suy ra thuần từ lịch sử lệnh con đã đẩy (bắt đầu ngay sau lệnh gần nhất, theo đúng
> nhịp `interval`) thay vì theo giờ máy thật — để bản demo luôn hiển thị nhất quán bất kể lúc nào mở lên.

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
| LT20260617-03 | Khớp hết | None | Lệnh **Mua** VIC, Avg Px 45,200 > VWAP 44,500 ⇒ **% PR = −1.57% → dưới ngưỡng −0.6%, hiện cảnh báo** |
| LT20260617-04 | Chờ xác nhận hủy | None | Chờ ACK yêu cầu hủy |
| LT20260618-01 | Khớp 1 phần | None | Khớp 1 phần thông thường |
| LT20260619-01 | Khớp 1 phần | Hoạt động | **Lệnh con Auto TWAP tự sinh động theo giờ thực (xem bên dưới) + 1 lệnh broker đặt tay** |

Toàn bộ dữ liệu đã được kiểm tra tự động đảm bảo: `Fill Qty`, `Avg Px` khớp với lệnh con; `REM BAL ≥ 0`; tổng KL lệnh con ≤ Qty; giá lệnh con không vi phạm LmtPx; trạng thái nhất quán với khối lượng khớp; lệnh có Auto TWAP đều còn REM BAL > 0.

### Lệnh con được nạp theo giờ thực của PC

Prototype mô phỏng giao dịch trong 1 ngày, dùng giờ thực của máy (`nowMinutes()`) làm mốc "bây giờ" —
không quan tâm ngày tháng. Vì vậy, lúc khởi động:

- **Mọi lệnh con** trong `CHILD_ORDERS` chỉ được nạp vào bảng "Sổ lệnh con trong ngày" nếu giờ đặt lệnh
  (`time`) ≤ giờ thực hiện tại. Lệnh con có giờ đặt ở "tương lai" (so với giờ thực) chưa tồn tại, không
  được render. `Fill Qty`/`REM BAL`/`REM PLACE`/`%PR`/trạng thái (khi đang ở 1 trong 3 trạng thái theo
  tiến độ khớp: Đã gửi/Khớp 1 phần/Khớp hết) của lệnh tổng tự động đồng bộ theo tập lệnh con đã lọc —
  không cần đọc lại `data.js` mỗi khi giờ thay đổi.
- **Lệnh Auto TWAP đang "Hoạt động"** (`LT20260615-01`, `LT20260619-01`) không còn lệnh con "Auto Twap"
  gán cứng trong `data.js`. Thay vào đó, hệ thống tự sinh danh sách lệnh con giả lập ngay lúc khởi động:
  mọi lệnh trong kế hoạch (`plan[]`, tính từ khung giờ cấu hình + REM BAL "gốc" từ lệnh con thật) có giờ
  dự kiến ≤ giờ thực đều coi như đã đẩy và khớp hết (`trader = 'Auto Twap'`, `status = 'Khớp hết'`).
  Nhờ vậy demo luôn nhất quán với chính kế hoạch, không cần đồng bộ tay dữ liệu mẫu mỗi khi công thức
  lập kế hoạch (mục 6.3) thay đổi.
- **`Avg Px`** của mọi lệnh tổng được tính **động**: bình quân gia quyền theo giá của MỌI lệnh con đã
  khớp hiện có (kể cả lệnh Auto Twap giả lập), không còn là giá trị tĩnh trong `data.js`. Trường
  `fillQty`/`avgPx`/`status` tĩnh trong `PARENT_ORDERS` chỉ là baseline ban đầu, luôn bị tính lại ngay
  khi trang tải xong.
- Bảng "Sổ lệnh con trong ngày" có thêm cột **"Giá khớp"** (ngay sau "Giá đặt"), để trống nếu lệnh con
  chưa khớp. Lệnh con thường (LO thủ công) giữ quy ước "giá khớp = giá đặt" như trước. Riêng lệnh Auto
  Twap tự sinh có giá khớp **mô phỏng giá thị trường**: dao động xen kẽ quanh VWAP của lệnh tổng, làm
  tròn đúng bước giá HOSE (giá < 10,000 → bước 10đ; 10,000–49,900 → bước 50đ; ≥ 50,000 → bước 100đ),
  luôn nằm trong biên độ giá (trần/sàn) của mã — nên khác giá đặt và khác nhau giữa các lệnh. Bảng
  "Chi tiết lệnh khớp" ở màn Detail cũng dùng cùng giá khớp này.
