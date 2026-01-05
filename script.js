// Data Store
let DATA = {
    schools: [],
    supervisors: [],
    wishes: [],
    guidance: [],
    final: [],
    activeUser: null
};

// Default Configuration
const CONFIG = {
    defaultSheetId: localStorage.getItem('sheetId') || '1CuCtGc5uCx-6F-gtSY5gdmbmMOsJQscS_VQhP2QRSw8',
    defaultGasUrl: localStorage.getItem('gasUrl') || 'https://script.google.com/macros/s/AKfycbwy8C1vCejq2UoRnSE-WZMiwpDJTHE9-E9qMu4011xsJLUraHtOQs4j5hvnONZp7Sc3Pw/exec'
};

// Initialize UI with defaults
window.addEventListener('DOMContentLoaded', async () => {
    const sheetInput = document.getElementById('sheetId');
    const gasInput = document.getElementById('gasUrl');
    if (sheetInput) sheetInput.value = CONFIG.defaultSheetId;
    if (gasInput) gasInput.value = CONFIG.defaultGasUrl;

    // Automatic Synchronization on Load
    if (CONFIG.defaultSheetId && CONFIG.defaultGasUrl) {
        console.log("Starting automatic background sync...");
        const success = await loadDataFromServer(CONFIG.defaultSheetId);
        if (success) {
            updateDashboard();
            // Silent init for supervisor dropdowns in background
            initLoginFilters();
        }
    }
});

// --- Navigation ---

function navigate(tab) {
    document.getElementById('view-supervisor').classList.toggle('hidden', tab !== 'supervisor');
    document.getElementById('view-admin').classList.toggle('hidden', tab !== 'admin');

    document.getElementById('nav-supervisor').classList.toggle('tab-active', tab === 'supervisor');
    document.getElementById('nav-admin').classList.toggle('tab-active', tab === 'admin');

    document.getElementById('nav-supervisor').classList.toggle('text-slate-400', tab !== 'supervisor');
    document.getElementById('nav-admin').classList.toggle('text-slate-400', tab !== 'admin');

    if (tab === 'supervisor') {
        // Reset to login screen if coming back
        document.getElementById('view-supervisor').children[0].classList.remove('hidden');
        document.getElementById('wishesSection').classList.add('hidden');
        DATA.activeUser = null;

        // Auto-load filters if we have data
        if (DATA.supervisors.length > 0) {
            initLoginFilters();
        } else {
            // If No data, maybe try to sync automatically from defaults
            const sheetId = document.getElementById('sheetId').value || CONFIG.defaultSheetId;
            if (sheetId) syncAllData();
        }
    }
}

function switchAdminTab(tab) {
    const views = ['sync', 'mandatory', 'results', 'raw'];
    views.forEach(v => {
        const viewEl = document.getElementById(`admin-view-${v}`);
        if (viewEl) viewEl.classList.toggle('hidden', v !== tab);

        const btn = document.getElementById(`admin-tab-${v}`);
        if (btn) {
            btn.classList.toggle('bg-indigo-600', v === tab);
            btn.classList.toggle('bg-slate-800', v !== tab);
            btn.classList.toggle('text-slate-400', v !== tab);
            btn.classList.toggle('text-white', v === tab);
        }
    });

    if (tab === 'raw') renderRawData('schools');
    if (tab === 'mandatory') renderMandatoryTable();
}

// --- Data Fetching ---

function getVal(obj, key) {
    if (!obj) return '';
    // Smart matching for keys with spaces or different casing
    const foundKey = Object.keys(obj).find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
    return foundKey ? obj[foundKey] : '';
}

function getGuidanceName(guidCode) {
    if (!guidCode) return '-';
    const sCode = String(guidCode).trim();
    const guidObj = DATA.guidance.find(g =>
        String(getVal(g, 'كود التوجيه')).trim() === sCode ||
        String(getVal(g, 'التوجيه')).trim() === sCode ||
        String(getVal(g, 'اسم التوجيه')).trim() === sCode
    );
    if (!guidObj) return guidCode;
    const name = getVal(guidObj, 'التوجيه') || getVal(guidObj, 'اسم التوجيه');
    return name ? `${name} (${sCode})` : sCode;
}

async function fetchCSV(sheetId, tabName) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    try {
        const response = await fetch(url);
        const text = await response.text();

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}`, isPrivate: response.status === 403 };
        }

        if (text.includes("<!DOCTYPE html>")) {
            return { success: false, error: "Private/Login Required", isPrivate: true };
        }

        if (text.length < 5) {
            return { success: false, error: "Empty Response", isPrivate: false };
        }

        return new Promise(resolve => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: results => {
                    resolve({ success: true, data: results.data, columns: results.meta.fields });
                }
            });
        });
    } catch (e) {
        console.error(`Error fetching ${tabName}:`, e);
        return { success: false, error: e.message, isPrivate: false };
    }
}

async function loadDataFromServer(sheetId) {
    const gasUrl = document.getElementById('gasUrl').value.trim();
    const logEl = document.getElementById('syncLog');
    if (logEl) logEl.innerHTML = '';

    const log = (msg, type = 'info') => {
        console.log(`[Sync] ${msg}`);
        if (logEl) {
            const span = document.createElement('div');
            span.className = `text-[10px] py-1 border-b border-white/5 ${type === 'error' ? 'text-rose-400' : type === 'warn' ? 'text-amber-400' : type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`;
            span.innerText = `> ${msg}`;
            logEl.appendChild(span);
        }
    };

    if (!gasUrl) {
        log("خطأ: رابط GAS Web App غير موجود. لا يمكن المزامنة بدون الرابط.", "error");
        showToast("يرجى إدخال رابط GAS أولاً", "⚠️");
        return false;
    }

    log("بدء الاتصال بـ Google Apps Script...", "info");
    toggleLoader(true, "جاري استيراد البيانات من الشيت...");

    try {
        const fetchUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=fetch`;
        const response = await fetch(fetchUrl);

        if (!response.ok) {
            throw new Error(`تعذر الاتصال بالخادم (${response.status})`);
        }

        const result = await response.json();

        if (result.status === "success") {
            const d = result.data;
            DATA.schools = d.schools || [];
            DATA.supervisors = d.supervisors || [];
            DATA.guidance = d.guidance || [];
            DATA.wishes = d.wishes || [];
            DATA.mandatory = d.mandatory || [];

            // Restore mandatory assignments to school objects
            if (DATA.mandatory.length > 0) {
                DATA.mandatory.forEach(m => {
                    const sCode = String(getVal(m, 'كود المدرسة')).trim();
                    const supName = getVal(m, 'الموجه المكلّف');
                    const school = DATA.schools.find(s => String(getVal(s, 'كود المدرسة')).trim() === sCode);
                    if (school) school._mandatorySup = supName;
                });
                log(`تم استعادة ${DATA.mandatory.length} تكليف إجباري`, "success");
            }

            log(`تم الاتصال بنجاح بملف: ${result.sheetName}`, "success");
            log(`المدارس: ${DATA.schools.length}`, "info");
            log(`الموجهين: ${DATA.supervisors.length}`, "info");

            initLoginFilters(); // Populate login dropdowns after sync

            if (DATA.schools.length === 0) {
                log("تنبيه: لم يتم العثور على أي مدارس في الملف.", "warn");
                showToast("ملف المدارس فارغ أو غير موجود", "⚠️");
            }

            return true;
        } else {
            log(`خطأ من الخادم: ${result.message}`, "error");
            showToast("فشلت المزامنة: " + result.message, "❌");
            return false;
        }
    } catch (error) {
        log(`خطأ فني: ${error.message}`, "error");
        log("تأكد من تحديث الكود في GAS وإعادة نشره (Deploy).", "warn");
        showToast("خطأ في الاتصال بالخادم", "❌");
        return false;
    } finally {
        toggleLoader(false);
    }
}

