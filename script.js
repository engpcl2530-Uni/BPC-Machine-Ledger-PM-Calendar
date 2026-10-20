// 🔴 นำ Web App URL ของ Google Apps Script มาใส่ตรงนี้
const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbxRj_dahQfwuT4X8iTFF2-ds_9vo-GHVbvLDgxvOdW-r8UfYQ3F4uXtvN-MOuhHOu0Ngg/exec";

// ================= 0. Helper Functions (Modal Alert & Security) =================
// ฟังก์ชันโชว์แจ้งเตือนด้วย Modal สวยๆ แทน alert()
function showModalAlert(title, message, isError = false) {
  const header = document.getElementById("msgModalHeader");
  header.className = `modal-header text-white ${isError ? "bg-danger" : "bg-success"}`;
  document.getElementById("msgModalTitle").innerText = title;
  document.getElementById("msgModalBody").innerText = message;
  new bootstrap.Modal(document.getElementById("messageModal")).show();
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function safeJSONParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

/**
 * API Service (ตัดระบบรหัสผ่านออก User โหลด-เซฟได้เลย)
 */
const ApiService = {
  async request(action, data = {}) {
    try {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...data }),
      });
      if (!response.ok) throw new Error(`HTTP_ERROR_${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "API_ERROR");
      return result;
    } catch (err) {
      console.error(`ApiService Error [${action}]:`, err);
      throw err;
    }
  },
  async getAllData() {
    return (await this.request("get_all_data")).data;
  },
  async saveLedger(ledgerData) {
    return await this.request("save_ledger", { data: ledgerData });
  },
};

let dbData = {};
let currentDept = null;
let currentLine = null;
let currentMach = null;
let currentSub = null;

// ================= 1. ดึงข้อมูลจากฐานข้อมูล =================
// ตัวแปรเก็บการ์ดทั้งหมด
let allMachineCards = [];

// 1. จังหวะที่ 1: ดึงการ์ดทั้งหมดตอนเปิดจอ
function fetchFirstLoad() {
  // สั่งโชว์ Loading ใหญ่กลางจอ
  updateLoadingState("กำลังโหลดข้อมูลเครื่องจักร...");

  var payload = { action: "get_first_load" };

  google.script.run
    .withSuccessHandler(function (response) {
      if (response.success) {
        allMachineCards = response.data;
        renderAllCards(allMachineCards); // วาดการ์ดทั้งหมดทีเดียวเลย
        updateLoadingState("", true); // ปิด Loading ใหญ่กลางจอ

        // เริ่มจังหวะที่ 2 (แอบดึง Real-time ขาดด้านหลัง)
        fetchRealtimePMStatus();
      } else {
        updateLoadingState("เกิดข้อผิดพลาดในการดึงข้อมูล");
      }
    })
    .withFailureHandler(function (error) {
      updateLoadingState("เกิดข้อผิดพลาด โปรดรีเฟรชหน้าจอ");
    })
    .doPost(payload);
}

// วาดการ์ดทั้งหมด
function renderAllCards(data) {
  const container = document.getElementById("first-page-container");
  container.innerHTML = "";

  data.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    card.id = "mach-card-" + item.machineName.replace(/\s+/g, "-"); // ตั้ง ID ให้หาเจอง่ายๆ

    // ถ้ามี PM ให้ใส่คลาสเรืองแสงสีแดง
    if (item.hasPM) {
      card.classList.add("pm-alert-glow");
    }

    card.innerHTML = `
      ${item.hasPM ? '<div class="pm-badge" id="badge-' + item.machineName.replace(/\s+/g, "-") + '">มี PM สัปดาห์นี้!</div>' : ""}
      <img src="${item.image}" alt="${item.machineName}" style="width:100%; height:150px; object-fit:cover; border-radius:8px 8px 0 0;">
      <div style="padding: 10px;">
        <h4 style="color:#d90000;">${item.machineName}</h4>
        <p><strong>Line:</strong> ${item.line}</p>
        <p><strong>Subassemblies:</strong> ${item.subCount}</p>
        <p><strong>Components:</strong> ${item.compCount}</p>
      </div>
    `;
    container.appendChild(card);
  });
}

// 2. จังหวะที่ 2: ดึงข้อมูลอัปเดตล่าสุด
function fetchRealtimePMStatus() {
  const syncAlert = document.getElementById("pm-sync-alert");
  syncAlert.style.display = "flex"; // โชว์กล่อง "กำลังซิงค์ข้อมูล..." มุมขวาล่าง

  var payload = { action: "get_realtime_pm_status" };

  google.script.run
    .withSuccessHandler(function (response) {
      syncAlert.style.display = "none"; // ซ่อนเมื่อเสร็จ

      if (response.success) {
        var finished = response.finishedPMs;
        // วนดูว่ามีเครื่องไหนในหน้าจอที่เพิ่งทำเสร็จไปวันนี้บ้าง
        allMachineCards.forEach((item) => {
          if (item.hasPM && finished[item.machineName] > 0) {
            // ถ้ามีคนทำ PM เครื่องนี้ไปแล้ว (อย่างน้อย 1 ชิ้น)
            // **หมายเหตุ:** ถ้าอยากให้เป๊ะว่า "ทำครบทุกชิ้นแล้วถึงจะลบป้าย"
            // ต้องเพิ่มเงื่อนไขนับจำนวนชิ้นรวมด้วย ตรงนี้ผมทำแบบ "ถ้าเริ่มทำแล้ว ให้ลบป้ายออกก่อนเลย"

            let cardId = "mach-card-" + item.machineName.replace(/\s+/g, "-");
            let cardElement = document.getElementById(cardId);
            if (cardElement) {
              cardElement.classList.remove("pm-alert-glow"); // เอาขอบแดงออก
              let badge = document.getElementById(
                "badge-" + item.machineName.replace(/\s+/g, "-"),
              );
              if (badge) badge.remove(); // ลบป้ายแจ้งเตือนทิ้ง
            }
          }
        });
      }
    })
    .withFailureHandler(function (error) {
      syncAlert.style.display = "none";
      console.log("Realtime Sync Failed");
    })
    .doPost(payload);
}

// เริ่มทำงานเมื่อเว็บโหลด
window.addEventListener("DOMContentLoaded", () => {
  // สร้างกล่องแจ้งเตือนซิงค์ใส่ใน body (ถ้าคุณไม่ได้ใส่ใน HTML ไว้)
  if (!document.getElementById("pm-sync-alert")) {
    let syncBox = document.createElement("div");
    syncBox.id = "pm-sync-alert";
    syncBox.innerHTML =
      '<div class="sync-spinner"></div> ซิงค์สถานะ PM ล่าสุด...';
    document.body.appendChild(syncBox);
  }

  fetchFirstLoad();
});

// =========================================================
// 🔴 ฟังก์ชันควบคุม Smart Filters
// =========================================================

// สร้างรายการแผนกจาก dbData อัตโนมัติ
function initFilters() {
  const lang = getCurrentLang();
  const t = translations[lang] || translations["th"];

  const deptSelect = document.getElementById("filterDept");
  deptSelect.innerHTML = `<option value="ALL">${t.filter_dept_all}</option>`;

  for (let dept in dbData) {
    deptSelect.innerHTML += `<option value="${dept}">${dept}</option>`;
  }
  // เพิ่มตัวเลือก อื่นๆ (Others)
  deptSelect.innerHTML += `<option value="OTHER">${t.filter_other}</option>`;
}

// อัปเดตช่องเลือกไลน์ เมื่อมีการเปลี่ยนแผนก
function updateLineDropdown() {
  const lang = getCurrentLang();
  const t = translations[lang] || translations["th"];

  const dept = document.getElementById("filterDept").value;
  const lineSelect = document.getElementById("filterLine");

  lineSelect.innerHTML = `<option value="ALL">${t.filter_line_all}</option>`;

  if (dept === "ALL") {
    lineSelect.disabled = true;
  } else {
    if (dept === "OTHER") {
      for (let d in dbData) {
        if (d !== "CO" && d !== "PCL") {
          for (let line in dbData[d]) {
            lineSelect.innerHTML += `<option value="${line}">${line}</option>`;
          }
        }
      }
    } else if (dbData[dept]) {
      for (let line in dbData[dept]) {
        lineSelect.innerHTML += `<option value="${line}">${line}</option>`;
      }
    }
    lineSelect.disabled = false;
  }
  handleRouting();
}

// สวิตช์ปุ่มแคปซูล 2 สัปดาห์
function toggleUpcomingFilter() {
  const btn = document.getElementById("btnFilterUpcoming");
  const icon = document.getElementById("iconUpcoming");
  btn.classList.toggle("active");

  if (btn.classList.contains("active")) {
    icon.innerText = "local_fire_department"; // เปลี่ยนเป็นรูปไฟ
  } else {
    icon.innerText = "notifications"; // กลับเป็นกระดิ่ง
  }
  handleRouting();
}

// เช็ค Class ของอะไหล่ในเครื่องจักร
function hasClassTarget(entityData, targetClass, isLine = false) {
  if (targetClass === "ALL") return true;
  const checkCompClass = (comp) => comp.class === targetClass;

  if (isLine) {
    for (let m in entityData.machines) {
      for (let s in entityData.machines[m].subassemblies) {
        for (let c of entityData.machines[m].subassemblies[s].components) {
          if (checkCompClass(c)) return true;
        }
      }
    }
  } else {
    for (let s in entityData.subassemblies) {
      for (let c of entityData.subassemblies[s].components) {
        if (checkCompClass(c)) return true;
      }
    }
  }
  return false;
}

window.onload = () => {
  loadDataFromDatabase();
};

// ดึงภาษาปัจจุบันที่ใช้อยู่ (ถ้าไม่มีให้เป็น 'th')
function getCurrentLang() {
  return localStorage.getItem("app_lang") || "th";
}

// ฟังก์ชันหาว่าตอนนี้อยู่สัปดาห์ที่เท่าไหร่ของปี (1-52)
function getCurrentWeekNumber() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ฟังก์ชันสแกนหางานล่วงหน้า 2 สัปดาห์
function hasUpcomingTasks(entityData, isLine = false) {
  const currentWeekIndex = getCurrentWeekNumber() - 1; // สัปดาห์ปัจจุบัน

  const checkComponent = (comp) => {
    // เช็คสัปดาห์ปัจจุบัน และ สัปดาห์หน้า (รวม 2 วีคล่วงหน้า)
    for (let i = currentWeekIndex; i <= currentWeekIndex + 1; i++) {
      if (i < 52 && comp.weeks[i]) {
        let w = comp.weeks[i];
        // ตรวจจับเฉพาะงาน PM (t=ดำ, b=เหลือง) หรือ Breakdown (r=แดง)
        if (w.t === 1 || w.b === 1 || w.r === 1) return true;
      }
    }
    return false;
  };

  if (isLine) {
    for (let m in entityData.machines) {
      for (let s in entityData.machines[m].subassemblies) {
        for (let c of entityData.machines[m].subassemblies[s].components) {
          if (checkComponent(c)) return true;
        }
      }
    }
  } else {
    for (let s in entityData.subassemblies) {
      for (let c of entityData.subassemblies[s].components) {
        if (checkComponent(c)) return true;
      }
    }
  }
  return false;
}

// ตัวแปรเก็บสถานะว่าผู้ใช้กดกรอง Dashboard โหมดไหนอยู่ ('PLAN', 'DONE', 'EWO', หรือ null)
let currentDashFilter = null;
function updateDashboardStats() {
  const lang = getCurrentLang();
  const t = translations[lang]; // 🔴 เรียกใช้แปลภาษา

  let currentWeekIndex = getCurrentWeekNumber() - 1;
  let prevWeekIndex = currentWeekIndex - 1;

  let dashWeekEl = document.getElementById("dash-week");
  if (dashWeekEl) dashWeekEl.innerText = currentWeekIndex + 1;

  let stats = {
    currTotal: 0,
    currDone: 0,
    currEwo: 0,
    prevTotal: 0,
    prevDone: 0,
    prevEwo: 0,
  };

  for (let dept in dbData) {
    for (let line in dbData[dept]) {
      if (!dbData[dept][line].machines) continue;
      for (let mach in dbData[dept][line].machines) {
        if (!dbData[dept][line].machines[mach].subassemblies) continue;
        for (let sub in dbData[dept][line].machines[mach].subassemblies) {
          let comps =
            dbData[dept][line].machines[mach].subassemblies[sub].components;
          if (!comps) continue;
          comps.forEach((comp) => {
            if (comp.weeks && comp.weeks[currentWeekIndex]) {
              let w = comp.weeks[currentWeekIndex];
              if (w.b === 1 || w.t === 1) stats.currTotal++;
              if (w.t === 1) stats.currDone++;
              if (w.r === 1) stats.currEwo++;
            }
            if (prevWeekIndex >= 0 && comp.weeks && comp.weeks[prevWeekIndex]) {
              let w = comp.weeks[prevWeekIndex];
              if (w.b === 1 || w.t === 1) stats.prevTotal++;
              if (w.t === 1) stats.prevDone++;
              if (w.r === 1) stats.prevEwo++;
            }
          });
        }
      }
    }
  }

  let currPercent =
    stats.currTotal > 0
      ? Math.round((stats.currDone / stats.currTotal) * 100)
      : 0;
  let prevPercent =
    stats.prevTotal > 0
      ? Math.round((stats.prevDone / stats.prevTotal) * 100)
      : 0;

  if (document.getElementById("dash-total"))
    document.getElementById("dash-total").innerHTML =
      `${stats.currTotal} <span class="fs-6 fw-normal">${t.dash_plan_unit}</span>`;
  if (document.getElementById("dash-completed"))
    document.getElementById("dash-completed").innerText = stats.currDone;
  if (document.getElementById("dash-percent"))
    document.getElementById("dash-percent").innerText = `(${currPercent}%)`;
  if (document.getElementById("dash-breakdown"))
    document.getElementById("dash-breakdown").innerHTML =
      `${stats.currEwo} <span class="fs-6 fw-normal">${t.dash_ewo_unit}</span>`;
  if (document.getElementById("dash-progress-bar"))
    document.getElementById("dash-progress-bar").style.width =
      `${currPercent}%`;

  updateTrendUI(
    "dash-trend-total",
    stats.currTotal,
    stats.prevTotal,
    prevWeekIndex,
  );
  updateTrendUI(
    "dash-trend-done",
    currPercent,
    prevPercent,
    prevWeekIndex,
    "%",
  );
  updateTrendUI("dash-trend-ewo", stats.currEwo, stats.prevEwo, prevWeekIndex);
}

function updateTrendUI(
  elementId,
  currValue,
  prevValue,
  prevWeekIndex,
  suffix = "",
) {
  const lang = getCurrentLang();
  const t = translations[lang]; // 🔴 เรียกใช้แปลภาษา

  let el = document.getElementById(elementId);
  if (!el) return;

  if (prevWeekIndex < 0) {
    el.innerHTML = `<span class="material-symbols-rounded fs-6 align-middle">remove</span> ${t.trend_no_data}`;
    return;
  }

  let diff = currValue - prevValue;
  if (diff > 0) {
    let icon = elementId.includes("ewo") ? "trending_up" : "trending_up";
    el.innerHTML = `<span class="material-symbols-rounded fs-6 align-middle">${icon}</span> ${t.trend_increase} ${diff}${suffix} (W${prevWeekIndex + 1})`;
  } else if (diff < 0) {
    let icon = "trending_down";
    el.innerHTML = `<span class="material-symbols-rounded fs-6 align-middle">${icon}</span> ${t.trend_decrease} ${Math.abs(diff)}${suffix} (W${prevWeekIndex + 1})`;
  } else {
    el.innerHTML = `<span class="material-symbols-rounded fs-6 align-middle">drag_handle</span> ${t.trend_equal}`;
  }
}

// 🔴 ฟังก์ชันควบคุมการกด Dashboard Filter
function toggleDashboardFilter(type) {
  // กดซ้ำที่เดิม = ล้างฟิลเตอร์
  if (currentDashFilter === type) {
    clearDashboardFilter();
    return;
  }

  currentDashFilter = type;
  document.getElementById("btn-clear-dash").classList.remove("d-none");

  // ล้างการค้นหาและ Dropdown เดิมทิ้ง (ป้องกันเงื่อนไขตีกัน)
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterDept").value = "ALL";
  document.getElementById("filterLine").value = "ALL";
  document.getElementById("filterLine").disabled = true;
  document.getElementById("filterClass").value = "ALL";

  updateDashboardCardVisuals();
  handleRouting(); // รีเรนเดอร์หน้าจอ
}

function clearDashboardFilter() {
  currentDashFilter = null;
  document.getElementById("btn-clear-dash").classList.add("d-none");
  updateDashboardCardVisuals();
  handleRouting();
}

function updateDashboardCardVisuals() {
  let cards = ["dash-card-plan", "dash-card-done", "dash-card-ewo"];
  let activeMap = {
    PLAN: "dash-card-plan",
    DONE: "dash-card-done",
    EWO: "dash-card-ewo",
  };

  cards.forEach((c) => {
    let el = document.getElementById(c);
    if (el) {
      if (!currentDashFilter) {
        // ไม่มีฟิลเตอร์ ให้การ์ดสว่างทุกใบ
        el.classList.remove("dash-active", "dash-inactive");
      } else {
        if (activeMap[currentDashFilter] === c) {
          el.classList.add("dash-active");
          el.classList.remove("dash-inactive");
        } else {
          el.classList.remove("dash-active");
          el.classList.add("dash-inactive");
        }
      }
    }
  });
}

// อัปเดต Navigate ให้พ่วง Department ไปด้วย
function navigateTo(dept = null, line = null, mach = null, sub = null) {
  let url = new URL(window.location);
  if (dept) url.searchParams.set("dept", dept);
  else url.searchParams.delete("dept");
  if (line) url.searchParams.set("line", line);
  else url.searchParams.delete("line");
  if (mach) url.searchParams.set("mach", mach);
  else url.searchParams.delete("mach");
  if (sub) url.searchParams.set("sub", sub);
  else url.searchParams.delete("sub");
  window.history.pushState({}, "", url);
  handleRouting();
}

// 🔴 1. อัปเดต handleRouting() ให้เปลี่ยนข้อความส่วนหัวให้ชัดเจน
// 🔴 1. อัปเดต handleRouting() ให้เปลี่ยนข้อความส่วนหัวให้ชัดเจนและรองรับ 2 ภาษา
function handleRouting() {
  let params = new URLSearchParams(window.location.search);
  let mode = params.get("mode");
  currentDept = params.get("dept");
  currentLine = params.get("line");
  currentMach = params.get("mach");
  currentSub = params.get("sub");

  const lang = getCurrentLang();
  const t = translations[lang]; // ดึงดิกชันนารีมาใช้

  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  toggleFabMode(false);

  let fabTest = document.getElementById("fabTestExecutionBtn");
  if (fabTest) {
    if (currentDept && currentLine && currentMach && mode !== "execute") {
      fabTest.style.display = "flex";
    } else {
      fabTest.style.display = "none";
    }
  }

  let breadcrumb = "Dashboard";

  if (mode === "execute" && currentDept && currentLine && currentMach) {
    renderExecutionMode(currentDept, currentLine, currentMach);
    document.getElementById("view-execution").classList.add("active");
    window.scrollTo(0, 0);
    return;
  }

  if (!dbData || Object.keys(dbData).length === 0) {
    document.getElementById("view-lines").classList.add("active");
    return;
  }

  if (currentDept && currentLine && currentMach && currentSub) {
    document.getElementById("lbl-sub-title").innerHTML =
      `<span class="badge bg-secondary mb-2" style="font-size:12px;">${t.nav_dept}: ${currentDept} > ${t.nav_line}: ${currentLine} > ${t.nav_mach}: ${currentMach}</span><br/>${t.nav_sub}: <span class="text-primary">${currentSub}</span>`;
    renderComponentTable();
    document.getElementById("view-components").classList.add("active");
    breadcrumb = `${currentDept} > ${currentLine} > ${currentMach} > ${currentSub}`;
  } else if (currentDept && currentLine && currentMach) {
    document.getElementById("lbl-mach-title").innerHTML =
      `<span class="badge bg-secondary mb-2" style="font-size:12px;">${t.nav_dept}: ${currentDept} > ${t.nav_line}: ${currentLine}</span><br/>${t.nav_sub_list} <span class="text-danger">${currentMach}</span>`;
    renderSubs(currentDept, currentLine, currentMach);
    document.getElementById("view-subs").classList.add("active");
    breadcrumb = `${currentDept} > ${currentLine} > ${currentMach}`;
  } else if (currentDept && currentLine) {
    document.getElementById("lbl-line-title").innerHTML =
      `<span class="badge bg-secondary mb-2" style="font-size:12px;">${t.nav_dept}: ${currentDept}</span><br/>${t.nav_mach_list} <span class="text-primary">${currentLine}</span>`;
    renderMachs(currentDept, currentLine);
    document.getElementById("view-machs").classList.add("active");
    breadcrumb = `${currentDept} > ${currentLine}`;
  } else {
    renderLines();
    document.getElementById("view-lines").classList.add("active");
  }

  document.getElementById("headerBreadcrumb").innerText = breadcrumb;
  window.scrollTo(0, 0);
}

// 🔴 2. ฟังก์ชันวาดการ์ดส่งงานสำหรับช่าง (ดึงคำแปลมาใช้)
function renderExecutionMode(dept, line, mach) {
  let container = document.getElementById("execTasksContainer");
  container.innerHTML = "";

  const lang = getCurrentLang();
  const t = translations[lang];

  document.getElementById("execHeaderDesc").innerText =
    `${t.nav_dept}: ${dept} > ${t.nav_line}: ${line} > ${t.nav_mach}: ${mach}`;

  let currWeek = getCurrentWeekNumber();
  document.getElementById("execCurrentWeek").innerText = currWeek;

  if (
    !dbData[dept] ||
    !dbData[dept][line] ||
    !dbData[dept][line].machines[mach]
  ) {
    container.innerHTML = `<div class="col-12 text-center text-danger p-4 fw-bold">${t.exec_not_found}</div>`;
    return;
  }

  let machData = dbData[dept][line].machines[mach];
  let hasTasks = false;

  for (let subName in machData.subassemblies) {
    let comps = machData.subassemblies[subName].components;

    comps.forEach((comp) => {
      for (
        let i = Math.max(0, currWeek - 5);
        i <= Math.min(51, currWeek + 3);
        i++
      ) {
        let w = comp.weeks[i];
        if (w && (w.t === 1 || w.b === 1 || w.r === 1 || w.l === 1)) {
          hasTasks = true;
          let clone = document
            .getElementById("execTaskTemplate")
            .content.cloneNode(true);
          let card = clone.querySelector(".card");

          clone.querySelector(".exec-week-badge").innerText = `Week ${i + 1}`;
          clone.querySelector(".exec-comp-name").innerText =
            `[${subName}] ${comp.name}`;
          clone.querySelector(".exec-task-name").innerText =
            `Task: ${w.remark || "Check/Inspect"}`;
          clone.querySelector(".exec-ppe").innerText = comp.ppe || "-";

          // ดึงภาษาแปลสำหรับค่าความเสี่ยง
          clone.querySelector(".exec-risk").innerText = comp.risk
            ? t.exec_risk_high
            : t.exec_risk_normal;

          if (comp.imgComp && comp.imgComp.indexOf("NO+IMAGE") === -1) {
            clone.querySelector(".exec-comp-img").src = comp.imgComp;
          }

          card.dataset.sub = subName;
          card.dataset.comp = comp.name;
          card.dataset.weekIndex = i;

          container.appendChild(clone);
        }
      }
    });
  }

  if (!hasTasks) {
    container.innerHTML = `<div class="col-12 text-center text-muted p-5">
        <span class="material-symbols-rounded fs-1 d-block mb-3">check_circle</span>
        <h6 class="fw-bold">${t.exec_no_plan}</h6>
        <p class="small">${t.exec_no_plan_desc}</p>
      </div>`;
  }
}

function toggleDefectFields(selectElement) {
  let defectBox = selectElement
    .closest(".exec-form-block")
    .querySelector(".exec-defect-box");
  if (
    selectElement.value === "DEFECT" ||
    selectElement.value === "WAITING" ||
    selectElement.value === "BREAKDOWN"
  ) {
    defectBox.classList.remove("d-none");
  } else {
    defectBox.classList.add("d-none");
  }
}

// =========================================================
// 🟢 อัปเดตฟังก์ชัน Render ต่างๆ ให้ตรงกับ CSS (.hover-card, .card-overlay)
// =========================================================

// อัปเดต renderLines() ให้สแกนและโชว์แบนเนอร์แจ้งเตือนทันที
// =========================================================
// 🟢 อัปเดตฟังก์ชัน Render หน้าแรก (Lines) แบบรีดประสิทธิภาพ
// =========================================================

function renderLines() {
  let grid = document.getElementById("lineGrid");
  const lang = getCurrentLang();
  const t = translations[lang] || translations["th"];

  const filterDept = document.getElementById("filterDept").value;
  const filterLine = document.getElementById("filterLine").value;
  const filterClass = document.getElementById("filterClass").value;
  const filterSearch = document
    .getElementById("filterSearch")
    .value.toLowerCase();

  let hasResult = false;
  let hasAnyUpcoming = false;

  // ใช้ตัวแปรเก็บ HTML string ไว้ก่อน เพื่อยิงเข้า DOM ทีเดียวตอนจบลูป (ลดอาการกระตุก Reflow/Repaint)
  let htmlOutput = "";

  if (currentDashFilter) {
    let hasMachineResult = false;
    let currentWeekIndex = getCurrentWeekNumber() - 1;

    for (let deptName in dbData) {
      for (let lineName in dbData[deptName]) {
        let lineData = dbData[deptName][lineName];
        if (!lineData.machines) continue;

        for (let machName in lineData.machines) {
          let machData = lineData.machines[machName];
          let isMatch = false;

          for (let sub in machData.subassemblies) {
            let comps = machData.subassemblies[sub].components;
            if (!comps) continue;
            for (let c of comps) {
              if (c.weeks && c.weeks[currentWeekIndex]) {
                let w = c.weeks[currentWeekIndex];
                if (currentDashFilter === "PLAN" && (w.b === 1 || w.t === 1))
                  isMatch = true;
                if (currentDashFilter === "DONE" && w.t === 1) isMatch = true;
                if (currentDashFilter === "EWO" && w.r === 1) isMatch = true;
              }
            }
            if (isMatch) break;
          }

          if (isMatch) {
            hasMachineResult = true;
            let safeMachName = escapeHTML(machName);
            let imageUrl =
              machData.image && !machData.image.includes("NO+IMAGE")
                ? machData.image
                : "https://via.placeholder.com/400x200?text=No+Image+Available";
            let sCount = machData.subassemblies
              ? Object.keys(machData.subassemblies).length
              : 0;

            htmlOutput += `
              <div class="col-md-6 col-lg-4">
                <div class="hover-card d-flex flex-column h-100" onclick="navigateTo('${escapeHTML(deptName)}', '${escapeHTML(lineName)}', '${safeMachName}')">
                  <img src="${imageUrl}" loading="lazy" class="card-img-top border-bottom" onerror="this.src='https://via.placeholder.com/400x200?text=Image+Error'">
                  <div class="p-3 d-flex flex-column flex-grow-1 bg-white">
                    <div class="mb-2">
                       <span class="badge bg-primary me-1">${escapeHTML(deptName)}</span>
                       <span class="badge bg-secondary">${escapeHTML(lineName)}</span>
                    </div>
                    <h5 class="fw-bold text-dark mb-1 text-truncate" title="${safeMachName}">${safeMachName}</h5>
                    <div class="text-muted small fw-bold mt-2">
                      <span class="material-symbols-rounded align-middle text-primary" style="font-size: 18px;">account_tree</span> 
                      ${t.has_sub_text} ${sCount} ${t.unit_sub_text}
                    </div>
                  </div>
                </div>
              </div>`;
          }
        }
      }
    }

    grid.innerHTML = htmlOutput;
    if (!hasMachineResult) {
      grid.innerHTML = `<div class="col-12 text-center text-muted p-5">
           <span class="material-symbols-rounded text-secondary mb-3 d-block" style="font-size:48px;">check_circle</span>
           <h5>${t.no_match_filter}</h5>
         </div>`;
    }
    return;
  }

  for (let deptName in dbData) {
    if (filterDept !== "ALL") {
      if (filterDept === "OTHER") {
        if (deptName === "CO" || deptName === "PCL") continue;
      } else if (deptName !== filterDept) continue;
    }

    for (let lineName in dbData[deptName]) {
      if (filterLine !== "ALL" && lineName !== filterLine) continue;

      let lineData = dbData[deptName][lineName];
      let lineMatch = lineName.toLowerCase().includes(filterSearch);
      let deptMatch = deptName.toLowerCase().includes(filterSearch);
      let machMatch = false;
      if (filterSearch && lineData.machines) {
        machMatch = Object.keys(lineData.machines).some((mach) =>
          mach.toLowerCase().includes(filterSearch),
        );
      }
      if (filterSearch && !lineMatch && !deptMatch && !machMatch) continue;
      if (filterClass !== "ALL" && !hasClassTarget(lineData, filterClass, true))
        continue;

      hasResult = true;
      let safeDept = escapeHTML(deptName);
      let safeLine = escapeHTML(lineName);
      let mCount = lineData.machines
        ? Object.keys(lineData.machines).length
        : 0;
      let safeLastUpdated = escapeHTML(lineData.lastUpdated || "-");
      let safeUpdatedBy = escapeHTML(lineData.updatedBy || "-");

      let isUpcoming = hasUpcomingTasks(lineData, true);
      if (isUpcoming) hasAnyUpcoming = true;
      let highlightClass = isUpcoming ? "upcoming-task" : "";

      let imageUrl = lineData.image;
      if (!imageUrl || imageUrl.includes("NO+IMAGE") || imageUrl === "") {
        imageUrl =
          "https://via.placeholder.com/400x200?text=No+Image+Available";
      }

      let machListHtml = "";
      if (lineData.machines && Object.keys(lineData.machines).length > 0) {
        machListHtml = `<ul class="m-0 ps-3 mt-2" style="font-size: 13px; color: #cbd5e1; line-height: 1.6;">`;
        for (let mName in lineData.machines) {
          machListHtml += `<li>${escapeHTML(mName)}</li>`;
        }
        machListHtml += `</ul>`;
      } else {
        machListHtml = `<div class="text-center text-white-50 mt-3" style="font-size: 12px;">${t.no_mach_in_line_small}</div>`;
      }

      // สะสมข้อความ HTML ไว้ในตัวแปร แทนการสั่ง .innerHTML += บ่อยๆ ในลูป
      htmlOutput += `
        <div class="col-md-6 col-lg-4">
          <div class="hover-card ${highlightClass} d-flex flex-column h-100" onclick="navigateTo('${safeDept}', '${safeLine}')">
            <img src="${imageUrl}" loading="lazy" class="card-img-top border-bottom" onerror="this.src='https://via.placeholder.com/400x200?text=Image+Error'">
            <div class="p-3 d-flex flex-column flex-grow-1 bg-white">
              <div class="mb-2"><span class="badge bg-secondary">${safeDept}</span></div>
              <h5 class="fw-bold text-primary mb-1">${safeDept} - ${safeLine}</h5>
              <div class="text-muted small fw-bold mt-2">
                <span class="material-symbols-rounded align-middle text-secondary" style="font-size: 18px;">dns</span> ${t.has_mach_text} ${mCount} ${t.unit_mach_text}
              </div>
              <div class="mt-auto pt-3 border-top mt-3" style="font-size: 11px;">
                 <div class="d-flex justify-content-between mb-1 text-muted">
                    <span><span class="material-symbols-rounded align-middle me-1" style="font-size:14px;">schedule</span>${t.label_updated}</span><span class="fw-bold text-dark">${safeLastUpdated}</span>
                 </div>
                 <div class="d-flex justify-content-between text-muted">
                    <span><span class="material-symbols-rounded align-middle me-1" style="font-size:14px;">person</span>${t.label_editor}</span><span class="fw-bold text-dark">${safeUpdatedBy}</span>
                 </div>
              </div>
            </div>
            
            <div class="card-overlay" style="justify-content: flex-start; padding-top: 25px;">
              <h5 class="fw-bold text-warning mb-1">${safeDept} - ${safeLine}</h5>
              <div style="font-size: 12px; color: #94a3b8; font-weight: 600;">${t.mach_list_label}</div>
              <div style="flex-grow: 1; overflow-y: auto; margin-bottom: 15px;">
                ${machListHtml}
              </div>
              <div class="mt-auto text-center w-100">
                <span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">${t.view_machine} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span></span>
              </div>
            </div>
          </div>
        </div>`;
    }
  }

  // ยิงเข้า DOM ครั้งเดียวจบ ทำให้หน้าแรกโหลดไวขึ้นและอนิเมชั่นไม่สะดุด
  grid.innerHTML = htmlOutput;

  let alertBanner = document.getElementById("upcomingAlertBanner");
  if (alertBanner) {
    if (hasAnyUpcoming) alertBanner.classList.remove("d-none");
    else alertBanner.classList.add("t-none");
  }

  if (!hasResult) {
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">
        <span class="material-symbols-rounded text-secondary mb-3 d-block" style="font-size:48px;">search_off</span>
        ${t.no_data_condition}
      </div>`;
  }
}

