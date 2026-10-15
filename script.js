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
async function loadDataFromDatabase() {
  document.getElementById("loadingOverlay").style.display = "flex";
  try {
    dbData = await ApiService.getAllData();
    handleRouting();
    checkDraftStatus(); // เช็คว่ามีแบบร่างค้างไว้ไหม
  } catch (err) {
    showModalAlert(
      "โหลดข้อมูลล้มเหลว",
      "ไม่สามารถเชื่อมต่อฐานข้อมูลได้: " + err.message,
      true,
    );
  } finally {
    document.getElementById("loadingOverlay").style.display = "none";
  }
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

// ฟังก์ชันเช็คว่าเครื่องจักร/ไลน์นี้ มีงานในสัปดาห์นี้หรือสัปดาห์หน้าหรือไม่?
function hasUpcomingTasks(entityData, isLine = false) {
  const currentWeekIndex = getCurrentWeekNumber() - 1; // index ใน array 0-51
  let found = false;

  const checkComponent = (comp) => {
    // เช็คสัปดาห์ปัจจุบัน (w) และ สัปดาห์หน้า (w+1)
    for (let i = currentWeekIndex; i <= currentWeekIndex + 1; i++) {
      if (i < 52 && comp.weeks[i]) {
        let w = comp.weeks[i];
        if (w.t === 1 || w.r === 1 || w.b === 1 || w.l === 1) return true;
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
    // เช็คระดับเครื่องจักร
    for (let s in entityData.subassemblies) {
      for (let c of entityData.subassemblies[s].components) {
        if (checkComponent(c)) return true;
      }
    }
  }
  return false;
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

function handleRouting() {
  let params = new URLSearchParams(window.location.search);
  currentDept = params.get("dept");
  currentLine = params.get("line");
  currentMach = params.get("mach");
  currentSub = params.get("sub");

  const lang = getCurrentLang();

  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  let breadcrumb = "Dashboard";
  toggleFabMode(false);

  if (!dbData || Object.keys(dbData).length === 0) {
    document.getElementById("view-lines").classList.add("active");
    document.getElementById("lineGrid").innerHTML =
      `<div class="col-12 text-center text-muted p-5"><i class="bi bi-inbox fs-1 d-block mb-3"></i>${translations[lang].no_data}</div>`;
    return;
  }

  if (currentDept && currentLine && currentMach && currentSub) {
    document.getElementById("lbl-sub-title").innerText = currentSub;
    renderComponentTable();
    document.getElementById("view-components").classList.add("active");
    breadcrumb = `${currentDept} > ${currentLine} > ${currentMach} > ${currentSub}`;
  } else if (currentDept && currentLine && currentMach) {
    document.getElementById("lbl-mach-title").innerText = currentMach;
    renderSubs(currentDept, currentLine, currentMach);
    document.getElementById("view-subs").classList.add("active");
    breadcrumb = `${currentDept} > ${currentLine} > ${currentMach}`;
  } else if (currentDept && currentLine) {
    document.getElementById("lbl-line-title").innerText = currentLine;
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

function renderLines() {
  let grid = document.getElementById("lineGrid");
  grid.innerHTML = "";
  const lang = getCurrentLang();
  const t = translations[lang];

  // ดึงค่าจาก Filter
  const filterDept = document.getElementById("filterDept").value;
  const filterSearch = document
    .getElementById("filterSearch")
    .value.toLowerCase();
  const filterUpcoming = document.getElementById("filterUpcoming").checked;

  let hasResult = false;

  for (let deptName in dbData) {
    // กรองแผนก
    if (filterDept !== "ALL" && deptName !== filterDept) continue;

    for (let lineName in dbData[deptName]) {
      // กรองคำค้นหา
      if (
        filterSearch &&
        !lineName.toLowerCase().includes(filterSearch) &&
        !deptName.toLowerCase().includes(filterSearch)
      )
        continue;

      let isUpcoming = hasUpcomingTasks(dbData[deptName][lineName], true);
      // กรองเฉพาะงานที่มีใกล้ถึง
      if (filterUpcoming && !isUpcoming) continue;

      hasResult = true;
      let safeDept = escapeHTML(deptName);
      let safeLine = escapeHTML(lineName);
      let mCount = Object.keys(dbData[deptName][lineName].machines).length;
      let highlightClass = isUpcoming ? "upcoming-task" : "";

      grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card ${highlightClass}" onclick="navigateTo('${safeDept}', '${safeLine}')">
        <img src="${dbData[deptName][lineName].image}" class="card-img-top">
        <div class="p-3">
          <span class="badge bg-secondary mb-2">${safeDept}</span>
          <h5 class="fw-bold text-primary mb-1">${safeLine}</h5>
          <div class="text-muted small"><span class="material-symbols-rounded align-middle" style="font-size: 16px;">dns</span> ${t.has_machine} ${mCount} ${t.unit_machine}</div>
        </div>
        <div class="card-overlay">
          <h5 class="fw-bold text-warning mb-3">${safeLine}</h5>
          <div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">${t.view_machine} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span></span></div>
        </div></div></div>`;
    }
  }

  if (!hasResult)
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา</div>`;
}

function renderMachs(deptName, lineName) {
  let grid = document.getElementById("machGrid");
  grid.innerHTML = "";

  // 🔴 ป้องกัน Error กรณีที่แผนกหรือไลน์ไม่มีข้อมูลในฐานข้อมูล
  if (!dbData[deptName] || !dbData[deptName][lineName]) {
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">ยังไม่มีข้อมูลเครื่องจักรในไลน์นี้ กดปุ่ม + มุมขวาล่างเพื่อเพิ่มได้เลยครับ</div>`;
    return;
  }

  let line = dbData[deptName][lineName];
  const lang = getCurrentLang();
  const t = translations[lang];

  // 🔴 เช็คว่ามี object machines หรือไม่
  if (!line.machines || Object.keys(line.machines).length === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-muted p-5">ยังไม่มีข้อมูลเครื่องจักรในไลน์นี้ กดปุ่ม + มุมขวาล่างเพื่อเพิ่มได้เลยครับ</div>`;
    return;
  }

  for (let machName in line.machines) {
    let safeMachName = escapeHTML(machName);
    let sCount = line.machines[machName].subassemblies
      ? Object.keys(line.machines[machName].subassemblies).length
      : 0;
    let isUpcoming = hasUpcomingTasks(line.machines[machName], false);
    let highlightClass = isUpcoming ? "upcoming-task" : "";

    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card ${highlightClass}" onclick="navigateTo('${escapeHTML(deptName)}', '${escapeHTML(lineName)}', '${safeMachName}')">
      <img src="${line.machines[machName].image || "https://via.placeholder.com/400x200?text=No+Image"}" class="card-img-top">
      <div class="p-3">
        <h5 class="fw-bold text-dark mb-1">${safeMachName}</h5>
        <div class="text-muted small"><span class="material-symbols-rounded align-middle" style="font-size: 16px;">account_tree</span> ${t.has_sub} ${sCount} ${t.unit_sub}</div>
      </div>
      <div class="card-overlay">
        <h5 class="fw-bold text-warning mb-3">${safeMachName}</h5>
        <div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">${t.view_sub} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span></span></div>
      </div></div></div>`;
  }
}

function renderSubs(deptName, lineName, machName) {
  let grid = document.getElementById("subGrid");
  grid.innerHTML = "";
  let mach = dbData[deptName][lineName].machines[machName];
  if (!mach) return;
  const lang = getCurrentLang();
  const t = translations[lang];

  for (let subName in mach.subassemblies) {
    let safeSubName = escapeHTML(subName);
    let cCount = mach.subassemblies[subName].components.length;

    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${escapeHTML(deptName)}', '${escapeHTML(lineName)}', '${escapeHTML(machName)}', '${safeSubName}')">
      <img src="${mach.subassemblies[subName].image}" class="card-img-top">
      <div class="p-3">
        <h6 class="fw-bold text-dark mb-1">${safeSubName}</h6>
        <div class="text-muted small"><span class="material-symbols-rounded align-middle" style="font-size: 16px;">build</span> ${t.has_comp} ${cCount} ${t.unit_comp}</div>
      </div>
      <div class="card-overlay">
        <h6 class="fw-bold text-warning mb-3">${safeSubName}</h6>
        <div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">${t.view_comp} <span class="material-symbols-rounded align-middle ms-1" style="font-size: 16px;">arrow_forward</span></span></div>
      </div></div></div>`;
  }
}

function renderComponentTable() {
  let tbody = document.getElementById("componentTableBody");
  tbody.innerHTML = "";
  let comps =
    dbData[currentDept][currentLine].machines[currentMach].subassemblies[
      currentSub
    ].components;
  // ... (ฟังก์ชันตัวในตารางเหมือนเดิม ไม่ต้องเปลี่ยน)
  comps.forEach((c) => {
    let weeksHtml = "";
    c.weeks.forEach((w) => {
      weeksHtml += `<td class="text-center p-1">${getTriangleSVGOnly(w)}</td>`;
    });
    let safeName = escapeHTML(c.name);
    let safeTask = escapeHTML(c.task || "-");
    let safeRemark = escapeHTML(c.remarkEwo || "-");
    tbody.innerHTML += `<tr><td class="text-center"><i class="bi bi-image text-muted fs-3"></i></td><td class="fw-bold text-primary">${safeName}</td><td>${safeTask}</td><td class="text-center">${c.class || "-"}</td><td class="text-center">${c.std || "-"}</td><td class="text-center"><span class="badge bg-success">${c.stat || "Run"}</span></td><td class="text-center fw-bold text-danger">${c.time || "-"}</td><td class="text-center" style="font-size:10px;">${c.ppe || "-"}</td>${weeksHtml}<td class="text-muted fw-bold" style="font-size:11px; color:#E53E3E !important;">${safeRemark}</td></tr>`;
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

  // นำค่าไปใส่ในฟอร์ม (เวอร์ชันรองรับ Select + Custom)
  document.getElementById("f_department").value = deptName;

  let lineSelect = document.getElementById("f_lineSelect");
  let lineCustom = document.getElementById("f_lineCustom");

  // เช็คว่าชื่อไลน์ที่ Import มา มีอยู่ในตัวเลือกหรือเปล่า
  let optionExists = Array.from(lineSelect.options).some(
    (opt) => opt.value === lineName,
  );

  if (optionExists) {
    lineSelect.value = lineName;
    toggleCustomLineInput(); // สั่งซ่อนกล่อง
  } else if (lineName.toUpperCase().includes("MIX")) {
    lineSelect.value = "MIXING_CUSTOM";
    toggleCustomLineInput(); // สั่งเปิดกล่อง
    lineCustom.value = lineName;
  } else {
    lineSelect.value = "OTHER_CUSTOM";
    toggleCustomLineInput(); // สั่งเปิดกล่อง
    lineCustom.value = lineName;
  }

  document.getElementById("f_machineName").value = machName + " (Copy)";
  document.getElementById("subSystemsContainer").innerHTML = "";

  let [deptName, lineName, machName] = val.split("|");
  let machData = dbData[deptName][lineName].machines[machName];
  if (!machData) return;

  // นำค่าไปใส่ในฟอร์ม
  document.getElementById("f_department").value = deptName;
  document.getElementById("f_lineName").value = lineName;
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
      let val = chk.getAttribute("data-val");
      if (importedRisks.includes(val)) chk.classList.remove("not-used");
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

      let importedPPE = comp.ppe || "";
      compCard.querySelectorAll(".ppe-grid .icon-checkbox").forEach((chk) => {
        let val = chk.getAttribute("data-val");
        if (importedPPE.includes(val)) chk.classList.remove("not-used");
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
  document.getElementById("ledgerForm").reset();
  document.getElementById("subSystemsContainer").innerHTML = "";
  populateImportDropdown();
  toggleFabMode(true);

  // 🔴 อัปเดตการดึง ID ให้ตรงกับ HTML ตัวใหม่ (Dropdown แผนก และ ไลน์)
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

  if (cardStructure) cardStructure.style.display = "block";
  if (boxDept) boxDept.style.display = "block";
  if (boxLine) boxLine.style.display = "block";
  if (boxMach) boxMach.style.display = "block";
  if (boxImgMach) boxImgMach.style.display = "block";
  if (btnAddSub) btnAddSub.style.display = "block";

  // ปลดล็อกฟอร์มให้แก้ไขได้
  if (deptSelect) deptSelect.disabled = false;
  if (lineSelect) lineSelect.disabled = false;
  if (lineCustom) lineCustom.readOnly = false;
  if (mInput) mInput.readOnly = false;

  // รีเซ็ตซ่อนกล่อง Custom ไว้ก่อน
  if (lineCustom) lineCustom.classList.add("d-none");

  // 🔴 ตรรกะจัดการเวลาผู้ใช้กดปุ่ม + จากหน้าแผนก/ไลน์/เครื่องจักร (Context Aware)
  if (currentDept && currentLine && currentMach && currentSub) {
    cardStructure.style.display = "none";
    btnAddSub.style.display = "none";

    if (deptSelect) deptSelect.value = currentDept;
    autoSetLineDropdown(currentLine);
    mInput.value = currentMach;

    addSubsystemCard();
    let subCard = document.querySelector(".sub-system-card");
    subCard.querySelector(".input-subname").value = currentSub;
  } else if (currentDept && currentLine && currentMach) {
    cardStructure.style.display = "none";
    if (deptSelect) deptSelect.value = currentDept;
    autoSetLineDropdown(currentLine);
    mInput.value = currentMach;
    addSubsystemCard();
  } else if (currentDept && currentLine) {
    if (boxDept) boxDept.style.display = "none";
    boxLine.style.display = "none";
    if (deptSelect) deptSelect.value = currentDept;
    autoSetLineDropdown(currentLine);
    addSubsystemCard();
  } else {
    addSubsystemCard();
  }

  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-form").classList.add("active");
  window.scrollTo(0, 0);
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

// ================= 6. Submit API =================
function getBase64(imgElement) {
  if (imgElement && imgElement.src && imgElement.src.startsWith("data:image"))
    return imgElement.src;
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
    // ใช้ showModalConfirm แทน confirm ธรรมดาให้สวยงาม
    showModalConfirm(
      "กู้คืนแบบร่าง",
      `พบข้อมูลที่เคยพิมพ์ค้างไว้เมื่อ: ${draft.time}<br/>คุณต้องการกู้คืนมาแก้ไขต่อหรือไม่?`,
      () => {
        openAddFormContext();
        document.getElementById("f_department").value = draft.department || ""; // 🔴 เพิ่มบรรทัดนี้
        document.getElementById("f_lineName").value = draft.lineName || "";
        document.getElementById("f_machineName").value =
          draft.machineName || "";
        document.getElementById("f_updatedBy").value = draft.updatedBy || "";
      },
    );
  }
}

// อัปเดตฟังก์ชัน submitFormViaAPI ให้ใช้ showModalAlert แทน alert()
async function submitFormViaAPI() {
  if (!document.getElementById("ledgerForm").checkValidity()) {
    document.getElementById("ledgerForm").reportValidity();
    return;
  }

  // ดึงค่าไลน์แบบใหม่ (เช็คว่ากรอกเอง หรือ เลือกจาก Dropdown)
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

  // แจ้งยืนยัน
  if (
    !confirm(
      `ระบบกำลังจะบันทึกข้อมูลเครื่องจักร: ${f_mach}\nคุณตรวจสอบข้อมูลถูกต้องแล้วใช่หรือไม่?`,
    )
  )
    return;

  document.getElementById("loadingOverlay").style.display = "flex";

  let payload = {
    data: {
      department: document.getElementById("f_department").value, // 🔴 เพิ่มฟิลด์แผนก
      lineName: f_line,
      machineName: f_mach,
      updatedBy: document.getElementById("f_updatedBy").value.trim(),
      imgMachine: getBase64(
        document
          .getElementById("f_machineName")
          .closest(".card-std")
          ?.querySelector(".preview-img"),
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
      imgSub: getBase64(subCard.querySelector(".box_imgSub .preview-img")),
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
        status: pCard.querySelector(".input-status").value,
        stdTime: pCard.querySelector(".input-time").value,
        remarkEwo: pCard.querySelector(".input-remark").value,
        risk: pCard.querySelector(".input-risk").checked,
        ppe: ppeActive.join(", "),
        imgComp: getBase64(pCard.querySelector(".box_imgComp .preview-img")),
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
      // 🔴 เคลียร์แบบร่างทิ้งเมื่อบันทึกสำเร็จ
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
}

// ==========================================
// ระบบแปลภาษา (i18n: Internationalization)
// ==========================================

// 1. สร้างพจนานุกรมคำแปล (เพิ่มคำศัพท์สำหรับการ์ดเข้าไป)
const translations = {
  th: {
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

    // คำศัพท์สำหรับการ์ดหน้าแรก
    has_machine: "มี",
    unit_machine: "เครื่องจักร",
    view_machine: "ดูเครื่องจักร",
    has_sub: "มี",
    unit_sub: "ระบบย่อย",
    view_sub: "ดูระบบย่อย",
    has_comp: "มี",
    unit_comp: "ชิ้นส่วน",
    view_comp: "ดูตาราง Component",
    no_data: "ยังไม่มีข้อมูลในระบบ กดปุ่ม + เพื่อสร้างใหม่ได้เลยครับ",

    // ฟอร์มระบบย่อย (Subsystem)
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

    // ฟอร์ม Component
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

    // Modal 52 สัปดาห์
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

    // Modals (Alert / Cancel)
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
  },
  en: {
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

    // คำศัพท์สำหรับการ์ดหน้าแรก
    has_machine: "Contains",
    unit_machine: "Machines",
    view_machine: "View Machines",
    has_sub: "Contains",
    unit_sub: "Subassemblies",
    view_sub: "View Subassemblies",
    has_comp: "Contains",
    unit_comp: "Components",
    view_comp: "View Components Table",
    no_data: "No data available. Click + to create a new one.",

    // ฟอร์มระบบย่อย (Subsystem)
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

    // ฟอร์ม Component
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

    // Modal 52 สัปดาห์
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

    // Modals (Alert / Cancel)
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
