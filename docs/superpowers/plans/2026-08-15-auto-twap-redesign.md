# Redesign Auto TWAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual "% phân bổ theo phiên" setup in Auto TWAP with an automatic ATO/ATC-aware planner, and show the resulting per-order plan (push/match status) on the management screen.

**Architecture:** Single new pure function `computeAutoTwapPlan(startMin, endMin, interval, remBal)` in `index.html` replaces the old `computeTwapPushCount`/`computeTwapPerPushQty` pair and becomes the one source of truth for both the setup-screen preview and the seed data. Its output `plan[]` (array of `{seq, session, timeMin, qty}`) is stored on `autoTwapConfigs[orderId]` and rendered as a table in the review modal, matched positionally (after sorting by time) against already-generated `trader === 'Auto Twap'` child rows to derive push/match status per line.

**Tech Stack:** Vanilla JS/HTML/CSS, single file (`index.html`), no build step, no test framework — verification is done via a `node -e` syntax check plus manual checks in the Browser pane (established pattern in this repo).

## Global Constraints

- KL of every planned order must be a multiple of 100 (chẵn lô 100).
- ATO triggers when Thời gian bắt đầu < 09:15; ATC triggers when Thời gian kết thúc ≥ 14:30.
- REM BAL is divided evenly across ALL planned orders (continuous + ATO + ATC); the last order by time absorbs the rounding remainder.
- If the desired order count would push any order below 100 shares, reduce the continuous-order count (increasing the effective interval) until every order is ≥100 and a multiple of 100.
- Follow existing code conventions: 2-space indent, `var`, no semicolon-free style, Vietnamese comments only where the WHY is non-obvious (matches rest of `index.html`).
- `YEU-CAU-DEV.md` must be updated to match every behavior change (established project rule).
- No automated test framework exists in this repo — every "test" step below is either a `node -e` syntax check or a manual check via the Browser pane MCP tools, per the pattern used in prior tasks in this codebase.

---

### Task 1: Core planning function `computeAutoTwapPlan()`

**Files:**
- Modify: `khtc-prototype/index.html:1209-1240` (constants + old `computeTwapPushCount`/`computeTwapPerPushQty`)

**Interfaces:**
- Produces: `computeAutoTwapPlan(startMin, endMin, interval, remBal)` → on success `{ ato: bool, atc: bool, contCount: number, totalCount: number, interval: number, effectiveInterval: number|null, adjusted: bool, perOrderQty: number, lastOrderQty: number, plan: [{seq, session:'ato'|'continuous'|'atc', timeMin, qty}] }`; on failure `{ error: string }`. Later tasks (2, 3) call this and check `result.error` first.
- Produces: `minutesToTimeStr(min)` → `"HH:mm"` string, used by Task 3's table renderer and reusable anywhere a `timeMin` needs display.
- Consumes: existing `timeToMinutes(hhmm)` (already defined just above, unchanged).

- [ ] **Step 1: Replace the constants block and delete the two old functions**

Find this block (currently lines 1209-1239):

```js
    // ===== Cài đặt Auto TWAP: chia lệnh theo phiên ATO (9h00-9h15) / Liên tục (9h15-14h30, nghỉ trưa
    // 11h30-13h00 không tính) / ATC (14h30-14h45). Số lần đẩy lệnh = thời lượng phiên liên tục khả dụng
    // (đã trừ nghỉ trưa, đã chặn theo khung giờ phiên) / Tần suất; Khối lượng mỗi lệnh làm tròn bội số 100.
    var TWAP_ATO_START = 9 * 60, TWAP_ATO_END = 9 * 60 + 15;
    var TWAP_CONT_START = 9 * 60 + 15, TWAP_CONT_END = 14 * 60 + 30;
    var TWAP_LUNCH_START = 11 * 60 + 30, TWAP_LUNCH_END = 13 * 60;
    var twapTargetOrderId = null; // lệnh tổng đang cài đặt/xem Auto TWAP trong modal

    function timeToMinutes(hhmm) {
      if (!hhmm) return null;
      var p = hhmm.split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    function computeTwapPushCount(startMin, endMin, interval) {
      if (startMin === null || endMin === null || interval <= 0) return 0;
      // Start time < 9h15 tính từ 9h15; End time > 14h30 tính tới 14h30
      var clampedStart = Math.max(startMin, TWAP_CONT_START);
      var clampedEnd = Math.min(endMin, TWAP_CONT_END);
      var overlapLunch = Math.max(0, Math.min(clampedEnd, TWAP_LUNCH_END) - Math.max(clampedStart, TWAP_LUNCH_START));
      var availableMinutes = Math.max(0, clampedEnd - clampedStart - overlapLunch);
      return availableMinutes > 0 ? Math.max(1, Math.floor(availableMinutes / interval)) : 0;
    }

    // Khối lượng mỗi lệnh (phiên liên tục), làm tròn bội số 100
    function computeTwapPerPushQty(pushCount, remBal, contPct) {
      var contTotalQty = Math.round(remBal * contPct / 100 / 100) * 100;
      var perPushQty = pushCount > 0 ? Math.round((contTotalQty / pushCount) / 100) * 100 : 0;
      if (perPushQty < 100 && contTotalQty > 0) perPushQty = 100;
      return perPushQty;
    }
```

Replace it with:

```js
    // ===== Cài đặt Auto TWAP: hệ thống tự suy ATO/ATC theo khung giờ, chia đều REM BAL cho MỌI lệnh
    // trong kế hoạch (kể cả ATO/ATC), luôn chẵn lô 100. Nếu KL/lệnh sẽ dưới 100 thì tự giảm số lệnh
    // liên tục (tăng giãn cách) cho tới khi mọi lệnh đạt tối thiểu 100. Lệnh cuối cùng theo thời gian
    // nhận phần dư khi REM BAL không chia hết, để tổng kế hoạch luôn khớp đúng REM BAL.
    var TWAP_ATO_START = 9 * 60, TWAP_ATO_END = 9 * 60 + 15;
    var TWAP_CONT_START = 9 * 60 + 15, TWAP_CONT_END = 14 * 60 + 30;
    var TWAP_LUNCH_START = 11 * 60 + 30, TWAP_LUNCH_END = 13 * 60;
    var TWAP_ATC_TIME = TWAP_CONT_END; // mốc lập kế hoạch cho lệnh ATC = 14:30
    var TWAP_SESSION_LABEL = { ato: 'ATO', continuous: 'Liên tục', atc: 'ATC' };
    var twapTargetOrderId = null; // lệnh tổng đang cài đặt/xem Auto TWAP trong modal

    function timeToMinutes(hhmm) {
      if (!hhmm) return null;
      var p = hhmm.split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    function minutesToTimeStr(min) {
      var h = Math.floor(min / 60), m = min % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function computeAutoTwapPlan(startMin, endMin, interval, remBal) {
      if (startMin === null || endMin === null || endMin <= startMin || interval <= 0 || remBal <= 0) {
        return { error: 'Vui lòng nhập đầy đủ Thời gian bắt đầu/kết thúc/Tần suất hợp lệ.' };
      }

      var hasAto = startMin < TWAP_ATO_END;
      var hasAtc = endMin >= TWAP_CONT_END;

      var clampedStart = Math.max(startMin, TWAP_CONT_START);
      var clampedEnd = Math.min(endMin, TWAP_CONT_END);
      var overlapLunch = Math.max(0, Math.min(clampedEnd, TWAP_LUNCH_END) - Math.max(clampedStart, TWAP_LUNCH_START));
      var availableMin = Math.max(0, clampedEnd - clampedStart - overlapLunch);

      var contCount = availableMin > 0 ? Math.floor(availableMin / interval) : 0;
      var totalCount = contCount + (hasAto ? 1 : 0) + (hasAtc ? 1 : 0);

      var requiredFixed = (hasAto ? 1 : 0) + (hasAtc ? 1 : 0);
      var maxByLot100 = Math.floor(remBal / 100);
      if (maxByLot100 < requiredFixed) {
        return { error: 'REM BAL quá nhỏ, không đủ 100 cổ phiếu cho các lệnh ATO/ATC bắt buộc.' };
      }

      var effectiveInterval = interval;
      var adjusted = false;
      if (totalCount > maxByLot100) {
        contCount = maxByLot100 - requiredFixed;
        totalCount = contCount + requiredFixed;
        effectiveInterval = contCount > 0 ? Math.floor(availableMin / contCount) : null;
        adjusted = true;
      }

      if (totalCount === 0) {
        return { error: 'Khung giờ/Tần suất không hợp lệ, không lập được kế hoạch.' };
      }

      var perOrderQty = Math.floor(remBal / totalCount / 100) * 100;
      var lastOrderQty = remBal - perOrderQty * (totalCount - 1);

      var plan = [];
      if (hasAto) plan.push({ session: 'ato', timeMin: TWAP_ATO_START, qty: perOrderQty });
      var t = clampedStart;
      for (var i = 0; i < contCount; i++) {
        if (t >= TWAP_LUNCH_START && t < TWAP_LUNCH_END) t = TWAP_LUNCH_END;
        plan.push({ session: 'continuous', timeMin: t, qty: perOrderQty });
        t += effectiveInterval;
      }
      if (hasAtc) plan.push({ session: 'atc', timeMin: TWAP_ATC_TIME, qty: perOrderQty });
      plan.forEach(function (p, idx) { p.seq = idx + 1; });
      plan[plan.length - 1].qty = lastOrderQty;

      return {
        ato: hasAto, atc: hasAtc, contCount: contCount, totalCount: totalCount,
        interval: interval, effectiveInterval: effectiveInterval, adjusted: adjusted,
        perOrderQty: perOrderQty, lastOrderQty: lastOrderQty, plan: plan
      };
    }
```

