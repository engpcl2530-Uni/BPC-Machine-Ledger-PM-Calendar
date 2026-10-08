// 🔴 นำ Web App URL ของ Google Apps Script ของคุณมาใส่ตรงนี้
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyaFFS-_FgA5uMfU1dsS_1C4ab0bTVU_StMZOeXU1fx3JQroONG5047l2QuMYItuCJO9A/exec"; 

// Mock Data
let dbData = {
  "Machine A1": {
    image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=80", machineCount: 1,
    subassemblies: {
      "Conveyor": { image: "https://images.unsplash.com/photo-1563248386-35eb05cc092b?w=400&q=80", components: [{name:"Belt Roll", time:30}] }
    }
  }
};

let currentLine = null;
let currentSub = null;

// ================= 1. Routing & Render =================
function navigateTo(line = null, sub = null) {
  let url = new URL(window.location);
  if (line) url.searchParams.set('line', line); else url.searchParams.delete('line');
  if (sub) url.searchParams.set('sub', sub); else url.searchParams.delete('sub');
  window.history.pushState({}, '', url);
  handleRouting();
}

function handleRouting() {
  let params = new URLSearchParams(window.location.search);
  currentLine = params.get('line');
  currentSub = params.get('sub');

  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  let breadcrumb = "Dashboard";

  if (currentLine && currentSub) {
    document.getElementById('lbl-sub-title').innerText = currentSub;
    renderComponentTable();
    document.getElementById('view-components').classList.add('active');
    breadcrumb = `${currentLine} > ${currentSub}`;
  } else if (currentLine) {
    document.getElementById('lbl-line-title').innerText = currentLine;
    renderSubs(currentLine);
    document.getElementById('view-subs').classList.add('active');
    breadcrumb = `${currentLine}`;
  } else {
    renderLines();
    document.getElementById('view-lines').classList.add('active');
  }
  document.getElementById('headerBreadcrumb').innerText = breadcrumb;
  window.scrollTo(0,0);
}
window.addEventListener('popstate', handleRouting);

