// ============================================================
// data.js — Dữ liệu mẫu cho prototype KHTC "Bloomberg và lệnh tổng"
// Tách riêng khỏi index.html để dễ xem/sửa dữ liệu demo mà không đụng vào code giao diện.
// index.html nạp file này (script src="data.js") TRƯỚC script chính, rồi dùng các bảng
// dưới đây để dựng bảng Bloomberg, Sổ lệnh con, và danh sách Tài khoản/Tiểu khoản khi khởi động.
// ============================================================

// ----- Bảng thông tin khách hàng: Tài khoản + các Tiểu khoản trực thuộc -----
var CUSTOMERS = [
  {
    accountCode: 'SCBB116688',
    accountName: 'QUỸ ĐẦU TƯ TĂNG TRƯỞNG DÀI HẠN VIỆT NAM',
    subaccounts: [
      { code: '0001067447', name: 'Thường TP 0.02_CP 0.12 - 0001067447' }
    ]
  },
  {
    accountCode: 'SCBFCA8060',
    accountName: 'QUỸ ĐẦU TƯ CỔ PHIẾU TĂNG TRƯỞNG',
    subaccounts: [
      { code: 'PPL', name: 'Tiểu khoản PPL - PPL01' }
    ]
  }
];

// ----- Bảng thông tin chứng khoán: Mã CK + Giá thị trường + Giá Trần/Sàn (biên độ dao động ±7%) -----
var SECURITIES = [
  { symbol: 'HPG', marketPrice: 24580, ceilingPrice: 26300, floorPrice: 22850 },
  { symbol: 'FPT', marketPrice: 75950, ceilingPrice: 81300, floorPrice: 70600 },
  { symbol: 'VIC', marketPrice: 45050, ceilingPrice: 48200, floorPrice: 41900 },
  { symbol: 'MWG', marketPrice: 52480, ceilingPrice: 56200, floorPrice: 48800 }
];