- [ ] **Step 2: Syntax check**

Run:
```bash
node -e "new Function(require('fs').readFileSync('khtc-prototype/index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"
```
Expected: no output (no `SyntaxError`). (This regex grabs the single inline `<script>` block — same technique used in prior tasks in this repo.)

- [ ] **Step 3: Verify the function with hand-computed scenarios in the browser console**

Start the preview (`preview_start` with `name: "khtc-prototype"`), then run each call below via the browser JS tool and confirm the printed value matches:

```js
JSON.stringify(computeAutoTwapPlan(540, 660, 15, 1600))
// expect: ato=true, atc=false, contCount=7, totalCount=8, effectiveInterval=15, adjusted=false,
//         perOrderQty=200, lastOrderQty=200, plan.length=8, plan[0]={session:'ato',timeMin:540,qty:200}

JSON.stringify(computeAutoTwapPlan(810, 855, 15, 1900))
// expect: ato=false, atc=false, contCount=3, totalCount=3, perOrderQty=600, lastOrderQty=700
// (remainder case: last plan entry qty=700, the other two are 600)

JSON.stringify(computeAutoTwapPlan(555, 600, 4, 800))
// expect: contCount adjusted from 11 down to 8, effectiveInterval changes from 4 to 5, adjusted=true,
//         perOrderQty=100, lastOrderQty=100

JSON.stringify(computeAutoTwapPlan(540, 600, 15, 50))
// expect: {"error":"REM BAL quá nhỏ, không đủ 100 cổ phiếu cho các lệnh ATO/ATC bắt buộc."}
// (hasAto=true because 540<555, but floor(50/100)=0 < 1 required)

JSON.stringify(computeAutoTwapPlan(600, 610, 60, 500))
// expect: {"error":"Khung giờ/Tần suất không hợp lệ, không lập được kế hoạch."}
// (10 available minutes, interval 60 → contCount=0, no ATO/ATC → totalCount=0)
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(auto-twap): thêm computeAutoTwapPlan tự suy ATO/ATC, chia đều KL, tự điều chỉnh giãn cách"
```

---

### Task 2: Setup screen — remove % allocation UI, wire the new planner

**Files:**
- Modify: `khtc-prototype/index.html:382-396` (CSS)
- Modify: `khtc-prototype/index.html:1032-1058` (setup modal HTML)
- Modify: `khtc-prototype/index.html` — `openAutoTwapSetup`, `onAutoTwapInputsChanged`, `recalcAutoTwapPreview`, `confirmAutoTwapSetup` (currently ~lines 1254-1390)

**Interfaces:**
- Consumes: `computeAutoTwapPlan` and `minutesToTimeStr` from Task 1; existing `openModal`/`closeModal`, `parseQty`/`formatQty`, `AUTOTWAP_LABEL`/`AUTOTWAP_BADGE`, `orderStatus`, `refreshQtyRemBalHint`, `validateOrderForm`, `refreshAutoTwapButtonState` (all pre-existing, unchanged).
- Produces: `autoTwapConfigs[orderId]` now shaped as `{ startTime, endTime, interval, effectiveInterval, plannedCount, plan }` (no more `sessions`/`perPushQty`) — this is what Task 3 reads.

- [ ] **Step 1: Trim the CSS block**

Find (currently lines 382-396):

```css
  /* ===== Modal: Cài đặt Auto TWAP ===== */
  .twap-section-title { font-weight:700; color:var(--text-title); font-size:var(--fs-small); margin:14px 0 8px; }
  .modal-kv-row input[type="time"], .modal-kv-row input[type="number"] {
    background:var(--input-bg); border:1px solid var(--border); border-radius:var(--radius-btn);
    padding:6px 10px; color:var(--text-title); font-size:var(--fs-small); font-family:var(--font-ui); width:120px; text-align:right; }
  .twap-session-row { display:flex; align-items:center; justify-content:space-between; padding:8px 0;
    border-bottom:1px solid var(--border); font-size:var(--fs-small); }
  .twap-session-row:last-of-type { border-bottom:none; margin-bottom:14px; }
  .twap-session-row label { display:flex; align-items:center; gap:8px; color:var(--text-title); cursor:pointer; }
  .twap-session-row input[type="checkbox"] { width:16px; height:16px; cursor:pointer; }
  .twap-session-row input[type="number"] {
    background:var(--input-bg); border:1px solid var(--border); border-radius:var(--radius-btn);
    padding:6px 10px; color:var(--text-title); font-size:var(--fs-small); width:70px; text-align:right; }
  .twap-session-row input[type="number"]:disabled { opacity:.4; cursor:not-allowed; }
  .twap-session-row input[type="checkbox"]:disabled + * { opacity:.5; }
```

Replace with (drop every `.twap-session-row` rule, keep the rest):

```css
  /* ===== Modal: Cài đặt Auto TWAP ===== */
  .twap-section-title { font-weight:700; color:var(--text-title); font-size:var(--fs-small); margin:14px 0 8px; }
  .modal-kv-row input[type="time"], .modal-kv-row input[type="number"] {
    background:var(--input-bg); border:1px solid var(--border); border-radius:var(--radius-btn);
    padding:6px 10px; color:var(--text-title); font-size:var(--fs-small); font-family:var(--font-ui); width:120px; text-align:right; }
```

- [ ] **Step 2: Replace the setup modal body**

Find (currently lines 1032-1058):

