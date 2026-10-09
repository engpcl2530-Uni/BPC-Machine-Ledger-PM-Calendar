// 🔴 นำ Web App URL ของ Google Apps Script ของคุณมาใส่ตรงนี้
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxRj_dahQfwuT4X8iTFF2-ds_9vo-GHVbvLDgxvOdW-r8UfYQ3F4uXtvN-MOuhHOu0Ngg/exec"; 

// =========================================================
// โครงสร้างฐานข้อมูลจำลอง (Line -> Machine -> Subassembly -> Component)
// =========================================================
let dbData = {
  "Line A1 (Packing)": {
    image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=80",
    machines: {
      "FILLER-01": {
        image: "https://images.unsplash.com/photo-1537724326059-2ea20251b9c8?w=400&q=80",
        subassemblies: {
          "Conveyor System": { 
            image: "https://images.unsplash.com/photo-1563248386-35eb05cc092b?w=400&q=80", 
            components: [{name: "Belt Roll", time: 30}, {name: "Main Motor", time: 45}] 
          },
          "Hydraulic Unit": { 
            image: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=400&q=80", 
            components: [{name: "Main Pump", time: 60}] 
          }
        }
      },
      "PACKER-02": {
        image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&q=80",
        subassemblies: {
          "Sealing Station": { 
            image: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&q=80", 
            components: [{name: "Heater Block", time: 15}] 
          }
        }
      }
    }
  },
  "MIX#1": {
    image: "https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=400&q=80",
    machines: {
      "MIXER-01": {
        image: "https://images.unsplash.com/photo-1563248386-35eb05cc092b?w=400&q=80",
        subassemblies: {
          "Agitator Shaft": { 
            image: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=400&q=80", 
            components: [{name: "Mechanical Seal", time: 120}] 
          }
        }
      }
    }
  }
};

let currentLine = null;
let currentMach = null;
let currentSub = null;

// ================= 1. Routing & Render (ระบบเปลี่ยนหน้า) =================
function navigateTo(line = null, mach = null, sub = null) {
  let url = new URL(window.location);
  if (line) url.searchParams.set('line', line); else url.searchParams.delete('line');
  if (mach) url.searchParams.set('mach', mach); else url.searchParams.delete('mach');
  if (sub) url.searchParams.set('sub', sub); else url.searchParams.delete('sub');
  window.history.pushState({}, '', url);
  handleRouting();
}

function handleRouting() {
  let params = new URLSearchParams(window.location.search);
  currentLine = params.get('line');
  currentMach = params.get('mach');
  currentSub = params.get('sub');

  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  let breadcrumb = "Dashboard";

  if (currentLine && currentMach && currentSub) {
    // ระดับ 4: โชว์ตาราง Component
    document.getElementById('lbl-sub-title').innerText = currentSub;
    renderComponentTable();
    document.getElementById('view-components').classList.add('active');
    breadcrumb = `${currentLine} > ${currentMach} > ${currentSub}`;
  } else if (currentLine && currentMach) {
    // ระดับ 3: โชว์ Subassemblies
    document.getElementById('lbl-mach-title').innerText = currentMach;
    renderSubs(currentLine, currentMach);
    document.getElementById('view-subs').classList.add('active');
    breadcrumb = `${currentLine} > ${currentMach}`;
  } else if (currentLine) {
    // ระดับ 2: โชว์ Machines
    document.getElementById('lbl-line-title').innerText = currentLine;
    renderMachs(currentLine);
    document.getElementById('view-machs').classList.add('active');
    breadcrumb = `${currentLine}`;
  } else {
    // ระดับ 1: โชว์ Lines (หน้าแรกสุด)
    renderLines();
    document.getElementById('view-lines').classList.add('active');
  }
  
  document.getElementById('headerBreadcrumb').innerText = breadcrumb;
  window.scrollTo(0,0);
}
window.addEventListener('popstate', handleRouting); // ดักจับเวลากดปุ่ม Back/Forward บนเบราว์เซอร์

