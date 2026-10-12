// 🔴 นำ Web App URL ของ Google Apps Script มาใส่ตรงนี้
const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbxRj_dahQfwuT4X8iTFF2-ds_9vo-GHVbvLDgxvOdW-r8UfYQ3F4uXtvN-MOuhHOu0Ngg/exec";
// 🔴 ลบ const API_KEY ออกไปแล้ว เพื่อความปลอดภัย

let dbData = {};
let currentLine = null;
let currentMach = null;
let currentSub = null;

// ================= 1. ดึงข้อมูลจากฐานข้อมูล =================
async function loadDataFromDatabase() {
  document.getElementById("loadingOverlay").style.display = "flex";
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // 🔴 แก้ไข: ไม่ต้องส่ง apiKey ในการดึงข้อมูล (ให้สิทธิ์ทุกคนเปิดดูหน้าเว็บได้)
      body: JSON.stringify({ action: "get_all_data" }),
    });
    const result = await res.json();
    if (result.success) {
      dbData = result.data;
      handleRouting();
    } else {
      console.error("API Error:", result.message);
      alert("โหลดข้อมูลล้มเหลว: " + result.message);
    }
  } catch (err) {
    console.error("API Error:", err);
  } finally {
    document.getElementById("loadingOverlay").style.display = "none";
  }
}

window.onload = () => {
  loadDataFromDatabase();
};