```html
      <div class="twap-section-title">Cấu hình chia lệnh</div>
      <div class="modal-kv-group">
        <div class="modal-kv-row"><label>Thời gian bắt đầu</label><input type="time" id="twap-start-time" oninput="onAutoTwapInputsChanged()"></div>
        <div class="modal-kv-row"><label>Thời gian kết thúc</label><input type="time" id="twap-end-time" oninput="onAutoTwapInputsChanged()"></div>
        <div class="modal-kv-row"><label>Tần suất (phút)</label><input type="number" min="1" id="twap-interval" placeholder="Số phút" oninput="onAutoTwapInputsChanged()"></div>
      </div>

      <div class="twap-section-title">Phân bổ lệnh theo phiên <span style="color:var(--text-dim);font-weight:400;">(REM BAL: <span id="twap-rembal"></span>)</span></div>
      <div class="twap-session-row">
        <label><input type="checkbox" id="twap-chk-continuous" onchange="onAutoTwapInputsChanged()"> Khớp lệnh liên tục</label>
        <input type="number" min="0" max="100" id="twap-pct-continuous" placeholder="%" disabled oninput="onAutoTwapInputsChanged()">
      </div>
      <div class="twap-session-row">
        <label><input type="checkbox" id="twap-chk-ato" onchange="onAutoTwapInputsChanged()"> ATO</label>
        <input type="number" min="0" max="100" id="twap-pct-ato" placeholder="%" disabled oninput="onAutoTwapInputsChanged()">
      </div>
      <div class="twap-session-row">
        <label><input type="checkbox" id="twap-chk-atc" onchange="onAutoTwapInputsChanged()"> ATC</label>
        <input type="number" min="0" max="100" id="twap-pct-atc" placeholder="%" disabled oninput="onAutoTwapInputsChanged()">
      </div>

      <div class="modal-kv-group" style="margin-top:12px;">
        <div class="modal-kv-row"><label>Số lần đẩy lệnh (phiên liên tục)</label><span id="twap-preview-count">—</span></div>
        <div class="modal-kv-row"><label>KL mỗi lệnh (phiên liên tục)</label><span id="twap-preview-qty">—</span></div>
      </div>

      <div id="twap-error" style="color:var(--sell);font-size:var(--fs-small);min-height:16px;margin-top:8px;"></div>
```

Replace with:

```html
      <div class="twap-section-title">Cấu hình chia lệnh <span style="color:var(--text-dim);font-weight:400;">(REM BAL: <span id="twap-rembal"></span>)</span></div>
      <div class="modal-kv-group">
        <div class="modal-kv-row"><label>Thời gian bắt đầu</label><input type="time" id="twap-start-time" oninput="onAutoTwapInputsChanged()"></div>
        <div class="modal-kv-row"><label>Thời gian kết thúc</label><input type="time" id="twap-end-time" oninput="onAutoTwapInputsChanged()"></div>
        <div class="modal-kv-row"><label>Tần suất (phút)</label><input type="number" min="1" id="twap-interval" placeholder="Số phút" oninput="onAutoTwapInputsChanged()"></div>
      </div>

      <div class="twap-section-title">Dự kiến</div>
      <div class="modal-kv-group">
        <div class="modal-kv-row"><label>Số lệnh</label><span id="twap-preview-count">—</span></div>
        <div class="modal-kv-row"><label>KL mỗi lệnh</label><span id="twap-preview-qty">—</span></div>
        <div class="modal-kv-row"><label>Tần suất hiệu lực</label><span id="twap-preview-interval">—</span></div>
      </div>

      <div id="twap-error" style="color:var(--sell);font-size:var(--fs-small);min-height:16px;margin-top:8px;"></div>
```

- [ ] **Step 3: Rewrite `openAutoTwapSetup` to drop session/% wiring**

Find:

```js
      document.getElementById('twap-start-time').value = existingConfig ? existingConfig.startTime : defaultStart;
      document.getElementById('twap-end-time').value = existingConfig ? existingConfig.endTime : '';
      document.getElementById('twap-interval').value = existingConfig ? existingConfig.interval : '';
      ['continuous', 'ato', 'atc'].forEach(function (key) {
        var pct = existingConfig && existingConfig.sessions[key] ? existingConfig.sessions[key] : null;
        var chk = document.getElementById('twap-chk-' + key);
        var pctEl = document.getElementById('twap-pct-' + key);
        chk.checked = !!pct;
        chk.disabled = false;
        pctEl.value = pct || '';
        pctEl.disabled = !chk.checked;
      });
      document.getElementById('twap-error').textContent = '';
      onAutoTwapInputsChanged();
      openModal('modal-auto-twap');
    }
```

Replace with:

```js
      document.getElementById('twap-start-time').value = existingConfig ? existingConfig.startTime : defaultStart;
      document.getElementById('twap-end-time').value = existingConfig ? existingConfig.endTime : '';
      document.getElementById('twap-interval').value = existingConfig ? existingConfig.interval : '';
      document.getElementById('twap-error').textContent = '';
      onAutoTwapInputsChanged();
      openModal('modal-auto-twap');
    }
```

- [ ] **Step 4: Rewrite `onAutoTwapInputsChanged`, `recalcAutoTwapPreview`, `confirmAutoTwapSetup`**

Find (the whole three functions, from `onAutoTwapInputsChanged` through the end of `confirmAutoTwapSetup`):