async function syncAllData() {
    let sheetId = document.getElementById('sheetId').value.trim();
    const gasUrl = document.getElementById('gasUrl').value.trim();

    if (sheetId.includes('/d/')) {
        const match = sheetId.match(/\/d\/(.*?)(\/|$)/);
        if (match) sheetId = match[1];
    }

    if (!sheetId) return showToast("يرجى إدخال معرف الملف أولاً", "⚠️");

    localStorage.setItem('sheetId', sheetId);
    localStorage.setItem('gasUrl', gasUrl);

    toggleLoader(true);

    try {
        const success = await loadDataFromServer(sheetId);
        if (success) {
            renderMandatoryTable();
            runDistribution();
            updateDashboard();
            switchAdminTab('results');
            showToast(`تم مزامنة البيانات بنجاح`, "✅");
        }
    } catch (error) {
        showToast("خطأ في المزامنة: " + error.message, "❌");
    } finally {
        toggleLoader(false);
    }
}

// --- Distribution Logic ---

function updateSchoolMandatory(schoolId, supName) {
    const school = DATA.schools.find(s => getVal(s, 'كود المدرسة') == schoolId);
    if (school) {
        school._mandatorySup = supName || null;
        console.log(`[Mandatory] Set ${schoolId} to ${supName}`);
    }
}

