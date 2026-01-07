
// --- Supervisor Status Management ---

/**
 * عرض جدول إدارة حالة الموجهين
 */
function renderStatusTable() {
    const searchVal = (document.getElementById('statusSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('statusTableBody');
    if (!tbody) return;

    const filtered = DATA.supervisors.filter(s =>
        Object.values(s).join(' ').toLowerCase().includes(searchVal)
    );

    tbody.innerHTML = filtered.map(sup => {
        const code = getVal(sup, 'كود الموجه');
        const name = getVal(sup, 'اسم الموجه');
        const isActive = isSupervisorAvailable(sup);
        const guidName = getGuidanceName(getVal(sup, 'كود التوجيه'));

        // حساب عدد المدارس المخصصة لهذا الموجه
        const assignedSchools = DATA.final.filter(s => s.finalSupCode == code);
        const schoolCount = assignedSchools.length;

        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="px-6 py-4 text-sm">${code}</td>
                <td class="px-6 py-4 text-sm font-bold">${name}</td>
                <td class="px-6 py-4 text-sm">${guidName}</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 rounded-lg text-xs font-bold ${isActive
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30'
            }">
                        ${isActive ? '✅ نشط' : '❌ غير نشط'}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button 
                            onclick="toggleSupervisorStatus('${code}')" 
                            class="px-4 py-2 rounded-lg text-xs font-bold transition-all ${isActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }"
                        >
                            ${isActive ? '🚫 إيقاف' : '✅ تفعيل'}
                        </button>
                        ${schoolCount > 0 ? `
                            <span class="text-xs px-2 py-1 bg-amber-500/20 text-amber-300 rounded-lg font-bold">
                                ${schoolCount} مدرسة
                            </span>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                    <div class="text-4xl mb-2">🔍</div>
                    لا توجد نتائج للبحث
                </td>
            </tr>
        `;
    }
}

/**
 * تبديل حالة الموجه بين نشط وغير نشط
 */
async function toggleSupervisorStatus(supCode) {
    const supervisor = DATA.supervisors.find(s => getVal(s, 'كود الموجه') == supCode);
    if (!supervisor) return showToast('الموجه غير موجود', '❌');

    const isCurrentlyActive = isSupervisorAvailable(supervisor);
    const newStatus = isCurrentlyActive ? 'غير متاح' : 'متاح';
    const supName = getVal(supervisor, 'اسم الموجه');

    // حساب المدارس المتأثرة
    const assignedSchools = DATA.final.filter(s => s.finalSupCode == supCode);

    // تحذير إذا كان الموجه لديه مدارس ويتم إيقافه
    if (isCurrentlyActive && assignedSchools.length > 0) {
        const confirmMsg = `⚠️ تحذير!\n\nالموجه "${supName}" لديه ${assignedSchools.length} مدرسة مخصصة.\n\nإذا قمت بإيقافه، ستصبح هذه المدارس بحاجة لإعادة توزيع.\n\nهل تريد المتابعة؟`;
        if (!confirm(confirmMsg)) return;
    }

    const gasUrl = document.getElementById('gasUrl')?.value;
    if (!gasUrl) return showToast('يرجى إعداد رابط GAS أولاً', '⚠️');

    toggleLoader(true, 'جاري تحديث حالة الموجه...');

    try {
        // إرسال التحديث إلى Google Sheets
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({
                type: 'supervisor',
                action: 'update',
                id: supCode,
                data: { 'الحالة': newStatus }
            })
        });

        // تحديث البيانات محلياً
        supervisor['الحالة'] = newStatus;
        supervisor['متاح'] = newStatus;
        supervisor['نشط'] = newStatus;

        // إعادة عرض الجدول
        renderStatusTable();

        // إذا تم إيقاف موجه لديه مدارس، عرض تنبيه
        if (newStatus === 'غير متاح' && assignedSchools.length > 0) {
            showToast(`تم إيقاف الموجه. ${assignedSchools.length} مدرسة بحاجة لإعادة توزيع`, '⚠️');

            // الانتقال تلقائياً لعرض المدارس المتأثرة
            setTimeout(() => {
                showAffectedSchools(supCode);
            }, 2000);
        } else {
            showToast(`تم ${isCurrentlyActive ? 'إيقاف' : 'تفعيل'} الموجه بنجاح`, '✅');
        }

    } catch (e) {
        console.error('Error updating supervisor status:', e);
        showToast('فشل في تحديث الحالة', '❌');
    } finally {
        toggleLoader(false);
    }
}

/**
 * عرض المدارس المتأثرة بإيقاف موجه
 */
function showAffectedSchools(supCode) {
    const supervisor = DATA.supervisors.find(s => getVal(s, 'كود الموجه') == supCode);
    const supName = getVal(supervisor, 'اسم الموجه');
    const affectedSchools = DATA.final.filter(s => s.finalSupCode == supCode);

    if (affectedSchools.length === 0) return;

    const schoolsList = affectedSchools.map(s => `• ${getVal(s, 'اسم المدرسة')}`).join('\n');

    alert(`📋 المدارس التي كانت مخصصة للموجه "${supName}":\n\n${schoolsList}\n\nيمكنك إعادة توزيعها من خلال:\n1. الانتقال إلى علامة تبويب "النتائج"\n2. استخدام زر "⚡ توزيع وإصلاح" لإعادة التوزيع التلقائي\n3. أو استخدام التغيير اليدوي لكل مدرسة`);
}

/**
 * الحصول على المدارس التي لديها موجهين غير نشطين
 */
function getSchoolsWithInactiveSupervisors() {
    return DATA.final.filter(school => {
        if (!school.finalSupCode) return false;
        const supervisor = DATA.supervisors.find(s =>
            getVal(s, 'كود الموجه') == school.finalSupCode
        );
        return supervisor && !isSupervisorAvailable(supervisor);
    });
}

/**
 * عرض تقرير المدارس بدون موجه أو بموجهين غير نشطين
 */
function generateUnassignedSchoolsReport() {
    const unassigned = DATA.final.filter(s => !s.finalSup || s.finalSup === '-');
    const inactiveAssigned = getSchoolsWithInactiveSupervisors();
    const allProblematic = [...unassigned, ...inactiveAssigned];

    if (allProblematic.length === 0) {
        return showToast('جميع المدارس موزعة على موجهين نشطين ✅', '✅');
    }

    let rowsHtml = allProblematic.map((s, idx) => {
        const sup = DATA.supervisors.find(su => getVal(su, 'كود الموجه') == s.finalSupCode);
        const reason = !s.finalSup || s.finalSup === '-'
            ? 'غير موزعة'
            : 'موجه غير نشط';

        return `
            <tr>
                <td>${idx + 1}</td>
                <td style="text-align:right">${getVal(s, 'اسم المدرسة')}</td>
                <td>${getVal(s, 'المرحلة')}</td>
                <td>${getVal(s, 'النوعية')}</td>
                <td>${getGuidanceName(getVal(s, 'كود التوجيه'))}</td>
                <td style="color:#c00; font-weight:bold">${reason}</td>
            </tr>
        `;
    }).join('');

    const fullHtml = `
        <div class="report-page">
            <div class="report-header">
                <div style="text-align:right">
                    <p style="font-weight:900; font-size:14px;">محافظة الجيزة</p>
                    <p style="font-weight:900; font-size:14px;">إدارة العمرانية التعليمية</p>
                    <p style="font-size:11px; margin-top:3px;">تاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                <div class="report-title-box" style="flex:1; margin:0 15px;">
                    <div style="font-weight:900; font-size:16px;">تقرير المدارس بحاجة لتوزيع</div>
                    <div style="font-size:13px; margin-top:3px; font-weight:normal;">المدارس غير الموزعة أو الموزعة على موجهين غير نشطين</div>
                </div>
                <div style="text-align:left">
                    <div style="width:70px; height:70px; border:2px solid #000; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:10px; background:#f8f9fa;">
                        <img src="logo.png" style="width:100%; height:100%; object-fit:contain;" alt="شعار">
                    </div>
                </div>
            </div>

            <div style="margin:20px 0; padding:10px; background:#ffebeb; border:1px solid #ffcccc; text-align:center; color:#c00;">
                <strong>إجمالي المدارس: ${allProblematic.length} مدرسة</strong>
                <div style="font-size:12px; margin-top:5px;">
                    غير موزعة: ${unassigned.length} | موجه غير نشط: ${inactiveAssigned.length}
                </div>
            </div>

            <table class="official-table">
                <thead>
                    <tr style="background:#e9ecef;">
                        <th style="width:50px;">م</th>
                        <th>اسم المدرسة</th>
                        <th>المرحلة</th>
                        <th>النوعية</th>
                        <th>التوجيه</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return showToast('يرجى السماح بالنوافذ المنبثقة', '⚠️');

    const css = `
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
            .report-page { min-height: 100vh; }
            .report-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .report-title-box { text-align: center; border: 2px solid #000; padding: 5px; border-radius: 8px; }
            .official-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            .official-table th, .official-table td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
            @media print {
                @page { size: A4; margin: 0.5cm; }
                body { margin: 0; padding: 0; }
            }
        </style>
    `;

    printWindow.document.write(`<html><head><title>تقرير المدارس بحاجة لتوزيع</title>${css}</head><body>${fullHtml}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { setTimeout(() => { printWindow.print(); }, 500); };
}

// تصدير الدوال للوصول العام
window.renderStatusTable = renderStatusTable;
window.toggleSupervisorStatus = toggleSupervisorStatus;
window.getSchoolsWithInactiveSupervisors = getSchoolsWithInactiveSupervisors;
window.showAffectedSchools = showAffectedSchools;