```js
    function onAutoTwapInputsChanged() {
      var startMin = timeToMinutes(document.getElementById('twap-start-time').value);
      var atoChk = document.getElementById('twap-chk-ato');
      var atoBlocked = startMin !== null && startMin > TWAP_ATO_END;
      atoChk.disabled = atoBlocked;
      if (atoBlocked && atoChk.checked) atoChk.checked = false;

      ['continuous', 'ato', 'atc'].forEach(function (key) {
        document.getElementById('twap-pct-' + key).disabled = !document.getElementById('twap-chk-' + key).checked;
      });

      recalcAutoTwapPreview();
    }

    function recalcAutoTwapPreview() {
      var countEl = document.getElementById('twap-preview-count');
      var qtyEl = document.getElementById('twap-preview-qty');
      var contChecked = document.getElementById('twap-chk-continuous').checked;
      var startMin = timeToMinutes(document.getElementById('twap-start-time').value);
      var endMin = timeToMinutes(document.getElementById('twap-end-time').value);
      var interval = parseInt(document.getElementById('twap-interval').value, 10) || 0;

      if (!contChecked || startMin === null || endMin === null || interval <= 0) {
        countEl.textContent = '—';
        qtyEl.textContent = '—';
        return;
      }

      var pushCount = computeTwapPushCount(startMin, endMin, interval);
      var remBal = parseQty(document.getElementById('twap-rembal').textContent);
      var contPct = parseFloat(document.getElementById('twap-pct-continuous').value) || 0;
      var perPushQty = computeTwapPerPushQty(pushCount, remBal, contPct);

      countEl.textContent = pushCount || '—';
      qtyEl.textContent = perPushQty > 0 ? formatQty(perPushQty) : '—';
    }

    function confirmAutoTwapSetup() {
      var errorEl = document.getElementById('twap-error');
      errorEl.textContent = '';

      var startMin = timeToMinutes(document.getElementById('twap-start-time').value);
      var endMin = timeToMinutes(document.getElementById('twap-end-time').value);
      var interval = parseInt(document.getElementById('twap-interval').value, 10) || 0;

      if (startMin === null) { errorEl.textContent = 'Vui lòng nhập Thời gian bắt đầu.'; return; }
      if (endMin === null) { errorEl.textContent = 'Vui lòng nhập Thời gian kết thúc.'; return; }
      if (endMin <= startMin) { errorEl.textContent = 'Thời gian kết thúc phải sau Thời gian bắt đầu.'; return; }
      if (interval <= 0) { errorEl.textContent = 'Vui lòng nhập Tần suất (phút) hợp lệ.'; return; }

      var sessionKeys = ['continuous', 'ato', 'atc'];
      var checkedSessions = sessionKeys.filter(function (key) { return document.getElementById('twap-chk-' + key).checked; });
      if (!checkedSessions.length) { errorEl.textContent = 'Vui lòng chọn ít nhất 1 phiên phân bổ lệnh.'; return; }

      var totalPct = 0;
      var sessions = {};
      for (var i = 0; i < checkedSessions.length; i++) {
        var key = checkedSessions[i];
        var pct = parseFloat(document.getElementById('twap-pct-' + key).value) || 0;
        if (pct <= 0) { errorEl.textContent = 'Vui lòng nhập tỷ trọng % hợp lệ cho các phiên đã chọn.'; return; }
        sessions[key] = pct;
        totalPct += pct;
      }
      if (Math.round(totalPct) !== 100) {
        errorEl.textContent = 'Tổng tỷ trọng % các phiên phải bằng 100% (hiện tại: ' + totalPct + '%).';
        return;
      }

      var tr = document.getElementById('row-' + twapTargetOrderId);
      if (!tr) { closeModal('modal-auto-twap'); return; }

      var remBal = parseQty(tr.querySelector('.col-rembal').textContent);
      var pushCount = sessions.continuous ? computeTwapPushCount(startMin, endMin, interval) : 0;
      var perPushQty = sessions.continuous ? computeTwapPerPushQty(pushCount, remBal, sessions.continuous) : 0;
      var plannedCount = pushCount + (sessions.ato ? 1 : 0) + (sessions.atc ? 1 : 0);

      autoTwapConfigs[twapTargetOrderId] = {
        startTime: document.getElementById('twap-start-time').value,
        endTime: document.getElementById('twap-end-time').value,
        interval: interval,
        sessions: sessions,
        perPushQty: perPushQty,
        plannedCount: plannedCount
      };

      // Lần cài đầu tiên (đang None) mới bật Hoạt động; sửa cấu hình của lệnh đang active/paused thì
      // giữ nguyên trạng thái hoạt động hiện tại, chỉ cập nhật lại cấu hình.
      if ((tr.dataset.autotwap || 'none') === 'none') {
        tr.dataset.autotwap = 'active';
        var span = tr.querySelector('.col-autotwap');
        if (span) {
          span.className = 'col-autotwap ' + AUTOTWAP_BADGE.active;
          span.textContent = AUTOTWAP_LABEL.active;
        }
      }
      closeModal('modal-auto-twap');
      refreshAutoTwapButtonState();
      if (selectedOrderId === twapTargetOrderId) {
        var status = orderStatus(tr);
        var isActive = (status === 'Chờ xử lý' || status === 'Đã gửi' || status === 'Khớp 1 phần');
        if (isActive) refreshQtyRemBalHint(tr);
        validateOrderForm();
      }
    }
```

Replace with:

```js
    function onAutoTwapInputsChanged() {
      recalcAutoTwapPreview();
    }

    function recalcAutoTwapPreview() {
      var countEl = document.getElementById('twap-preview-count');
      var qtyEl = document.getElementById('twap-preview-qty');
      var intervalEl = document.getElementById('twap-preview-interval');

      var startMin = timeToMinutes(document.getElementById('twap-start-time').value);
      var endMin = timeToMinutes(document.getElementById('twap-end-time').value);
      var interval = parseInt(document.getElementById('twap-interval').value, 10) || 0;
      var remBal = parseQty(document.getElementById('twap-rembal').textContent);

      var result = computeAutoTwapPlan(startMin, endMin, interval, remBal);
      if (result.error) {
        countEl.textContent = '—';
        qtyEl.textContent = '—';
        intervalEl.textContent = '—';
        return;
      }

      var parts = [];
      if (result.ato) parts.push('1 ATO');
      if (result.contCount > 0) parts.push(result.contCount + ' liên tục');
      if (result.atc) parts.push('1 ATC');
      countEl.textContent = parts.join(' + ') + ' = ' + result.totalCount + ' lệnh';
      qtyEl.textContent = formatQty(result.perOrderQty) +
        (result.lastOrderQty !== result.perOrderQty ? ' (lệnh cuối: ' + formatQty(result.lastOrderQty) + ')' : '');
      intervalEl.textContent = result.effectiveInterval === null ? '—' :
        (result.effectiveInterval + ' phút' + (result.adjusted ? ' (đã tự điều chỉnh)' : ''));
    }

    function confirmAutoTwapSetup() {
      var errorEl = document.getElementById('twap-error');
      errorEl.textContent = '';

      var startMin = timeToMinutes(document.getElementById('twap-start-time').value);
      var endMin = timeToMinutes(document.getElementById('twap-end-time').value);
      var interval = parseInt(document.getElementById('twap-interval').value, 10) || 0;
      var remBal = parseQty(document.getElementById('twap-rembal').textContent);
      var result = computeAutoTwapPlan(startMin, endMin, interval, remBal);

      if (result.error) { errorEl.textContent = result.error; return; }

      var tr = document.getElementById('row-' + twapTargetOrderId);
      if (!tr) { closeModal('modal-auto-twap'); return; }

      autoTwapConfigs[twapTargetOrderId] = {
        startTime: document.getElementById('twap-start-time').value,
        endTime: document.getElementById('twap-end-time').value,
        interval: interval,
        effectiveInterval: result.effectiveInterval,
        plannedCount: result.totalCount,
        plan: result.plan
      };

      // Lần cài đầu tiên (đang None) mới bật Hoạt động; sửa cấu hình của lệnh đang active/paused thì
      // giữ nguyên trạng thái hoạt động hiện tại, chỉ cập nhật lại cấu hình.
      if ((tr.dataset.autotwap || 'none') === 'none') {
        tr.dataset.autotwap = 'active';
        var span = tr.querySelector('.col-autotwap');
        if (span) {
          span.className = 'col-autotwap ' + AUTOTWAP_BADGE.active;
          span.textContent = AUTOTWAP_LABEL.active;
        }
      }
      closeModal('modal-auto-twap');
      refreshAutoTwapButtonState();
      if (selectedOrderId === twapTargetOrderId) {
        var status = orderStatus(tr);
        var isActive = (status === 'Chờ xử lý' || status === 'Đã gửi' || status === 'Khớp 1 phần');
        if (isActive) refreshQtyRemBalHint(tr);
        validateOrderForm();
      }
    }
```

- [ ] **Step 5: Syntax check**

Run the same `node -e "new Function(...)"` command as Task 1 Step 2. Expected: no output.

- [ ] **Step 6: Manual verification in the Browser pane**