function runDistribution() {
    console.log("Starting Advanced Heuristic Distribution...");

    const activeSups = DATA.supervisors.filter(sup => {
        const status = (getVal(sup, 'الحالة') || getVal(sup, 'نشط') || 'نشط').trim();
        return status !== 'غير نشط' && status !== '0';
    });

    // Advanced Tracking
    const supervisorLoad = {};
    const supervisorStageLoad = {};
    const supervisorTypeLoad = {};

    activeSups.forEach(s => {
        const code = String(getVal(s, 'كود الموجه')).trim();
        supervisorLoad[code] = 0;
        supervisorStageLoad[code] = {};
        supervisorTypeLoad[code] = {};
    });

    function incrementLoad(supCode, stage, type) {
        if (!supCode || supervisorLoad[supCode] === undefined) return;
        supervisorLoad[supCode]++;
        if (stage) supervisorStageLoad[supCode][stage] = (supervisorStageLoad[supCode][stage] || 0) + 1;
        if (type) supervisorTypeLoad[supCode][type] = (supervisorTypeLoad[supCode][type] || 0) + 1;
    }

    // Pass 1: Mandatory & Locks (Fixed Assignments)
    DATA.final = DATA.schools.map(s => {
        const schoolId = String(getVal(s, 'كود المدرسة')).trim();
        const existing = (DATA.final && DATA.final.length > 0) ? DATA.final.find(f => String(getVal(f, 'كود المدرسة')).trim() === schoolId) : null;
        const isLocked = existing && existing.method === 'تعديل إداري';
        const mandatorySupName = s._mandatorySup || null;

        let finalSup = isLocked ? existing.finalSup : (mandatorySupName || null);
        let finalSupCode = isLocked ? (existing.finalSupCode || '') : '';
        let method = isLocked ? 'تعديل إداري' : (mandatorySupName ? 'تكليف إداري (إجباري)' : 'تلقائي');

        if (mandatorySupName && !isLocked) {
            const ms = activeSups.find(sup => getVal(sup, 'اسم الموجه') == mandatorySupName);
            if (ms) finalSupCode = String(getVal(ms, 'كود الموجه')).trim();
        }

        if (!finalSup) {
            const sheetSupCode = String(getVal(s, 'كود الموجه')).trim();
            if (sheetSupCode && supervisorLoad[sheetSupCode] !== undefined) {
                const sheetSup = activeSups.find(sup => String(getVal(sup, 'كود الموجه')).trim() === sheetSupCode);
                if (sheetSup) {
                    finalSup = getVal(sheetSup, 'اسم الموجه');
                    finalSupCode = sheetSupCode;
                    method = 'تكليف إداري (الملف)';
                }
            }
        }

        if (finalSupCode) incrementLoad(finalSupCode, getVal(s, 'المرحلة'), getVal(s, 'النوعية'));
        return { ...s, finalSup, finalSupCode, method };
    });

    const LOAD_LIMIT = 5;

    // Pass 2: Wishes (Latest per supervisor)
    const latestWishes = {};
    DATA.wishes.forEach(w => {
        const code = String(getVal(w, 'كود الموجه')).trim();
        if (code) latestWishes[code] = w;
    });

    for (let pass = 1; pass <= 4; pass++) {
        // Randomize sups order within pass for fairness
        const shuffledSups = [...activeSups].sort(() => Math.random() - 0.5);

        shuffledSups.forEach(sup => {
            const supName = getVal(sup, 'اسم الموجه');
            const supCode = String(getVal(sup, 'كود الموجه')).trim();
            if (supervisorLoad[supCode] >= LOAD_LIMIT) return;

            const logWish = latestWishes[supCode];
            const wishSchoolId = logWish ? (
                getVal(logWish, `رغبة ${pass}`) || getVal(logWish, `رغبة${pass}`) ||
                getVal(logWish, `wish ${pass}`) || getVal(logWish, `wish${pass}`) ||
                getVal(logWish, `الرغبة ${pass}`)
            ) : (
                getVal(sup, `رغبة ${pass}`) || getVal(sup, `رغبة${pass}`) || getVal(sup, `wish${pass}`)
            );

            if (wishSchoolId) {
                const searchCode = String(wishSchoolId).trim();
                const school = DATA.final.find(f => String(getVal(f, 'كود المدرسة')).trim() === searchCode && !f.finalSup);
                if (school) {
                    school.finalSup = supName;
                    school.finalSupCode = supCode;
                    school.method = `رغبة ${pass}`;
                    incrementLoad(supCode, getVal(school, 'المرحلة'), getVal(school, 'النوعية'));
                }
            }
        });
    }

    // Pass 3: Smart Balanced Distribution (Optimization Mode)
    // We process schools in a random order to avoid structural bias
    const pendingSchools = DATA.final.filter(f => !f.finalSup).sort(() => Math.random() - 0.5);

    pendingSchools.forEach(school => {
        const guidCode = String(getVal(school, 'كود التوجيه')).trim();
        const stage = getVal(school, 'المرحلة');
        const type = getVal(school, 'النوعية');

        // Heuristic Scoring Function: Lower is Better
        // Penalty = global_load*100 + stage_load*50 + type_load*20 + specialty_mismatch*1000
        function calculateFairnessScore(sup) {
            const code = String(getVal(sup, 'كود الموجه')).trim();
            const totalLoad = supervisorLoad[code];
            if (totalLoad >= LOAD_LIMIT) return Infinity;

            const stageLoad = supervisorStageLoad[code][stage] || 0;
            const typeLoad = supervisorTypeLoad[code][type] || 0;
            const isSpecialtyMatch = String(getVal(sup, 'كود التوجيه')).trim() === guidCode;

            let score = (totalLoad * 100) + (stageLoad * 50) + (typeLoad * 25);
            if (!isSpecialtyMatch) score += 1000; // Major penalty for non-specialty match

            return score;
        }

        const sortedCandidates = activeSups
            .map(sup => ({ sup, score: calculateFairnessScore(sup) }))
            .filter(c => c.score !== Infinity)
            .sort((a, b) => a.score - b.score);

        const best = sortedCandidates[0];
        if (best) {
            const code = String(getVal(best.sup, 'كود الموجه')).trim();
            school.finalSup = getVal(best.sup, 'اسم الموجه');
            school.finalSupCode = code;
            school.method = best.score < 1000 ? 'توزيع ذكي (متوازن)' : 'توزيع عام (متوازن)';
            incrementLoad(code, stage, type);
        }
    });

    renderAdminTable();
}

// --- Admin Features ---

function manualOverride(schoolId, supName) {
    const row = DATA.final.find(s => getVal(s, 'كود المدرسة') == schoolId);
    if (row) {
        row.finalSup = supName || null;
        row.method = supName ? 'تعديل إداري' : 'تلقائي';
        updateDashboard();
        renderAdminTable();
        showToast("تم تحديث وجدول التوزيع", "✍️");
    }
}

function updateSchoolMandatory(schoolId, supName) {
    const sId = String(schoolId).trim();
    const school = DATA.schools.find(s => String(getVal(s, 'كود المدرسة')).trim() === sId);
    if (school) {
        school._mandatorySup = supName || null;
        console.log(`[Mandatory] Set ${sId} to ${supName}`);
        renderMandatoryTable(); // Update others to hide this sup
    }
}

function applyBulkMandatory() {
    const bulkSup = document.getElementById('bulkSupSelect').value;
    if (!bulkSup) return showToast("يرجى اختيار موجه أولاً", "⚠️");

    const search = document.getElementById('mandatorySearch').value.toLowerCase();
    const stage = document.getElementById('man-filter-stage').value;
    const type = document.getElementById('man-filter-type').value;
    const guid = document.getElementById('man-filter-guid').value;

    const filtered = DATA.schools.filter(s => {
        const matchesSearch = getVal(s, 'اسم المدرسة').toLowerCase().includes(search);
        const matchesStage = !stage || getVal(s, 'المرحلة') === stage;
        const matchesType = !type || getVal(s, 'النوعية') === type;
        const matchesGuid = !guid || getVal(s, 'كود التوجيه') == guid || getVal(s, 'التوجيه') == guid;
        return matchesSearch && matchesStage && matchesType && matchesGuid;
    });

    if (filtered.length === 0) return showToast("لا توجد مدارس مطابقة للتصفية", "⚠️");

    // Check if supervisor is already assigned to a school NOT in this filtered set
    const alreadyAssignedElsewhere = DATA.schools.some(s => s._mandatorySup === bulkSup && !filtered.includes(s));
    if (alreadyAssignedElsewhere) {
        return showToast("هذا الموجه مسكّن بالفعل في مدرسة أخرى خارج نافذة البحث الحالية", "❌");
    }

    filtered.forEach(s => { s._mandatorySup = bulkSup; });
    showToast(`تم تخصيص ${bulkSup} لـ ${filtered.length} مدرسة`, "✅");
    renderMandatoryTable();
}