// ================= 2. Routing & Render =================
function navigateTo(line = null, mach = null, sub = null) {
  let url = new URL(window.location);
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
  currentLine = params.get("line");
  currentMach = params.get("mach");
  currentSub = params.get("sub");

  document
    .querySelectorAll(".view-section")
    .forEach((v) => v.classList.remove("active"));
  let breadcrumb = "Dashboard";
  toggleFabMode(false);

  if (Object.keys(dbData).length === 0) {
    document.getElementById("view-lines").classList.add("active");
    document.getElementById("lineGrid").innerHTML =
      `<div class="col-12 text-center text-muted p-5"><i class="bi bi-inbox fs-1 d-block mb-3"></i>ยังไม่มีข้อมูลในระบบ กดปุ่ม + เพื่อสร้างใหม่ได้เลยครับ</div>`;
    return;
  }

  if (currentLine && currentMach && currentSub) {
    document.getElementById("lbl-sub-title").innerText = currentSub;
    renderComponentTable();
    document.getElementById("view-components").classList.add("active");
    breadcrumb = `${currentLine} > ${currentMach} > ${currentSub}`;
  } else if (currentLine && currentMach) {
    document.getElementById("lbl-mach-title").innerText = currentMach;
    renderSubs(currentLine, currentMach);
    document.getElementById("view-subs").classList.add("active");
    breadcrumb = `${currentLine} > ${currentMach}`;
  } else if (currentLine) {
    document.getElementById("lbl-line-title").innerText = currentLine;
    renderMachs(currentLine);
    document.getElementById("view-machs").classList.add("active");
    breadcrumb = `${currentLine}`;
  } else {
    renderLines();
    document.getElementById("view-lines").classList.add("active");
  }

  document.getElementById("headerBreadcrumb").innerText = breadcrumb;
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", handleRouting);

function renderLines() {
  let grid = document.getElementById("lineGrid");
  grid.innerHTML = "";
  for (let lineName in dbData) {
    let safeLineName = escapeHTML(lineName); // ทำความสะอาดชื่อ
    let mCount = Object.keys(dbData[lineName].machines).length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${safeLineName}')"><img src="${dbData[lineName].image}" class="card-img-top"><div class="p-3"><h5 class="fw-bold text-primary mb-1">${safeLineName}</h5><div class="text-muted small"><i class="bi bi-hdd-rack"></i> มี ${mCount} เครื่องจักร</div></div><div class="card-overlay"><h5 class="fw-bold text-warning mb-3">${safeLineName}</h5><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูเครื่องจักร <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderMachs(lineName) {
  let grid = document.getElementById("machGrid");
  grid.innerHTML = "";
  let line = dbData[lineName];
  if (!line) return;
  for (let machName in line.machines) {
    let safeMachName = escapeHTML(machName);
    let sCount = Object.keys(line.machines[machName].subassemblies).length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${escapeHTML(lineName)}', '${safeMachName}')"><img src="${line.machines[machName].image}" class="card-img-top"><div class="p-3"><h5 class="fw-bold text-dark mb-1">${safeMachName}</h5><div class="text-muted small"><i class="bi bi-diagram-3"></i> มี ${sCount} ระบบย่อย</div></div><div class="card-overlay"><h5 class="fw-bold text-warning mb-3">${safeMachName}</h5><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูระบบย่อย <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderSubs(lineName, machName) {
  let grid = document.getElementById("subGrid");
  grid.innerHTML = "";
  let mach = dbData[lineName].machines[machName];
  if (!mach) return;
  for (let subName in mach.subassemblies) {
    let safeSubName = escapeHTML(subName);
    let cCount = mach.subassemblies[subName].components.length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${escapeHTML(lineName)}', '${escapeHTML(machName)}', '${safeSubName}')"><img src="${mach.subassemblies[subName].image}" class="card-img-top"><div class="p-3"><h6 class="fw-bold text-dark mb-1">${safeSubName}</h6><div class="text-muted small"><i class="bi bi-tools"></i> มี ${cCount} ชิ้นส่วน</div></div><div class="card-overlay"><h6 class="fw-bold text-warning mb-3">${safeSubName}</h6><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูตาราง Component <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderComponentTable() {
  let tbody = document.getElementById("componentTableBody");
  tbody.innerHTML = "";
  let comps =
    dbData[currentLine].machines[currentMach].subassemblies[currentSub]
      .components;
  comps.forEach((c) => {
    let weeksHtml = "";
    c.weeks.forEach((w) => {
      weeksHtml += `<td class="text-center p-1">${getTriangleSVGOnly(w)}</td>`;
    });

    // ทำความสะอาดข้อมูลที่จะลงตาราง
    let safeName = escapeHTML(c.name);
    let safeTask = escapeHTML(c.task || "-");
    let safeRemark = escapeHTML(c.remarkEwo || "-");

    tbody.innerHTML += `<tr><td class="text-center"><i class="bi bi-image text-muted fs-3"></i></td><td class="fw-bold text-primary">${safeName}</td><td>${safeTask}</td><td class="text-center">${c.class || "-"}</td><td class="text-center">${c.std || "-"}</td><td class="text-center"><span class="badge bg-success">${c.stat || "Run"}</span></td><td class="text-center fw-bold text-danger">${c.time || "-"}</td><td class="text-center" style="font-size:10px;">${c.ppe || "-"}</td>${weeksHtml}<td class="text-muted fw-bold" style="font-size:11px; color:#E53E3E !important;">${safeRemark}</td></tr>`;
  });
}

// ================= 3. ระบบอัจฉริยะ (FAB / Copy / Drag & Drop / Import) =================

function toggleFabMode(isFormMode) {
  let fabBtn = document.getElementById("mainFabBtn");
  let fabIcon = document.getElementById("mainFabIcon");
  if (!fabBtn) return;
  if (isFormMode) {
    fabBtn.classList.remove("btn-primary");
    fabBtn.classList.add("btn-success");
    fabIcon.className = "bi bi-floppy-fill fs-4";
    fabBtn.onclick = submitFormViaAPI;
  } else {
    fabBtn.classList.add("btn-primary");
    fabBtn.classList.remove("btn-success");
    fabIcon.className = "bi bi-plus-lg fs-4";
    fabBtn.onclick = openAddFormContext;
  }
}

function populateImportDropdown() {
  let select = document.getElementById("importDbSelect");
  if (!select) return; // 🔴 แก้ไข: ถ้าหาหน้าต่าง Import ไม่เจอ ให้ข้ามไปเลย ไม่ต้องพัง

  select.innerHTML =
    '<option value="">-- เลือกเครื่องจักรจากระบบเพื่อคัดลอก (Template) --</option>';
  for (let lineName in dbData) {
    for (let machName in dbData[lineName].machines) {
      select.innerHTML += `<option value="${lineName}|${machName}">[${lineName}] - ${machName}</option>`;
    }
  }
}

function executeImportData() {
  let val = document.getElementById("importDbSelect").value;
  if (!val) {
    alert("กรุณาเลือกเครื่องจักรที่ต้องการคัดลอกครับ");
    return;
  }

  let [lineName, machName] = val.split("|");
  let machData = dbData[lineName].machines[machName];
  if (!machData) return;

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

    // 🔴 แก้ไข: เซ็ตค่า Risk ให้ตรงกับแบบรูปภาพ
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

      // 🔴 แก้ไข: เซ็ตค่า PPE ให้ตรงกับแบบรูปภาพ
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
  alert(`ดึงข้อมูลโครงสร้างของเครื่อง ${machName} สำเร็จ!`);
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

  // 🔴 แก้ไข: คัดลอกสถานะของไอคอนรูปภาพ PPE/Risk ด้วย
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
function previewDynamicFile(input) {
  if (input.files && input.files[0]) {
    let reader = new FileReader();
    reader.onload = function (e) {
      let preview = input.nextElementSibling;
      preview.src = e.target.result;
      preview.style.display = "block";
      input.previousElementSibling.style.display = "none";
    };
    reader.readAsDataURL(input.files[0]);
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
}

function openAddFormContext() {
  document.getElementById("ledgerForm").reset();
  document.getElementById("subSystemsContainer").innerHTML = "";
  populateImportDropdown();
  toggleFabMode(true);

  let lInput = document.getElementById("f_lineName");
  let mInput = document.getElementById("f_machineName");
  let boxLine = document.getElementById("box_f_lineName");
  let boxMach = document.getElementById("box_f_machineName");
  let boxImgMach = document.getElementById("box_imgMach");
  let cardStructure = document.getElementById("cardStructure");
  let btnAddSub = document.getElementById("btnAddSub");

  cardStructure.style.display = "block";
  boxLine.style.display = "block";
  lInput.readOnly = false;
  boxMach.style.display = "block";
  mInput.readOnly = false;
  boxImgMach.style.display = "block";
  btnAddSub.style.display = "block";

  if (currentLine && currentMach && currentSub) {
    cardStructure.style.display = "none";
    btnAddSub.style.display = "none";
    lInput.value = currentLine;
    mInput.value = currentMach;
    addSubsystemCard();
    let subCard = document.querySelector(".sub-system-card");
    subCard.querySelector(".input-subname").value = currentSub;
    subCard.querySelector("#subHeaderRow").style.display = "none";
  } else if (currentLine && currentMach) {
    cardStructure.style.display = "none";
    lInput.value = currentLine;
    mInput.value = currentMach;
    addSubsystemCard();
  } else if (currentLine) {
    boxLine.style.display = "none";
    lInput.value = currentLine;
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

// ================= 5. 4-Triangle Calendar (Smart UI) =================
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
  // 🔴 UX เด็ดๆ: พอกดรูปภาพปุ๊บ ให้เอาเมาส์ไปกระพริบรอที่ช่องใส่ตัวเลขสัปดาห์เลย!
  document.getElementById("inputWeeks").focus();
}

function openWeekModal(compactGridElement) {
  currentCompactGrid = compactGridElement;
  currentWeekInput = compactGridElement.nextElementSibling;

  try {
    let loadedData = JSON.parse(currentWeekInput.value);
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
  document.getElementById("inputRemark").value = "";
  updatePreviewAndList();
  new bootstrap.Modal(document.getElementById("weekModal")).show();
}

function updatePreviewAndList() {
  let grid = document.getElementById("weekPreviewGrid");
  let remarksContainer = document.getElementById("weekRemarksSummary");
  let entriesList = document.getElementById("planEntriesList");

  grid.innerHTML = "";
  remarksContainer.innerHTML = "";
  let hasRemarks = false;
  let activePlans = [];

  for (let i = 0; i < 52; i++) {
    let d = tempWeekData[i];
    grid.innerHTML += `<div class="preview-box">W${i + 1}${getTriangleSVGOnly(d)}</div>`;

    let safeRemark = escapeHTML(d.remark); // ทำความสะอาดหมายเหตุ

    if (safeRemark && safeRemark.trim() !== "") {
      hasRemarks = true;
      remarksContainer.innerHTML += `<div class="mb-1"><strong>W${i + 1}:</strong> ${safeRemark}</div>`;
    }

    let colors = [];
    if (d.t) colors.push('<i class="bi bi-circle-fill text-dark"></i>');
    if (d.b) colors.push('<i class="bi bi-circle-fill text-warning"></i>');
    if (d.l) colors.push('<i class="bi bi-circle-fill text-primary"></i>');
    if (d.r) colors.push('<i class="bi bi-circle-fill text-danger"></i>');

    if (colors.length > 0)
      activePlans.push({
        week: i + 1,
        colors: colors.join(" "),
        remark: safeRemark,
      });
  }

  if (!hasRemarks)
    remarksContainer.innerHTML =
      '<span class="text-muted fst-italic">ไม่มีหมายเหตุ</span>';

  entriesList.innerHTML = "";
  if (activePlans.length === 0) {
    entriesList.innerHTML =
      '<div class="text-center text-muted small p-3 bg-white border rounded">ยังไม่มีข้อมูล</div>';
  } else {
    activePlans.forEach((plan) => {
      entriesList.innerHTML += `
        <div class="plan-entry-card p-2 border rounded shadow-sm mb-2" style="border-left: 4px solid #005EB8; background-color: #f8fafc;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <strong class="text-primary small">W${plan.week}</strong>
            <div>${plan.colors}</div>
          </div>
          ${plan.remark ? `<div class="small text-muted text-truncate" style="font-size:11px;">📝 ${plan.remark}</div>` : ""}
          <div class="text-end mt-1">
             <button class="btn btn-sm text-danger p-0 border-0" onclick="removePlanWeek(${plan.week - 1})"><i class="bi bi-x-circle"></i> ลบข้อมูล W${plan.week}</button>
          </div>
        </div>`;
    });
  }
}

function parseWeeks(inputStr) {
  let weeks = new Set();
  let parts = inputStr.split(",");
  for (let part of parts) {
    part = part.trim();
    if (part.includes("-")) {
      let range = part.split("-");
      let start = parseInt(range[0]);
      let end = parseInt(range[1]);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let w = start; w <= end; w++)
          if (w >= 1 && w <= 52) weeks.add(w - 1);
      }
    } else {
      let w = parseInt(part);
      if (!isNaN(w) && w >= 1 && w <= 52) weeks.add(w - 1);
    }
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

function addPlanEntry() {
  if (
    !smartColorState.t &&
    !smartColorState.b &&
    !smartColorState.l &&
    !smartColorState.r
  ) {
    alert("กรุณาแตะเลือกประเภทงาน (สี) ที่รูปสามเหลี่ยมอย่างน้อย 1 ข้อครับ");
    return;
  }
  let targetWeeksIndex = parseWeeks(
    document.getElementById("inputWeeks").value,
  );
  if (targetWeeksIndex.length === 0) {
    alert("กรุณาระบุสัปดาห์ให้ถูกต้อง (1-52)");
    return;
  }

  let remark = document.getElementById("inputRemark").value.trim();
  targetWeeksIndex.forEach((idx) => {
    if (smartColorState.t) tempWeekData[idx].t = 1;
    if (smartColorState.b) tempWeekData[idx].b = 1;
    if (smartColorState.l) tempWeekData[idx].l = 1;
    if (smartColorState.r) tempWeekData[idx].r = 1;
    if (remark)
      tempWeekData[idx].remark = tempWeekData[idx].remark
        ? tempWeekData[idx].remark + " / " + remark
        : remark;
  });

  document.getElementById("inputWeeks").value = "";
  document.getElementById("inputRemark").value = "";
  resetSmartColorSelector();
  updatePreviewAndList();
}

function removePlanWeek(idx) {
  tempWeekData[idx] = { t: 0, r: 0, b: 0, l: 0, remark: "" };
  updatePreviewAndList();
}

function clearAllPlans() {
  if (
    confirm("ยืนยันที่จะล้างข้อมูล 52 สัปดาห์ทั้งหมดของชิ้นส่วนนี้หรือไม่?")
  ) {
    tempWeekData = Array(52)
      .fill()
      .map(() => ({ t: 0, r: 0, b: 0, l: 0, remark: "" }));
    updatePreviewAndList();
  }
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

async function submitFormViaAPI() {
  if (!document.getElementById("ledgerForm").checkValidity()) {
    document.getElementById("ledgerForm").reportValidity();
    return;
  }
  
  // 🔴 1. เด้งหน้าต่างถามรหัสผ่านจากผู้ใช้งาน
  let userPassword = prompt("🔒 กรุณากรอกรหัสผ่านเพื่อยืนยันการบันทึกข้อมูล:");
  
  // 🔴 2. เช็คว่าถ้ากดยกเลิก หรือไม่พิมพ์รหัสผ่าน ให้หยุดการทำงานทันที
  if (userPassword === null || userPassword.trim() === "") {
    alert("❌ ยกเลิกการบันทึกข้อมูล (ไม่มีรหัสผ่าน)");
    return; 
  }

  document.getElementById("loadingOverlay").style.display = "flex";

  let payload = {
    apiKey: userPassword.trim(), // 🔴 3. แนบรหัสผ่านที่ผู้ใช้เพิ่งพิมพ์ ส่งไปให้หลังบ้านตรวจสอบ
    action: "save_ledger",
    data: {
      lineName: document.getElementById("f_lineName").value,
      machineName: document.getElementById("f_machineName").value,
      updatedBy: document.getElementById("f_updatedBy").value,
      imgMachine: getBase64(
        document
          .getElementById("f_machineName")
          .closest(".card-std")
          ?.querySelector(".preview-img"),
      ),
      subSystems: [],
    },
  };

  document.querySelectorAll(".sub-system-card").forEach((subCard) => {
    // 🔴 แก้ไข: ดึงข้อมูล Risk แบบรูปภาพ
    let riskActive = [];
    subCard
      .querySelectorAll(".risk-grid .icon-checkbox:not(.not-used)")
      .forEach((chk) => {
        riskActive.push(chk.getAttribute("data-val"));
      });

    let subData = {
      subName: subCard.querySelector(".input-subname").value,
      imgSub: getBase64(subCard.querySelector(".box_imgSub .preview-img")),
      risks: riskActive.join(", "),
      components: [],
    };

    subCard.querySelectorAll(".part-item").forEach((pCard) => {
      // 🔴 แก้ไข: ดึงข้อมูล PPE แบบรูปภาพ
      let ppeActive = [];
      pCard
        .querySelectorAll(".ppe-grid .icon-checkbox:not(.not-used)")
        .forEach((chk) => {
          ppeActive.push(chk.getAttribute("data-val"));
        });

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
        weeks: JSON.parse(pCard.querySelector(".week-data-input").value),
      });
    });
    payload.data.subSystems.push(subData);
  });

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ บันทึกข้อมูลสำเร็จ!");
      await loadDataFromDatabase();
      window.history.back();
    } else {
      alert("❌ เกิดข้อผิดพลาด: " + result.message);
    }
  } catch (error) {
    alert("❌ Error: เชื่อมต่อ API ไม่สำเร็จ");
  } finally {
    document.getElementById("loadingOverlay").style.display = "none";
  }
}