// ----- Bảng lệnh tổng (Bloomberg và lệnh tổng) -----
var PARENT_ORDERS = [
  {
    orderId: 'LT20260615-01', route: 'Manual', checkPx: '3', createTime: '13:34:45',
    instructions: 'DNR - Do not reduce, giữ nguyên giá khi có cổ tức',
    status: 'Khớp 1 phần', side: 'Mua', account: 'SCBB116688', subaccount: '0001067447',
    // avgPx = bình quân gia quyền phần đã khớp của lệnh con: (350*24550 + 700*24580)/1050 = 24570
    symbol: 'HPG', qty: 5000, price: 24600, fillQty: 1050, avgPx: 24570, vwap: 24615,
    orderType: 'LO', note: 'Ưu tiên khớp trước 14h00', marketVol: 8500000,
    tradeId: 'TRD20260615-01', autoTwap: 'active'
  },
  {
    orderId: 'LT20260615-02', route: 'Manual', checkPx: '1', createTime: '15:40:29',
    instructions: 'Work the order, VWAP trong phiên',
    status: 'Đã gửi', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    // Chưa khớp (fillQty = 0) → avgPx = 0, không hiển thị Avg Px / % PR
    symbol: 'FPT', qty: 3500, price: 76000, fillQty: 0, avgPx: 0, vwap: 76080,
    orderType: 'LO', note: '', marketVol: 4200000,
    tradeId: 'TRD20260615-02', autoTwap: 'paused'
  },
  {
    orderId: 'LT20260616-01', route: 'Manual', checkPx: '', createTime: '09:12:08',
    instructions: '',
    status: 'Chờ xác nhận đặt', side: 'Mua', account: 'SCBB116688', subaccount: '0001067447',
    symbol: 'VIC', qty: 2000, price: 45000, fillQty: 0, avgPx: 0, vwap: 45050,
    orderType: 'LO', note: '', marketVol: 3100000,
    tradeId: ''
  },
  {
    orderId: 'LT20260616-02', route: 'Manual', checkPx: '2', createTime: '10:05:51',
    instructions: 'Not held, tùy nghi thời điểm khớp',
    status: 'Chờ xử lý', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'MWG', qty: 800, price: 52500, fillQty: 0, avgPx: 0, vwap: 52480,
    orderType: 'LO', note: 'Theo dõi thanh khoản trước khi khớp', marketVol: 2600000,
    tradeId: ''
  },
  {
    orderId: 'LT20260617-01', route: 'Manual', checkPx: '1', createTime: '11:20:15',
    instructions: '',
    status: 'Chờ xác nhận sửa', side: 'Mua', account: 'SCBB116688', subaccount: '0001067447',
    symbol: 'HPG', qty: 1500, price: 24700, fillQty: 250, avgPx: 24700, vwap: 24720,
    orderType: 'LO', note: '', marketVol: 5000000,
    tradeId: ''
  },
  {
    orderId: 'LT20260617-02', route: 'Broker', checkPx: '2', createTime: '14:05:33',
    instructions: '',
    status: 'Đã hủy', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'FPT', qty: 1200, price: 77000, fillQty: 0, avgPx: 0, vwap: 77050,
    orderType: 'LO', note: '', marketVol: 3800000,
    tradeId: ''
  },
  {
    orderId: 'LT20260617-03', route: 'Manual', checkPx: '3', createTime: '09:45:00',
    instructions: '',
    status: 'Khớp hết', side: 'Mua', account: 'SCBB116688', subaccount: '0001067447',
    // Khớp hết 800 @ 45200 → avgPx = 45200. VWAP thị trường thấp hơn hẳn (44500) nên
    // % PR = 45200/44500 - 1 = +1.57% → vượt mức cảnh báo 1% (mua đắt hơn VWAP thị trường).
    symbol: 'VIC', qty: 800, price: 45200, fillQty: 800, avgPx: 45200, vwap: 44500,
    orderType: 'LO', note: '', marketVol: 2900000,
    tradeId: 'TRD20260617-03'
  },
  {
    orderId: 'LT20260617-04', route: 'Manual', checkPx: '1', createTime: '16:10:05',
    instructions: '',
    status: 'Chờ xác nhận hủy', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'MWG', qty: 600, price: 53000, fillQty: 0, avgPx: 0, vwap: 53000,
    orderType: 'LO', note: '', marketVol: 2200000,
    tradeId: ''
  },
  {
    orderId: 'LT20260618-01', route: 'Broker', checkPx: '2', createTime: '10:30:00',
    instructions: '',
    status: 'Khớp 1 phần', side: 'Mua', account: 'SCBB116688', subaccount: '0001067447',
    symbol: 'FPT', qty: 2000, price: 78000, fillQty: 400, avgPx: 78000, vwap: 78050,
    orderType: 'LO', note: '', marketVol: 4500000,
    tradeId: 'TRD20260618-01'
  },
  {
    // Đang chạy Auto TWAP (phiên liên tục): 3 lệnh con do Auto TWAP tự sinh (trader "Auto Twap") +
    // 1 lệnh con do broker đặt tay trước khi cài đặt Auto TWAP (trader ADMINHN, lúc 09:05, trước cả
    // giờ Auto TWAP bắt đầu 09:15) — dùng để demo màn hình xem lại cài đặt Auto TWAP.
    orderId: 'LT20260619-01', route: 'Manual', checkPx: '2', createTime: '09:00:00',
    instructions: 'Auto TWAP chia lệnh theo phiên liên tục',
    // Đã khớp 400/3000 → trạng thái "Khớp 1 phần"; avgPx = 52500 (các lệnh con khớp đều @ 52500)
    status: 'Khớp 1 phần', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'MWG', qty: 3000, price: 52500, fillQty: 400, avgPx: 52500, vwap: 52480,
    orderType: 'LO', note: '', marketVol: 2600000,
    tradeId: '', autoTwap: 'active'
  }
];