1. `preview_start` → reload if already open.
2. Select order `LT20260616-02` (MWG, Bán, REM BAL 800, status "Chờ xử lý") and click the `Auto TWAP` toolbar button — the setup modal should open with **no checkboxes/% fields**, only Thời gian bắt đầu/kết thúc/Tần suất and a "Dự kiến" block showing `—` for all three (nothing entered yet).
3. Enter Thời gian bắt đầu `09:15`, Thời gian kết thúc `10:00`, Tần suất `4` → "Dự kiến" should update to show `8 liên tục = 8 lệnh`, `KL mỗi lệnh: 100`, `Tần suất hiệu lực: 5 phút (đã tự điều chỉnh)` (matches Task 1 Step 3's third scenario).
4. Click "Xác nhận" → modal closes, no error, the order's `Auto TWAP` badge should now read "Hoạt động".
5. `read_console_messages` → confirm no errors were logged during the above.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(auto-twap): bỏ cài đặt %% theo phiên ở màn cài đặt, dùng computeAutoTwapPlan"
```

---

### Task 3: Management screen — plan detail table, seed data, pause/resume recompute

**Files:**
- Modify: `khtc-prototype/index.html:1067-1092` (review modal HTML)
- Modify: `khtc-prototype/index.html` — `openAutoTwapReview`, `toggleAutoTwapPauseResume`, `seedAutoTwapConfig` + its 3 call sites (currently ~lines 1392-1462, 3434-3449)

**Interfaces:**
- Consumes: `autoTwapConfigs[orderId].plan` from Task 2; `computeAutoTwapPlan`, `minutesToTimeStr`, `TWAP_SESSION_LABEL` from Task 1; existing `countAutoTwapGeneratedOrders`, `formatQty`, `STATUS_BADGE`.
- Produces: `renderAutoTwapPlanTable(orderId, cfg)` — new function, called only from `openAutoTwapReview`.

- [ ] **Step 1: Replace the review modal HTML**

Find (currently lines 1067-1092):

```html
  <!-- ===== Modal: Xem lại cài đặt Auto TWAP (lệnh đã Hoạt động/Tạm dừng) ===== -->
  <div class="modal-overlay" id="modal-auto-twap-review" hidden>
    <div class="modal-box" style="max-width:440px;">
      <div class="modal-title-row">
        <span class="modal-title">Auto TWAP</span>
        <span class="modal-close" onclick="closeModal('modal-auto-twap-review')">✕</span>
      </div>
      <div class="modal-order-header">
        <div class="modal-order-symbol" id="twapview-header-symbol"></div>
        <div class="modal-order-side" id="twapview-header-side"></div>
      </div>
      <div class="modal-kv-group">
        <div class="modal-kv-row"><label>Trạng thái</label><span id="twapview-status"></span></div>
        <div class="modal-kv-row"><label>Thời gian bắt đầu</label><span id="twapview-start"></span></div>
        <div class="modal-kv-row"><label>Thời gian kết thúc</label><span id="twapview-end"></span></div>
        <div class="modal-kv-row"><label>Tần suất</label><span id="twapview-interval"></span></div>
        <div class="modal-kv-row"><label>Phân bổ phiên</label><span id="twapview-sessions"></span></div>
        <div class="modal-kv-row"><label>Số lệnh theo kế hoạch</label><span id="twapview-planned"></span></div>
        <div class="modal-kv-row"><label>Số lệnh đã sinh</label><span id="twapview-generated"></span></div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" onclick="editAutoTwapFromReview()">Sửa</button>
        <button class="modal-btn confirm" id="twapview-toggle-btn" onclick="toggleAutoTwapPauseResume()">Tạm dừng</button>
      </div>
    </div>
  </div>
```

Replace with:

```html
  <!-- ===== Modal: Xem lại cài đặt Auto TWAP (lệnh đã Hoạt động/Tạm dừng) ===== -->
  <div class="modal-overlay" id="modal-auto-twap-review" hidden>
    <div class="modal-box" style="width:640px; max-width:94vw;">
      <div class="modal-title-row">
        <span class="modal-title">Auto TWAP</span>
        <span class="modal-close" onclick="closeModal('modal-auto-twap-review')">✕</span>
      </div>
      <div class="modal-order-header">
        <div class="modal-order-symbol" id="twapview-header-symbol"></div>
        <div class="modal-order-side" id="twapview-header-side"></div>
      </div>
      <div class="modal-kv-group">
        <div class="modal-kv-row"><label>Trạng thái</label><span id="twapview-status"></span></div>
        <div class="modal-kv-row"><label>Thời gian bắt đầu</label><span id="twapview-start"></span></div>
        <div class="modal-kv-row"><label>Thời gian kết thúc</label><span id="twapview-end"></span></div>
        <div class="modal-kv-row"><label>Tần suất</label><span id="twapview-interval"></span></div>
        <div class="modal-kv-row"><label>Số lệnh theo kế hoạch</label><span id="twapview-planned"></span></div>
        <div class="modal-kv-row"><label>Số lệnh đã sinh</label><span id="twapview-generated"></span></div>
      </div>
      <div style="font-size:var(--fs-small);font-weight:600;color:var(--text-title);margin:14px 0 8px;">Chi tiết kế hoạch đặt lệnh</div>
      <div class="table-wrap">
        <table class="table-detail-fills">
          <thead><tr><th>STT</th><th>Phiên</th><th>Thời gian dự kiến</th><th>KL kế hoạch</th><th>TT đẩy lệnh</th><th>TT khớp</th></tr></thead>
          <tbody id="twapview-plan-tbody"></tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" onclick="editAutoTwapFromReview()">Sửa</button>
        <button class="modal-btn confirm" id="twapview-toggle-btn" onclick="toggleAutoTwapPauseResume()">Tạm dừng</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Add `renderAutoTwapPlanTable` and wire it into `openAutoTwapReview`**

Find:

```js
    // ===== Xem lại cài đặt Auto TWAP (khi lệnh tổng đã active/paused) =====
    function openAutoTwapReview(tr) {
      twapTargetOrderId = tr.dataset.orderId;
      var isBuy = tr.dataset.side === 'Mua';
      document.getElementById('twapview-header-symbol').textContent = tr.dataset.symbol;
      var sideHeaderEl = document.getElementById('twapview-header-side');
      sideHeaderEl.textContent = isBuy ? 'MUA' : 'BÁN';
      sideHeaderEl.className = 'modal-order-side ' + (isBuy ? 'buy' : 'sell');

      var state = tr.dataset.autotwap === 'paused' ? 'paused' : 'active';
      var statusEl = document.getElementById('twapview-status');
      statusEl.textContent = AUTOTWAP_LABEL[state];
      statusEl.style.color = state === 'active' ? 'var(--buy)' : 'var(--warning)';

      var cfg = autoTwapConfigs[twapTargetOrderId] || null;
      document.getElementById('twapview-start').textContent = cfg ? cfg.startTime : '—';
      document.getElementById('twapview-end').textContent = cfg ? cfg.endTime : '—';
      document.getElementById('twapview-interval').textContent = cfg ? (cfg.interval + ' phút') : '—';

      var sessionParts = [];
      if (cfg) {
        if (cfg.sessions.continuous) sessionParts.push('Liên tục ' + cfg.sessions.continuous + '%');
        if (cfg.sessions.ato) sessionParts.push('ATO ' + cfg.sessions.ato + '%');
        if (cfg.sessions.atc) sessionParts.push('ATC ' + cfg.sessions.atc + '%');
      }
      document.getElementById('twapview-sessions').textContent = sessionParts.length ? sessionParts.join(', ') : '—';
      document.getElementById('twapview-planned').textContent = (cfg ? cfg.plannedCount : 0) + ' lệnh';
      document.getElementById('twapview-generated').textContent = countAutoTwapGeneratedOrders(twapTargetOrderId) + ' lệnh';

      var toggleBtn = document.getElementById('twapview-toggle-btn');
      toggleBtn.textContent = state === 'active' ? 'Tạm dừng' : 'Tiếp tục';
      toggleBtn.classList.remove('buy-confirm', 'warning-confirm');
      toggleBtn.classList.add(state === 'active' ? 'warning-confirm' : 'buy-confirm');

      openModal('modal-auto-twap-review');
    }
```

Replace with:

```js
    var TWAP_MATCH_LABEL = { 'Đã gửi': 'Chưa khớp', 'Khớp 1 phần': 'Khớp 1 phần', 'Khớp hết': 'Khớp hết', 'Đã hủy': 'Đã hủy' };
    var TWAP_MATCH_BADGE = { 'Đã gửi': 'badge-sent', 'Khớp 1 phần': 'badge-part', 'Khớp hết': 'badge-matched', 'Đã hủy': 'badge-cancelled' };

    // Mỗi dòng trong cfg.plan (đã sắp theo thời gian) khớp vị trí với lệnh con "Auto Twap" đã sinh,
    // sau khi các lệnh con đó được sắp lại theo thời gian đặt — để không phụ thuộc thứ tự hiện có
    // trên DOM (bảng lệnh con có thể bị người dùng sắp xếp lại cột).
    function renderAutoTwapPlanTable(orderId, cfg) {
      var tbody = document.getElementById('twapview-plan-tbody');
      if (!cfg || !cfg.plan || !cfg.plan.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);">Chưa có kế hoạch</td></tr>';
        return;
      }
      var generatedRows = Array.prototype.filter.call(
        document.querySelectorAll('#child-tbody tr[data-parent-id="' + orderId + '"]'),
        function (r) { return r.querySelector('.col-child-trader').textContent.trim() === 'Auto Twap'; }
      ).sort(function (a, b) {
        return a.querySelector('.col-child-time').textContent.trim().localeCompare(b.querySelector('.col-child-time').textContent.trim());
      });

      var rows = '';
      cfg.plan.forEach(function (p, i) {
        var generated = generatedRows[i];
        var pushLabel = generated ? 'Đã đẩy' : 'Chưa đẩy';
        var pushBadge = generated ? 'badge-sent' : 'badge-awaiting';
        var matchCell = '—';
        if (generated) {
          var childStatus = generated.querySelector('.col-child-status').textContent.trim();
          var matchLabel = TWAP_MATCH_LABEL[childStatus] || childStatus;
          var matchBadge = TWAP_MATCH_BADGE[childStatus] || '';
          matchCell = '<span class="col-child-status ' + matchBadge + '">' + matchLabel + '</span>';
        }
        rows += '<tr><td>' + (i + 1) + '</td><td>' + TWAP_SESSION_LABEL[p.session] + '</td><td>' +
          minutesToTimeStr(p.timeMin) + '</td><td class="mono">' + formatQty(p.qty) + '</td>' +
          '<td><span class="col-child-status ' + pushBadge + '">' + pushLabel + '</span></td>' +
          '<td>' + matchCell + '</td></tr>';
      });
      tbody.innerHTML = rows;
    }

    // ===== Xem lại cài đặt Auto TWAP (khi lệnh tổng đã active/paused) =====
    function openAutoTwapReview(tr) {
      twapTargetOrderId = tr.dataset.orderId;
      var isBuy = tr.dataset.side === 'Mua';
      document.getElementById('twapview-header-symbol').textContent = tr.dataset.symbol;
      var sideHeaderEl = document.getElementById('twapview-header-side');
      sideHeaderEl.textContent = isBuy ? 'MUA' : 'BÁN';
      sideHeaderEl.className = 'modal-order-side ' + (isBuy ? 'buy' : 'sell');

      var state = tr.dataset.autotwap === 'paused' ? 'paused' : 'active';
      var statusEl = document.getElementById('twapview-status');
      statusEl.textContent = AUTOTWAP_LABEL[state];
      statusEl.style.color = state === 'active' ? 'var(--buy)' : 'var(--warning)';

      var cfg = autoTwapConfigs[twapTargetOrderId] || null;
      document.getElementById('twapview-start').textContent = cfg ? cfg.startTime : '—';
      document.getElementById('twapview-end').textContent = cfg ? cfg.endTime : '—';
      document.getElementById('twapview-interval').textContent = cfg
        ? (cfg.effectiveInterval + ' phút' + (cfg.effectiveInterval !== cfg.interval ? ' (đã tự điều chỉnh)' : ''))
        : '—';
      document.getElementById('twapview-planned').textContent = (cfg ? cfg.plannedCount : 0) + ' lệnh';
      document.getElementById('twapview-generated').textContent = countAutoTwapGeneratedOrders(twapTargetOrderId) + ' lệnh';

      renderAutoTwapPlanTable(twapTargetOrderId, cfg);

      var toggleBtn = document.getElementById('twapview-toggle-btn');
      toggleBtn.textContent = state === 'active' ? 'Tạm dừng' : 'Tiếp tục';
      toggleBtn.classList.remove('buy-confirm', 'warning-confirm');
      toggleBtn.classList.add(state === 'active' ? 'warning-confirm' : 'buy-confirm');

      openModal('modal-auto-twap-review');
    }
```

- [ ] **Step 3: Rewrite the "Tiếp tục" recompute in `toggleAutoTwapPauseResume`**

Find:

```js
      if (next === 'active') {
        var cfg = autoTwapConfigs[twapTargetOrderId];
        if (cfg && cfg.sessions.continuous && cfg.perPushQty > 0) {
          var remBalNow = parseQty(tr.querySelector('.col-rembal').textContent);
          var contTotalQtyNow = Math.round(remBalNow * cfg.sessions.continuous / 100 / 100) * 100;
          var remainingContCount = contTotalQtyNow > 0 ? Math.max(1, Math.ceil(contTotalQtyNow / cfg.perPushQty)) : 0;
          cfg.plannedCount = remainingContCount + (cfg.sessions.ato ? 1 : 0) + (cfg.sessions.atc ? 1 : 0);
        }
      }
```

Replace with:

```js
      if (next === 'active') {
        var cfg = autoTwapConfigs[twapTargetOrderId];
        if (cfg) {
          var remBalNow = parseQty(tr.querySelector('.col-rembal').textContent);
          var result = computeAutoTwapPlan(timeToMinutes(cfg.startTime), timeToMinutes(cfg.endTime), cfg.interval, remBalNow);
          if (!result.error) {
            cfg.effectiveInterval = result.effectiveInterval;
            cfg.plannedCount = result.totalCount;
            cfg.plan = result.plan;
          }
        }
      }
```

- [ ] **Step 4: Rewrite `seedAutoTwapConfig` and its 3 call sites**

Find (near the end of the script, currently lines 3434-3449):

```js
    // Cấu hình Auto TWAP mẫu cho các lệnh tổng đang Hoạt động/Tạm dừng — dùng cho màn "Xem lại cài đặt"
    function seedAutoTwapConfig(orderId, startTime, endTime, interval, contPct) {
      var tr = document.getElementById('row-' + orderId);
      if (!tr) return;
      var startMin = timeToMinutes(startTime), endMin = timeToMinutes(endTime);
      var remBal = parseQty(tr.querySelector('.col-rembal').textContent);
      var pushCount = computeTwapPushCount(startMin, endMin, interval);
      var perPushQty = computeTwapPerPushQty(pushCount, remBal, contPct);
      autoTwapConfigs[orderId] = {
        startTime: startTime, endTime: endTime, interval: interval,
        sessions: { continuous: contPct }, perPushQty: perPushQty, plannedCount: pushCount
      };
    }
    seedAutoTwapConfig('LT20260615-01', '13:30', '14:15', 15, 100); // Hoạt động — Mua HPG
    seedAutoTwapConfig('LT20260615-02', '10:00', '11:00', 15, 100); // Tạm dừng — Bán FPT
    seedAutoTwapConfig('LT20260619-01', '09:00', '11:00', 15, 100); // Hoạt động — Bán MWG
```

Replace with:

```js
    // Cấu hình Auto TWAP mẫu cho các lệnh tổng đang Hoạt động/Tạm dừng — dùng cho màn "Xem lại cài đặt"
    function seedAutoTwapConfig(orderId, startTime, endTime, interval) {
      var tr = document.getElementById('row-' + orderId);
      if (!tr) return;
      var startMin = timeToMinutes(startTime), endMin = timeToMinutes(endTime);
      var remBal = parseQty(tr.querySelector('.col-rembal').textContent);
      var result = computeAutoTwapPlan(startMin, endMin, interval, remBal);
      if (result.error) return;
      autoTwapConfigs[orderId] = {
        startTime: startTime, endTime: endTime, interval: interval,
        effectiveInterval: result.effectiveInterval, plannedCount: result.totalCount, plan: result.plan
      };
    }
    seedAutoTwapConfig('LT20260615-01', '13:30', '14:15', 15); // Hoạt động — Mua HPG, REM BAL 1,900
    seedAutoTwapConfig('LT20260615-02', '10:00', '11:00', 15); // Tạm dừng — Bán FPT, REM BAL 500
    seedAutoTwapConfig('LT20260619-01', '09:00', '11:00', 15); // Hoạt động — Bán MWG, REM BAL 1,600
```

- [ ] **Step 5: Syntax check**

Same `node -e "new Function(...)"` command as before. Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(auto-twap): bảng chi tiết kế hoạch đặt lệnh ở màn quản lý, tính lại plan khi Tiếp tục"
```

(Manual browser verification of this table happens in Task 4 Step 3, after the seed data below is aligned — otherwise `LT20260619-01`'s push/match demo will look inconsistent.)

---

### Task 4: Align sample data for `LT20260619-01`

**Files:**
- Modify: `khtc-prototype/data.js:138-145` (parent order)
- Modify: `khtc-prototype/data.js:169-171` (its 3 "Auto Twap" child orders)

**Interfaces:** none (data-only; consumed by Task 3's `renderAutoTwapPlanTable` and existing `updateOrderAggregates`).

With `computeAutoTwapPlan(540, 660, 15, 1600)` (Task 1 Step 3), the plan is: seq1 ATO@09:00 qty200, seq2 continuous@09:15 qty200, seq3 continuous@09:30 qty200, … seq8 continuous@10:45 qty200. The existing 3 sample "Auto Twap" child orders (`CO20260619-02/03/04`, currently at 09:20/09:35/09:50 with qty 300) must move to the first 3 plan slots (09:00/09:15/09:30, qty 200) so the review screen's plan table shows a believable mix: slot 1 fully matched, slot 2 partially matched, slot 3 pushed-but-unmatched, slots 4–8 not yet pushed.

- [ ] **Step 1: Update the 3 child order records**

Find (`data.js`, currently lines 169-171):

```js
  { childId: 'CO20260619-02', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:20:00', matchTime: '09:20:40', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 100, status: 'Khớp 1 phần' },
  { childId: 'CO20260619-03', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:35:00', matchTime: '09:36:12', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 300, status: 'Khớp hết' },
  { childId: 'CO20260619-04', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:50:00', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 300, price: 52500, matchQty: 0,   status: 'Đã gửi' }
```

Replace with:

```js
  { childId: 'CO20260619-02', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:00:00', matchTime: '09:00:30', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 200, price: 52500, matchQty: 200, status: 'Khớp hết' },
  { childId: 'CO20260619-03', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:15:00', matchTime: '09:15:35', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 200, price: 52500, matchQty: 100, status: 'Khớp 1 phần' },
  { childId: 'CO20260619-04', parentId: 'LT20260619-01', account: 'SCBFCA8060', subaccount: 'PPL', symbol: 'MWG', time: '09:30:00', side: 'Bán', orderType: 'LO', trader: 'Auto Twap', qty: 200, price: 52500, matchQty: 0,   status: 'Đã gửi' }
```

- [ ] **Step 2: Update the parent order's `fillQty` to match the new sum of `matchQty`**

Sum of all matched qty for `LT20260619-01` is now `0 (CO20260619-01) + 200 + 100 + 0 = 300` (was 400).

Find (`data.js`, currently lines 138-144):

```js
    orderId: 'LT20260619-01', route: 'Manual', checkPx: '2', createTime: '09:00:00',
    instructions: 'Auto TWAP chia lệnh theo phiên liên tục',
    // Đã khớp 400/3000 → trạng thái "Khớp 1 phần"; avgPx = 52500 (các lệnh con khớp đều @ 52500)
    status: 'Khớp 1 phần', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'MWG', qty: 3000, price: 52500, fillQty: 400, avgPx: 52500, vwap: 52478.9126,
    orderType: 'LO', note: '', marketVol: 2600000,
    tradeId: '', autoTwap: 'active'
```

Replace with:

```js
    orderId: 'LT20260619-01', route: 'Manual', checkPx: '2', createTime: '09:00:00',
    instructions: 'Auto TWAP chia lệnh theo phiên liên tục',
    // Đã khớp 300/3000 → trạng thái "Khớp 1 phần"; avgPx = 52500 (các lệnh con khớp đều @ 52500)
    status: 'Khớp 1 phần', side: 'Bán', account: 'SCBFCA8060', subaccount: 'PPL',
    symbol: 'MWG', qty: 3000, price: 52500, fillQty: 300, avgPx: 52500, vwap: 52478.9126,
    orderType: 'LO', note: '', marketVol: 2600000,
    tradeId: '', autoTwap: 'active'
```

- [ ] **Step 3: Manual verification in the Browser pane**

1. Reload the preview.
2. Select `LT20260619-01`, click `Auto TWAP` (already active → opens the review/management modal directly).
3. Confirm the summary rows read: Trạng thái "Hoạt động", Thời gian bắt đầu 09:00, Thời gian kết thúc 11:00, Tần suất "15 phút" (no adjustment note — matches Task 1 Step 3's first scenario), Số lệnh theo kế hoạch "8 lệnh", Số lệnh đã sinh "3 lệnh".
4. Confirm the "Chi tiết kế hoạch đặt lệnh" table has exactly 8 rows:
   - Row 1: ATO, 09:00, 200, Đã đẩy, Khớp hết
   - Row 2: Liên tục, 09:15, 200, Đã đẩy, Khớp 1 phần
   - Row 3: Liên tục, 09:30, 200, Đã đẩy, Chưa khớp
   - Rows 4–8: Liên tục, 09:45/10:00/10:15/10:30/10:45, 200 each, Chưa đẩy, —
5. Open the Detail modal for `LT20260619-01` and confirm Fill Qty now reads 300 (was 400) and `%Khớp/TT` recomputes accordingly — no console errors.
6. Repeat steps 2–3 for `LT20260615-01` (expect 3-row plan: 13:30/13:45/14:00, qty 600/600/700, all "Chưa đẩy" — this order has no `Auto Twap`-trader children) and `LT20260615-02` (expect 4-row plan: 10:00/10:15/10:30/10:45, qty 100/100/100/200, all "Chưa đẩy").
7. `read_console_messages` → confirm no errors across all three checks.

- [ ] **Step 4: Commit**

```bash
git add data.js
git commit -m "data: đồng bộ lệnh con mẫu Auto Twap của LT20260619-01 theo kế hoạch mới (ATO + 2 lệnh liên tục đầu)"
```

---

### Task 5: Update `YEU-CAU-DEV.md` sections 6 and 7

**Files:**
- Modify: `khtc-prototype/YEU-CAU-DEV.md:391-538` (sections 6 and 7 in full)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Replace section 6 (6.2, 6.3, 6.4) and section 7 (7.1, 7.3)**

Find (`YEU-CAU-DEV.md` lines 401-460, section 6.2–6.4):

```
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
```

Replace with:

```
### 6.2. Giao diện màn cài đặt

```
Cài đặt Auto TWAP                    ✕
            MWG
           [BÁN]
── Cấu hình chia lệnh (REM BAL: 1,600) ──
Thời gian bắt đầu      [09:00]
Thời gian kết thúc     [11:00]
Tần suất (phút)        [15]
── Dự kiến ──────────────────────────
Số lệnh        1 ATO + 7 liên tục = 8 lệnh
KL mỗi lệnh    200
Tần suất hiệu lực   15 phút
[thông báo lỗi]
        [Hủy]  [Xác nhận]
```

**Quy tắc nhập:**
- **Thời gian bắt đầu**: mặc định = giờ hiện tại, cho phép sửa.
- **Thời gian kết thúc**, **Tần suất (phút)**: broker tự nhập.
- Không còn checkbox/tỷ trọng % theo phiên — hệ thống **tự suy** ATO/ATC theo khung giờ (xem 6.3) và **tự lập kế hoạch** ngay khi broker gõ đủ 3 trường, hiển thị real-time ở khối "Dự kiến".

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

contCount  = floor(availableMin / Tần suất)
totalCount = contCount + (hasAto?1:0) + (hasAtc?1:0)

// Chẵn lô 100: nếu totalCount lệnh sẽ khiến 1 lệnh < 100 cổ phiếu, giảm số lệnh liên tục
maxByLot100 = floor(REM BAL / 100)
nếu totalCount > maxByLot100:
    contCount  = maxByLot100 − (hasAto?1:0) − (hasAtc?1:0)
    totalCount = contCount + (hasAto?1:0) + (hasAtc?1:0)
    Tần suất hiệu lực = floor(availableMin / contCount)   ← hiển thị lại cho broker, kèm ghi chú "đã tự điều chỉnh"

// Chia đều REM BAL cho MỌI lệnh trong kế hoạch (kể cả ATO/ATC)
KL mỗi lệnh (trừ lệnh cuối) = floor(REM BAL / totalCount / 100) × 100
KL lệnh cuối cùng (theo thời gian, ATC nếu có, ngược lại lệnh liên tục cuối)
                            = REM BAL − KL mỗi lệnh × (totalCount − 1)   ← nhận phần dư, đảm bảo khớp đúng REM BAL
```

> **Bắt buộc:** KL mỗi lệnh TWAP phải là **bội số của 100** (lô chẵn), kể cả lệnh ATO/ATC.

### 6.4. Validate khi xác nhận

| Điều kiện | Thông báo |
|---|---|
| Thiếu giờ bắt đầu / kết thúc / tần suất ≤ 0 | "Vui lòng nhập đầy đủ Thời gian bắt đầu/kết thúc/Tần suất hợp lệ." |
| Giờ kết thúc ≤ giờ bắt đầu | (gộp vào thông báo trên) |
| REM BAL không đủ 100 cổ phiếu cho ATO/ATC bắt buộc | "REM BAL quá nhỏ, không đủ 100 cổ phiếu cho các lệnh ATO/ATC bắt buộc." |
| Khung giờ/Tần suất khiến tổng số lệnh = 0 | "Khung giờ/Tần suất không hợp lệ, không lập được kế hoạch." |

**Sau khi xác nhận:** lưu cấu hình gồm `startTime, endTime, interval, effectiveInterval, plannedCount, plan[]` (mỗi phần tử: `seq, session, timeMin, qty`); `autoTwap` → `active` (nếu trước đó là `none`); nếu đang sửa cấu hình của lệnh `active`/`paused` thì **giữ nguyên trạng thái hiện tại**.
```

- [ ] **Step 2: Replace section 7.1's diagram and 7.3's formula**

Find (`YEU-CAU-DEV.md`, section 7.1 diagram, currently lines 477-491):

```
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
```

Replace with:

```
```
Auto TWAP                            ✕
            MWG
           [BÁN]
┌────────────────────────────────────┐
│ Trạng thái            Hoạt động    │ ← xanh lá / Tạm dừng: vàng
│ Thời gian bắt đầu     09:00        │
│ Thời gian kết thúc    11:00        │
│ Tần suất              15 phút      │
│ Số lệnh theo kế hoạch 8 lệnh       │
│ Số lệnh đã sinh       3 lệnh       │ ← đếm lệnh con có người đặt = Auto Twap
└────────────────────────────────────┘
STT  Phiên       Thời gian dự kiến  KL kế hoạch  TT đẩy lệnh   TT khớp
1    ATO         09:00              200          Đã đẩy       Khớp hết
2    Liên tục    09:15              200          Đã đẩy       Khớp 1 phần
3    Liên tục    09:30              200          Đã đẩy       Chưa khớp
...  Liên tục    ...                200          Chưa đẩy     —
      [Sửa]      [Tạm dừng]
```

**Bảng "Chi tiết kế hoạch đặt lệnh"**: mỗi dòng ứng với 1 lệnh trong `plan[]`. **TT đẩy lệnh** = "Đã đẩy" nếu đã có lệnh con `trader = Auto Twap` tương ứng (khớp theo thứ tự thời gian), ngược lại "Chưa đẩy". **TT khớp** = "—" nếu chưa đẩy; nếu đã đẩy thì map trạng thái lệnh con: `Đã gửi → "Chưa khớp"`, `Khớp 1 phần → "Khớp 1 phần"`, `Khớp hết → "Khớp hết"`.
```

Find (`YEU-CAU-DEV.md`, section 7.3, currently lines 511-519):

```
### 7.3. Tính lại kế hoạch khi bấm "Tiếp tục"

Khi chuyển `paused` → `active`, hệ thống **tính lại số lệnh còn phải sinh** dựa trên **REM BAL hiện tại** (đã thay đổi do lệnh con khớp thêm hoặc do broker đặt tay trong lúc tạm dừng):

```
KL phiên liên tục còn lại = REM BAL hiện tại × %liên tục   (làm tròn bội số 100)
Số lệnh còn lại = ceil(KL còn lại / KL mỗi lệnh)
Số lệnh theo kế hoạch = Số lệnh còn lại + (ATO?1:0) + (ATC?1:0)
```
```

Replace with:

```
### 7.3. Tính lại kế hoạch khi bấm "Tiếp tục"

Khi chuyển `paused` → `active`, hệ thống **lập lại toàn bộ kế hoạch** bằng đúng công thức ở mục 6.3, dùng lại `startTime`/`endTime`/`interval` đã cài nhưng **REM BAL hiện tại** (đã thay đổi do lệnh con khớp thêm hoặc do broker đặt tay trong lúc tạm dừng). Kết quả (`effectiveInterval`, `plannedCount`, `plan[]`) ghi đè lên cấu hình cũ; các lệnh con Auto Twap đã sinh trước đó không bị xoá, chỉ được khớp lại theo thứ tự thời gian với `plan[]` mới ở màn hiển thị.
```

- [ ] **Step 3: Commit**

```bash
git add YEU-CAU-DEV.md
git commit -m "docs: cập nhật mục 6-7 YEU-CAU-DEV.md theo thiết kế Auto TWAP mới"
```

---

### Task 6: Full regression sweep and push

**Files:** none (verification only).

- [ ] **Step 1: Fetch and confirm remote hasn't moved**

```bash
git fetch origin && git log HEAD..origin/main --oneline
```
Expected: no output.

- [ ] **Step 2: Full browser sweep**

1. Reload the preview.
2. Re-run Task 2 Step 6's manual check (setup modal on `LT20260616-02`) and Task 4 Step 3's checks (review modal on `LT20260619-01`, `LT20260615-01`, `LT20260615-02`) once more end-to-end, back to back, to catch any regression from later commits touching the same functions.
3. Additionally open the Detail modal (`showOrderDetail`) for `LT20260619-01`, `LT20260615-01` and confirm the "Chi tiết lệnh khớp" table (unrelated feature, from a prior task) still renders correctly — this confirms the `fillQty` edit in Task 4 didn't break `buildFillHistory` or `%PR` calculations.
4. `read_console_messages` with `onlyErrors: true` → expect empty.

- [ ] **Step 3: Push**

```bash
git push origin main
```