function renderMachs(deptName, lineName) {
  let grid = document.getElementById("machGrid");
  grid.innerHTML = "";
  const lang = getCurrentLang();
  const t = translations[lang];

  if (
    !dbData[deptName] ||
    !dbData[deptName][lineName] ||
    !dbData[deptName][lineName].machines ||
    Object.keys(dbData[deptName][lineName].machines).length === 0
  ) {
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">
       <span class="material-symbols-rounded text-secondary mb-3 d-block" style="font-size:48px;">precision_manufacturing</span>
       <h5>${t.page_mach_empty_1} <span class="text-dark">${escapeHTML(deptName)}</span> ${t.page_mach_empty_2} <span class="text-dark">${escapeHTML(lineName)}</span></h5>
       <p>${t.page_mach_empty_3}</p>
    </div>`;
    return;
  }

  let line = dbData[deptName][lineName];

  for (let machName in line.machines) {
    let safeMachName = escapeHTML(machName);
    let machData = line.machines[machName];
    let sCount = machData.subassemblies
      ? Object.keys(machData.subassemblies).length
      : 0;
    let isUpcoming = hasUpcomingTasks(machData, false);
    let highlightClass = isUpcoming ? "upcoming-task" : "";
    let imageUrl =
      machData.image && !machData.image.includes("NO+IMAGE")
        ? machData.image
        : "https://via.placeholder.com/400x200?text=No+Image+Available";

    let subListHtml = "";
    if (
      machData.subassemblies &&
      Object.keys(machData.subassemblies).length > 0
    ) {
      subListHtml = `<ul class="m-0 ps-3 mt-2" style="font-size: 13px; color: #cbd5e1; line-height: 1.6;">`;
      for (let subName in machData.subassemblies) {
        let subInfo = machData.subassemblies[subName];
        let cCount = subInfo.components ? subInfo.components.length : 0;
        subListHtml += `<li>${escapeHTML(subName)} <span class="text-white opacity-75" style="font-size: 11px;">(${cCount} ${t.unit_pieces})</span></li>`;
      }
      subListHtml += `</ul>`;
    } else {
      subListHtml = `<div class="text-center text-white-50 mt-3" style="font-size: 12px;">${t.no_sub_in_mach_small}</div>`;
    }

    grid.innerHTML += `
      <div class="col-md-6 col-lg-4">
        <div class="hover-card ${highlightClass} d-flex flex-column h-100" onclick="navigateTo('${escapeHTML(deptName)}', '${escapeHTML(lineName)}', '${safeMachName}')">
          <img src="${imageUrl}" class="card-img-top border-bottom" onerror="this.src='https://via.placeholder.com/400x200?text=Image+Error'">
          <div class="p-3 d-flex flex-column flex-grow-1 bg-white">
            <h5 class="fw-bold text-dark mb-1 text-truncate" title="${safeMachName}">${safeMachName}</h5>
            <div class="text-muted small fw-bold mt-2">
              <span class="material-symbols-rounded align-middle text-primary" style="font-size: 18px;">account_tree</span> 
              ${t.has_sub_text} ${sCount} ${t.unit_sub_text}
            </div>
            <div class="mt-auto"></div> 
          </div>
          
          <div class="card-overlay" style="justify-content: flex-start; padding-top: 25px;">
            <h5 class="fw-bold text-warning mb-1 text-truncate" title="${safeMachName}">${safeMachName}</h5>
            <div style="font-size: 12px; color: #94a3b8; font-weight: 600;">${t.sub_list_label}</div>
            <div style="flex-grow: 1; overflow-y: auto; margin-bottom: 15px;">
              ${subListHtml}
            </div>
            <div class="mt-auto text-center w-100">
              <span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">
                ${t.view_sub} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span>
              </span>
            </div>
          </div>
        </div>
      </div>`;
  }
}

// =========================================================
// 🔴 ฟังก์ชันวาดตาราง Component (อัปเดต: คืนรูปภาพ, ดึง Task จาก 52 วีคมาโชว์)
// =========================================================
function renderComponentTable() {
  let tbody = document.getElementById("componentTableBody");
  tbody.innerHTML = "";

  // ให้แน่ใจว่าคอลัมน์รูปไม่ถูกซ่อน
  let tableHead = document.querySelector(".table-ledger thead tr");
  if (tableHead && tableHead.cells[0].style.display === "none") {
    tableHead.cells[0].style.display = "";
  }

  let comps =
    dbData[currentDept][currentLine].machines[currentMach].subassemblies[
      currentSub
    ].components;

  comps.forEach((c) => {
    let weeksHtml = "";
    let taskList = [];

    c.weeks.forEach((w, idx) => {
      weeksHtml += `<td class="text-center p-1">${getTriangleSVGOnly(w)}</td>`;
      // ดึง Task (remark) ออกมาโชว์ถ้ายอมใส่ไว้ (ฟอร์แมต Week X : Task)
      if (w.remark && w.remark.trim() !== "") {
        taskList.push(
          `<div style="white-space: nowrap;"><span class="badge bg-light text-dark border me-1">Week ${idx + 1}</span> : ${escapeHTML(w.remark)}</div>`,
        );
      }
    });

    let safeName = escapeHTML(c.name);
    let displayTask = taskList.length > 0 ? taskList.join("") : "-";
    let safeRemark = escapeHTML(c.remarkEwo || "-");

    // ดึงรูปภาพอะไหล่มาแสดงผล (สามารถคลิกเพื่อดูรูปเต็มได้)
    let imgHtml =
      c.imgComp && c.imgComp.indexOf("NO+IMAGE") === -1
        ? `<img src="${c.imgComp}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; cursor: zoom-in;" onclick="window.open('${c.imgComp}')">`
        : `<span class="material-symbols-rounded text-muted" style="font-size:28px;">image_not_supported</span>`;

    tbody.innerHTML += `
      <tr>
        <td class="text-center align-middle">${imgHtml}</td>
        <td class="fw-bold text-primary align-middle">${safeName}</td>
        <td style="font-size: 11px;" class="align-middle">${displayTask}</td>
        <td class="text-center align-middle">${c.class || "-"}</td>
        <td class="text-center align-middle">${c.std || "-"}</td>
        <td class="text-center align-middle"><span class="badge bg-success">${c.stat || "Run"}</span></td>
        <td class="text-center fw-bold text-danger align-middle">${c.time || "-"}</td>
        <td class="text-center align-middle" style="font-size:10px;">${c.ppe || "-"}</td>
        ${weeksHtml}
        <td class="text-muted fw-bold align-middle" style="font-size:11px; color:#E53E3E !important;">${safeRemark}</td>
      </tr>`;
  });
}

// ================= 3. ระบบอัจฉริยะ (FAB / Copy / Drag & Drop / Import) =================

function toggleFabMode(isFormMode) {
  let fabBtn = document.querySelector(".fab-main");
  if (!fabBtn) return;
  if (isFormMode) {
    fabBtn.style.display = "none"; // 🔴 ซ่อนปุ่มเมื่ออยู่ในหน้าฟอร์ม กันกดพลาด
  } else {
    fabBtn.style.display = "flex"; // แสดงปุ่มเมื่ออยู่ในหน้า Dashboard ปกติ
    fabBtn.onclick = openAddFormContext;
  }
}

// 🔴 ฟังก์ชันกดยกเลิกการกรอก (เรียก Bootstrap Modal)
function cancelFormContext() {
  const cancelModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("confirmCancelModal"),
  );
  cancelModal.show();
}

// 🔴 ฟังก์ชันทำงานจริงเมื่อกด "ใช่, ย้อนกลับ" บน Modal
function executeCancelForm() {
  // ปิด Modal
  const cancelModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("confirmCancelModal"),
  );
  cancelModal.hide();

  // ซ่อนฟอร์มและกลับไปหน้าเดิม
  document.getElementById("view-form").classList.remove("active");
  handleRouting();
  window.scrollTo(0, 0);
}

function populateImportDropdown() {
  let select = document.getElementById("importDbSelect");
  if (!select) return;

  select.innerHTML =
    '<option value="">-- เลือกเครื่องจักรจากระบบเพื่อคัดลอก (Template) --</option>';
  for (let deptName in dbData) {
    for (let lineName in dbData[deptName]) {
      for (let machName in dbData[deptName][lineName].machines) {
        select.innerHTML += `<option value="${deptName}|${lineName}|${machName}">[${deptName}] ${lineName} - ${machName}</option>`;
      }
    }
  }
}

function executeImportData() {
  let val = document.getElementById("importDbSelect").value;
  if (!val) {
    showModalAlert(
      "แจ้งเตือน",
      "กรุณาเลือกเครื่องจักรที่ต้องการคัดลอกครับ",
      true,
    );
    return;
  }

  let [deptName, lineName, machName] = val.split("|");
  let machData =
    dbData[deptName] &&
    dbData[deptName][lineName] &&
    dbData[deptName][lineName].machines[machName];
  if (!machData) return;

  document.getElementById("f_department").value = deptName;

  let lineSelect = document.getElementById("f_lineSelect");
  let lineCustom = document.getElementById("f_lineCustom");

  let optionExists = Array.from(lineSelect.options).some(
    (opt) => opt.value === lineName,
  );

  if (optionExists) {
    lineSelect.value = lineName;
    toggleCustomLineInput();
  } else if (lineName.toUpperCase().includes("MIX")) {
    lineSelect.value = "MIXING_CUSTOM";
    toggleCustomLineInput();
    if (lineCustom) lineCustom.value = lineName;
  } else {
    lineSelect.value = "OTHER_CUSTOM";
    toggleCustomLineInput();
    if (lineCustom) lineCustom.value = lineName;
  }

  document.getElementById("f_machineName").value = machName + " (Copy)";
  document.getElementById("subSystemsContainer").innerHTML = "";

  for (let subName in machData.subassemblies) {
    let subInfo = machData.subassemblies[subName];
    addSubsystemCard();
    let subCard = document.getElementById(
      "subSystemsContainer",
    ).lastElementChild;
    subCard.querySelector(".input-subname").value = subName;
    subCard.querySelector(".parts-container").innerHTML = "";

    let importedRisks = subInfo.risks || "";
    subCard.querySelectorAll(".risk-grid .icon-checkbox").forEach((chk) => {
      let v = chk.getAttribute("data-val");
      if (importedRisks.includes(v)) chk.classList.remove("not-used");
      else chk.classList.add("not-used");
    });

    subInfo.components.forEach((comp) => {
      addComponentCard(subCard.querySelector(".parts-container"));
      let compCard = subCard.querySelector(".parts-container").lastElementChild;

      compCard.querySelector(".input-compname").value = comp.name || "";
      compCard.querySelector(".input-task").value = comp.task || "";
      compCard.querySelector(".input-class").value = comp.class || "A";
      compCard.querySelector(".input-pmstd").value = comp.std || "CBM";
      compCard.querySelector(".input-status").value = comp.stat || "Run";
      compCard.querySelector(".input-time").value = comp.time || "";
      compCard.querySelector(".input-risk").checked = comp.risk;
      compCard.querySelector(".input-remark").value = comp.remarkEwo || "";
      if (compCard.querySelector(".input-frequency")) {
        compCard.querySelector(".input-frequency").value =
          comp.frequency || "1W";
      }

      let importedPPE = comp.ppe || "";
      compCard.querySelectorAll(".ppe-grid .icon-checkbox").forEach((chk) => {
        let v = chk.getAttribute("data-val");
        if (importedPPE.includes(v)) chk.classList.remove("not-used");
        else chk.classList.add("not-used");
      });

      compCard.querySelector(".week-data-input").value = JSON.stringify(
        comp.weeks,
      );
      renderCompactGrid(
        compCard.querySelector(".week-compact-grid"),
        comp.weeks,
      );
    });
  }
  showModalAlert("สำเร็จ!", `ดึงข้อมูลโครงสร้างของเครื่อง ${machName} สำเร็จ!`);
}

function duplicateItem(btn) {
  let original = btn.closest(".drag-item");
  let clone = original.cloneNode(true);

  let originalInputs = original.querySelectorAll("input, select, textarea");
  let cloneInputs = clone.querySelectorAll("input, select, textarea");
  originalInputs.forEach((input, index) => {
    if (input.type === "checkbox" || input.type === "radio") {
      cloneInputs[index].checked = input.checked;
    } else {
      cloneInputs[index].value = input.value;
    }
  });

  let originalIcons = original.querySelectorAll(".icon-checkbox");
  let cloneIcons = clone.querySelectorAll(".icon-checkbox");
  originalIcons.forEach((icon, idx) => {
    cloneIcons[idx].className = icon.className;
  });

  clone
    .querySelectorAll(".preview-img")
    .forEach((img) => (img.style.display = "none"));
  clone
    .querySelectorAll(".bi-camera, .bi-image, .bi-images")
    .forEach((i) => (i.style.display = "block"));

  original.parentNode.insertBefore(clone, original.nextSibling);
}

let draggedElement = null;
function makeDraggable(el) {
  el.closest(".drag-item").setAttribute("draggable", "true");
}
function makeUndraggable(el) {
  el.closest(".drag-item").setAttribute("draggable", "false");
}

function handleDragStart(e) {
  draggedElement = e.target.closest(".drag-item");
  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    draggedElement.classList.add("opacity-50");
  }, 0);
}
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const target = e.target.closest(".drag-item");
  if (
    target &&
    target !== draggedElement &&
    target.parentNode === draggedElement.parentNode
  ) {
    const rect = target.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
    target.parentNode.insertBefore(
      draggedElement,
      next ? target.nextSibling : target,
    );
  }
}
function handleDragEnd(e) {
  if (draggedElement) draggedElement.classList.remove("opacity-50");
  draggedElement = null;
  document
    .querySelectorAll(".drag-item")
    .forEach((el) => el.setAttribute("draggable", "false"));
}

// ================= 4. Context Aware Form (ระบบจัดการฟอร์ม) =================
// 🟢 อัปเดตฟังก์ชันพรีวิวและบีบอัดภาพ
async function previewDynamicFile(input) {
  if (input.files && input.files[0]) {
    let file = input.files[0];

    // เช็คขนาดไฟล์เริ่มต้น (เช่น หากใหญ่เกิน 15MB เตือนก่อน)
    if (file.size > 15 * 1024 * 1024) {
      showModalAlert("แจ้งเตือน", "ไฟล์มีขนาดใหญ่เกินไป (จำกัด 15MB)", true);
      input.value = "";
      return;
    }

    try {
      // เรียกใช้ฟังก์ชันย่อขนาดภาพ (บีบให้เหลือความกว้าง/สูงไม่เกิน 1000px และคุณภาพ 70%)
      let compressedBase64 = await compressImage(file, 1000, 1000, 0.7);

      let preview = input.nextElementSibling;
      preview.src = compressedBase64;
      preview.style.display = "block";
      input.previousElementSibling.style.display = "none";
    } catch (e) {
      console.error("Compression error:", e);
      showModalAlert("แจ้งเตือน", "ไม่สามารถประมวลผลรูปภาพนี้ได้", true);
    }
  }
}

function addSubsystemCard() {
  const container = document.getElementById("subSystemsContainer");
  const clone = document
    .getElementById("subSystemTemplate")
    .content.cloneNode(true);
  container.appendChild(clone);
  addComponentCard(
    container.lastElementChild.querySelector(".parts-container"),
  );
  window.changeLanguage(localStorage.getItem("app_lang") || "th");
}

function addComponentCard(elementInsideCard) {
  const container = elementInsideCard
    .closest(".sub-system-card")
    .querySelector(".parts-container");
  const clone = document
    .getElementById("componentTemplate")
    .content.cloneNode(true);
  let defaultData = [];
  for (let i = 0; i < 52; i++) defaultData.push({ t: 0, r: 0, b: 0, l: 0 });
  clone.querySelector(".week-data-input").value = JSON.stringify(defaultData);
  renderCompactGrid(clone.querySelector(".week-compact-grid"), defaultData);
  container.appendChild(clone);
  window.changeLanguage(localStorage.getItem("app_lang") || "th");
}

function openAddFormContext() {
  // 🔴 กรณีที่ 2: กดปุ่ม [+] ตอนที่อยู่หน้าระบบย่อย (Subassembly) หรือลึกกว่านั้น
  // สลับไปโหมด Edit ดึงข้อมูลเดิม และเพิ่มการ์ดใหม่ให้ 1 ใบต่อท้ายอัตโนมัติ
  if (currentDept && currentLine && currentMach) {
    editSubassembly(true); // ส่งสถานะ true เพื่อบอกว่าเป็นการ "เพิ่มย่อยใหม่"
    return;
  }

  document.getElementById("ledgerForm").reset();
  document.getElementById("subSystemsContainer").innerHTML = "";
  populateImportDropdown();
  toggleFabMode(true);

  let deptSelect = document.getElementById("f_department");
  let lineSelect = document.getElementById("f_lineSelect");
  let lineCustom = document.getElementById("f_lineCustom");
  let mInput = document.getElementById("f_machineName");

  let boxDept = document.getElementById("box_f_dept");
  let boxLine = document.getElementById("box_f_lineName");
  let boxMach = document.getElementById("box_f_machineName");
  let boxImgMach = document.getElementById("box_imgMach");
  let cardStructure = document.getElementById("cardStructure");
  let btnAddSub = document.getElementById("btnAddSub");

  // เปิดช่องกลับมาเป็นปกติก่อน
  if (cardStructure) cardStructure.style.display = "block";
  if (boxDept) boxDept.style.display = "block";
  if (boxLine) boxLine.style.display = "block";
  if (boxMach) boxMach.style.display = "block";
  if (boxImgMach) boxImgMach.style.display = "block";
  if (btnAddSub) btnAddSub.style.display = "block";

  // ปลดล็อกฟอร์ม
  if (deptSelect) deptSelect.disabled = false;
  if (lineSelect) lineSelect.disabled = false;
  if (lineCustom) lineCustom.readOnly = false;
  if (mInput) mInput.readOnly = false;
  if (lineCustom) lineCustom.classList.add("d-none");

  // เคลียร์รูปภาพพรีวิวเครื่องจักรที่ค้างไว้
  let machImgPreview = document.querySelector("#cardStructure .preview-img");
  if (machImgPreview) {
    machImgPreview.src = "";
    machImgPreview.style.display = "none";
  }

  // 🔴 กรณีที่ 1: กดปุ่ม [+] จากหน้า "ไลน์ผลิต" (หน้ารายการเครื่องจักร)
  if (currentDept && currentLine && !currentMach) {
    // ซ่อน Dropdown แผนกและไลน์
    if (boxDept) boxDept.style.display = "none";
    if (boxLine) boxLine.style.display = "none";

    // ล็อกค่าหลังบ้านไว้ แต่อย่า disable เพื่อให้ค่าถูกส่งตอนเซฟ
    if (deptSelect) deptSelect.value = currentDept;
    autoSetLineDropdown(currentLine);

    // ใส่การ์ดระบบย่อย 1 ใบ
    addSubsystemCard();

    // เปลี่ยนแบนเนอร์ด้านบน
    let banner = document.getElementById("formContextBanner");
    let bannerText = document.getElementById("formContextText");
    if (banner && bannerText) {
      banner.classList.remove("d-none");
      bannerText.innerText = `สร้างเครื่องจักรใหม่ในไลน์ ${currentLine}`;
    }
  }
  // 🔴 กรณีกดจากหน้าแรก Dashboard (ให้โชว์กรอกใหม่หมด)
  else {
    addSubsystemCard();
    let banner = document.getElementById("formContextBanner");
    if (banner) banner.classList.add("d-none");
  }

  // ปิดหน้าเก่า เปิดหน้าฟอร์ม
  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-form").classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 🔴 ฟังก์ชันช่วยเลือก Dropdown ไลน์ผลิตให้อัตโนมัติ (ใช้คู่กับ openAddFormContext)
function autoSetLineDropdown(lineName) {
  let lineSelect = document.getElementById("f_lineSelect");
  let lineCustom = document.getElementById("f_lineCustom");
  if (!lineSelect) return;

  let optionExists = Array.from(lineSelect.options).some(
    (opt) => opt.value === lineName,
  );
  if (optionExists) {
    lineSelect.value = lineName;
    toggleCustomLineInput(); // ฟังก์ชันนี้เราเขียนไว้แล้วด้านล่าง
  } else if (lineName.toUpperCase().includes("MIX")) {
    lineSelect.value = "MIXING_CUSTOM";
    toggleCustomLineInput();
    if (lineCustom) lineCustom.value = lineName;
  } else {
    lineSelect.value = "OTHER_CUSTOM";
    toggleCustomLineInput();
    if (lineCustom) lineCustom.value = lineName;
  }
}

// ================= 5. 4-Triangle Calendar (Smart UI 52 Weeks) =================
let currentCompactGrid = null;
let currentWeekInput = null;
let tempWeekData = [];
let smartColorState = { t: false, r: false, b: false, l: false };

function getTriangleSVGOnly(d) {
  return `<svg viewBox="0 0 20 20" width="100%" height="100%">
    <polygon class="tri-part tri-top ${d.t ? "active" : "inactive"}" points="0,0 20,0 10,10"/>
    <polygon class="tri-part tri-right ${d.r ? "active" : "inactive"}" points="20,0 20,20 10,10"/>
    <polygon class="tri-part tri-bottom ${d.b ? "active" : "inactive"}" points="20,20 0,20 10,10"/>
    <polygon class="tri-part tri-left ${d.l ? "active" : "inactive"}" points="0,20 0,0 10,10"/>
  </svg>`;
}

function renderCompactGrid(container, dataArray) {
  container.innerHTML = "";
  dataArray.forEach((d) => {
    container.innerHTML += getTriangleSVGOnly(d);
  });
}

function resetSmartColorSelector() {
  smartColorState = { t: false, r: false, b: false, l: false };
  ["t", "r", "b", "l"].forEach((side) => {
    let tri = document.getElementById("tri-" + side);
    let lbl = document.getElementById("lbl-" + side);
    if (tri && lbl) {
      tri.classList.remove("active");
      tri.classList.add("inactive");
      lbl.classList.remove("active");
    }
  });
  document.getElementById("boxTaskDetail").classList.add("d-none");
  document.getElementById("boxEwoDetail").classList.add("d-none");
}

function toggleSmartColor(side) {
  smartColorState[side] = !smartColorState[side];
  let tri = document.getElementById("tri-" + side);
  let lbl = document.getElementById("lbl-" + side);

  if (smartColorState[side]) {
    tri.classList.remove("inactive");
    tri.classList.add("active");
    lbl.classList.add("active");
  } else {
    tri.classList.remove("active");
    tri.classList.add("inactive");
    lbl.classList.remove("active");
  }

  // 🔴 เงื่อนไขโชว์ช่องกรอกข้อมูล: เหลือง(b)=Task , แดง(r)=EWO
  document
    .getElementById("boxTaskDetail")
    .classList.toggle("d-none", !smartColorState.b);
  document
    .getElementById("boxEwoDetail")
    .classList.toggle("d-none", !smartColorState.r);

  document.getElementById("inputWeeks").focus();
}

function openWeekModal(compactGridElement) {
  currentCompactGrid = compactGridElement;
  currentWeekInput = compactGridElement.nextElementSibling;
  try {
    let loadedData = safeJSONParse(currentWeekInput.value);
    tempWeekData = loadedData.map((w) => ({
      t: w.t || 0,
      r: w.r || 0,
      b: w.b || 0,
      l: w.l || 0,
      remark: w.remark || "",
    }));
  } catch (e) {
    tempWeekData = Array(52)
      .fill()
      .map(() => ({ t: 0, r: 0, b: 0, l: 0, remark: "" }));
  }
  resetSmartColorSelector();
  document.getElementById("inputWeeks").value = "";
  document.getElementById("inputTaskText").value = "";
  document.getElementById("inputEwoText").value = "";
  updatePreviewAndList();
  new bootstrap.Modal(document.getElementById("weekModal")).show();
}

// 🔴 ฟังก์ชันเรียก Modal Confirm แบบสากล (แทน confirm สีดำ)
function showModalConfirm(title, message, onConfirm) {
  const lang = localStorage.getItem("app_lang") || "th";
  const t = translations[lang];

  document.getElementById("genericConfirmTitle").innerHTML = title;
  document.getElementById("genericConfirmMsg").innerHTML = message;
  document.getElementById("genericConfirmCancelBtn").innerText =
    t.btn_cancel || "Cancel";
  document.getElementById("genericConfirmOkBtn").innerText =
    t.btn_confirm || "Confirm";

  const modal = new bootstrap.Modal(
    document.getElementById("genericConfirmModal"),
  );
  const okBtn = document.getElementById("genericConfirmOkBtn");

  // ป้องกันการทำงานซ้ำซ้อนของปุ่ม OK
  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);

  newOkBtn.addEventListener("click", () => {
    modal.hide();
    if (onConfirm) onConfirm();
  });
  modal.show();
}

// =========================================================
// 🔴 ฟังก์ชันเพิ่มงานลง 52 สัปดาห์ (addPlanEntry)
// =========================================================
function parseWeeks(str) {
  let weeks = [];
  let parts = str.split(",");
  for (let part of parts) {
    part = part.trim();
    if (part.includes("-")) {
      let [start, end] = part.split("-");
      start = parseInt(start);
      end = parseInt(end);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) weeks.push(i);
      }
    } else {
      let w = parseInt(part);
      if (!isNaN(w)) weeks.push(w);
    }
  }
  return weeks;
}

function addPlanEntry() {
  let weekStr = document.getElementById("inputWeeks").value;
  if (!weekStr) {
    showModalAlert(
      "แจ้งเตือน",
      "กรุณาระบุสัปดาห์ที่ต้องการเพิ่มงาน (เช่น 1, 5, 10-15)",
      true,
    );
    return;
  }

  let weeks = parseWeeks(weekStr);
  let taskText = document.getElementById("inputTaskText").value.trim();
  let ewoText = document.getElementById("inputEwoText").value.trim();

  let remarkArr = [];
  if (taskText) remarkArr.push(`Task: ${taskText}`);
  if (ewoText) remarkArr.push(`EWO: ${ewoText}`);
  let finalRemark = remarkArr.join(" | ");

  let added = false;
  weeks.forEach((w) => {
    let idx = w - 1; // สัปดาห์ที่ 1 คือ index 0
    if (idx >= 0 && idx < 52) {
      tempWeekData[idx].t = smartColorState.t ? 1 : tempWeekData[idx].t;
      tempWeekData[idx].r = smartColorState.r ? 1 : tempWeekData[idx].r;
      tempWeekData[idx].b = smartColorState.b ? 1 : tempWeekData[idx].b;
      tempWeekData[idx].l = smartColorState.l ? 1 : tempWeekData[idx].l;

      if (finalRemark) {
        tempWeekData[idx].remark = tempWeekData[idx].remark
          ? tempWeekData[idx].remark + " \n " + finalRemark
          : finalRemark;
      }
      added = true;
    }
  });

  if (added) {
    updatePreviewAndList();
    document.getElementById("inputWeeks").value = "";
    document.getElementById("inputTaskText").value = "";
    document.getElementById("inputEwoText").value = "";
    resetSmartColorSelector();
  } else {
    showModalAlert(
      "แจ้งเตือน",
      "รูปแบบสัปดาห์ไม่ถูกต้อง (ต้องเป็นเลข 1-52)",
      true,
    );
  }
}

// 🔴 อัปเดต Preview & Summary เป็น 2 ภาษา
function updatePreviewAndList() {
  const lang = localStorage.getItem("app_lang") || "th";
  const t = translations[lang];

  let grid = document.getElementById("weekPreviewGrid");
  let summary = document.getElementById("weekRemarksSummary");
  grid.innerHTML = "";
  summary.innerHTML = "";
  let hasRemarks = false;

  for (let i = 0; i < 52; i++) {
    let d = tempWeekData[i];
    grid.innerHTML += `<div class="preview-box" onclick="removePlanWeek(${i})" style="cursor:pointer;" title="ลบข้อมูล">W${i + 1}${getTriangleSVGOnly(d)}</div>`;

    if (d.remark && d.remark.trim() !== "") {
      hasRemarks = true;
      summary.innerHTML += `<div class="mb-2 border-bottom pb-1"><span class="fw-bold text-primary">${t.week_prefix || "Week"} ${i + 1}</span> : ${escapeHTML(d.remark)}</div>`;
    }
  }
  // ถ้าไม่มีงาน ให้ดึงคำแปลมาโชว์
  if (!hasRemarks)
    summary.innerHTML = `<span class="text-muted fst-italic">${t.no_task_week || "ไม่มีงานระบุในสัปดาห์ใดๆ"}</span>`;
}

// 🔴 อัปเดตตอนกดลบรายสัปดาห์ (เรียก Modal แทน Confirm ดำ)
function removePlanWeek(idx) {
  const lang = localStorage.getItem("app_lang") || "th";
  const t = translations[lang];
  const msg = (t.confirm_delete_week || "").replace("{week}", idx + 1);

  showModalConfirm(t.alert_title_confirm || "Confirm", msg, () => {
    tempWeekData[idx] = { t: 0, r: 0, b: 0, l: 0, remark: "" };
    updatePreviewAndList();
  });
}

// 🔴 อัปเดตตอนกดล้างข้อมูลทั้งหมด (เรียก Modal แทน Confirm ดำ)
function clearAllPlans() {
  const lang = localStorage.getItem("app_lang") || "th";
  const t = translations[lang];

  showModalConfirm(
    t.alert_title_confirm || "Confirm",
    t.confirm_clear_all,
    () => {
      tempWeekData = Array(52)
        .fill()
        .map(() => ({ t: 0, r: 0, b: 0, l: 0, remark: "" }));
      updatePreviewAndList();
    },
  );
}

function syncModalToCompact() {
  if (currentCompactGrid && currentWeekInput) {
    currentWeekInput.value = JSON.stringify(tempWeekData);
    renderCompactGrid(currentCompactGrid, tempWeekData);
  }
  bootstrap.Modal.getInstance(document.getElementById("weekModal")).hide();
}

// 🔴 อัปเดตให้รองรับทั้งรูปใหม่ (Base64) และรูปเก่าจากฐานข้อมูล (http)
function getBase64(imgElement) {
  if (imgElement && imgElement.src) {
    if (
      imgElement.src.startsWith("data:image") ||
      imgElement.src.startsWith("http")
    ) {
      return imgElement.src;
    }
  }
  return "";
}

// ================= 7. ระบบแบบร่าง (Draft Auto-Save) =================
// ทำงานทุกครั้งที่พิมพ์ข้อมูลในหน้าฟอร์ม
document.addEventListener("input", () => {
  let formView = document.getElementById("view-form");
  if (formView && formView.classList.contains("active")) {
    let draftData = {
      department: document.getElementById("f_department")?.value || "",
      lineSelect: document.getElementById("f_lineSelect")?.value || "", // เก็บค่า Dropdown
      lineCustom: document.getElementById("f_lineCustom")?.value || "", // เก็บค่าที่พิมพ์เอง
      machineName: document.getElementById("f_machineName")?.value || "",
      updatedBy: document.getElementById("f_updatedBy")?.value || "",
      time: new Date().toLocaleString("th-TH"),
    };
    localStorage.setItem("bpc_draft", JSON.stringify(draftData));
    document.getElementById("fabDraftBtn").style.display = "flex";
  }
});

function checkDraftStatus() {
  if (localStorage.getItem("bpc_draft")) {
    document.getElementById("fabDraftBtn").style.display = "flex";
  }
}

function restoreDraftData() {
  let draft = safeJSONParse(localStorage.getItem("bpc_draft"));
  if (draft.time) {
    showModalConfirm(
      "กู้คืนแบบร่าง",
      `พบข้อมูลที่เคยพิมพ์ค้างไว้เมื่อ: ${draft.time}<br/>คุณต้องการกู้คืนมาแก้ไขต่อหรือไม่?`,
      () => {
        openAddFormContext();

        // 🔴 โหลดข้อมูลกลับเข้าฟอร์ม
        document.getElementById("f_department").value = draft.department || "";

        // 🔴 จัดการระบบ Line Dropdown รูปแบบใหม่
        let lineSelect = document.getElementById("f_lineSelect");
        if (lineSelect) {
          lineSelect.value = draft.lineSelect || "";
          toggleCustomLineInput(); // สั่งให้โชว์/ซ่อน กล่องพิมพ์เอง
        }

        let lineCustom = document.getElementById("f_lineCustom");
        if (lineCustom && draft.lineCustom) {
          lineCustom.value = draft.lineCustom;
        }

        document.getElementById("f_machineName").value =
          draft.machineName || "";
        document.getElementById("f_updatedBy").value = draft.updatedBy || "";
      },
    );
  }
}

// =========================================================
// 🔴 ฟังก์ชันบันทึกข้อมูล (อัปเดตเป็น UI แจ้งเตือนใหม่)
// =========================================================
async function submitFormViaAPI() {
  if (!document.getElementById("ledgerForm").checkValidity()) {
    document.getElementById("ledgerForm").reportValidity();
    return;
  }

  let f_line_select = document.getElementById("f_lineSelect").value;
  let f_line = f_line_select;
  if (f_line_select === "MIXING_CUSTOM" || f_line_select === "OTHER_CUSTOM") {
    f_line = document.getElementById("f_lineCustom").value.trim();
  }
  let f_mach = document.getElementById("f_machineName").value.trim();

  if (f_line.length < 2 || f_mach.length < 2) {
    showModalAlert(
      "ข้อมูลไม่สมบูรณ์",
      "กรุณากรอกชื่อไลน์และชื่อเครื่องจักรให้ชัดเจน",
      true,
    );
    return;
  }
  if (!/^[a-zA-Z0-9ก-๙\s\-_()\[\]]+$/.test(f_mach)) {
    showModalAlert(
      "ข้อมูลไม่ถูกต้อง",
      "ชื่อเครื่องจักรมีอักขระพิเศษที่ไม่ได้รับอนุญาต",
      true,
    );
    return;
  }

  let subCards = document.querySelectorAll(".sub-system-card");
  if (subCards.length === 0) {
    showModalAlert(
      "ข้อมูลไม่ครบ",
      "ต้องมี 'ระบบย่อย (Sub-system)' อย่างน้อย 1 ระบบ",
      true,
    );
    return;
  }

  // 🔴 แจ้งยืนยันด้วย UI Modal สวยงามแทน alert
  showModalConfirm(
    "ยืนยันการบันทึกข้อมูล",
    `ระบบกำลังจะบันทึกข้อมูลเครื่องจักร: <b>${f_mach}</b><br/>คุณตรวจสอบข้อมูลครบถ้วนและต้องการบันทึกเลยหรือไม่?`,
    async () => {
      document.getElementById("loadingOverlay").style.display = "flex";

      let payload = {
        data: {
          department: document.getElementById("f_department").value,
          lineName: f_line,
          machineName: f_mach,
          updatedBy: document.getElementById("f_updatedBy").value.trim(),
          // 🔴 อัปเดตการดึงรูปภาพเครื่องจักรให้แม่นยำขึ้น
          imgMachine: getBase64(
            document.querySelector("#cardStructure .file-img")
              .nextElementSibling,
          ),
          subSystems: [],
        },
      };

      subCards.forEach((subCard) => {
        let riskActive = [];
        subCard
          .querySelectorAll(".risk-grid .icon-checkbox:not(.not-used)")
          .forEach((chk) => riskActive.push(chk.getAttribute("data-val")));

        let subData = {
          subName: subCard.querySelector(".input-subname").value,
          // 🔴 อัปเดตการดึงรูประบบย่อย (Subassembly) ให้แม่นยำขึ้น
          imgSub: getBase64(
            subCard.querySelector(".file-sub-img").nextElementSibling,
          ),
          risks: riskActive.join(", "),
          components: [],
        };

        subCard.querySelectorAll(".part-item").forEach((pCard) => {
          let ppeActive = [];
          pCard
            .querySelectorAll(".ppe-grid .icon-checkbox:not(.not-used)")
            .forEach((chk) => ppeActive.push(chk.getAttribute("data-val")));
          subData.components.push({
            compName: pCard.querySelector(".input-compname").value,
            task: pCard.querySelector(".input-task").value,
            spareClass: pCard.querySelector(".input-class").value,
            pmStd: pCard.querySelector(".input-pmstd").value,
            frequency: pCard.querySelector(".input-frequency")
              ? pCard.querySelector(".input-frequency").value
              : "1M",
            status: pCard.querySelector(".input-status").value,
            stdTime: pCard.querySelector(".input-time").value,
            remarkEwo: pCard.querySelector(".input-remark").value,
            risk: pCard.querySelector(".input-risk").checked,
            ppe: ppeActive.join(", "),
            // 🔴 การดึงรูปอะไหล่
            imgComp: getBase64(
              pCard.querySelector(".file-comp-img").nextElementSibling,
            ),
            weeks: safeJSONParse(
              pCard.querySelector(".week-data-input").value,
              Array(52).fill({ t: 0, r: 0, b: 0, l: 0 }),
            ),
          });
        });
        payload.data.subSystems.push(subData);
      });

      try {
        const result = await ApiService.saveLedger(payload.data);
        if (result.success) {
          localStorage.removeItem("bpc_draft");
          document.getElementById("fabDraftBtn").style.display = "none";
          showModalAlert("สำเร็จ!", "บันทึกข้อมูลเข้าสู่ระบบเรียบร้อยแล้ว");
          await loadDataFromDatabase();
          handleRouting();
        } else {
          showModalAlert("เกิดข้อผิดพลาด", result.message, true);
        }
      } catch (error) {
        showModalAlert("เชื่อมต่อล้มเหลว", error.message, true);
      } finally {
        document.getElementById("loadingOverlay").style.display = "none";
      }
    },
  );
}

// ==========================================
// ระบบแปลภาษา (i18n: Internationalization)
// ==========================================
const translations = {
  th: {
    // --- ส่วนที่เพิ่มใหม่สำหรับ Dashboard & Filter ---
    dashboard_title: "ภาพรวมสัปดาห์ปัจจุบัน",
    dash_plan_title: "แผน PM สัปดาห์นี้",
    dash_done_title: "ดำเนินการแล้ว",
    dash_ewo_title: "เครื่องเสีย / รอซ่อม (EWO)",
    dash_plan_cta: "คลิกเพื่อดูคิวงาน",
    dash_done_cta: "คลิกดูงานสำเร็จ",
    dash_ewo_cta: "คลิกดูเครื่องเสีย",
    search_placeholder:
      "ค้นหาชื่อเครื่องจักร, ไลน์ผลิต หรือ รหัสชิ้นส่วนที่นี่...",
    filter_dept_label: "แผนก (Department)",
    filter_line_label: "ไลน์ผลิต (Line)",
    filter_class_label: "ระดับความสำคัญ (Class)",
    filter_dept_all: "รวมทุกแผนก",
    filter_line_all: "รวมทุกไลน์",
    filter_class_all: "ทุกระดับ Class",
    filter_other: "อื่นๆ (Others)",
    btn_clear_filter: "ล้างตัวกรอง",

    // --- คำศัพท์เดิม ---
    select_line: "เลือกไลน์ผลิต (Lines)",
    back_to_line: "กลับหน้าไลน์ผลิต",
    form_title: "ฟอร์มบันทึกข้อมูล",
    cancel: "ยกเลิก",
    working_in: "กำลังปฏิบัติงานใน",
    general_info: "ส่วนที่ 1: ข้อมูลเครื่องจักรหลัก (General Info)",
    label_line_name: "ไลน์ผลิต (Line Name)",
    label_machine_name: "ชื่อเครื่องจักร (Machine Name)",
    label_updated_by: "ชื่อผู้บันทึกข้อมูล / ผู้แก้ไข",
    placeholder_updated_by: "เช่น นายสมชาย",
    main_image: "ภาพถ่ายเครื่องจักร (Main Image)",
    tap_to_upload: "แตะเพื่อถ่ายรูป หรือ เลือกจากอัลบั้ม",
    add_subsystem: "เพิ่มระบบย่อยใหม่ (Add Sub-system)",
    btn_save: "ยืนยันและบันทึกข้อมูลทั้งหมด",
    back_bpc: "กลับ BPC Hub",
    dash_plan_unit: "งาน",
    dash_ewo_unit: "รายการ",
    trend_no_data: "ไม่มีข้อมูลก่อนหน้า",
    trend_increase: "เพิ่มขึ้น",
    trend_decrease: "ลดลง",
    trend_equal: "เท่ากับสัปดาห์ที่แล้ว",
    no_match_filter: "ไม่มีเครื่องจักรที่ตรงกับสถานะนี้ในสัปดาห์นี้ครับ",
    has_sub_text: "มีระบบย่อย",
    unit_sub_text: "ระบบ",
    has_mach_text: "มีเครื่องจักรทั้งหมด",
    unit_mach_text: "เครื่อง",
    label_updated: "อัปเดต:",
    label_editor: "ผู้แก้ไข:",
    mach_list_label: "รายชื่อเครื่องจักร:",
    no_mach_in_line_small: "ยังไม่มีเครื่องจักรในไลน์นี้",
    view_machine: "ดูเครื่องจักร",
    no_data_condition:
      "ไม่พบข้อมูลที่ตรงกับเงื่อนไข หรือยังไม่มีข้อมูลในระบบครับ",
    page_mach_empty_1: "หน้าเครื่องจักรนี้ แผนก",
    page_mach_empty_2: "ไลน์",
    page_mach_empty_3:
      "ยังไม่มีข้อมูลเครื่องจักรในระบบ กดปุ่ม + มุมขวาล่างเพื่อสร้างใหม่ได้เลยครับ",
    view_sub: "ดูระบบย่อย",
    page_sub_empty_1: "เครื่องจักร",
    page_sub_empty_2: "ยังไม่มีข้อมูลระบบย่อย (Subassembly) ครับ",
    has_comp_text: "มี",
    unit_comp_text: "ชิ้นส่วน (Components)",
    view_comp: "ดูอะไหล่",
    sub_list_label: "รายชื่อระบบย่อย:",
    no_sub_in_mach_small: "ยังไม่มีระบบย่อย",
    unit_pieces: "ชิ้น",
    subassembly: "ระบบย่อย (Subassembly)",
    delete_subassembly: "ลบระบบย่อย",
    label_sub_name: "ชื่อระบบย่อย",
    placeholder_sub_name: "ระบุชื่อระบบย่อย",
    sub_image: "ภาพระบบย่อย",
    risk_assessment: "ประเมินความเสี่ยง",
    risk_desc: "ค่าเริ่มต้นคือมีความเสี่ยงทั้งหมด แตะ ❌ หากไม่มี",
    components_title: "ชิ้นส่วนอะไหล่ (Components)",
    add_component: "เพิ่ม Component",
    risk_1: "จุดหนีบ",
    risk_2: "อุปกรณ์",
    risk_3: "ยกด้วยมือ",
    risk_4: "ที่สูง",
    risk_5: "สารเคมี",
    risk_6: "เสียงดัง",
    risk_7: "โฟล์คลิฟต์",
    comp_image: "ภาพอะไหล่",
    label_comp_name: "ชื่อ Component",
    label_time_min: "เวลา(นาที)",
    label_remark: "หมายเหตุ (ถ้ามี)",
    placeholder_remark: "ระบุหมายเหตุเพิ่มเติม",
    high_risk: "เสี่ยงสูง (Work Permit)",
    ppe_desc: "อุปกรณ์ PPE ที่จำเป็น (แตะ ❌ หากไม่ใช้)",
    ppe_1: "ถุงมือ",
    ppe_2: "หมวกนิรภัย",
    ppe_3: "แว่นตา",
    ppe_4: "หน้ากาก",
    ppe_5: "ที่อุดหู",
    ppe_6: "รองเท้า",
    ppe_7: "กันตกที่สูง",
    ppe_8: "สะท้อนแสง",
    ppe_9: "LOTO",
    plan_52_weeks: "แผน 52 สัปดาห์",
    manage: "จัดการ",
    modal_52_title: "กำหนดแผนงาน 52 สัปดาห์",
    modal_52_subtitle1: "กำหนดค่างานรายสัปดาห์",
    modal_52_step1: "1. แตะเลือกประเภทงาน (เลือกได้หลายข้อ)",
    modal_52_step2: "2. ระบุสัปดาห์ (1-52)",
    placeholder_weeks: "เช่น 25, 30, 35 หรือ 10-15",
    modal_52_task: "ระบุ Task (งานที่ต้องทำ):",
    placeholder_task: "เช่น Lube, Inspect",
    modal_52_ewo: "รหัส EWO (กรณี Breakdown):",
    placeholder_ewo: "เช่น EWO-12345",
    add_task_week: "เพิ่มงานลงในสัปดาห์",
    clear_all_52: "ล้างข้อมูล 52 สัปดาห์ทั้งหมด",
    update_preview: "อัปเดตผลลัพธ์ (Preview)",
    week_details: "รายละเอียดงานแต่ละสัปดาห์",
    close_window: "ปิดหน้าต่าง",
    save_plan: "บันทึกแผนงาน",
    alert_title_warning: "แจ้งเตือน",
    alert_btn_ok: "ตกลง (OK)",
    confirm_cancel_title: "ยืนยันการย้อนกลับ",
    confirm_cancel_desc:
      "ข้อมูลที่คุณกำลังกรอกไว้จะไม่ถูกบันทึก<br />คุณต้องการย้อนกลับใช่หรือไม่?",
    btn_no_continue: "ไม่, พิมพ์ต่อ",
    btn_yes_back: "ใช่, ย้อนกลับ",
    no_task_week: "ไม่มีงานระบุในสัปดาห์ใดๆ",
    week_prefix: "Week",
    confirm_delete_week: "ต้องการลบข้อมูลแผนงานของ Week {week} ใช่หรือไม่?",
    confirm_clear_all: "ยืนยันที่จะล้างข้อมูล 52 สัปดาห์ทั้งหมดหรือไม่?",
    btn_confirm: "ตกลง (Confirm)",
    btn_cancel: "ยกเลิก (Cancel)",
    alert_title_confirm: "ยืนยันการทำรายการ",
    nav_dept: "แผนก",
    nav_line: "ไลน์",
    nav_mach: "เครื่องจักร",
    nav_sub: "ระบบย่อย",
    nav_sub_list: "รายชื่อระบบย่อย (Subassemblies) ของเครื่องจักร:",
    nav_mach_list: "รายชื่อเครื่องจักรทั้งหมดในไลน์ผลิต:",
    exec_not_found: "ไม่พบข้อมูลเครื่องจักรนี้",
    exec_risk_high: "เสี่ยงสูง (Work Permit)",
    exec_risk_normal: "ปกติ",
    exec_no_plan: "ไม่มีแผนงาน PM",
    exec_no_plan_desc: "ไม่พบแผนงานในช่วง +/- 4 สัปดาห์นี้ครับ",
  },
  en: {
    // --- ส่วนที่เพิ่มใหม่สำหรับ Dashboard & Filter ---
    dashboard_title: "Current Week Overview",
    dash_plan_title: "PM Plan This Week",
    dash_done_title: "Completed",
    dash_ewo_title: "Breakdown / Waiting (EWO)",
    dash_plan_cta: "Click to view queue",
    dash_done_cta: "Click to view completed",
    dash_ewo_cta: "Click to view breakdowns",
    search_placeholder: "Search machine, line, or component...",
    filter_dept_label: "Department",
    filter_line_label: "Production Line",
    filter_class_label: "Priority Class",
    filter_dept_all: "All Departments",
    filter_line_all: "All Lines",
    filter_class_all: "All Classes",
    filter_other: "Others",
    btn_clear_filter: "Clear Filter",

    // --- คำศัพท์เดิม ---
    select_line: "Select Production Line",
    back_to_line: "Back to Lines",
    form_title: "Data Entry Form",
    cancel: "Cancel",
    working_in: "Working in",
    general_info: "Part 1: General Machine Info",
    label_line_name: "Line Name",
    label_machine_name: "Machine Name",
    label_updated_by: "Updated By / Recorder",
    placeholder_updated_by: "e.g. John Doe",
    main_image: "Main Machine Image",
    tap_to_upload: "Tap to take a photo or select from album",
    add_subsystem: "Add Sub-system",
    btn_save: "Confirm and Save All Data",
    back_bpc: "Back to BPC Hub",
    dash_plan_unit: "Tasks",
    dash_ewo_unit: "Items",
    trend_no_data: "No previous data",
    trend_increase: "Increased",
    trend_decrease: "Decreased",
    trend_equal: "Same as last week",
    no_match_filter: "No machines match this status for the current week.",
    has_sub_text: "Contains",
    unit_sub_text: "Subassemblies",
    has_mach_text: "Contains",
    unit_mach_text: "Machines",
    label_updated: "Updated:",
    label_editor: "Editor:",
    mach_list_label: "Machine List:",
    no_mach_in_line_small: "No machines in this line",
    view_machine: "View Machine",
    no_data_condition: "No data matches the criteria or no data available.",
    page_mach_empty_1: "Machine page: Dept",
    page_mach_empty_2: "Line",
    page_mach_empty_3:
      "No machine data yet. Click + at bottom right to create.",
    view_sub: "View Subassemblies",
    page_sub_empty_1: "Machine",
    page_sub_empty_2: "No subassembly data found.",
    has_comp_text: "Contains",
    unit_comp_text: "Components",
    view_comp: "View Components",
    sub_list_label: "Subassembly List:",
    no_sub_in_mach_small: "No subassemblies",
    unit_pieces: "pcs",
    subassembly: "Subassembly",
    delete_subassembly: "Delete",
    label_sub_name: "Subassembly Name",
    placeholder_sub_name: "Enter subassembly name",
    sub_image: "Subassembly Image",
    risk_assessment: "Risk Assessment",
    risk_desc: "Default is all risks apply. Tap ❌ if not.",
    components_title: "Components",
    add_component: "Add Component",
    risk_1: "Pinch Point",
    risk_2: "Tools",
    risk_3: "Manual Lift",
    risk_4: "High Ground",
    risk_5: "Chemical",
    risk_6: "Loud Noise",
    risk_7: "Forklift",
    comp_image: "Component Image",
    label_comp_name: "Component Name",
    label_time_min: "Time (mins)",
    label_remark: "Remark (if any)",
    placeholder_remark: "Enter additional remarks",
    high_risk: "High Risk (Work Permit)",
    ppe_desc: "Required PPE (Tap ❌ if not used)",
    ppe_1: "Gloves",
    ppe_2: "Helmet",
    ppe_3: "Glasses",
    ppe_4: "Mask",
    ppe_5: "Earplugs",
    ppe_6: "Safety Shoes",
    ppe_7: "Harness",
    ppe_8: "Hi-Vis",
    ppe_9: "LOTO",
    plan_52_weeks: "52-Week Plan",
    manage: "Manage",
    modal_52_title: "Set 52-Week Plan",
    modal_52_subtitle1: "Weekly Task Settings",
    modal_52_step1: "1. Select task types (Multiple)",
    modal_52_step2: "2. Specify weeks (1-52)",
    placeholder_weeks: "e.g. 25, 30, 35 or 10-15",
    modal_52_task: "Specify Task:",
    placeholder_task: "e.g. Lube, Inspect",
    modal_52_ewo: "EWO Code (Breakdown):",
    placeholder_ewo: "e.g. EWO-12345",
    add_task_week: "Add task to week(s)",
    clear_all_52: "Clear all 52-week data",
    update_preview: "Update Preview",
    week_details: "Weekly Task Details",
    close_window: "Close",
    save_plan: "Save Plan",
    alert_title_warning: "Notification",
    alert_btn_ok: "OK",
    confirm_cancel_title: "Confirm Go Back",
    confirm_cancel_desc:
      "Unsaved changes will be lost.<br />Do you want to go back?",
    btn_no_continue: "No, Continue Editing",
    btn_yes_back: "Yes, Go Back",
    no_task_week: "No tasks specified in any week",
    week_prefix: "Week",
    confirm_delete_week: "Do you want to delete the plan for Week {week}?",
    confirm_clear_all: "Are you sure you want to clear all 52-week data?",
    btn_confirm: "Confirm",
    btn_cancel: "Cancel",
    alert_title_confirm: "Confirmation",
    nav_dept: "Dept",
    nav_line: "Line",
    nav_mach: "Machine",
    nav_sub: "Subassembly",
    nav_sub_list: "Subassemblies of machine:",
    nav_mach_list: "All machines in production line:",
    exec_not_found: "Machine data not found",
    exec_risk_high: "High Risk (Work Permit)",
    exec_risk_normal: "Normal",
    exec_no_plan: "No PM Tasks",
    exec_no_plan_desc: "No tasks found within +/- 4 weeks.",
  },
};

// 2. ฟังก์ชันเปลี่ยนภาษา (อัปเดตให้ Re-render หน้าจอ และ สลับสีปุ่ม)
window.changeLanguage = function (lang) {
  localStorage.setItem("app_lang", lang);

  // สลับสีปุ่ม TH / EN ให้แสดงว่ากำลังเลือกภาษาไหนอยู่
  const btnTH = document.getElementById("btn-lang-th");
  const btnEN = document.getElementById("btn-lang-en");
  if (btnTH && btnEN) {
    if (lang === "th") {
      btnTH.className = "btn btn-sm btn-light fw-bold text-dark shadow-sm"; // ปุ่มทึบ
      btnEN.className =
        "btn btn-sm btn-outline-light fw-bold shadow-sm text-white"; // ปุ่มโปร่งใส
    } else {
      btnEN.className = "btn btn-sm btn-light fw-bold text-dark shadow-sm"; // ปุ่มทึบ
      btnTH.className =
        "btn btn-sm btn-outline-light fw-bold shadow-sm text-white"; // ปุ่มโปร่งใส
    }
  }

  // เปลี่ยนข้อความ (Inner Text) สำหรับแท็กที่มี data-i18n
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      element.innerHTML = translations[lang][key];
    }
  });

  // เปลี่ยน Placeholder สำหรับช่องกรอกข้อมูล
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    if (translations[lang] && translations[lang][key]) {
      element.placeholder = translations[lang][key];
    }
  });

  // 🔴 สั่งอัปเดตภาษาบนหน้า Dashboard และการ์ดต่างๆ ทันที
  updateDashboardStats();

  // เช็คว่าถ้า "ไม่ได้" อยู่ในหน้าฟอร์ม (view-form) ถึงจะยอมให้จัดหน้าใหม่ (Re-render)
  const formView = document.getElementById("view-form");
  if (formView && !formView.classList.contains("active")) {
    handleRouting();
  }
};

// โหลดภาษาตั้งต้นเมื่อเปิดเว็บ
document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("app_lang") || "th";
  window.changeLanguage(savedLang);
});

// ==========================================
// ฟังก์ชันจัดการช่องกรอกไลน์แบบพิเศษ
// ==========================================
function toggleCustomLineInput() {
  const select = document.getElementById("f_lineSelect");
  const custom = document.getElementById("f_lineCustom");
  const dept = document.getElementById("f_department");

  // ถ้าเลือก Mixing แบบต้องระบุเลข
  if (select.value === "MIXING_CUSTOM") {
    custom.classList.remove("d-none");
    custom.placeholder = "ระบุเลข Mix เช่น MIX#1";
    custom.required = true;
  }
  // ถ้าเลือก อื่นๆ แบบต้องระบุเอง
  else if (select.value === "OTHER_CUSTOM") {
    custom.classList.remove("d-none");
    custom.placeholder = "ระบุชื่อไลน์ หรือ แผนกที่ต้องการ...";
    custom.required = true;
  }
  // ถ้าเลือกไลน์ปกติ (ซ่อนกล่องและช่วยเปลี่ยนแผนกให้อัตโนมัติ)
  else {
    custom.classList.add("d-none");
    custom.required = false;
    custom.value = "";

    // 🔴 Auto-select แผนกเพื่อความสะดวกของ User
    const optGroup = select.options[select.selectedIndex].parentNode.label;
    if (optGroup === "CO") dept.value = "CO";
    else if (optGroup === "PCL") dept.value = "PCL";
  }
}

// 🟢 ฟังก์ชันย่อขนาดและบีบอัดภาพอัตโนมัติก่อนส่งขึ้น Google Drive
function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // คำนวณสัดส่วนใหม่ไม่ให้เกินขนาด maxWidth และ maxHeight ที่กำหนด
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // แปลงไฟล์ภาพเป็น JPEG พร้อมปรับระดับความคมชัด (Quality 0.7 = 70% ขนาดลดลงเยอะมากแต่ภาพยังชัดเจน)
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

// =========================================================
// 🔴 ฟังก์ชันดึงข้อมูลเดิมกลับมาแก้ไข (Edit Mode)
// =========================================================
// เพิ่มพารามิเตอร์ isAppendNewSub สำหรับแยกว่าเป็นการ "แก้ไข" หรือ "เพิ่มของใหม่ต่อท้าย"
function editSubassembly(isAppendNewSub = false) {
  if (!currentDept || !currentLine || !currentMach) return;

  let machData = dbData[currentDept][currentLine].machines[currentMach];
  if (!machData) {
    showModalAlert("ข้อผิดพลาด", "ไม่พบข้อมูลเครื่องจักรนี้ในระบบ", true);
    return;
  }

  // 1. เคลียร์ฟอร์ม
  document.getElementById("ledgerForm").reset();
  document.getElementById("subSystemsContainer").innerHTML = "";
  toggleFabMode(true);

  // 2. ใส่ข้อมูลส่วนบน (แผนก, ไลน์, เครื่องจักร)
  document.getElementById("f_department").value = currentDept;
  autoSetLineDropdown(currentLine);
  document.getElementById("f_machineName").value = currentMach;

  // ล็อกชื่อเครื่องจักร แผนก และไลน์ ไม่ให้แก้ไข
  document.getElementById("f_machineName").readOnly = true;
  let boxDept = document.getElementById("box_f_dept");
  let boxLine = document.getElementById("box_f_lineName");
  if (boxDept) boxDept.style.display = "none";
  if (boxLine) boxLine.style.display = "none";

  // ดึงรูประดับเครื่องจักร
  let machImgPreview = document.querySelector("#cardStructure .preview-img");
  let machImgUploadBox = document.getElementById("box_imgMach");
  if (machData.image && machData.image.indexOf("NO+IMAGE") === -1) {
    machImgPreview.src = machData.image;
    machImgPreview.style.display = "block";
    if (machImgUploadBox) machImgUploadBox.style.display = "none";
  } else {
    machImgPreview.src = "";
    machImgPreview.style.display = "none";
    if (machImgUploadBox) machImgUploadBox.style.display = "flex";
  }

  // 3. วนลูปสร้างการ์ดระบบย่อยเก่า
  for (let subName in machData.subassemblies) {
    let subInfo = machData.subassemblies[subName];

    addSubsystemCard();
    let subCard = document.getElementById(
      "subSystemsContainer",
    ).lastElementChild;
    subCard.querySelector(".input-subname").value = subName;

    // รูประบบย่อย
    let subImgPreview = subCard.querySelector(".preview-img");
    let subImgBox = subCard.querySelector(".box_imgSub");
    if (subInfo.image && subInfo.image.indexOf("NO+IMAGE") === -1) {
      subImgPreview.src = subInfo.image;
      subImgPreview.style.display = "block";
      if (subImgBox) subImgBox.style.display = "none";
    }

    // ประเมินความเสี่ยง
    let importedRisks = subInfo.risks || "";
    subCard.querySelectorAll(".risk-grid .icon-checkbox").forEach((chk) => {
      let val = chk.getAttribute("data-val");
      if (importedRisks.includes(val)) chk.classList.remove("not-used");
      else chk.classList.add("not-used");
    });

    subCard.querySelector(".parts-container").innerHTML = "";

    // Component
    subInfo.components.forEach((comp) => {
      addComponentCard(subCard.querySelector(".parts-container"));
      let compCard = subCard.querySelector(".parts-container").lastElementChild;

      compCard.querySelector(".input-compname").value = comp.name || "";
      compCard.querySelector(".input-task").value = comp.task || "";
      compCard.querySelector(".input-class").value = comp.class || "A";
      compCard.querySelector(".input-pmstd").value = comp.std || "CBM";
      compCard.querySelector(".input-status").value = comp.stat || "Run";
      compCard.querySelector(".input-time").value = comp.time || "";
      compCard.querySelector(".input-risk").checked = comp.risk;
      compCard.querySelector(".input-remark").value = comp.remarkEwo || "";
      if (compCard.querySelector(".input-frequency")) {
        compCard.querySelector(".input-frequency").value =
          comp.frequency || "1W";
      }

      let importedPPE = comp.ppe || "";
      compCard.querySelectorAll(".ppe-grid .icon-checkbox").forEach((chk) => {
        let val = chk.getAttribute("data-val");
        if (importedPPE.includes(val)) chk.classList.remove("not-used");
        else chk.classList.add("not-used");
      });

      let compImgPreview = compCard.querySelector(".box_imgComp .preview-img");
      let compImgBox = compCard.querySelector(".box_imgComp .upload-box-smp");
      if (comp.imgComp && comp.imgComp.indexOf("NO+IMAGE") === -1) {
        compImgPreview.src = comp.imgComp;
        compImgPreview.style.display = "block";
        if (compImgBox) compImgBox.style.display = "none";
      }

      compCard.querySelector(".week-data-input").value = JSON.stringify(
        comp.weeks,
      );
      renderCompactGrid(
        compCard.querySelector(".week-compact-grid"),
        comp.weeks,
      );
    });
  }

  // 🔴 4. เพิ่มช่อง Subassembly ใหม่ต่อท้ายอัตโนมัติ (ถ้ามาจากการกดปุ่ม +)
  if (isAppendNewSub === true) {
    addSubsystemCard();
    let newlyAddedCard = document.getElementById(
      "subSystemsContainer",
    ).lastElementChild;

    // เปลี่ยนไปที่หน้าฟอร์ม
    document
      .querySelectorAll(".view-section")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById("view-form").classList.add("active");

    // ตั้งค่าแบนเนอร์
    let banner = document.getElementById("formContextBanner");
    let bannerText = document.getElementById("formContextText");
    if (banner && bannerText) {
      banner.classList.remove("d-none");
      bannerText.innerText = `เพิ่มระบบย่อยให้กับเครื่องจักร: ${currentMach}`;
    }

    // Auto-scroll ลงมาที่การ์ดใหม่ พร้อมโฟกัสช่องพิมพ์ และไฮไลต์
    setTimeout(() => {
      newlyAddedCard.scrollIntoView({ behavior: "smooth", block: "center" });
      let inputField = newlyAddedCard.querySelector(".input-subname");
      if (inputField) {
        // แอฟเฟกต์แสงไฮไลต์รอบการ์ด 1.5 วินาที
        newlyAddedCard.style.transition = "box-shadow 0.5s";
        newlyAddedCard.style.boxShadow = "0 0 0 4px rgba(0, 94, 184, 0.5)";
        setTimeout(() => (newlyAddedCard.style.boxShadow = ""), 1500);

        inputField.focus(); // เคอร์เซอร์ไปรอที่ช่องพิมพ์เลย
      }
    }, 300); // ดีเลย์เล็กน้อยเพื่อให้หน้าจอเรนเดอร์เสร็จก่อนเลื่อน
  } else {
    // กรณีเข้าโหมด "แก้ไข" ปกติ
    document
      .querySelectorAll(".view-section")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById("view-form").classList.add("active");

    let banner = document.getElementById("formContextBanner");
    let bannerText = document.getElementById("formContextText");
    if (banner && bannerText) {
      banner.classList.remove("d-none");
      bannerText.innerText = `โหมดแก้ไขเครื่องจักร: ${currentMach}`;
    }
    window.scrollTo(0, 0);
  }
}

async function submitExecutionTask(btnElement) {
  let card = btnElement.closest(".card");
  let formBlock = card.querySelector(".exec-form-block");
  let status = formBlock.querySelector(".exec-status").value;
  let imgBeforeInput = formBlock.querySelector(".exec-img-before");
  let imgAfterInput = formBlock.querySelector(".exec-img-after");
  let imgBeforePreview = imgBeforeInput.nextElementSibling;
  let imgAfterPreview = imgAfterInput.nextElementSibling;
  let actualTime = formBlock.querySelector(".exec-actual-time").value;
  let mechanicId = formBlock.querySelector(".exec-mechanic-id").value;
  let remark = formBlock.querySelector(".exec-remark").value;

  if (!mechanicId) {
    showModalAlert(
      "ข้อมูลไม่ครบ",
      "กรุณาระบุรหัสพนักงานหรือชื่อผู้ส่งงาน",
      true,
    );
    return;
  }

  let payloadData = {
    dept: currentDept,
    line: currentLine,
    mach: currentMach,
    subName: card.dataset.sub,
    compName: card.dataset.comp,
    weekIndex: parseInt(card.dataset.weekIndex),
    status: status,
    actualTime: actualTime,
    mechanicId: mechanicId,
    remark: remark,
    imgBefore: getBase64(imgBeforePreview),
    imgAfter: getBase64(imgAfterPreview),
  };

  showModalConfirm(
    "ยืนยันการส่งงาน",
    `คุณต้องการส่งงาน PM สำหรับ <b>${card.dataset.comp}</b> ใช่หรือไม่?`,
    async () => {
      document.getElementById("loadingOverlay").style.display = "flex";
      try {
        const result = await ApiService.request("submit_execution", {
          data: payloadData,
        });
        if (result.success) {
          showModalAlert("สำเร็จ!", "บันทึกและส่งงาน PM เรียบร้อยแล้ว");
          await loadDataFromDatabase();
          handleRouting();
        } else {
          showModalAlert("เกิดข้อผิดพลาด", result.message, true);
        }
      } catch (err) {
        showModalAlert("เชื่อมต่อล้มเหลว", err.message, true);
      } finally {
        document.getElementById("loadingOverlay").style.display = "none";
      }
    },
  );
}
// ==========================================
// ฟังก์ชันสำหรับทดสอบเข้า/ออก โหมดส่งงาน PM ของช่าง
// ==========================================
function testExecutionMode() {
  if (currentDept && currentLine && currentMach) {
    let url = new URL(window.location);
    url.searchParams.set("mode", "execute"); // สั่งเปลี่ยนเป็นโหมด execute
    window.history.pushState({}, "", url);
    handleRouting(); // รีเฟรชหน้าจอ
  } else {
    showModalAlert(
      "แจ้งเตือน",
      "กรุณาเลือกเครื่องจักรให้เรียบร้อยก่อนเข้าสู่โหมดส่งงาน",
      true,
    );
  }
}

function exitExecutionMode() {
  let url = new URL(window.location);
  url.searchParams.delete("mode"); // ลบพารามิเตอร์ mode ออก (กลับสู่หน้าปกติ)
  window.history.pushState({}, "", url);
  handleRouting(); // รีเฟรชหน้าจอ
}

// ==========================================
// 1. ฟังก์ชันกรอง Base64 และหานามสกุลไฟล์รูป (แก้ปัญหารูปไม่แสดงใน Excel)
// ==========================================
function getCleanBase64(dataUrl) {
  if (!dataUrl) return null;
  // ดึงเฉพาะข้อมูล Base64 ออกมา ไม่ว่าจะเป็น jpeg หรือ png
  if (dataUrl.includes("base64,")) {
    return dataUrl.split("base64,")[1];
  }
  if (!dataUrl.startsWith("http")) return dataUrl;
  return null;
}

function getExtensionFromBase64(dataUrl) {
  if (!dataUrl) return "png";
  // เช็คว่าเป็นรูปประเภทไหน เพื่อให้ ExcelJS สร้างไฟล์ได้ถูกต้อง
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg"))
    return "jpeg";
  if (dataUrl.includes("image/gif")) return "gif";
  return "png"; // ค่าเริ่มต้น
}

// ==========================================
// 2. ฟังก์ชันตรวจสอบงานล่วงหน้าในระดับ "ระบบย่อย" (Subassembly)
// ==========================================
function hasUpcomingSubTasks(subData) {
  const currentWeekIndex = getCurrentWeekNumber() - 1;
  if (!subData.components) return false;
  for (let c of subData.components) {
    for (let i = currentWeekIndex; i <= currentWeekIndex + 1; i++) {
      if (i < 52 && c.weeks[i]) {
        let w = c.weeks[i];
        if (w.t === 1 || w.b === 1 || w.r === 1) return true;
      }
    }
  }
  return false;
}

// ==========================================
// 3. ทับฟังก์ชัน renderSubs ให้รองรับการไฮไลต์แดง
// ==========================================
function renderSubs(deptName, lineName, machName) {
  let grid = document.getElementById("subGrid");
  grid.innerHTML = "";
  const lang = getCurrentLang();
  const t = translations[lang];

  if (
    !dbData[deptName] ||
    !dbData[deptName][lineName] ||
    !dbData[deptName][lineName].machines[machName] ||
    Object.keys(dbData[deptName][lineName].machines[machName].subassemblies)
      .length === 0
  ) {
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">
       <span class="material-symbols-rounded text-secondary mb-3 d-block" style="font-size:48px;">account_tree</span>
       <h5>${t.page_sub_empty_1} <span class="text-danger">${escapeHTML(machName)}</span></h5>
       <p>${t.page_sub_empty_2}</p>
     </div>`;
    return;
  }

  let mach = dbData[deptName][lineName].machines[machName];

  for (let subName in mach.subassemblies) {
    let safeSubName = escapeHTML(subName);
    let subData = mach.subassemblies[subName];
    let cCount = subData.components ? subData.components.length : 0;

    let isUpcoming = hasUpcomingSubTasks(subData);
    let highlightClass = isUpcoming ? "upcoming-task" : "";
    let imageUrl =
      subData.image && !subData.image.includes("NO+IMAGE")
        ? subData.image
        : "https://via.placeholder.com/400x200?text=No+Image+Available";

    grid.innerHTML += `
      <div class="col-md-6 col-lg-4">
        <div class="hover-card ${highlightClass} d-flex flex-column h-100" onclick="navigateTo('${escapeHTML(deptName)}', '${escapeHTML(lineName)}', '${escapeHTML(machName)}', '${safeSubName}')">
          <img src="${imageUrl}" class="card-img-top border-bottom" onerror="this.src='https://via.placeholder.com/400x200?text=Image+Error'">
          <div class="p-3 d-flex flex-column flex-grow-1 bg-white">
            <h6 class="fw-bold text-dark mb-1 text-truncate" title="${safeSubName}">${safeSubName}</h6>
            <div class="text-muted small fw-bold mt-2">
              <span class="material-symbols-rounded align-middle text-success" style="font-size: 18px;">build</span> 
              ${t.has_comp_text} ${cCount} ${t.unit_comp_text}
            </div>
            <div class="mt-auto"></div>
          </div>
          <div class="card-overlay">
            <h6 class="fw-bold text-warning mb-3 text-truncate" title="${safeSubName}">${safeSubName}</h6>
            <div class="mt-auto text-center w-100">
              <span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">
                ${t.view_comp} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span>
              </span>
            </div>
          </div>
        </div>
      </div>`;
  }
}

