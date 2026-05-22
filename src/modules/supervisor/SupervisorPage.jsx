// ... باقي الـ imports والحافظات كما هي ...

export default function SupervisorPage() {
  // ... كل الـ state hooks كما كانت (مع إضافة printRound) ...

  // ─── دالة الطباعة بتنسيق مشابه للصفحة ─────────────────────────────────────────
  const handlePrint = () => {
    const roundsToPrint = saved.filter(s => (s.round || 1) === printRound)
    if (roundsToPrint.length === 0) {
      toast(`⚠️ لا توجد بيانات للجولة ${printRound} في هذا التاريخ`, 'warn')
      return
    }

    // تجهيز محتوى HTML بنفس تصميم البطاقات والمحاور الأصلية
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>تقييم المشرفين - ${date} - جولة ${printRound}</title>
          <style>
            /* استيراد الخطوط والمتغيرات الأساسية المشابهة للصفحة */
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', 'Tahoma', system-ui, sans-serif;
              background: #f5f7fb;
              padding: 24px;
              color: #1e293b;
            }
            :root {
              --primary: #2563eb;
              --green: #10b981;
              --red: #ef4444;
              --yellow: #f59e0b;
              --border: #e2e8f0;
              --surface: #ffffff;
              --surface2: #f8fafc;
              --text-muted: #64748b;
              --accent: #3b82f6;
            }
            .print-header {
              background: white;
              border-radius: 20px;
              padding: 20px;
              margin-bottom: 20px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              text-align: center;
            }
            .card {
              background: var(--surface);
              border-radius: 20px;
              padding: 18px;
              margin-bottom: 20px;
              border: 1px solid var(--border);
              box-shadow: 0 2px 6px rgba(0,0,0,0.03);
            }
            .axis-card {
              background: var(--surface2);
              border-radius: 16px;
              padding: 12px 16px;
              margin-bottom: 16px;
              border-right: 4px solid var(--axis-color, var(--primary));
            }
            .axis-label {
              font-weight: 700;
              font-size: 1rem;
              color: #0f172a;
            }
            .axis-total {
              background: var(--primary);
              color: white;
              padding: 4px 10px;
              border-radius: 40px;
              font-size: 0.75rem;
              font-weight: 600;
            }
            .axis-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: wrap;
              gap: 8px;
              padding: 8px 0;
              border-bottom: 1px solid var(--border);
            }
            .axis-item-label {
              font-size: 0.85rem;
              font-weight: 500;
              color: #334155;
              flex: 1;
            }
            .score-btns {
              display: flex;
              gap: 6px;
            }
            .sb {
              width: 32px;
              height: 32px;
              border-radius: 12px;
              border: 1px solid var(--border);
              background: white;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 0.8rem;
            }
            .sb.sel {
              background: var(--primary);
              border-color: var(--primary);
              color: white;
            }
            .badge {
              background: var(--green);
              color: white;
              padding: 4px 10px;
              border-radius: 40px;
              font-size: 0.7rem;
            }
            .form-row {
              display: flex;
              gap: 16px;
              flex-wrap: wrap;
              margin-bottom: 16px;
            }
            .form-group {
              flex: 1;
            }
            label {
              font-size: 0.75rem;
              font-weight: 600;
              color: var(--text-muted);
              display: block;
              margin-bottom: 4px;
            }
            input, textarea {
              width: 100%;
              padding: 8px 12px;
              border: 1px solid var(--border);
              border-radius: 14px;
              background: white;
              font-family: inherit;
            }
            .section-divider {
              height: 1px;
              background: var(--border);
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              font-size: 0.7rem;
              color: var(--text-muted);
              margin-top: 30px;
              padding-top: 16px;
              border-top: 1px solid var(--border);
            }
            @media print {
              body { background: white; padding: 0; }
              .btn, .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h2>🌙 التقييم المسائي للمشرفين</h2>
            <p>📅 ${info.day} — ${date} &nbsp;|&nbsp; 📆 ${info.week} — ${info.month} &nbsp;|&nbsp; 🔄 جولة ${printRound}</p>
            <p>✅ عدد الأجنحة المدخلة: ${roundsToPrint.length}</p>
          </div>

          ${roundsToPrint.map(w => {
            // إعادة بناء المحاور بنفس شكل AxisCard الأصلي
            const axesHtml = (w.axes || []).map((ax, idx) => {
              const axisConfig = AXES.find(a => a.key === ax.key) || AXES[idx] || { label: ax.label, color: '#3b82f6', items: [] }
              const color = axisConfig.color || '#3b82f6'
              const scoresArray = ax.scores || Array(5).fill(0)
              const total = ax.total || scoresArray.reduce((a,b)=>a+b,0)
              return `
                <div class="axis-card" style="--axis-color: ${color}">
                  <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                    <div class="axis-label">${ax.label}</div>
                    <div class="axis-total">${total} / 15</div>
                  </div>
                  ${axisConfig.items.map((item, ii) => `
                    <div class="axis-item">
                      <div class="axis-item-label">${item}</div>
                      <div class="score-btns">
                        ${[1,2,3,4,5].map(n => `
                          <span class="sb ${scoresArray[ii] === n ? 'sel' : ''}">${n}</span>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `
            }).join('')

            return `
              <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
                  <h3 style="font-size:1.1rem">📌 ${w.masandaName} — جناح ${w.wing}</h3>
                  <span class="badge">${w.totalScore} / 60</span>
                </div>
                <div class="form-row fr-2">
                  <div class="form-group">
                    <label>عدد المستفيدين</label>
                    <input type="text" readonly value="${w.beneficiaries || 0}">
                  </div>
                  <div class="form-group">
                    <label>عدد المخالفات</label>
                    <input type="text" readonly value="${w.violations || 0}">
                  </div>
                </div>
                ${axesHtml}
                <div class="section-divider"></div>
                <div class="card-title" style="font-weight:bold; margin-bottom:8px">📝 ملاحظات</div>
                <div class="form-row fr-3">
                  <div class="form-group">
                    <label>ملاحظات أمنية</label>
                    <textarea readonly rows="2">${w.obs?.amni || ''}</textarea>
                  </div>
                  <div class="form-group">
                    <label>ملاحظات فنية</label>
                    <textarea readonly rows="2">${w.obs?.fanni || ''}</textarea>
                  </div>
                  <div class="form-group">
                    <label>ملاحظات البرامج</label>
                    <textarea readonly rows="2">${w.obs?.baramij || ''}</textarea>
                  </div>
                </div>
                <div style="font-size:0.7rem; color:#64748b; margin-top:12px">
                  🧑‍💻 أدخل بواسطة: ${w.savedBy || name}
                </div>
              </div>
            `
          }).join('')}

          <div class="footer">
            تمت الطباعة بواسطة ${name} — ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
    printWindow.onafterprint = () => printWindow.close()
  }

  // باقي الكود (return, JSX) كما هو ولكن مع تغيير اسم المتغير من exportRound إلى printRound
  // وأزرار الطباعة تستخدم handlePrint و printRound
}