// ----- Bảng lệnh con (Sổ lệnh con trong ngày) -----
var CHILD_ORDERS = [
  { childId: 'CO20260615-01', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:48:26', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 1000, price: 23800, matchQty: 0,   status: 'Đã gửi' },
  { childId: 'CO20260615-02', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:47:51', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 500,  price: 23900, matchQty: 0,   status: 'Đã hủy' },
  { childId: 'CO20260615-03', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:46:21', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 400,  price: 24600, matchQty: 0,   status: 'Đã gửi' },
  { childId: 'CO20260615-04', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:46:06', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 300,  price: 24500, matchQty: 0,   status: 'Đã gửi' },
  { childId: 'CO20260615-05', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:45:37', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 200,  price: 24000, matchQty: 0,   status: 'Đã hủy' },
  { childId: 'CO20260615-06', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:36:59', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 100,  price: 24450, matchQty: 0,   status: 'Đã gửi' },
  { childId: 'CO20260615-09', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:50:12', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 600,  price: 24550, matchQty: 350, status: 'Khớp 1 phần' },
  { childId: 'CO20260615-10', parentId: 'LT20260615-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '13:51:40', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 700,  price: 24580, matchQty: 700, status: 'Khớp hết' },
  { childId: 'CO20260615-07', parentId: 'LT20260615-02', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'FPT', time: '15:41:10', side: 'Bán', orderType: 'LO', trader: 'ADMINHN', qty: 2000, price: 76000, matchQty: 0, status: 'Đã gửi' },
  // Đặt 3,000/3,500 → còn REM BAL 500 để Auto TWAP (đang Tạm dừng) có phần khối lượng còn lại mà chạy tiếp
  { childId: 'CO20260615-08', parentId: 'LT20260615-02', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'FPT', time: '15:40:55', side: 'Bán', orderType: 'LO', trader: 'ADMINHN', qty: 1000, price: 76200, matchQty: 0, status: 'Đã gửi' },
  // Khách hàng đã gửi yêu cầu sửa/hủy nhưng broker chưa xác nhận — lệnh con vẫn đứng nguyên chờ xử lý
  { childId: 'CO20260617-01', parentId: 'LT20260617-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'HPG', time: '11:25:40', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 500, price: 24700, matchQty: 250, status: 'Khớp 1 phần' },
  { childId: 'CO20260617-02', parentId: 'LT20260617-02', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'FPT', time: '14:10:12', side: 'Bán', orderType: 'LO', trader: 'ADMINHN', qty: 400, price: 77000, matchQty: 0, status: 'Đã hủy' },
  { childId: 'CO20260617-03', parentId: 'LT20260617-03', account: 'SCBB116688', subaccount: '0001067447', symbol: 'VIC', time: '09:50:22', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 800, price: 45200, matchQty: 800, status: 'Khớp hết' },
  { childId: 'CO20260618-01', parentId: 'LT20260618-01', account: 'SCBB116688', subaccount: '0001067447', symbol: 'FPT', time: '10:35:20', side: 'Mua', orderType: 'LO', trader: 'ADMINHN', qty: 800, price: 78000, matchQty: 400, status: 'Khớp 1 phần' },
  // Lệnh con của LT20260619-01 (đang chạy Auto TWAP): 1 lệnh broker đặt tay trước khi cài Auto TWAP,
  // xen giữa 3 lệnh do Auto TWAP tự sinh (trader "Auto Twap") — demo "lẫn 1 lệnh con do broker đặt trước".
  { childId: 'CO20260619-01', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:05:00', side: 'Bán', orderType: 'LO', trader: 'ADMINHN',   qty: 500, price: 52500, matchQty: 0,   status: 'Đã gửi' },
  { childId: 'CO20260619-02', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:20:00', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 100, status: 'Khớp 1 phần' },
  { childId: 'CO20260619-03', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:35:00', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 300, status: 'Khớp hết' },
  { childId: 'CO20260619-04', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:50:00', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 0,   status: 'Đã gửi' }
];