// ==========================================
// 4. ฟังก์ชันสร้างรูปภาพ 52 สัปดาห์ และ รูป Legend (ออกแบบใหม่ พื้นหลังขาวชัดเจน)
// ==========================================
function create52WeekImageBase64(t, r, b, l) {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");

  // ถมพื้นหลังสีขาวเสมอ
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 40, 40);

  const COLOR_TOP = "#000000"; // สีดำ (Planned Maint. Executed)
  const COLOR_RIGHT = "#ef4444"; // สีแดง (Breakdown Maint.)
  const COLOR_BOTTOM = "#eab308"; // สีเหลือง (Planned Maintenance)
  const COLOR_LEFT = "#005eb8"; // สีน้ำเงิน (Unplanned Extra)
  const COLOR_INACTIVE = "#e2e8f0"; // สีเทา (ไม่มีข้อมูล)

  function drawTriangle(points, isActive, color) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.closePath();
    ctx.fillStyle = isActive ? color : COLOR_INACTIVE;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // วาด 4 มุม (จัดตำแหน่งใหม่ตาม UI)
  drawTriangle(
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 20, y: 20 },
    ],
    t === 1,
    COLOR_TOP,
  ); // Top
  drawTriangle(
    [
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 20, y: 20 },
    ],
    r === 1,
    COLOR_RIGHT,
  ); // Right
  drawTriangle(
    [
      { x: 40, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 20 },
    ],
    b === 1,
    COLOR_BOTTOM,
  ); // Bottom
  drawTriangle(
    [
      { x: 0, y: 40 },
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ],
    l === 1,
    COLOR_LEFT,
  ); // Left

  return canvas.toDataURL("image/png");
}