function renderLines() {
  let grid = document.getElementById('lineGrid');
  grid.innerHTML = '';
  for (let lineName in dbData) {
    let mCount = Object.keys(dbData[lineName].machines).length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${lineName}')"><img src="${dbData[lineName].image}" class="card-img-top"><div class="p-3"><h5 class="fw-bold text-primary mb-1">${lineName}</h5><div class="text-muted small"><i class="bi bi-hdd-rack"></i> มี ${mCount} เครื่องจักร</div></div><div class="card-overlay"><h5 class="fw-bold text-warning mb-3">${lineName}</h5><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูเครื่องจักรในไลน์นี้ <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderMachs(lineName) {
  let grid = document.getElementById('machGrid');
  grid.innerHTML = '';
  let line = dbData[lineName];
  if (!line) return;
  for (let machName in line.machines) {
    let sCount = Object.keys(line.machines[machName].subassemblies).length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${lineName}', '${machName}')"><img src="${line.machines[machName].image}" class="card-img-top"><div class="p-3"><h5 class="fw-bold text-dark mb-1">${machName}</h5><div class="text-muted small"><i class="bi bi-diagram-3"></i> มี ${sCount} ระบบย่อย</div></div><div class="card-overlay"><h5 class="fw-bold text-warning mb-3">${machName}</h5><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูระบบย่อย (Subassembly) <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderSubs(lineName, machName) {
  let grid = document.getElementById('subGrid');
  grid.innerHTML = '';
  let mach = dbData[lineName].machines[machName];
  if (!mach) return;
  for (let subName in mach.subassemblies) {
    let cCount = mach.subassemblies[subName].components.length;
    grid.innerHTML += `<div class="col-md-6 col-lg-4"><div class="hover-card" onclick="navigateTo('${lineName}', '${machName}', '${subName}')"><img src="${mach.subassemblies[subName].image}" class="card-img-top"><div class="p-3"><h6 class="fw-bold text-dark mb-1">${subName}</h6><div class="text-muted small"><i class="bi bi-tools"></i> มี ${cCount} ชิ้นส่วน</div></div><div class="card-overlay"><h6 class="fw-bold text-warning mb-3">${subName}</h6><div class="mt-auto text-center w-100"><span class="badge bg-light text-primary py-2 px-3 w-100 rounded-pill shadow-sm">ดูตาราง Component <i class="bi bi-arrow-right-circle-fill ms-1"></i></span></div></div></div></div>`;
  }
}

function renderComponentTable() {
  let tbody = document.getElementById('componentTableBody');
  tbody.innerHTML = '';
  let comps = dbData[currentLine].machines[currentMach].subassemblies[currentSub].components;
  comps.forEach(c => {
    let weeksHtml = "";
    for(let w=1; w<=52; w++) { weeksHtml += `<td class="text-center p-1">${getTriangleSVGOnly({t:w%4===0?1:0, r:0, b:0, l:0})}</td>`; }
    tbody.innerHTML += `<tr><td class="text-center"><i class="bi bi-image text-muted fs-3"></i></td><td class="fw-bold text-primary">${c.name}</td><td>Inspect Condition</td><td class="text-center">A</td><td class="text-center">CBM</td><td class="text-center">Run</td><td class="text-center fw-bold">${c.time}</td><td class="text-center" style="font-size:10px;">ถุงมือ</td>${weeksHtml}<td class="text-muted" style="font-size:11px;">-</td></tr>`;
  });
}

// 🔴 ระบบแก้ไขข้อมูล
function editSubassembly() {
  openAddFormContext(); 
}

// ================= 2. Context Aware Form (ฟอร์มอัจฉริยะ) =================
function previewDynamicFile(input) {
  if (input.files && input.files[0]) {
    let reader = new FileReader();
    reader.onload = function(e) {
      let preview = input.nextElementSibling;
      preview.src = e.target.result;
      preview.style.display = 'block';
      input.previousElementSibling.style.display = 'none'; 
    }
    reader.readAsDataURL(input.files[0]);
  }
}

function addSubsystemCard() {
  const container = document.getElementById('subSystemsContainer');
  const clone = document.getElementById('subSystemTemplate').content.cloneNode(true);
  container.appendChild(clone);
  addComponentCard(container.lastElementChild.querySelector('.btn-success')); 
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

// ล็อกฟอร์มขึ้นอยู่กับว่ากดมาจากหน้าไหน
function openAddFormContext() {
  document.getElementById('ledgerForm').reset();
  document.getElementById('subSystemsContainer').innerHTML = ''; 
  
  let lInput = document.getElementById('f_lineName');
  let mInput = document.getElementById('f_machineName');
  
  let boxLine = document.getElementById('box_f_lineName');
  let boxMach = document.getElementById('box_f_machineName');
  let boxImgMach = document.getElementById('box_imgMach');
  
  let cardStructure = document.getElementById('cardStructure');
  let btnAddSub = document.getElementById('btnAddSub');
  
  let contextBanner = document.getElementById('formContextBanner');
  let contextText = document.getElementById('formContextText');

  // ค่าเริ่มต้น -> โชว์ทุกช่อง
  cardStructure.style.display = 'block';
  boxLine.style.display = 'block'; lInput.readOnly = false;
  boxMach.style.display = 'block'; mInput.readOnly = false;
  boxImgMach.style.display = 'block';
  btnAddSub.style.display = 'block';
  contextBanner.classList.add('d-none');

  if (currentLine && currentMach && currentSub) {
    // 🔴 1. อยู่หน้าลึกสุด (Component) -> ให้เติมแค่ Component (ล็อก 3 ชั้น)
    cardStructure.style.display = 'none'; 
    btnAddSub.style.display = 'none';
    
    contextBanner.classList.remove('d-none');
    contextText.innerText = `${currentLine} > ${currentMach} > ${currentSub}`;
    
    lInput.value = currentLine;
    mInput.value = currentMach;
    
    addSubsystemCard();
    let subCard = document.querySelector('.sub-system-card');
    subCard.querySelector('.input-subname').value = currentSub;
    subCard.querySelector('#subHeaderRow').style.display = 'none'; 
    subCard.querySelector('.btn-remove-sub').style.display = 'none';

  } else if (currentLine && currentMach) {
    // 🔴 2. อยู่หน้า Subassembly -> ให้เติม Subassembly + Component (ล็อก 2 ชั้น)
    cardStructure.style.display = 'none'; 
    
    contextBanner.classList.remove('d-none');
    contextText.innerText = `เพิ่มระบบย่อยใน: ${currentLine} > ${currentMach}`;
    
    lInput.value = currentLine;
    mInput.value = currentMach;
    addSubsystemCard();

  } else if (currentLine) {
    // 🔴 3. อยู่หน้า Machine -> ให้เติม Machine + Sub + Comp (ล็อก 1 ชั้น)
    boxLine.style.display = 'none';
    lInput.value = currentLine;
    
    contextBanner.classList.remove('d-none');
    contextText.innerText = `เพิ่มเครื่องจักรในไลน์: ${currentLine}`;
    addSubsystemCard();
    
  } else {
    // 🔴 4. อยู่หน้าแรก -> เติมทุกอย่าง
    addSubsystemCard();
  }

  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.getElementById('view-form').classList.add('active');
  window.scrollTo(0,0);
}

// ================= 3. 4-Triangle Calendar =================
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

// ================= 4. Submit API =================
function getBase64(imgElement) {
  if(imgElement && imgElement.src && imgElement.src.startsWith('data:image')) return imgElement.src;
  return "";
}

async function submitFormViaAPI() {
  if(!document.getElementById('ledgerForm').checkValidity()) { document.getElementById('ledgerForm').reportValidity(); return; }

  document.getElementById('loadingOverlay').style.display = 'flex';

  let payload = {
    action: 'save_ledger', 
    data: {
      lineName: document.getElementById('f_lineName').value,
      machineName: document.getElementById('f_machineName').value,
      imgMachine: getBase64(document.getElementById('f_machineName').closest('.card-std')?.querySelector('.preview-img')),
      subSystems: []
    }
  };

  document.querySelectorAll('.sub-system-card').forEach(subCard => {
    
    // ดึง Risk ของ Subassembly
    let riskActive = []; 
    subCard.querySelectorAll('.risk-grid .icon-checkbox:not(.not-used) .label').forEach(el => riskActive.push(el.innerText));

    let subData = {
      subName: subCard.querySelector('.input-subname').value,
      imgSub: getBase64(subCard.querySelector('.box_imgSub .preview-img')),
      risks: riskActive.join(', '), 
      components: []
    };

    subCard.querySelectorAll('.part-item').forEach(pCard => {
      let ppeActive = []; 
      pCard.querySelectorAll('.ppe-grid .icon-checkbox:not(.not-used) .label').forEach(el => ppeActive.push(el.innerText));
      
      subData.components.push({
        compName: pCard.querySelector('.input-compname').value,
        task: pCard.querySelector('.input-task').value,
        spareClass: pCard.querySelector('.input-class').value,
        pmStd: pCard.querySelector('.input-pmstd').value,
        status: pCard.querySelector('.input-status').value,
        stdTime: pCard.querySelector('.input-time').value,
        remarkEwo: pCard.querySelector('.input-remark').value, 
        risk: pCard.querySelector('.input-risk').checked,
        ppe: ppeActive.join(', '),
        imgComp: getBase64(pCard.querySelector('.box_imgComp .preview-img')),
        weeks: JSON.parse(pCard.querySelector('.week-data-input').value)
      });
    });
    payload.data.subSystems.push(subData);
  });

  try {
    const res = await fetch(GAS_API_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
      body: JSON.stringify(payload) 
    });
    const result = await res.json();
    if(result.success) { alert("✅ บันทึกข้อมูลสำเร็จ!"); window.history.back(); } 
    else { alert("❌ เกิดข้อผิดพลาด: " + result.message); }
  } catch (error) { alert("❌ Error: เชื่อมต่อ API ไม่สำเร็จ"); } 
  finally { document.getElementById('loadingOverlay').style.display = 'none'; }
}

window.onload = () => { handleRouting(); };