function renderMandatoryTable() {
    const body = document.getElementById('mandatoryBody');
    if (!body) return;

    // 1. Extract and Populate Filters for Admin
    const stages = [...new Set(DATA.schools.map(s => getVal(s, 'المرحلة')).filter(Boolean))].sort();
    const types = [...new Set(DATA.schools.map(s => getVal(s, 'النوعية')).filter(Boolean))].sort();
    const guids = [...new Set(DATA.schools.map(s => getVal(s, 'كود التوجيه')).filter(Boolean))].sort();

    const fStage = document.getElementById('man-filter-stage');
    const fType = document.getElementById('man-filter-type');
    const fGuid = document.getElementById('man-filter-guid');

    if (fStage && fStage.options.length <= 1) stages.forEach(s => fStage.add(new Option(s, s)));
    if (fType && fType.options.length <= 1) types.forEach(t => fType.add(new Option(t, t)));
    if (fGuid && fGuid.options.length <= 1) {
        guids.forEach(g => {
            const name = (DATA.guidance.find(gx => getVal(gx, 'كود التوجيه') == g))?.['التوجيه'] || g;
            fGuid.add(new Option(name, g));
        });
    }

    const search = document.getElementById('mandatorySearch').value.toLowerCase();
    const selStage = fStage?.value || '';
    const selType = fType?.value || '';
    const selGuid = fGuid?.value || '';

    // 2. Filter schools
    const filtered = DATA.schools.filter(s => {
        const matchesSearch = getVal(s, 'اسم المدرسة').toLowerCase().includes(search);
        const matchesStage = !selStage || getVal(s, 'المرحلة') === selStage;
        const matchesType = !selType || getVal(s, 'النوعية') === selType;
        const matchesGuid = !selGuid || getVal(s, 'كود التوجيه') == selGuid || getVal(s, 'التوجيه') == selGuid;
        return matchesSearch && matchesStage && matchesType && matchesGuid;
    });

    // Track already assigned mandatory supervisors across ALL schools
    const assignedSups = new Set(DATA.schools.map(s => s._mandatorySup).filter(Boolean));

    if (bulkSelect) {
        const currentVal = bulkSelect.value;
        const activeSups = DATA.supervisors.filter(sup => {
            const status = (getVal(sup, 'الحالة') || getVal(sup, 'نشط') || 'نشط').trim();
            return status !== 'غير نشط' && status !== '0';
        });

        bulkSelect.innerHTML = '<option value="">اختر الموجه لتطبيقه على الكل...</option>' +
            activeSups.map(sup => {
                const name = getVal(sup, 'اسم الموجه');
                const isAssigned = assignedSups.has(name);
                return `<option value="${name}" ${isAssigned ? 'disabled' : ''}>${name} ${isAssigned ? '(مسكّن حالياً)' : ''}</option>`;
            }).join('');
        bulkSelect.value = currentVal;
    }

    body.innerHTML = filtered.map(s => {
        const schoolId = getVal(s, 'كود المدرسة');
        const guidCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة');
        const guidName = getGuidanceName(guidCode);
        const currentSelection = s._mandatorySup || '';

        return `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
            <td class="px-6 py-4 font-bold text-sm text-slate-200">${getVal(s, 'اسم المدرسة')}</td>
            <td class="px-6 py-4 text-xs text-indigo-300">${getVal(s, 'المرحلة')}</td>
            <td class="px-6 py-4 text-xs text-emerald-300">${getVal(s, 'النوعية')}</td>
            <td class="px-6 py-4 text-xs text-slate-400 font-mono">${guidName}</td>
            <td class="px-6 py-4">
                <select id="man-${schoolId}"
                        onchange="updateSchoolMandatory('${schoolId}', this.value)"
                        class="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-xs w-full focus:border-indigo-500 outline-none transition-all">
                    <option value="">توزيع تلقائي</option>
                    ${DATA.supervisors
                .filter(sup => {
                    const status = (getVal(sup, 'الحالة') || getVal(sup, 'نشط') || 'نشط').trim();
                    return status !== 'غير نشط' && status !== '0';
                })
                .map(sup => {
                    const name = getVal(sup, 'اسم الموجه');
                    const isAssignedElsewhere = assignedSups.has(name) && name !== currentSelection;
                    if (isAssignedElsewhere) return '';
                    return `<option value="${name}" ${currentSelection === name ? 'selected' : ''}>${name}</option>`;
                }).join('')}
                </select>
            </td>
        </tr>
        `;
    }).join('');
}