function createLegendImageBase64() {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "#000000";
  ctx.fillText("สัญลักษณ์แผนงาน PM (Legend)", 10, 25);

  // วาดสัญลักษณ์รวม 4 สี
  const cx = 40,
    cy = 60,
    size = 20;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";

  ctx.fillStyle = "#005eb8";
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size);
  ctx.lineTo(cx + size, cy - size);
  ctx.lineTo(cx, cy);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.moveTo(cx + size, cy - size);
  ctx.lineTo(cx + size, cy + size);
  ctx.lineTo(cx, cy);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.moveTo(cx + size, cy + size);
  ctx.lineTo(cx - size, cy + size);
  ctx.lineTo(cx, cy);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#eab308";
  ctx.beginPath();
  ctx.moveTo(cx - size, cy + size);
  ctx.lineTo(cx - size, cy - size);
  ctx.lineTo(cx, cy);
  ctx.fill();
  ctx.stroke();

  // วาดคำอธิบาย
  ctx.font = "14px Arial";
  ctx.fillStyle = "#000000";
  ctx.fillRect(80, 40, 12, 12);
  ctx.fillText("สีดำ = วางแผน (Plan)", 100, 51);
  ctx.fillStyle = "#005eb8";
  ctx.fillRect(80, 65, 12, 12);
  ctx.fillText("สีน้ำเงิน = ทำเสร็จ (Done)", 100, 76);

  ctx.fillStyle = "#ef4444";
  ctx.fillRect(250, 40, 12, 12);
  ctx.fillText("สีแดง = เครื่องเสีย (Breakdown)", 270, 51);
  ctx.fillStyle = "#eab308";
  ctx.fillRect(250, 65, 12, 12);
  ctx.fillText("สีเหลือง = รออะไหล่ (Wait Part)", 270, 76);

  return canvas.toDataURL("image/png");
}