function renderLines() {
  let grid = document.getElementById('lineGrid');
  grid.innerHTML = '';
  for (let lineName in dbData) {
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${lineName}')"><img src="${dbData[lineName].image}" class="card-img-top"><div class="p-3"><h5 class="fw-bold text-primary mb-1">${lineName}</h5></div><div class="card-overlay"><h5 class="fw-bold text-warning mb-3">${lineName}</h5><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">เข้าสู่ Machine นี้ <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderSubs(lineName) {
  let grid = document.getElementById('subGrid');
  grid.innerHTML = '';
  let line = dbData[lineName];
  if (!line) return;
  for (let subName in line.subassemblies) {
    let sub = line.subassemblies[subName];
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${lineName}', '${subName}')"><img src="${sub.image}" class="card-img-top"><div class="p-3"><h6 class="fw-bold text-dark mb-1">${subName}</h6></div><div class="card-overlay"><h6 class="fw-bold text-warning mb-3">${subName}</h6><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดู Component <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderComponentTable() {
  let tbody = document.getElementById('componentTableBody');
  tbody.innerHTML = '';
  let comps = dbData[currentLine].subassemblies[currentSub].components;
  comps.forEach(c => {
    let weeksHtml = "";
    for(let w=1; w<=52; w++) { weeksHtml += `<td class="text-center p-1">${getTriangleSVGOnly({t:w%4===0?1:0, r:0, b:0, l:0})}</td>`; }
    tbody.innerHTML += `<tr><td class="text-center"><i class="bi bi-image text-muted fs-3"></i></td><td class="fw-bold text-primary">${c.name}</td><td>Inspect</td><td class="text-center">A</td><td class="text-center">CBM</td><td class="text-center">Run</td><td class="text-center fw-bold">${c.time}</td><td class="text-center" style="font-size:10px;">PPE</td>${weeksHtml}</tr>`;
  });
}

// ================= 2. Form Logic (CMMS Hierarchy) =================
function previewDynamicFile(input) {
  if (input.files && input.files[0]) {
    let reader = new FileReader();
    reader.onload = function(e) {
      let preview = input.nextElementSibling;
      preview.src = e.target.result;
      preview.style.display = 'block';
      input.previousElementSibling.style.display = 'none'; // ซ่อน Upload Box
    }
    reader.readAsDataURL(input.files[0]);
  }
}

function addSubsystemCard() {
  const container = document.getElementById('subSystemsContainer');
  const clone = document.getElementById('subSystemTemplate').content.cloneNode(true);
  container.appendChild(clone);
  addComponentCard(container.lastElementChild.querySelector('.btn-success')); // แถม 1 part อัตโนมัติ
}

function addComponentCard(btn) {
  const container = btn.closest('.sub-system-card').querySelector('.parts-container');
  const clone = document.getElementById('componentTemplate').content.cloneNode(true);
  
  let defaultData = [];
  for(let i=0; i<52; i++) defaultData.push({t:0, r:0, b:0, l:0});
  clone.querySelector('.week-data-input').value = JSON.stringify(defaultData);
  
  renderCompactGrid(clone.querySelector('.week-compact-grid'), defaultData);
  container.appendChild(clone);
}

// ================= 3. Context Aware Add Form =================
function openAddFormContext() {
  document.getElementById('ledgerForm').reset();
  document.getElementById('subSystemsContainer').innerHTML = ''; // ล้างกรุ๊ปเก่า
  
  let mInput = document.getElementById('f_machineName');
  let btnAddSub = document.getElementById('btnAddSub');
  let boxMach = document.getElementById('box_imgMach');

  if (currentLine && currentSub) {
    // 3.1 อยู่หน้า Components (ลึกสุด) -> ล็อก Machine & Sub ให้เติมแค่ Component
    mInput.value = currentLine; mInput.readOnly = true; boxMach.style.display = 'none';
    btnAddSub.style.display = 'none';
    
    // สร้าง 1 Subassembly ล็อกชื่อไว้ และซ่อนรูป Sub
    addSubsystemCard();
    let subCard = document.querySelector('.sub-system-card');
    subCard.querySelector('.input-subname').value = currentSub;
    subCard.querySelector('.input-subname').readOnly = true;
    subCard.querySelector('.box_imgSub').style.display = 'none';
    subCard.querySelector('.btn-remove-sub').style.display = 'none';

  } else if (currentLine) {
    // 3.2 อยู่หน้า Subassembly -> ล็อก Machine ให้เติม Sub + Component ได้
    mInput.value = currentLine; mInput.readOnly = true; boxMach.style.display = 'none';
    btnAddSub.style.display = 'block';
    addSubsystemCard();

  } else {
    // 3.3 อยู่หน้าแรกสุด -> เปิดอิสระ เติม Machine + Sub + Component
    mInput.readOnly = false; boxMach.style.display = 'block';
    btnAddSub.style.display = 'block';
    addSubsystemCard();
  }

  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.getElementById('view-form').classList.add('active');
  window.scrollTo(0,0);
}

// ================= 4. 4-Triangle Calendar =================
let currentCompactGrid = null; 
let tempWeekData = [];

function getTriangleSVGOnly(d) {
  return `<svg viewBox="0 0 20 20" width="100%" height="100%"><polygon class="tri-part tri-top ${d.t?'active':'inactive'}" points="0,0 20,0 10,10"/><polygon class="tri-part tri-right ${d.r?'active':'inactive'}" points="20,0 20,20 10,10"/><polygon class="tri-part tri-bottom ${d.b?'active':'inactive'}" points="20,20 0,20 10,10"/><polygon class="tri-part tri-left ${d.l?'active':'inactive'}" points="0,20 0,0 10,10"/></svg>`;
}

function renderCompactGrid(container, dataArray) {
  container.innerHTML = '';
  dataArray.forEach(d => { container.innerHTML += getTriangleSVGOnly(d); });
}

function openWeekModal(compactGridElement) {
  currentCompactGrid = compactGridElement;
  tempWeekData = JSON.parse(compactGridElement.nextElementSibling.value);
  
  let grid = document.getElementById('expandedWeekGrid');
  grid.innerHTML = '';
  for(let i=0; i<52; i++) {
    let d = tempWeekData[i];
    grid.innerHTML += `<div class="week-expand-box">W${i+1}<div class="week-svg-container"><svg viewBox="0 0 20 20" width="100%" height="100%"><polygon class="tri-part tri-top ${d.t?'active':''}" points="0,0 20,0 10,10" onclick="toggleTri(${i},'t',this)"/><polygon class="tri-part tri-right ${d.r?'active':''}" points="20,0 20,20 10,10" onclick="toggleTri(${i},'r',this)"/><polygon class="tri-part tri-bottom ${d.b?'active':''}" points="20,20 0,20 10,10" onclick="toggleTri(${i},'b',this)"/><polygon class="tri-part tri-left ${d.l?'active':''}" points="0,20 0,0 10,10" onclick="toggleTri(${i},'l',this)"/></svg></div></div>`;
  }
  new bootstrap.Modal(document.getElementById('weekModal')).show();
}

function toggleTri(index, side, el) {
  tempWeekData[index][side] = tempWeekData[index][side] ? 0 : 1;
  el.classList.toggle('active');
}

function syncModalToCompact() {
  if (currentCompactGrid) {
    currentCompactGrid.nextElementSibling.value = JSON.stringify(tempWeekData);
    renderCompactGrid(currentCompactGrid, tempWeekData);
  }
  bootstrap.Modal.getInstance(document.getElementById('weekModal')).hide();
}

// ================= 5. Submit to Google Apps Script =================
function getBase64(imgElement) {
  if(imgElement && imgElement.src && imgElement.src.startsWith('data:image')) return imgElement.src;
  return "";
}

async function submitFormViaAPI() {
  if(!document.getElementById('ledgerForm').checkValidity()) { document.getElementById('ledgerForm').reportValidity(); return; }

  document.getElementById('loadingOverlay').style.display = 'flex';

  let payload = {
    machineName: document.getElementById('f_machineName').value,
    imgMachine: getBase64(document.getElementById('f_machineName').closest('.card-std').querySelector('.preview-img')),
    subSystems: []
  };

  document.querySelectorAll('.sub-system-card').forEach(subCard => {
    let subData = {
      subName: subCard.querySelector('.input-subname').value,
      imgSub: getBase64(subCard.querySelector('.box_imgSub .preview-img')),
      components: []
    };

    subCard.querySelectorAll('.part-item').forEach(pCard => {
      let ppeActive = []; pCard.querySelectorAll('.ppe-item.active').forEach(el => ppeActive.push(el.innerText));
      subData.components.push({
        compName: pCard.querySelector('.input-compname').value,
        task: pCard.querySelector('.input-task').value,
        spareClass: pCard.querySelector('.input-class').value,
        pmStd: pCard.querySelector('.input-pmstd').value,
        status: pCard.querySelector('.input-status').value,
        stdTime: pCard.querySelector('.input-time').value,
        risk: pCard.querySelector('.input-risk').checked,
        ppe: ppeActive.join(', '),
        imgComp: getBase64(pCard.querySelector('.box_imgComp .preview-img')),
        weeks: JSON.parse(pCard.querySelector('.week-data-input').value)
      });
    });
    payload.subSystems.push(subData);
  });

  try {
    const res = await fetch(GAS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    const result = await res.json();
    if(result.success) { alert("✅ บันทึกข้อมูลสำเร็จ!"); window.history.back(); } 
    else { alert("❌ เกิดข้อผิดพลาด: " + result.message); }
  } catch (error) { alert("❌ Error: เชื่อมต่อ API ไม่สำเร็จ"); } 
  finally { document.getElementById('loadingOverlay').style.display = 'none'; }
}

window.onload = () => { handleRouting(); };