function renderAdminTable() {
    const body = document.getElementById('resultBody');
    if (!body) return;

    body.innerHTML = DATA.final.map(s => {
        const schoolCode = getVal(s, 'كود المدرسة');

        // Try multiple headers for school's guidance code
        let guidCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة') || getVal(s, 'الادارة');

        // Fallback: Use assigned supervisor's guidance code if school info is missing
        if (!guidCode && s.finalSupCode) {
            const assignedSup = DATA.supervisors.find(sx => getVal(sx, 'كود الموجه') == s.finalSupCode);
            if (assignedSup) guidCode = getVal(assignedSup, 'كود التوجيه') || getVal(assignedSup, 'التوجيه');
        }

        const guidName = getGuidanceName(guidCode);
        const method = s.method || 'تلقائي';

        let badgeStyle = "bg-slate-800 text-slate-400";
        if (method.includes('إجباري') || method.includes('الملف')) badgeStyle = "bg-rose-500/20 text-rose-400 border border-rose-500/30";
        else if (method.includes('رغبة')) badgeStyle = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold";
        else if (method.includes('تعديل')) badgeStyle = "bg-amber-500/20 text-amber-400 border border-amber-500/30";

        return `
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-8 py-5 font-bold">${getVal(s, 'اسم المدرسة')}</td>
            <td class="px-8 py-5">
                <select onchange="manualOverride('${schoolCode}', this.value)" 
                        class="bg-slate-900 border border-white/10 rounded-lg px-3 py-1 text-sm w-full">
                    <option value="">غير مسكن</option>
                    ${DATA.supervisors
                .filter(sup => {
                    const status = (getVal(sup, 'الحالة') || getVal(sup, 'نشط') || 'نشط').trim();
                    return status !== 'غير نشط' && status !== '0';
                })
                .map(sup => {
                    const supName = getVal(sup, 'اسم الموجه');
                    return `<option value="${supName}" ${s.finalSup === supName ? 'selected' : ''}>${supName}</option>`;
                }).join('')}
                </select>
            </td>
            <td class="px-8 py-5 text-slate-400 font-mono text-xs">${guidName}</td>
            <td class="px-8 py-5 text-indigo-300 text-xs">${getVal(s, 'المرحلة')}</td>
            <td class="px-8 py-5 text-[10px] font-bold">
                <span class="px-2 py-1 rounded ${badgeStyle}">${method}</span>
            </td>
            <td class="px-8 py-5 text-center">
                <button onclick="generateIndividualLetters('${schoolCode}')" 
                        class="p-2 hover:bg-white/10 rounded-lg text-amber-500 title="طباعة الخطاب">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function renderRawData(type) {
    const titleEl = document.getElementById('rawTitle');
    const bodyEl = document.getElementById('rawBody');
    if (!titleEl || !bodyEl) return;

    let data = DATA[type] || [];

    // Update button styles
    const buttons = document.querySelectorAll('#admin-view-raw button');
    buttons.forEach(btn => {
        const isTarget = (type === 'schools' && btn.innerText.includes('المدارس')) ||
            (type === 'supervisors' && btn.innerText.includes('الموجهين')) ||
            (type === 'guidance' && btn.innerText.includes('التوجيه'));
        btn.classList.toggle('bg-indigo-600', isTarget);
        btn.classList.toggle('bg-slate-800', !isTarget);
    });

    if (data.length === 0) {
        titleEl.innerHTML = `<tr><th class="px-6 py-4">لا توجد بيانات متاحة</th></tr>`;
        bodyEl.innerHTML = `<tr><td class="px-6 py-4 text-center">يرجى الضغط على "مزامنة" أولاً أو التأكد من أسماء الصفحات في الشيت</td></tr>`;
        return;
    }

    const headers = Object.keys(data[0]);
    titleEl.innerHTML = `<tr>${headers.map(h => `<th class="px-6 py-4 border-b border-white/10 text-indigo-400 whitespace-nowrap">${h}</th>`).join('')}</tr>`;

    bodyEl.innerHTML = data.map(row => `
        <tr class="hover:bg-white/5 transition-colors">
            ${headers.map(h => `<td class="px-6 py-4 border-b border-white/5 whitespace-nowrap">${row[h] || '-'}</td>`).join('')}
        </tr>
    `).join('');
}

function updateDashboard() {
    const schools = DATA.schools.length;
    const assigned = DATA.final.filter(s => s.finalSup).length;
    const active = DATA.supervisors.filter(sup => getVal(sup, 'الحالة') !== 'غير نشط').length;

    const elements = {
        statSchools: schools,
        statSupervisors: `${active} / ${DATA.supervisors.length}`,
        statCoverage: schools > 0 ? Math.round((assigned / schools) * 100) + '%' : '0%',
        statWishes: DATA.wishes.length
    };

    for (let id in elements) {
        const el = document.getElementById(id);
        if (el) el.innerText = elements[id];
    }
}

// --- Supervisor Features ---

// --- Supervisor Login & Filters ---

function initLoginFilters(forceSync = false) {
    if (forceSync) return syncAllData();

    const guidSelect = document.getElementById('loginGuidance');
    if (!guidSelect) return;

    // Reset
    guidSelect.innerHTML = '<option value="">اختر التوجيه الخاص بك...</option>';

    // Get unique guidance from supervisors or guidance sheet
    const guids = [...new Set(DATA.supervisors.map(s => getVal(s, 'كود التوجيه')).filter(Boolean))].sort();

    guids.forEach(g => {
        const guidObj = DATA.guidance.find(gx => getVal(gx, 'كود التوجيه') == g);

        // Try multiple headers for name
        let name = '';
        if (guidObj) {
            name = getVal(guidObj, 'التوجيه') ||
                getVal(guidObj, 'اسم التوجيه') ||
                getVal(guidObj, 'الإدارة') ||
                getVal(guidObj, 'الادارة') ||
                getVal(guidObj, 'guidance');
        }

        const displayName = name ? name : `توجيه (${g})`;
        guidSelect.add(new Option(displayName, g));
    });

    const list = document.getElementById('supervisorList');
    if (list) list.innerHTML = '';
}

function updateLoginSupervisorList() {
    const guidCode = document.getElementById('loginGuidance').value;
    const list = document.getElementById('supervisorList');
    const input = document.getElementById('loginSupervisorInput');
    if (!list || !input) return;

    list.innerHTML = '';
    input.value = ''; // Clear previous selection

    if (!guidCode) return;

    const filtered = DATA.supervisors.filter(s => getVal(s, 'كود التوجيه') == guidCode);
    filtered.forEach(s => {
        const option = document.createElement('option');
        option.value = getVal(s, 'اسم الموجه');
        list.appendChild(option);
    });
}

async function handleLogin() {
    const nameInput = document.getElementById('loginSupervisorInput').value.trim();
    if (!nameInput) return showToast("يرجى اختيار أو كتابة اسم الموجه", "⚠️");

    // Lookup supervisor by name
    const sup = DATA.supervisors.find(s => getVal(s, 'اسم الموجه').trim() === nameInput);
    if (!sup) return showToast("الاسم غير موجود في قائمة التوجيه المختار", "❌");

    const code = getVal(sup, 'كود الموجه');
    DATA.activeUser = sup;
    const name = getVal(sup, 'اسم الموجه');
    const guidCode = getVal(sup, 'كود التوجيه');
    const guidObj = DATA.guidance.find(g => getVal(g, 'كود التوجيه') == guidCode);

    document.getElementById('supHello').innerText = `أهلاً بك، أ/ ${name}`;
    document.getElementById('supGuidance').innerText = `التوجيه: ${getVal(guidObj, 'التوجيه') || guidCode}`;
    document.getElementById('supSpecialty').innerText = getVal(DATA.activeUser, 'النوعية') || 'عام';

    // 1. Render selects first (so options exist)
    renderSchoolSelects();

    // 2. Load existing wishes if any
    loadExistingWishes(code);

    document.getElementById('view-supervisor').children[0].classList.add('hidden');
    document.getElementById('wishesSection').classList.remove('hidden');
}

function loadExistingWishes(supCode) {
    const sCode = String(supCode).trim();
    const lastWish = [...DATA.wishes].reverse().find(w => String(getVal(w, 'كود الموجه')).trim() === sCode);

    if (lastWish) {
        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById(`wish${i}`);
            if (el) {
                // Try multiple variants for header
                const val = getVal(lastWish, `رغبة ${i}`) ||
                    getVal(lastWish, `رغبة${i}`) ||
                    getVal(lastWish, `wish ${i}`) ||
                    getVal(lastWish, `wish${i}`) ||
                    getVal(lastWish, `الرغبة ${i}`);
                if (val) el.value = val;
            }
        }
        showToast("تم استعادة رغباتك السابقة من السجلات", "✅");
    }
}

function renderSchoolSelects(specificSlot = null) {
    const slots = specificSlot ? [specificSlot] : [1, 2, 3, 4];
    const userGuidance = getVal(DATA.activeUser, 'كود التوجيه');

    // 1. Extract unique stages and types from DATA.schools for the filters
    const stages = [...new Set(DATA.schools.map(s => getVal(s, 'المرحلة')).filter(Boolean))].sort();
    const types = [...new Set(DATA.schools.map(s => getVal(s, 'النوعية')).filter(Boolean))].sort();

    slots.forEach(slot => {
        const stageFilter = document.getElementById(`filter-stage-${slot}`);
        const typeFilter = document.getElementById(`filter-type-${slot}`);
        const select = document.getElementById(`wish${slot}`);

        if (!select) return;

        const currentVal = select.value; // Store current selection

        // Populate filters if they are empty
        if (stageFilter && stageFilter.options.length <= 1) {
            stages.forEach(st => stageFilter.add(new Option(st, st)));
        }
        if (typeFilter && typeFilter.options.length <= 1) {
            types.forEach(ty => typeFilter.add(new Option(ty, ty)));
        }

        const selectedStage = stageFilter ? stageFilter.value : '';
        const selectedType = typeFilter ? typeFilter.value : '';

        // Filter schools based on selection
        const filteredSchools = DATA.schools.filter(s => {
            const matchesStage = !selectedStage || getVal(s, 'المرحلة') === selectedStage;
            const matchesType = !selectedType || getVal(s, 'النوعية') === selectedType;
            return matchesStage && matchesType;
        });

        const options = filteredSchools.map(s => {
            const isMatch = getVal(s, 'كود التوجيه') == userGuidance;
            return `<option value="${getVal(s, 'كود المدرسة')}">${isMatch ? '⭐ ' : ''} ${getVal(s, 'اسم المدرسة')}</option>`;
        }).join('');

        select.innerHTML = `<option value="">اختر مدرسة (${filteredSchools.length})...</option>${options}`;
        if (currentVal) select.value = currentVal; // Restore if possible
    });
}

async function submitWishes() {
    const gasUrl = document.getElementById('gasUrl').value;
    if (!gasUrl) return showToast("لم يتم إعداد رابط الاستقبال", "⚠️");

    const payload = {
        type: 'wish',
        supCode: getVal(DATA.activeUser, 'كود الموجه'),
        supName: getVal(DATA.activeUser, 'اسم الموجه'),
        wish1: document.getElementById('wish1').value,
        wish2: document.getElementById('wish2').value,
        wish3: document.getElementById('wish3').value,
        wish4: document.getElementById('wish4').value
    };

    if (!payload.wish1) return showToast("يجب اختيار الرغبة الأولى", "⚠️");

    toggleLoader(true, "جاري الحفظ...");
    try {
        await fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        showToast("تم الحفظ بنجاح", "✅");
        setTimeout(() => location.reload(), 2000);
    } catch (e) {
        showToast("خطأ في الاتصال", "❌");
    } finally {
        toggleLoader(false);
    }
}

// --- Diagnostic Feature ---

async function quickAddRecord(type) {
    const gasUrl = document.getElementById('gasUrl').value;
    if (!gasUrl) return showToast("رابط الاستقبال غير موجود", "⚠️");

    let payload = { type: type };
    if (type === 'school') {
        payload.schoolName = document.getElementById('newSchoolName').value;
        payload.schoolCode = document.getElementById('newSchoolCode').value;
        payload.guidanceCode = ''; // Default empty for quick add
        payload.stage = '';
    } else if (type === 'supervisor') {
        payload.supName = document.getElementById('newSupName').value;
        payload.supCode = document.getElementById('newSupCode').value;
        payload.guidanceCode = '';
        payload.status = 'نشط';
    } else if (type === 'guidance') {
        payload.guidanceName = document.getElementById('newGuidName').value;
        payload.guidanceCode = document.getElementById('newGuidCode').value;
    }

    toggleLoader(true, "جاري الإرسال...");
    try {
        await fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        showToast("تم إرسال الطلب. تحقق من الشيت", "✅");
    } catch (e) {
        showToast("فشل الاتصال", "❌");
    } finally {
        toggleLoader(false);
    }
}

// --- Utils ---

function toggleLoader(show, msg = "جاري معالجة البيانات...") {
    const loader = document.getElementById('globalLoader');
    const text = document.getElementById('loaderText');
    if (text) text.innerText = msg;
    if (loader) loader.classList.toggle('hidden', !show);
}

function showToast(msg, icon) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    const iconEl = document.getElementById('toastIcon');
    if (msgEl) msgEl.innerText = msg;
    if (iconEl) iconEl.innerText = icon;

    toast.classList.remove('translate-y-10', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
    }, 4000);
}

async function saveMandatoryAssignments() {
    const gasUrl = document.getElementById('gasUrl').value;
    if (!gasUrl) return showToast("يرجى إدخال رابط GAS", "⚠️");

    const assignments = [];
    DATA.schools.forEach(s => {
        const schoolId = String(getVal(s, 'كود المدرسة')).trim();
        const mSup = s._mandatorySup; // Use internal state
        if (mSup) {
            assignments.push({
                schoolCode: schoolId,
                schoolName: getVal(s, 'اسم المدرسة'),
                supName: mSup
            });
        }
    });

    if (assignments.length === 0) return showToast("لا يوجد تكليفات لحفظها", "ℹ️");

    toggleLoader(true, "جاري حفظ التكليفات في الشيت...");
    try {
        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ type: 'saveMandatory', assignments: assignments })
        });
        showToast("تم حفظ التكليفات بنجاح", "✅");
    } catch (e) {
        showToast("خطأ في الحفظ: تأكد من إعدادات GAS", "❌");
        console.error(e);
    } finally {
        toggleLoader(false);
    }
}

async function pushResultsToSheet() {
    const gasUrl = document.getElementById('gasUrl').value;
    if (!gasUrl) return showToast("يرجى إدخال رابط GAS", "⚠️");
    if (DATA.final.length === 0) return showToast("لا توجد نتائج لتصديرها", "⚠️");

    toggleLoader(true, "جاري تصدير النتائج النهائية للشيت...");

    const resultsPayload = DATA.final.map(s => {
        // Shared logic for guidance detection
        let gCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة') || getVal(s, 'الادارة');
        if (!gCode && s.finalSupCode) {
            const assignedSup = DATA.supervisors.find(sx => getVal(sx, 'كود الموجه') == s.finalSupCode);
            if (assignedSup) gCode = getVal(assignedSup, 'كود التوجيه') || getVal(assignedSup, 'التوجيه');
        }
        const gName = getGuidanceName(gCode);

        return {
            supName: s.finalSup || '-',
            supCode: s.finalSupCode || '-',
            guidance: gName, // Store the name for clarity in the sheet
            schoolName: getVal(s, 'اسم المدرسة'),
            schoolCode: getVal(s, 'كود المدرسة'),
            stage: getVal(s, 'المرحلة') || '-'
        };
    });

    try {
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ type: 'saveResults', results: resultsPayload })
        });
        showToast("تم تصدير النتائج بنجاح إلى شيت 'النتائج النهائية'", "✅");
    } catch (e) {
        showToast("فشلت عملية التصدير", "❌");
        console.error(e);
    } finally {
        toggleLoader(false);
    }
}

function filterMandatoryTable() {
    const val = document.getElementById('mandatorySearch').value.toLowerCase();
    const rows = document.getElementById('mandatoryBody').getElementsByTagName('tr');
    for (let row of rows) row.style.display = row.innerText.toLowerCase().includes(val) ? '' : 'none';
}

function filterAdminTable() {
    const val = document.getElementById('adminSearch').value.toLowerCase();
    const rows = document.getElementById('resultBody').getElementsByTagName('tr');
    for (let row of rows) row.style.display = row.innerText.toLowerCase().includes(val) ? '' : 'none';
}

function exportResults() {
    const csvData = Papa.unparse(DATA.final.map(s => {
        let gCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة');
        if (!gCode && s.finalSupCode) {
            const assignedSup = DATA.supervisors.find(sx => getVal(sx, 'كود الموجه') == s.finalSupCode);
            if (assignedSup) gCode = getVal(assignedSup, 'كود التوجيه') || getVal(assignedSup, 'التوجيه');
        }
        const gObj = DATA.guidance.find(go => getVal(go, 'كود التوجيه') == gCode || getVal(go, 'التوجيه') == gCode);
        const gName = gObj ? (getVal(gObj, 'التوجيه') || getVal(gObj, 'اسم التوجيه')) : (gCode || '-');

        return {
            'اسم المدرسة': getVal(s, 'اسم المدرسة'),
            'كود المدرسة': getVal(s, 'كود المدرسة'),
            'التوجيه': gName,
            'الموجه المسكن': s.finalSup || '-',
            'كود الموجه': s.finalSupCode || '-',
            'المرحلة': getVal(s, 'المرحلة'),
            'النوعية': getVal(s, 'النوعية'),
            'آلية التوزيع': s.method
        };
    }));

    const blob = new Blob(["\uFEFF" + csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `توزيع_الموجهين_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    document.body.removeChild(link);
}

// --- Official Reports System ---

const OFFICIALS = {
    gm: { name: "أ / سعاد محمد", title: "مدير عام الإدارة", phone: "01120309568" },
    deputy: { name: "أ / غادة محمد", title: "وكيل الإدارة", phone: "01100686383" }, // Phone updated as requested
    security: { name: "أ / وجيه عبد العال", title: "مسئول أمن الإدارة", phone: "01100686383" },
    managers: [
        { stage: "المرحلة الابتدائية", name: "أ / هشام محمود كامل", phone: "01124589939" },
        { stage: "المرحلة الإعدادية", name: "أ / داليا عمر", phone: "01287089498" },
        { stage: "المرحلة الثانوية", name: "أ / أحلام محمد", phone: "01121489382" }
    ]
};

function generateOfficialGeneralReport() {
    const container = document.getElementById('printReportContainer');
    if (!container) return;

    // 1. Group DATA.final by Guidance
    const grouped = {};
    DATA.final.forEach(s => {
        let gCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة');
        if (!gCode && s.finalSupCode) {
            const assignedSup = DATA.supervisors.find(sx => getVal(sx, 'كود الموجه') == s.finalSupCode);
            if (assignedSup) gCode = getVal(assignedSup, 'كود التوجيه') || getVal(assignedSup, 'التوجيه');
        }
        const guidName = getGuidanceName(gCode);
        if (!grouped[guidName]) grouped[guidName] = [];
        grouped[guidName].push(s);
    });

    // 2. Build HTML for each group as a separate page
    let fullHtml = Object.entries(grouped).map(([guidName, schools]) => {
        let rowsHtml = schools.map((s, index) => {
            const sup = DATA.supervisors.find(su => getVal(su, 'كود الموجه') == s.finalSupCode);
            const phone = sup ? (getVal(sup, 'تليفون الموجه') || getVal(sup, 'التليفون') || '-') : '-';
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td style="text-align:right">${getVal(s, 'اسم المدرسة')}</td>
                    <td>${s.finalSup || '-'}</td>
                    <td>${phone}</td>
                    <td style="width:100px"></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="report-page page-break">
                <div class="report-header">
                    <div style="text-align:right">
                        <p>محافظة الجيزة</p>
                        <p>إدارة العمرانية التعليمية</p>
                    </div>
                    <div class="report-title-box">
                        توزيع السادة الموجهين المقيمين لمتابعة امتحانات نصف العام 2026/2025م
                    </div>
                    <div style="text-align:left">
                        <img src="logo.png" style="width:70px; height:auto;">
                        <p style="font-size:10px; margin-top:2px;">لجنة الإدارة</p>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-weight:bold; font-size:1.1rem;">توجيه : ${guidName}</div>
                    <div style="font-size:0.9rem;">رقم الكشف: (${guidName}) / 2026</div>
                </div>
                
                <table class="official-table">
                    <thead>
                        <tr>
                            <th style="width:40px">م</th>
                            <th>المدرسة</th>
                            <th>اسم الموجه</th>
                            <th>التليفون</th>
                            <th>توقيع الموجه</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="signature-section">
                    <div class="signature-block">
                        <p>يعتمد،، مدير عام الإدارة</p>
                        <p>${OFFICIALS.gm.name}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = fullHtml;
    window.print();
}

function generateIndividualLetters(specificSchoolCode = null) {
    const container = document.getElementById('printReportContainer');
    if (!container) return;

    let targetData = DATA.final.filter(s => s.finalSup);
    if (specificSchoolCode) {
        targetData = targetData.filter(s => String(getVal(s, 'كود المدرسة')).trim() === String(specificSchoolCode).trim());
    }

    let fullHtml = targetData.map((s, idx) => {
        const sup = DATA.supervisors.find(su => getVal(su, 'كود الموجه') == s.finalSupCode);
        const supPhone = sup ? (getVal(sup, 'تليفون الموجه') || getVal(sup, 'التليفون') || '-') : '-';
        const guidCode = getVal(s, 'كود التوجيه') || getVal(s, 'التوجيه') || getVal(s, 'الإدارة');
        const guidName = getGuidanceName(guidCode);

        return `
        <div class="report-page page-break">
            <div class="report-header">
                <div style="text-align:right">
                    <p>محافظة الجيزة</p>
                    <p>إدارة العمرانية التعليمية</p>
                </div>
                <div class="report-title-box">
                    خطاب تكليف الموجه المقيم لمتابعة امتحانات نصف العام 2026/2025م
                </div>
                <div style="text-align:left">
                    <img src="logo.png" style="width:65px; height:auto;">
                    <p style="font-size:9px; margin-top:2px;">لجنة الإدارة</p>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin: 10px 0; border: 1.5px solid #000; padding: 5px; background:#f9f9f9;">
                <div style="font-weight:bold; font-size:1.1rem;">توجيه : ${guidName}</div>
                <div style="font-weight:bold; font-size:0.9rem;">مسلسل رقم: ${idx + 1} / 2026</div>
            </div>

            <div class="grid grid-cols-2 gap-2 mb-2" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div style="border:1px solid #000; padding:4px; font-size:11px;">أ / سعاد محمد ( مدير عام الإدارة ) <br> ${OFFICIALS.gm.phone}</div>
                <div style="border:1px solid #000; padding:4px; font-size:11px;">أ / غادة محمد ( وكيل الإدارة ) <br> ${OFFICIALS.deputy.phone}</div>
            </div>

            <div style="margin:15px 0; text-align:right;">
                <p>السيد / <strong>${s.finalSup}</strong> &nbsp;&nbsp;&nbsp;&nbsp; توجيه: <strong>${guidName}</strong></p>
                <p style="margin-top:8px;">تم تكليفكم لمتابعة امتحانات نصف العام 2026/2025 لصفوف النقل بمدرسة :</p>
                <div style="border:2.5px solid #000; padding:8px; text-align:center; margin:8px 0; font-size:1.3rem; font-weight:900;">
                    ${getVal(s, 'اسم المدرسة')}
                </div>
                <p style="font-weight:bold; text-decoration:underline;">وحسب جدول مواعيد امتحانات الصفوف الموجودة بالمدرسة</p>
            </div>

            <p style="text-align:right; font-weight:bold; margin-top:5px; font-size:0.95rem;">ويراعى الالتزام بما يلى :</p>
            <ol class="instructions-list" dir="rtl">
                <li>التزام الموجه المقيم بتواجده مع مدير المدرسة لاستلام مظاريف الأسئلة من المطبعة السرية وتأمين سرية الامتحانات.</li>
                <li>عمل محضر غلق وفتح دولاب الأسئلة والمسئولية مشتركة بين الموجه المقيم ومدير المدرسة.</li>
                <li>التزام الموجه المقيم بتواجده بالمدرسة قبل بداية امتحانات المواد الغير مضافة.</li>
                <li>الالتزام بالحضور قبل فتح مظاريف الأسئلة بوقت كاف مع مدير المدرسة ومسئوليته حتى التسليم إلى الكنترول.</li>
                <li>التواجد بالمدرسة قبل بدء الامتحان بوقت كاف للتأكد من استيفاء جميع الإجراءات المتصلة بالامتحان.</li>
                <li>الالتزام بخروج الطلاب آخر الوقت وعدم مغادرة المدرسة إلا بعد خروج آخر طالب ومتابعة ذلك مع مدير المدرسة.</li>
                <li>التواصل مع غرفة العمليات بالإدارة في حال حدوث مخالفة على الفور.</li>
            </ol>

            <div style="border:1px solid #000; margin-top:10px;">
                <div style="background:#eee; text-align:center; font-weight:bold; padding:4px; border-bottom:1px solid #000; font-size:0.9rem;">أرقام تواصل هامة</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; font-size:11px;">
                    ${OFFICIALS.managers.map(m => `<div style="border:1px solid #eee; padding:3px;">${m.stage}: ${m.name} (${m.phone})</div>`).join('')}
                    <div style="border:1px solid #eee; padding:3px; grid-column: span 2; background:#fcfcfc;">${OFFICIALS.security.title}: ${OFFICIALS.security.name} (${OFFICIALS.security.phone})</div>
                </div>
            </div>

            <div class="signature-section">
                <div class="signature-block">
                    <p style="font-weight:bold;">يعتمد،، مدير عام الإدارة</p>
                    <p>${OFFICIALS.gm.name}</p>
                    <p>........................</p>
                </div>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = fullHtml;
    window.print();
}