// ==========================================
// 🔴 Helper: ระบบแจ้งสถานะ Loading อัจฉริยะ
// ==========================================
function updateLoadingStatus(text) {
  const textEl = document.getElementById("loadingText");
  if (textEl) textEl.innerText = text;
}

function showLoading(text = "กำลังโหลดข้อมูล...") {
  updateLoadingStatus(text);
  document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}

// ==========================================
// 🔴 ปรับปรุง: ฟังก์ชันสร้าง Excel ให้สามารถคืนค่าเป็น Buffer ได้ (เพื่อส่งเข้า ZIP)
// ==========================================
// สังเกตที่ returnBuffer = false หากเป็น true จะไม่โหลดลงเครื่อง แต่จะส่งก้อนข้อมูลกลับไปแทน
async function exportMachineToExcel(machineData, returnBuffer = false) {
  const workbook = new ExcelJS.Workbook();
  const weekImageCache = {};

  function getWeekImageId(t, r, b, l) {
    const key = `${t}_${r}_${b}_${l}`;
    if (weekImageCache[key]) return weekImageCache[key];
    const base64Data = getCleanBase64(create52WeekImageBase64(t, r, b, l));
    const imgId = workbook.addImage({ base64: base64Data, extension: "png" });
    weekImageCache[key] = imgId;
    return imgId;
  }

  const legendImgId = workbook.addImage({
    base64: getCleanBase64(createLegendImageBase64()),
    extension: "png",
  });

  const hubSheet = workbook.addWorksheet("Index Hub");
  hubSheet.columns = [{ width: 5 }, { width: 30 }, { width: 50 }];
  hubSheet.getCell("B2").value = "MACHINE MAINTENANCE LEDGER";
  hubSheet.getCell("B2").font = {
    size: 18,
    bold: true,
    color: { argb: "FF005EB8" },
  };

  hubSheet.getCell("B4").value = "Department (แผนก):";
  hubSheet.getCell("C4").value = machineData.dept;
  hubSheet.getCell("B5").value = "Line (ไลน์ผลิต):";
  hubSheet.getCell("C5").value = machineData.line;
  hubSheet.getCell("B6").value = "Machine Name (ชื่อเครื่อง):";
  hubSheet.getCell("C6").value = machineData.machineName;
  hubSheet.getCell("B4").font = { bold: true };
  hubSheet.getCell("B5").font = { bold: true };
  hubSheet.getCell("B6").font = { bold: true };

  hubSheet.getCell("B8").value = "Subassembly List (คลิกเพื่อไปยังชีต):";
  hubSheet.getCell("B8").font = { bold: true, size: 12 };

  let hubRow = 9;
  for (const sub of machineData.subassemblies) {
    hubSheet.getCell(`C${hubRow}`).value = {
      text: `🔗 ${sub.name}`,
      hyperlink: `#'${sub.name}'!A1`,
    };
    hubSheet.getCell(`C${hubRow}`).font = {
      color: { argb: "FF0563C1" },
      underline: true,
    };
    hubRow++;
  }

  for (const sub of machineData.subassemblies) {
    const sheet = workbook.addWorksheet(sub.name);
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 10;
    for (let w = 1; w <= 52; w++) sheet.getColumn(w + 4).width = 4;
    sheet.getColumn(57).width = 25;

    sheet.getCell("A1").value =
      `Equipment: ${machineData.machineName} - ${sub.name}`;
    sheet.getCell("A1").font = { size: 16, bold: true };
    sheet.getCell("A2").value = `PLANNED MAINTENANCE SCHEDULE`;
    sheet.getCell("A2").font = {
      size: 14,
      bold: true,
      color: { argb: "FF005EB8" },
    };
    sheet.addImage(legendImgId, {
      tl: { col: 45, row: 0 },
      br: { col: 55, row: 3 },
    });

    const headers = ["Part Name", "Picture", "Method", "Freq."];
    for (let i = 1; i <= 4; i++) {
      let cell = sheet.getCell(4, i);
      cell.value = headers[i - 1];
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF005EB8" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
    for (let w = 1; w <= 52; w++) {
      let cell = sheet.getCell(4, w + 4);
      cell.value = `W${w}`;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF38A169" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }

    let ewoCell = sheet.getCell(4, 57);
    ewoCell.value = "EWO / Breakdown Summary";
    ewoCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF005EB8" },
    };
    ewoCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    ewoCell.alignment = { horizontal: "center", vertical: "middle" };
    ewoCell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    let rowIdx = 5;
    for (const part of sub.parts) {
      sheet.getRow(rowIdx).height = 60;
      sheet.getCell(`A${rowIdx}`).value = part.name;
      sheet.getCell(`A${rowIdx}`).alignment = {
        vertical: "middle",
        wrapText: true,
      };
      sheet.getCell(`C${rowIdx}`).value = part.method || "-";
      sheet.getCell(`D${rowIdx}`).value = part.frequency || "-";
      sheet.getCell(`C${rowIdx}`).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
      sheet.getCell(`D${rowIdx}`).alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      if (part.imageBase64 && part.imageBase64.startsWith("http")) {
        sheet.getCell(`B${rowIdx}`).value = "(รูปเก่าดูในระบบ)";
        sheet.getCell(`B${rowIdx}`).font = {
          italic: true,
          color: { argb: "FF888888" },
          size: 10,
        };
        sheet.getCell(`B${rowIdx}`).alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      } else if (part.imageBase64) {
        const cleanImg = getCleanBase64(part.imageBase64);
        if (cleanImg) {
          try {
            const imgId = workbook.addImage({
              base64: cleanImg,
              extension: "png",
            });
            sheet.addImage(imgId, {
              tl: { col: 1.1, row: rowIdx - 1 + 0.1 },
              br: { col: 1.9, row: rowIdx - 0.1 },
            });
          } catch (e) {}
        }
      }

      for (let w = 1; w <= 52; w++) {
        if (part.weeks && part.weeks[w - 1]) {
          let weekData = part.weeks[w - 1];
          let pmImgId = getWeekImageId(
            weekData.t,
            weekData.r,
            weekData.b,
            weekData.l,
          );
          sheet.addImage(pmImgId, {
            tl: { col: w + 4 - 1 + 0.1, row: rowIdx - 1 + 0.1 },
            br: { col: w + 4 - 0.1, row: rowIdx - 0.1 },
          });
        }
      }
      for (let c = 1; c <= 57; c++) {
        sheet.getCell(rowIdx, c).border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
      rowIdx++;
    }

    let approvalRow = rowIdx + 2;
    sheet.getRow(approvalRow).height = 60;
    sheet.getCell(`C${approvalRow}`).value =
      "ผู้จัดทำ (Prepared by)\n\n...................................\nวันที่: ....../....../......";
    sheet.getCell(`C${approvalRow}`).alignment = {
      wrapText: true,
      horizontal: "center",
      vertical: "middle",
    };
    sheet.mergeCells(`C${approvalRow}:G${approvalRow}`);
    sheet.getCell(`J${approvalRow}`).value =
      "ผู้ตรวจสอบ (Checked by)\n\n...................................\nวันที่: ....../....../......";
    sheet.getCell(`J${approvalRow}`).alignment = {
      wrapText: true,
      horizontal: "center",
      vertical: "middle",
    };
    sheet.mergeCells(`J${approvalRow}:N${approvalRow}`);
    sheet.getCell(`S${approvalRow}`).value =
      "ผู้อนุมัติ (Approved by)\n\n...................................\nวันที่: ....../....../......";
    sheet.getCell(`S${approvalRow}`).alignment = {
      wrapText: true,
      horizontal: "center",
      vertical: "middle",
    };
    sheet.mergeCells(`S${approvalRow}:W${approvalRow}`);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  // 🔴 เช็คว่าต้องการข้อมูลดิบ (นำไปใส่ ZIP) หรือ ให้โหลดลงเครื่องเลย
  if (returnBuffer) {
    return buffer;
  }
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `Machine_Ledger_${machineData.machineName}.xlsx`);
}

// ==========================================
// 🔴 ปรับปรุง: ฟังก์ชัน Export เครื่องจักรเดี่ยว (มีโชว์สถานะ)
// ==========================================
async function handleExportExcel() {
  if (!currentDept || !currentLine || !currentMach) {
    showModalAlert(
      "แจ้งเตือน",
      "ไม่พบข้อมูลเครื่องจักรที่ต้องการ Export",
      true,
    );
    return;
  }

  showLoading(`กำลังรวบรวมข้อมูลเครื่อง ${currentMach}...`);

  try {
    let machDataDB = dbData[currentDept][currentLine].machines[currentMach];
    let machineData = {
      dept: currentDept,
      line: currentLine,
      machineName: currentMach,
      subassemblies: [],
    };

    for (let subName in machDataDB.subassemblies) {
      let subDB = machDataDB.subassemblies[subName];
      let sub = { name: subName, parts: [] };
      subDB.components.forEach((comp) => {
        sub.parts.push({
          name: comp.name,
          method: comp.std,
          frequency: comp.frequency || comp.time || "-",
          imageBase64:
            comp.imgComp && comp.imgComp.indexOf("NO+IMAGE") === -1
              ? comp.imgComp
              : null,
          weeks: comp.weeks || [],
        });
      });
      machineData.subassemblies.push(sub);
    }

    updateLoadingStatus("กำลังประมวลผลไฟล์ Excel (อาจใช้เวลาสักครู่)...");

    // หน่วงเวลาเล็กน้อยให้หน้าจอ UI ได้อัปเดตข้อความก่อนลุยงานหนัก
    await new Promise((resolve) => setTimeout(resolve, 100));

    await exportMachineToExcel(machineData, false);
  } catch (error) {
    console.error("Export Error:", error);
    showModalAlert(
      "เกิดข้อผิดพลาด",
      "ไม่สามารถสร้างไฟล์ Excel ได้: " + error.message,
      true,
    );
  } finally {
    hideLoading();
  }
}

// ==========================================
// 🔴 ใหม่!: ฟังก์ชัน Export แบบระดับ Line (สร้างหลายไฟล์แล้วบีบอัดเป็น ZIP เดียว)
// ==========================================
async function handleExportLineZip() {
  if (!currentDept || !currentLine) {
    showModalAlert("แจ้งเตือน", "ไม่พบข้อมูลไลน์ผลิต", true);
    return;
  }

  if (typeof JSZip === "undefined") {
    showModalAlert(
      "ข้อผิดพลาด",
      "ระบบยังไม่ได้โหลดไลบรารี JSZip สำหรับบีบอัดไฟล์ กรุณารีเฟรชหน้าเว็บ",
      true,
    );
    return;
  }

  let lineData = dbData[currentDept][currentLine];
  if (
    !lineData ||
    !lineData.machines ||
    Object.keys(lineData.machines).length === 0
  ) {
    showModalAlert("แจ้งเตือน", "ไม่มีเครื่องจักรในไลน์นี้ให้ Export", true);
    return;
  }

  showLoading(`กำลังเตรียมไฟล์ ZIP สำหรับไลน์ ${currentLine}...`);

  try {
    const zip = new JSZip();
    // สร้าง Folder ข้างใน ZIP ให้ชื่อเป็น Dept_Line
    const folderName = `${currentDept}_${currentLine}`;
    const rootFolder = zip.folder(folderName);

    let machKeys = Object.keys(lineData.machines);

    for (let i = 0; i < machKeys.length; i++) {
      let machName = machKeys[i];

      // อัปเดตบอกผู้ใช้ว่ากำลังทำเครื่องที่เท่าไหร่จากทั้งหมด
      updateLoadingStatus(
        `กำลังสร้างไฟล์ (${i + 1}/${machKeys.length}): เครื่อง ${machName}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100)); // คืนลมหายใจให้เบราว์เซอร์อัปเดต UI

      let machDataDB = lineData.machines[machName];
      let machineData = {
        dept: currentDept,
        line: currentLine,
        machineName: machName,
        subassemblies: [],
      };

      for (let subName in machDataDB.subassemblies) {
        let subDB = machDataDB.subassemblies[subName];
        let sub = { name: subName, parts: [] };
        subDB.components.forEach((comp) => {
          sub.parts.push({
            name: comp.name,
            method: comp.std,
            frequency: comp.frequency || comp.time || "-",
            imageBase64:
              comp.imgComp && comp.imgComp.indexOf("NO+IMAGE") === -1
                ? comp.imgComp
                : null,
            weeks: comp.weeks || [],
          });
        });
        machineData.subassemblies.push(sub);
      }

      // 🔴 ส่ง true เพื่อรับเป็น Buffer แทนที่จะ SaveAs
      let excelBuffer = await exportMachineToExcel(machineData, true);

      // นำ Buffer ยัดใส่โฟลเดอร์ใน ZIP
      let safeFileName = machName.replace(/[/\\?%*:|"<>]/g, "-"); // ป้องกันชื่อไฟล์มีอักขระต้องห้าม
      rootFolder.file(`Machine_${safeFileName}.xlsx`, excelBuffer);
    }

    updateLoadingStatus("รวบรวมไฟล์เสร็จสิ้น กำลังบีบอัดเป็น ZIP...");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `Export_${currentDept}_${currentLine}_Ledger.zip`);
  } catch (error) {
    console.error("ZIP Export Error:", error);
    showModalAlert(
      "เกิดข้อผิดพลาด",
      "ไม่สามารถสร้างไฟล์ ZIP ได้: " + error.message,
      true,
    );
  } finally {
    hideLoading();
  }
}
