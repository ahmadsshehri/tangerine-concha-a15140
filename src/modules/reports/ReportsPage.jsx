import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, setDoc, getDoc, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../components/Toast'
import { MASANDAT, AXES, MOVEMENT_TYPES, TOOL_REPORT_STATUSES, FACILITY_REPORT_STATUSES } from '../../lib/constants'
import SupervisorBiasReport from './SupervisorBiasReport'

// ─── تصدير Excel ──────────────────────────────────────────────────────────────
function exportToExcel(rows, headers, filename) {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const hRow = headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')
  const dRows = rows.map(row =>
    '<Row>' + row.map(c => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('') + '</Row>'
  ).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="التقرير"><Table><Row>${hRow}</Row>${dRows}</Table></Worksheet></Workbook>`
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename + '.xls'
  a.click()
}

// ─── طباعة ────────────────────────────────────────────────────────────────────
function printTable(title, headers, rows) {
  const th = headers.map(h => `<th>${h}</th>`).join('')
  const tr = rows.map(row => `<tr>${row.map(c => `<td>${String(c ?? '—')}</td>`).join('')}</tr>`).join('')
  const html = `<html dir="rtl"><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;direction:rtl}
    h2{text-align:center;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:right}
    th{background:#d9e1f2;font-weight:bold}
    tr:nth-child(even){background:#f5f7fa}
    .ft{text-align:center;margin-top:16px;font-size:11px;color:#888}
  </style></head><body>
  <h2>${title}</h2>
  <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
  <div class="ft">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
  </body></html>`
  const w = window.open('', '_blank')
  w.document.write(html); w.document.close()
  setTimeout(() => w.print(), 400)
}

// ─── شريط أزرار التصدير ───────────────────────────────────────────────────────
function ExportBar({ onPrint, onExcel, count }) {
  if (!count) return null
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
        {count} سجل
      </span>
      <button className="btn btn-outline btn-sm" onClick={onPrint}>🖨️ طباعة</button>
      <button className="btn btn-green btn-sm" onClick={onExcel}>📊 Excel</button>
    </div>
  )
}

// ─── التبويبات — أضفنا supervisor_bias للمدير فقط ────────────────────────────
const ALL_REPORT_TABS = [
  { id: 'daily',           label: '📊 التقرير اليومي',   perm: 'reports_daily',      adminOnly: false },
  { id: 'wing',            label: '🏠 تقرير الجناح',     perm: 'supervisor_reports', adminOnly: false },
  { id: 'supervisor',      label: '🌙 ملاحظات المشرفين', perm: 'supervisor_reports', adminOnly: false },
  { id: 'caretaker',       label: '📋 تقارير القيّمين',  perm: 'caretaker_reports',  adminOnly: false },
  { id: 'needs',           label: '📏 الاحتياج',          perm: 'custody_reports',    adminOnly: false },
  { id: 'movements',       label: '🔄 الحركات',           perm: 'custody_reports',    adminOnly: false },
  { id: 'tool',            label: '🔧 بلاغات الأدوات',    perm: 'reports_view_all',   adminOnly: false },
  { id: 'facility',        label: '🏗️ بلاغات الصيانة',  perm: 'reports_view_all',   adminOnly: false },
  { id: 'inventory',       label: '📦 عهدة الأجنحة',      perm: 'custody_reports',    adminOnly: false },
  { id: 'supervisor_bias', label: '🎯 مقارنة المشرفين',  perm: null,                 adminOnly: true  },
]

export default function ReportsPage() {
  const { isAdmin, hasPerm } = useAuth()
  const TAB_LIST = ALL_REPORT_TABS.filter(t =>
    t.adminOnly ? isAdmin : (isAdmin || hasPerm(t.perm))
  )
  const [tab, setTab] = useState(null)
  const activeTab = TAB_LIST.find(t => t.id === tab)?.id || TAB_LIST[0]?.id || 'daily'
  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-title">
          <div className="icon" style={{ background: 'rgba(26,86,219,.1)' }}>📈</div>
          التقارير والمتابعة
        </div>
      </div>
      <div className="tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        {TAB_LIST.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            style={t.adminOnly ? {
              color: activeTab === t.id ? 'var(--purple)' : undefined,
              borderBottomColor: activeTab === t.id ? 'var(--purple)' : undefined
            } : {}}
          >
            {t.label}
            {t.adminOnly && <span style={{ fontSize: 9, marginRight: 3, opacity: .6 }}>🔒</span>}
          </button>
        ))}
      </div>
      {activeTab === 'daily'           && <DailyReport />}
      {activeTab === 'wing'            && <WingReport />}
      {activeTab === 'supervisor'      && <SupervisorReport />}
      {activeTab === 'caretaker'       && <CaretakerReport />}
      {activeTab === 'needs'           && <NeedsReport />}
      {activeTab === 'movements'       && <MovementsReport />}
      {activeTab === 'tool'            && <ToolReport />}
      {activeTab === 'facility'        && <FacilityReport />}
      {activeTab === 'inventory'       && <InventoryReport />}
      {activeTab === 'supervisor_bias' && isAdmin && <SupervisorBiasReport />}
    </div>
  )
}

// ─── مكوّن الإجراء المتابع ─────────────────────────────────────────────────────
function FollowUpCell({ recordId, field, existing }) {
  const { name } = useAuth()
  const toast = useToast()
  const [open,   setOpen]   = useState(false)
  const [text,   setText]   = useState(existing?.text || '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(existing)

  const save = async () => {
    if (!text.trim()) return
    setSaving(true)
    const id  = `followup_${recordId}_${field}`
    const ref = doc(db, 'followups', id)
    try {
      const data = {
        id, recordId, field, text,
        by: name, at: new Date().toISOString()
      }
      await setDoc(ref, data)
      setSaved(data); setOpen(false)
      toast('✅ تم حفظ الإجراء')
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setSaving(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      {saved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            fontSize: 12, color: 'var(--green)', fontWeight: 700,
            background: 'var(--green-dim)', padding: '4px 8px',
            borderRadius: 'var(--rxs)', display: 'flex', alignItems: 'center', gap: 4
          }}>
            ✅ تم الإجراء
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{saved.text}</div>
          <button
            onClick={() => { setText(saved.text); setOpen(true) }}
            style={{ fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', padding: 0 }}
          >
            تعديل
          </button>
        </div>
      ) : (
        <button className="btn btn-outline btn-xs" onClick={() => setOpen(true)}>
          + إجراء
        </button>
      )}

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 900, padding: 20
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,.15)'
          }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>📝 تدوين الإجراء</div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="اكتب الإجراء الذي تم اتخاذه..."
              style={{
                width: '100%', minHeight: 100, padding: '10px 12px',
                background: 'var(--surface2)', border: '1.5px solid var(--border)',
                borderRadius: 'var(--rs)', color: 'var(--text)',
                fontFamily: 'Cairo', fontSize: 13, direction: 'rtl', resize: 'vertical'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>إلغاء</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !text.trim()}>
                {saving ? '⏳...' : '💾 حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── جلب الإجراءات ────────────────────────────────────────────────────────────
async function fetchFollowups(ids) {
  if (!ids.length) return {}
  const snap = await getDocs(collection(db, 'followups'))
  const map  = {}
  snap.docs.forEach(d => {
    const data = d.data()
    if (ids.includes(data.recordId)) {
      if (!map[data.recordId]) map[data.recordId] = {}
      map[data.recordId][data.field] = data
    }
  })
  return map
}

// ─── التقرير اليومي ───────────────────────────────────────────────────────────
const DAR_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

function DailyReport() {
  const { name: uName } = useAuth()
  const toast = useToast()
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0])
  const [wings,   setWings]   = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!date) return
    setLoading(true)
    try {
      const q = query(collection(db, 'wings'), where('date', '==', date))
      const s = await getDocs(q)
      setWings(s.docs.map(d => d.data()))
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }, [date, toast])

  useEffect(() => { load() }, [load])

  const byM = {}
  MASANDAT.forEach(m => byM[m.id] = [])
  wings.forEach(w => { if (byM[w.masandaId]) byM[w.masandaId].push(w) })

  const sum = MASANDAT.map(m => {
    const ws = byM[m.id]; if (!ws.length) return null
    return {
      m, ws,
      avg:   ws.reduce((s,w) => s + w.totalScore,          0) / ws.length,
      ben:   ws.reduce((s,w) => s + (w.beneficiaries || 0), 0),
      vio:   ws.reduce((s,w) => s + (w.violations   || 0), 0),
      axAvg: AXES.map((_,ai) => {
        const v = ws.map(w => w.axes?.[ai]?.total || 0).filter(v => v > 0)
        return v.length ? v.reduce((a,b) => a+b, 0) / v.length : 0
      })
    }
  }).filter(Boolean)

  const tB    = sum.reduce((s,x) => s + x.ben, 0)
  const tV    = sum.reduce((s,x) => s + x.vio, 0)
  const gA    = sum.length ? sum.reduce((s,x) => s + x.avg, 0) / sum.length : 0
  const rankable = sum.filter(x => !x.m.excludeFromRanking)
  const best  = [...rankable].sort((a,b) => b.avg - a.avg).slice(0,3)
  const worst = [...rankable].sort((a,b) => a.avg - b.avg).slice(0,3)
  const d     = new Date(date + 'T12:00:00')
  const sc    = v => v >= 83 ? '#057a55' : v >= 58 ? '#b45309' : '#c81e1e'
  const bg    = v => v >= 83 ? '#e3f9ee' : v >= 58 ? '#fef3c7' : '#fde8e8'
  const pilC  = pct => pct >= 83 ? 'pill-g' : pct >= 58 ? 'pill-o' : 'pill-r'

  const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',sans-serif;background:#fff;color:#1e2533;direction:rtl;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.print-header{background:linear-gradient(135deg,#1e3a8a,#1a56db);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.ph-right{display:flex;flex-direction:column;gap:3px;} .ph-title{font-size:17px;font-weight:900;} .ph-badge{background:rgba(255,255,255,.2);border-radius:6px;padding:4px 10px;font-size:10px;font-weight:700;margin-top:4px;display:inline-block;} .ph-left{text-align:left;font-size:11px;opacity:.85;line-height:1.7;}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;padding:0 4px;}
.stat-box{border-radius:8px;padding:10px 12px;text-align:center;} .stat-box-b{background:#ebf0fd;border:1.5px solid #1a56db;} .stat-box-r{background:#fde8e8;border:1.5px solid #c81e1e;} .stat-box-o{background:#fef3c7;border:1.5px solid #b45309;} .stat-box-g{background:#e3f9ee;border:1.5px solid #057a55;}
.stat-val{font-size:22px;font-weight:900;line-height:1;} .stat-val-b{color:#1a56db;} .stat-val-r{color:#c81e1e;} .stat-val-o{color:#b45309;} .stat-val-g{color:#057a55;} .stat-lbl{font-size:10px;color:#5f6b7e;font-weight:700;margin-top:3px;}
.sec{margin-bottom:10px;padding:0 4px;} .sec-title{font-size:11px;font-weight:800;color:#1a56db;padding:6px 10px;background:#ebf0fd;border-right:4px solid #1a56db;border-radius:0 6px 6px 0;margin-bottom:7px;}
table{width:100%;border-collapse:collapse;font-size:10px;} th{background:#1a56db;color:#fff;padding:6px 8px;text-align:right;font-weight:700;font-size:10px;} td{padding:5px 8px;border-bottom:1px solid #e2e6ed;font-weight:500;} tr:nth-child(even) td{background:#f8f9fb;} tr.total-row td{background:#ebf0fd;font-weight:800;color:#1a56db;border-top:2px solid #1a56db;}
.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;} .pill-g{background:#e3f9ee;color:#057a55;border:1px solid #057a55;} .pill-o{background:#fef3c7;color:#b45309;border:1px solid #b45309;} .pill-r{background:#fde8e8;color:#c81e1e;border:1px solid #c81e1e;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;padding:0 4px;} .rank-box{border-radius:8px;overflow:hidden;border:1px solid #e2e6ed;} .rank-hdr{padding:7px 12px;font-size:11px;font-weight:800;} .rank-hdr-g{background:#057a55;color:#fff;} .rank-hdr-r{background:#c81e1e;color:#fff;} .rank-item{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-top:1px solid #eef1f5;font-size:10px;}
.notes-box{border-radius:8px;padding:10px 12px;margin-bottom:8px;} .note-hdr{font-size:10px;font-weight:800;margin-bottom:5px;} .note-row{display:grid;grid-template-columns:70px 80px 1fr;gap:6px;font-size:10px;padding:3px 0;}
.notes-box.notes-red{background:#fde8e8;border:1px solid #f5a3a3;} .notes-box.notes-red .note-hdr{color:#c81e1e;} .notes-box.notes-red .note-row{border-bottom:1px solid #f8caca;}
.notes-box.notes-yellow{background:#fef3c7;border:1px solid #fbbf24;} .notes-box.notes-yellow .note-hdr{color:#b45309;} .notes-box.notes-yellow .note-row{border-bottom:1px solid #fde68a;}
.notes-box.notes-green{background:#e3f9ee;border:1px solid #86d7b0;} .notes-box.notes-green .note-hdr{color:#057a55;} .notes-box.notes-green .note-row{border-bottom:1px solid #bfead3;}
.print-footer{border-top:2px solid #e2e6ed;margin-top:14px;padding:8px 4px 0;display:flex;justify-content:space-between;font-size:9px;color:#9aa3b0;}
@media print{@page{size:A4;margin:8mm;}body{font-size:10px;}.no-break{page-break-inside:avoid;}button{display:none!important;}}`

  const doPrint = () => {
    if (!wings.length) { toast('⚠️ لا توجد بيانات', 'warn'); return }
    const notesHtml = ['amni','fanni','baramij'].some(k => wings.some(w => w.obs?.[k]))
      ? `<div class="sec no-break"><div class="sec-title">📝 رابعاً: الملاحظات المرصودة</div>${
          [{key:'amni',label:'🛡️ أمني',cls:'notes-red'},{key:'fanni',label:'🔧 فني',cls:'notes-yellow'},{key:'baramij',label:'📚 برامج',cls:'notes-green'}]
          .map(item => { const rows=wings.filter(w=>w.obs?.[item.key]); if(!rows.length)return ''; return `<div class="notes-box ${item.cls}"><div class="note-hdr">${item.label}</div>${rows.map(w=>`<div class="note-row"><span><strong>جناح ${w.wing}</strong></span><span>${w.masandaName}</span><span>${w.obs[item.key]}</span></div>`).join('')}</div>`; }).join('')
        }</div>` : ''

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${PRINT_CSS}</style></head><body>
<div class="print-header">
  <div class="ph-right"><div class="ph-title">📊 التقرير اليومي — الفترة المسائية</div><div class="ph-badge">المراكز التأهيلية التخصصية</div></div>
  <div class="ph-left"><div>📅 ${DAR_AR[d.getDay()]} | ${date}</div><div>👤 أعده: ${uName}</div><div>🕐 ${new Date().toLocaleTimeString('ar-SA')}</div></div>
</div>
<div class="stats-row no-break">
  <div class="stat-box stat-box-b"><div class="stat-val stat-val-b">${tB.toLocaleString()}</div><div class="stat-lbl">إجمالي المستفيدين</div></div>
  <div class="stat-box stat-box-r"><div class="stat-val stat-val-r">${tV}</div><div class="stat-lbl">إجمالي المخالفات</div></div>
  <div class="stat-box stat-box-o"><div class="stat-val stat-val-o">${gA.toFixed(1)}</div><div class="stat-lbl">متوسط الدرجات / 60</div></div>
  <div class="stat-box stat-box-g"><div class="stat-val stat-val-g">${wings.length}</div><div class="stat-lbl">أجنحة مُقيَّمة</div></div>
</div>
<div class="sec no-break"><div class="sec-title">📋 أولاً: تفصيل الأجنحة</div>
<table><thead><tr><th>الجناح</th><th>المساندة</th><th>المستفيدون</th><th>المخالفات</th><th>الالتزام/15</th><th>السلوك/15</th><th>التفاعل/15</th><th>السكن/15</th><th>الإجمالي/60</th><th>المدخِل</th></tr></thead>
<tbody>${wings.map(w=>{const pct=(w.totalScore/60)*100;return`<tr><td><strong>جناح ${w.wing}</strong></td><td>${w.masandaName}</td><td>${w.beneficiaries||'—'}</td><td style="color:#c81e1e;font-weight:800">${w.violations||0}</td>${w.axes.map(a=>`<td style="text-align:center">${a.total}</td>`).join('')}<td><span class="pill ${pilC(pct)}">${w.totalScore}/60</span></td><td style="color:#5f6b7e">${w.savedBy||'—'}</td></tr>`;}).join('')}
<tr class="total-row"><td colspan="2"><strong>الإجمالي</strong></td><td>${tB}</td><td>${tV}</td><td colspan="4"></td><td><strong>${gA.toFixed(1)}/60</strong></td><td></td></tr>
</tbody></table></div>
<div class="sec no-break"><div class="sec-title">📊 ثانياً: ملخص بالمساندة</div>
<table><thead><tr><th>المساندة</th><th>أجنحة مُقيَّمة</th><th>المستفيدون</th><th>المخالفات</th><th>متوسط الدرجة</th><th>التقييم</th></tr></thead>
<tbody>${sum.map(x=>{const pct=(x.avg/60)*100;return`<tr><td><strong>${x.m.name}</strong></td><td style="text-align:center">${x.ws.length}/${x.m.wings.length}</td><td>${x.ben}</td><td style="color:#c81e1e;font-weight:700">${x.vio}</td><td style="text-align:center">${x.avg.toFixed(1)}/60</td><td><span class="pill ${pilC(pct)}">${pct>=83?'ممتاز':pct>=58?'متوسط':'ضعيف'}</span></td></tr>`;}).join('')}</tbody></table></div>
<div class="two-col no-break">
  <div class="rank-box"><div class="rank-hdr rank-hdr-g">🏆 أفضل 3 مساندات</div>${best.map((x,i)=>`<div class="rank-item"><span>${['🥇','🥈','🥉'][i]} ${x.m.name}</span><span class="pill pill-g">${x.avg.toFixed(1)}/60</span></div>`).join('')}</div>
  <div class="rank-box"><div class="rank-hdr rank-hdr-r">⚠️ تحتاج متابعة</div>${worst.map((x,i)=>`<div class="rank-item"><span>🔻${i+1} ${x.m.name}</span><span class="pill pill-r">${x.avg.toFixed(1)}/60</span></div>`).join('')}</div>
</div>
${notesHtml}
<div class="print-footer"><span>📅 ${new Date().toLocaleDateString('ar-SA')} — ${new Date().toLocaleTimeString('ar-SA')}</span><span>المراكز التأهيلية التخصصية</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),600);<\/script></body></html>`
    const w = window.open('','_blank'); w.document.write(html); w.document.close()
  }

  const doExcel = () => {
    if (!wings.length) { toast('⚠️ لا توجد بيانات', 'warn'); return }
    const h1 = ['الجناح','المساندة','المستفيدون','المخالفات','الالتزام/15','السلوك/15','التفاعل/15','السكن/15','الإجمالي/60','المدخِل']
    const r1 = wings.map(w => [`جناح ${w.wing}`, w.masandaName, w.beneficiaries||0, w.violations||0, ...w.axes.map(a=>a.total), w.totalScore, w.savedBy||''])
    exportToExcel(r1, h1, `التقرير-اليومي-${date}`)
  }

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
          <div className="form-group" style={{ flex:1 }}>
            <label>التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button className="btn btn-primary"  onClick={load}     >🔍 عرض</button>
          <button className="btn btn-outline"  onClick={doPrint}  disabled={!wings.length}>🖨️ طباعة</button>
          <button className="btn btn-green"    onClick={doExcel}  disabled={!wings.length}>📊 Excel</button>
        </div>
      </div>

      {loading && <div style={{ height:120 }} className="skeleton" />}

      {!loading && wings.length === 0 && (
        <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا توجد بيانات لهذا التاريخ</div></div>
      )}

      {!loading && wings.length > 0 && (
        <>
          <div style={{ background:'linear-gradient(135deg,#1e3a8a,#1a56db)', borderRadius:'var(--r)', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, color:'#fff' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:900 }}>🏛️ التقرير اليومي — الفترة المسائية</div>
              <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>{DAR_AR[d.getDay()]} | {date}</div>
            </div>
            <div style={{ textAlign:'left', fontSize:12, opacity:.85 }}><div>👤 {uName}</div></div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {[
              {label:'إجمالي المستفيدين', value:tB.toLocaleString(), color:'#1a56db', bg:'#ebf0fd'},
              {label:'إجمالي المخالفات',  value:tV,                  color:'#c81e1e', bg:'#fde8e8'},
              {label:'متوسط الدرجات/60',  value:gA.toFixed(1),       color:'#b45309', bg:'#fef3c7'},
              {label:'أجنحة مُقيَّمة',    value:wings.length,        color:'#057a55', bg:'#e3f9ee'},
            ].map((s,i)=>(
              <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.color}`, borderRadius:'var(--r)', padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:26, fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#5f6b7e', fontWeight:700, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-title">📋 أولاً: ملخص الأداء — تفصيل الأجنحة</div>
            <div className="table-wrap"><table>
              <thead><tr><th>الجناح</th><th>المساندة</th><th>المستفيدون</th><th>المخالفات</th><th>الالتزام/15</th><th>السلوك/15</th><th>التفاعل/15</th><th>السكن/15</th><th>الإجمالي/60</th><th>المدخِل</th></tr></thead>
              <tbody>
                {wings.map((w,i)=>{
                  const pct=(w.totalScore/60)*100
                  return (<tr key={i}>
                    <td style={{fontWeight:800}}>جناح {w.wing}</td>
                    <td style={{fontSize:12}}>{w.masandaName}</td>
                    <td style={{textAlign:'center',color:'#1a56db',fontWeight:700}}>{w.beneficiaries||'—'}</td>
                    <td style={{textAlign:'center',color:'#c81e1e',fontWeight:700}}>{w.violations||0}</td>
                    {w.axes.map((a,ai)=><td key={ai} style={{textAlign:'center',fontSize:12}}>{a.total}/15</td>)}
                    <td><span style={{display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:800,background:bg(pct),color:sc(pct),border:`1px solid ${sc(pct)}`}}>{w.totalScore}/60</span></td>
                    <td style={{fontSize:11,color:'var(--text-muted)'}}>{w.savedBy||'—'}</td>
                  </tr>)
                })}
              </tbody>
            </table></div>
          </div>

          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-title">📊 ثانياً: ملخص بالمساندة</div>
            <div className="table-wrap"><table>
              <thead><tr><th>المساندة</th><th>أجنحة</th><th>المستفيدون</th><th>المخالفات</th><th>الالتزام</th><th>السلوك</th><th>التفاعل</th><th>السكن</th><th>متوسط الدرجة</th></tr></thead>
              <tbody>
                {sum.map(({m,ws,avg,ben,vio,axAvg})=>{
                  const pct=(avg/60)*100
                  return (<tr key={m.id}>
                    <td style={{fontWeight:800}}>{m.name}</td>
                    <td style={{textAlign:'center'}}>{ws.length}/{m.wings.length}</td>
                    <td style={{textAlign:'center',color:'#1a56db'}}>{ben}</td>
                    <td style={{textAlign:'center',color:'#c81e1e'}}>{vio}</td>
                    {axAvg.map((v,i)=><td key={i} style={{textAlign:'center',fontSize:12}}>{v.toFixed(1)}</td>)}
                    <td><span style={{display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:800,background:bg(pct),color:sc(pct),border:`1px solid ${sc(pct)}`}}>{avg.toFixed(1)}/60</span></td>
                  </tr>)
                })}
                <tr style={{background:'#ebf0fd',fontWeight:800}}>
                  <td>الإجمالي</td><td style={{textAlign:'center'}}>{wings.length}</td>
                  <td style={{textAlign:'center',color:'#1a56db'}}>{tB}</td>
                  <td style={{textAlign:'center',color:'#c81e1e'}}>{tV}</td>
                  <td colSpan={4}></td>
                  <td style={{color:'#1a56db'}}>{gA.toFixed(1)}/60</td>
                </tr>
              </tbody>
            </table></div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div className="card">
              <div className="card-title" style={{color:'#057a55'}}>🏆 ثالثاً: أفضل 3 مساندات</div>
              {best.map((x,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontWeight:700}}>{['🥇','🥈','🥉'][i]} {x.m.name}</span>
                  <span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:800,background:'#e3f9ee',color:'#057a55',border:'1px solid #057a55'}}>{x.avg.toFixed(1)}/60</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title" style={{color:'#c81e1e'}}>⚠️ تحتاج متابعة</div>
              {worst.map((x,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontWeight:700}}>🔻{i+1} {x.m.name}</span>
                  <span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:800,background:'#fde8e8',color:'#c81e1e',border:'1px solid #c81e1e'}}>{x.avg.toFixed(1)}/60</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-title">📊 توزيع الدرجات</div>
            {wings.map((w,i)=>{ const pct=(w.totalScore/60)*100; const c=sc(pct); return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{minWidth:80,fontSize:12,fontWeight:700,color:'var(--text-muted)'}}>جناح {w.wing}</div>
                <div style={{flex:1,height:12,background:'var(--border)',borderRadius:6,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:c,borderRadius:6,transition:'width .4s'}} />
                </div>
                <div style={{minWidth:40,fontSize:12,fontWeight:800,color:c}}>{w.totalScore}</div>
              </div>
            )})}
          </div>

          {['amni','fanni','baramij'].some(k => wings.some(w => w.obs?.[k])) && (
            <div className="card">
              <div className="card-title">📝 رابعاً: الملاحظات المرصودة</div>
              {[
                {key:'amni',    label:'🛡️ المسار الأمني',  border:'#c81e1e', bg:'#fde8e8'},
                {key:'fanni',   label:'🔧 المسار الفني',    border:'#b45309', bg:'#fef3c7'},
                {key:'baramij', label:'📚 مسار البرامج',    border:'#057a55', bg:'#e3f9ee'},
              ].map(item => {
                const rows = wings.filter(w => w.obs?.[item.key]); if (!rows.length) return null
                return (
                  <div key={item.key} style={{marginBottom:12}}>
                    <div style={{fontSize:12.5,fontWeight:800,marginBottom:7,padding:'5px 10px',background:item.bg,borderRight:`4px solid ${item.border}`,borderRadius:'0 6px 6px 0'}}>{item.label}</div>
                    <div className="table-wrap"><table>
                      <thead><tr><th>الجناح</th><th>المساندة</th><th>الملاحظة</th></tr></thead>
                      <tbody>{rows.map((w,i)=><tr key={i}><td style={{fontWeight:700}}>جناح {w.wing}</td><td style={{fontSize:12}}>{w.masandaName}</td><td style={{fontSize:13}}>{w.obs[item.key]}</td></tr>)}</tbody>
                    </table></div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── تقارير المشرفين ──────────────────────────────────────────────────────────
function SupervisorReport() {
  const toast = useToast()
  const [wings,     setWings]     = useState([])
  const [followups, setFollowups] = useState({})
  const [loading,   setLoading]   = useState(false)
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [selMasanda, setSelMasanda] = useState('')
  const [selWing,    setSelWing]    = useState('')
  const [obsType,    setObsType]    = useState('all')
  const [showEmpty,  setShowEmpty]  = useState(false)

  const wingOptions = selMasanda ? MASANDAT.find(m => m.id === selMasanda)?.wings || [] : []

  const load = async () => {
    if (!from || !to) { toast('⚠️ حدد الفترة الزمنية', 'warn'); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'wings'))
      let all = snap.docs.map(d => d.data())
      all = all.filter(w => w.date >= from && w.date <= to)
      if (selMasanda) all = all.filter(w => w.masandaId === selMasanda)
      if (selWing)    all = all.filter(w => String(w.wing) === String(selWing))
      all.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
      setWings(all)
      const ids = all.map(w => `${w.date}_${w.masandaId}_${w.wing}`)
      const fu  = await fetchFollowups(ids)
      setFollowups(fu)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }

  const hasObs = (w) => {
    if (obsType === 'all')     return w.obs?.amni || w.obs?.fanni || w.obs?.baramij
    if (obsType === 'amni')    return w.obs?.amni
    if (obsType === 'fanni')   return w.obs?.fanni
    if (obsType === 'baramij') return w.obs?.baramij
    return true
  }

  const filtered = showEmpty ? wings : wings.filter(w => hasObs(w))
  const scoreColor = v => v >= 50 ? 'var(--green)' : v >= 35 ? 'var(--orange)' : 'var(--red)'
  const obsLabel = { amni: 'أمنية', fanni: 'فنية', baramij: 'برامج' }
  const obsColor = { amni: 'var(--red)', fanni: 'var(--orange)', baramij: 'var(--blue)' }

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔍 فلاتر البحث</div>
        <div className="form-row fr-3" style={{ marginBottom: 12 }}>
          <div className="form-group"><label>من تاريخ *</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="form-group"><label>إلى تاريخ *</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="form-group">
            <label>المساندة</label>
            <select value={selMasanda} onChange={e => { setSelMasanda(e.target.value); setSelWing('') }}>
              <option value="">كل المساندات</option>
              {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الجناح</label>
            <select value={selWing} onChange={e => setSelWing(e.target.value)} disabled={!selMasanda}>
              <option value="">كل الأجنحة</option>
              {wingOptions.map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>نوع الملاحظة</label>
            <select value={obsType} onChange={e => setObsType(e.target.value)}>
              <option value="all">كل الملاحظات</option>
              <option value="amni">الملاحظات الأمنية فقط</option>
              <option value="fanni">الملاحظات الفنية فقط</option>
              <option value="baramij">ملاحظات البرامج فقط</option>
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ opacity: 0 }}>_</label>
            <button className="btn btn-primary" onClick={load} style={{ width: '100%' }}>🔍 عرض النتائج</button>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
          عرض الأجنحة بدون ملاحظات أيضاً
        </label>
      </div>

      {loading && <div style={{ height: 200 }} className="skeleton" />}

      {!loading && wings.length > 0 && (
        <>
          <ExportBar count={filtered.length}
            onExcel={() => {
              const headers = ['التاريخ','المساندة','الجناح','الدرجة','ملاحظة أمنية','إجراء أمني','ملاحظة فنية','إجراء فني','ملاحظات برامج','إجراء برامج','المستفيدون','المخالفات']
              const rows = filtered.map(w => {
                const rid = `${w.date}_${w.masandaId}_${w.wing}`
                const fu  = followups[rid] || {}
                return [w.date, w.masandaName, isNaN(w.wing)?w.wing:`جناح ${w.wing}`, w.totalScore, w.obs?.amni||'', fu['amni']?.text||'', w.obs?.fanni||'', fu['fanni']?.text||'', w.obs?.baramij||'', fu['baramij']?.text||'', w.beneficiaries||0, w.violations||0]
              })
              exportToExcel(rows, headers, 'تقرير-المشرفين')
            }}
            onPrint={() => {
              const headers = ['التاريخ','المساندة','الجناح','الدرجة','ملاحظة أمنية','إجراء أمني','ملاحظة فنية','ملاحظات برامج']
              const rows = filtered.map(w => {
                const rid = `${w.date}_${w.masandaId}_${w.wing}`
                const fu  = followups[rid] || {}
                return [w.date, w.masandaName, isNaN(w.wing)?w.wing:`جناح ${w.wing}`, `${w.totalScore}/60`, w.obs?.amni||'—', fu['amni']?.text||'—', w.obs?.fanni||'—', w.obs?.baramij||'—']
              })
              printTable('تقرير الملاحظات المسائية', headers, rows)
            }}
          />

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
            {[
              { label: 'إجمالي السجلات',    value: wings.length,                             icon: '📋', color: 'var(--accent)' },
              { label: 'لها ملاحظات أمنية', value: wings.filter(w => w.obs?.amni).length,   icon: '🛡️', color: 'var(--red)'    },
              { label: 'لها ملاحظات فنية',  value: wings.filter(w => w.obs?.fanni).length,  icon: '🔧', color: 'var(--orange)' },
              { label: 'لها ملاحظات برامج', value: wings.filter(w => w.obs?.baramij).length,icon: '📚', color: 'var(--blue)'   },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(w => {
              const rid = `${w.date}_${w.masandaId}_${w.wing}`
              const fu  = followups[rid] || {}
              const obsToShow = obsType === 'all' ? ['amni','fanni','baramij'].filter(k => w.obs?.[k]) : [obsType].filter(k => w.obs?.[k])
              if (obsToShow.length === 0 && !showEmpty) return null
              return (
                <div key={rid} className="card" style={{ borderRight: `3px solid ${scoreColor(w.totalScore)}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{w.masandaName} — {isNaN(w.wing) ? w.wing : `جناح ${w.wing}`}</div>
                      <span className="badge badge-dim">{w.date}</span>
                      <span style={{ fontWeight: 800, color: scoreColor(w.totalScore), fontSize: 13 }}>{w.totalScore} / 60</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.savedBy || ''} | 👥 {w.beneficiaries || 0} | ⚠️ {w.violations || 0}</div>
                  </div>
                  {obsToShow.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {obsToShow.map(key => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '12px 14px', borderRight: `3px solid ${obsColor[key]}` }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: obsColor[key], marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                              {key === 'amni' ? '🛡️' : key === 'fanni' ? '🔧' : '📚'} ملاحظة {obsLabel[key]}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>{w.obs[key]}</div>
                          </div>
                          <div style={{ minWidth: 120 }}><FollowUpCell recordId={rid} field={key} existing={fu[key]} /></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>لا توجد ملاحظات</div>
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="es-icon">📭</div>
              <div className="es-title">لا توجد ملاحظات بهذا الفلتر</div>
              <div className="es-sub">جرب "عرض الأجنحة بدون ملاحظات" أو غيّر نوع الملاحظة</div>
            </div>
          )}
        </>
      )}

      {!loading && wings.length === 0 && from && to && (
        <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا توجد بيانات في هذه الفترة</div></div>
      )}
    </div>
  )
}

// ─── تقارير القيّمين ──────────────────────────────────────────────────────────
function CaretakerReport() {
  const toast = useToast()
  const [records,   setRecords]   = useState([])
  const [followups, setFollowups] = useState({})
  const [loading,   setLoading]   = useState(false)
  const [from,      setFrom]      = useState('')
  const [to,        setTo]        = useState('')
  const [selMasanda, setSelMasanda] = useState('')
  const [selWing,    setSelWing]    = useState('')
  const [selAxis,    setSelAxis]    = useState('')

  const wingOptions = selMasanda ? MASANDAT.find(m => m.id === selMasanda)?.wings || [] : []

  const load = async () => {
    if (!from || !to) { toast('⚠️ حدد الفترة الزمنية', 'warn'); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'qayyim'))
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      all = all.filter(r => {
        if (r.from && r.from < from) return false
        if (r.to   && r.to   > to)   return false
        return true
      })
      if (selMasanda) all = all.filter(r => r.center?.startsWith(selMasanda))
      if (selWing) {
        const locId = `${selMasanda}_${String(selWing).replace(/\s/g,'_')}`
        all = all.filter(r => r.center === locId)
      }
      all.sort((a, b) => (b.from || '') > (a.from || '') ? 1 : -1)
      setRecords(all)
      const fu = await fetchFollowups(all.map(r => r.id))
      setFollowups(fu)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }

  const getMasandaName = (center) => {
    const m = MASANDAT.find(m => center?.startsWith(m.id))
    return m?.name || '—'
  }
  const getWingLabel = (center) => {
    const m = MASANDAT.find(m => center?.startsWith(m.id))
    if (!m) return center || '—'
    const w = center.replace(m.id + '_', '').replace(/_/g, ' ')
    return isNaN(w) ? w : `جناح ${w}`
  }

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔍 فلاتر البحث</div>
        <div className="form-row fr-3" style={{ marginBottom: 12 }}>
          <div className="form-group"><label>من تاريخ *</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="form-group"><label>إلى تاريخ *</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="form-group">
            <label>المساندة</label>
            <select value={selMasanda} onChange={e => { setSelMasanda(e.target.value); setSelWing('') }}>
              <option value="">كل المساندات</option>
              {MASANDAT.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الجناح</label>
            <select value={selWing} onChange={e => setSelWing(e.target.value)} disabled={!selMasanda}>
              <option value="">كل الأجنحة</option>
              {wingOptions.map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>المحور</label>
            <select value={selAxis} onChange={e => setSelAxis(e.target.value)}>
              <option value="">كل المحاور</option>
              {['iltizam','suluk','tafaul','sukan'].map(k => (
                <option key={k} value={k}>
                  {k === 'iltizam' ? 'الالتزام اليومي' : k === 'suluk' ? 'السلوك والانضباط' : k === 'tafaul' ? 'التفاعل العلاجي' : 'السكن والنظام'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ opacity: 0 }}>_</label>
            <button className="btn btn-primary" onClick={load} style={{ width: '100%' }}>🔍 عرض النتائج</button>
          </div>
        </div>
      </div>

      {loading && <div style={{ height: 200 }} className="skeleton" />}

      {!loading && records.length > 0 && (
        <>
          <ExportBar count={records.length}
            onExcel={() => {
              const headers = ['المساندة','الجناح','من','إلى','المستفيدون','الحوادث','ملاحظات']
              const rows = records.map(r => [getMasandaName(r.center), getWingLabel(r.center), r.from||'', r.to||'', r.ben||0, r.incidents||0, r.notes||''])
              exportToExcel(rows, headers, 'تقرير-القيمين')
            }}
            onPrint={() => {
              const headers = ['المساندة','الجناح','من','إلى','المستفيدون','الحوادث']
              const rows = records.map(r => [getMasandaName(r.center), getWingLabel(r.center), r.from||'', r.to||'', r.ben||0, r.incidents||0])
              printTable('تقرير تقييم القيّمين', headers, rows)
            }}
          />

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            {[
              { label: 'إجمالي السجلات',    value: records.length,                                       icon: '📋', color: 'var(--accent)' },
              { label: 'إجمالي المستفيدين', value: records.reduce((s,r) => s + (r.ben||0), 0),          icon: '👥', color: 'var(--blue)'   },
              { label: 'إجمالي الحوادث',    value: records.reduce((s,r) => s + (r.incidents||0), 0),    icon: '⚠️', color: 'var(--orange)' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ '--card-accent': s.color }}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {records.map(r => {
              const fu = followups[r.id] || {}
              const axesToShow = selAxis
                ? r.days?.map((day, di) => ({ di, day, ax: day.axes?.find(a => a.key === selAxis) })).filter(x => x.ax)
                : null

              return (
                <div key={r.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{getMasandaName(r.center)} — {getWingLabel(r.center)}</div>
                      <span className="badge badge-dim">{r.from} ← {r.to}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.savedBy} | 👥 {r.ben || 0} | ⚠️ {r.incidents || 0}</div>
                  </div>

                  {!selAxis ? (
                    <div className="table-wrap" style={{ marginBottom: r.notes ? 12 : 0 }}>
                      <table>
                        <thead><tr><th>اليوم</th><th>الالتزام</th><th>السلوك</th><th>التفاعل</th><th>السكن</th><th>الإجمالي</th><th>مخالفات</th></tr></thead>
                        <tbody>
                          {r.days?.map((day, di) => {
                            const totals = day.axes?.map(ax => ax.total || 0) || []
                            const grand  = totals.reduce((a,b) => a+b, 0)
                            const color  = grand >= 50 ? 'var(--green)' : grand >= 35 ? 'var(--orange)' : 'var(--red)'
                            return (
                              <tr key={di}>
                                <td style={{ fontWeight: 700 }}>{day.day}</td>
                                {totals.map((t, i) => <td key={i} style={{ textAlign: 'center' }}>{t}</td>)}
                                <td><span style={{ fontWeight: 800, color }}>{grand}</span></td>
                                <td style={{ color: 'var(--orange)', textAlign: 'center' }}>{day.violations || 0}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {axesToShow?.map(({ di, day, ax }) => (
                        <div key={di} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '12px 14px' }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                              {day.day} — {ax.label}
                              <span className="badge badge-accent" style={{ marginRight: 8 }}>{ax.total} / {ax.scores?.length * 5}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {ax.scores?.map((s, si) => (
                                <span key={si} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s >= 4 ? 'var(--green-dim)' : s >= 3 ? 'var(--orange-dim)' : 'var(--red-dim)', color: s >= 4 ? 'var(--green)' : s >= 3 ? 'var(--orange)' : 'var(--red)' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div style={{ minWidth: 120 }}><FollowUpCell recordId={r.id} field={`day${di}_${selAxis}`} existing={fu[`day${di}_${selAxis}`]} /></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.notes && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--blue-dim)', borderRadius: 'var(--rs)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>📝 ملاحظات عامة</div>
                        <div style={{ fontSize: 13 }}>{r.notes}</div>
                      </div>
                      <FollowUpCell recordId={r.id} field="general_notes" existing={fu['general_notes']} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {!loading && records.length === 0 && from && to && (
        <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا توجد بيانات في هذه الفترة</div></div>
      )}
    </div>
  )
}

// ─── تقرير جناح محدد ─────────────────────────────────────────────────────────
function WingReport() {
  const toast = useToast()
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [selMasanda, setSelMasanda] = useState('')
  const [selWing,    setSelWing]    = useState('')
  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(false)

  const wingOptions = selMasanda ? MASANDAT.find(m => m.id === selMasanda)?.wings || [] : []

  const load = async () => {
    if (!from || !to)            { toast('⚠️ حدد الفترة الزمنية', 'warn'); return }
    if (!selMasanda || !selWing) { toast('⚠️ اختر المساندة والجناح', 'warn'); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'wings'))
      let recs = snap.docs.map(d => d.data())
      recs = recs.filter(w => w.masandaId === selMasanda && String(w.wing) === String(selWing) && w.date >= from && w.date <= to)
      recs.sort((a, b) => a.date > b.date ? 1 : -1)
      setData(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
    setLoading(false)
  }

  const m        = MASANDAT.find(m => m.id === selMasanda)
  const wLabel   = selWing ? (isNaN(selWing) ? selWing : `جناح ${selWing}`) : ''
  const sc       = v => v >= 50 ? '#057a55' : v >= 35 ? '#b45309' : '#c81e1e'
  const bg       = v => v >= 50 ? '#e3f9ee' : v >= 35 ? '#fef3c7' : '#fde8e8'
  const avgScore = data.length ? Math.round(data.reduce((s,w) => s+w.totalScore,0)/data.length) : 0
  const maxScore = data.length ? Math.max(...data.map(w=>w.totalScore)) : 0
  const minScore = data.length ? Math.min(...data.map(w=>w.totalScore)) : 0

  const doPrint = () => {
    if (!data.length) { toast('⚠️ لا توجد بيانات', 'warn'); return }
    const rows = data.map(w => `<tr><td>${w.date}</td>${w.axes.map(a=>`<td style="text-align:center">${a.total}/15</td>`).join('')}<td><span style="font-weight:800;color:${sc((w.totalScore/60)*100)}">${w.totalScore}/60</span></td><td>${w.beneficiaries||'—'}</td><td style="color:#c81e1e">${w.violations||0}</td><td style="font-size:10px;color:#5f6b7e">${w.savedBy||'—'}</td></tr>`).join('')
    const obsRows = ['amni','fanni','baramij'].flatMap(k => { const label=k==='amni'?'🛡️ أمني':k==='fanni'?'🔧 فني':'📚 برامج'; const color=k==='amni'?'#c81e1e':k==='fanni'?'#b45309':'#057a55'; return data.filter(w=>w.obs?.[k]).map(w=>`<tr><td>${w.date}</td><td style="font-weight:700;color:${color}">${label}</td><td>${w.obs[k]}</td></tr>`) }).join('')
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Cairo',sans-serif;background:#fff;color:#1e2533;direction:rtl;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.hdr{background:linear-gradient(135deg,#1e3a8a,#1a56db);color:#fff;padding:16px 24px;display:flex;justify-content:space-between;margin-bottom:14px;}.hdr-title{font-size:17px;font-weight:900;}.hdr-sub{font-size:11px;opacity:.8;margin-top:3px;}.hdr-right{text-align:left;font-size:11px;opacity:.85;line-height:1.8;}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}.st{border-radius:8px;padding:10px 12px;text-align:center;}.st-val{font-size:22px;font-weight:900;}.st-lbl{font-size:10px;color:#5f6b7e;font-weight:700;margin-top:3px;}.sec-title{font-size:11px;font-weight:800;color:#1a56db;padding:6px 10px;background:#ebf0fd;border-right:4px solid #1a56db;border-radius:0 6px 6px 0;margin-bottom:8px;}table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px;}th{background:#1a56db;color:#fff;padding:6px 8px;text-align:right;font-weight:700;}td{padding:5px 8px;border-bottom:1px solid #e2e6ed;}tr:nth-child(even) td{background:#f8f9fb;}.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}.bar-lbl{min-width:60px;font-size:10px;color:#5f6b7e;font-weight:600;}.bar-track{flex:1;height:10px;background:#e2e6ed;border-radius:5px;overflow:hidden;}.bar-fill{height:100%;border-radius:5px;}.bar-val{font-size:10px;font-weight:800;min-width:30px;}.footer{border-top:2px solid #e2e6ed;margin-top:12px;padding:8px 0 0;display:flex;justify-content:space-between;font-size:9px;color:#9aa3b0;}@media print{@page{size:A4;margin:8mm;}button{display:none!important;}}</style></head><body>
<div class="hdr"><div><div class="hdr-title">🏠 تقرير الجناح — ${m?.name} / ${wLabel}</div><div class="hdr-sub">الفترة: ${from} ← ${to}</div></div><div class="hdr-right"><div>📅 ${new Date().toLocaleDateString('ar-SA')}</div><div>عدد الأيام: ${data.length}</div></div></div>
<div class="stats"><div class="st" style="background:#ebf0fd;border:1.5px solid #1a56db"><div class="st-val" style="color:#1a56db">${data.length}</div><div class="st-lbl">أيام مُسجَّلة</div></div><div class="st" style="background:#e3f9ee;border:1.5px solid #057a55"><div class="st-val" style="color:#057a55">${avgScore}</div><div class="st-lbl">متوسط الدرجة/60</div></div><div class="st" style="background:#fef3c7;border:1.5px solid #b45309"><div class="st-val" style="color:#b45309">${maxScore}</div><div class="st-lbl">أعلى درجة</div></div><div class="st" style="background:#fde8e8;border:1.5px solid #c81e1e"><div class="st-val" style="color:#c81e1e">${minScore}</div><div class="st-lbl">أدنى درجة</div></div></div>
<div class="sec-title">📊 توزيع الدرجات اليومية</div>${data.map(w=>{const pct=(w.totalScore/60)*100;const col=sc(pct);return`<div class="bar-row"><div class="bar-lbl">${w.date.slice(5)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div><div class="bar-val" style="color:${col}">${w.totalScore}</div></div>`;}).join('')}
<div class="sec-title" style="margin-top:12px">📋 تفصيل الأيام</div>
<table><thead><tr><th>التاريخ</th><th>الالتزام/15</th><th>السلوك/15</th><th>التفاعل/15</th><th>السكن/15</th><th>الإجمالي/60</th><th>المستفيدون</th><th>المخالفات</th><th>المدخِل</th></tr></thead><tbody>${rows}</tbody></table>
${obsRows?`<div class="sec-title">📝 الملاحظات المرصودة</div><table><thead><tr><th>التاريخ</th><th>النوع</th><th>الملاحظة</th></tr></thead><tbody>${obsRows}</tbody></table>`:''}
<div class="footer"><span>المراكز التأهيلية التخصصية</span><span>${new Date().toLocaleDateString('ar-SA')} — ${new Date().toLocaleTimeString('ar-SA')}</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body></html>`
    const w = window.open('','_blank'); w.document.write(html); w.document.close()
  }

  return (
    <div className="animate-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🏠 تقرير جناح خلال فترة</div>
        <div className="form-row fr-3" style={{ marginBottom: 12 }}>
          <div className="form-group"><label>من تاريخ *</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="form-group"><label>إلى تاريخ *</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="form-group">
            <label>المساندة *</label>
            <select value={selMasanda} onChange={e => { setSelMasanda(e.target.value); setSelWing('') }}>
              <option value="">— اختر —</option>
              {MASANDAT.map(ms => <option key={ms.id} value={ms.id}>{ms.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>الجناح *</label>
            <select value={selWing} onChange={e => setSelWing(e.target.value)} disabled={!selMasanda}>
              <option value="">— اختر —</option>
              {wingOptions.map(w => <option key={w} value={w}>{isNaN(w) ? w : `جناح ${w}`}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ opacity: 0 }}>_</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={load} style={{ flex: 1 }}>🔍 عرض</button>
              <button className="btn btn-outline" onClick={doPrint} disabled={!data.length}>🖨️</button>
            </div>
          </div>
        </div>
      </div>

      {loading && <div style={{ height: 150 }} className="skeleton" />}

      {!loading && data.length === 0 && from && to && selWing && (
        <div className="empty-state"><div className="es-icon">📭</div><div className="es-title">لا توجد بيانات لهذا الجناح في الفترة المحددة</div></div>
      )}

      {!loading && data.length > 0 && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:'أيام مُسجَّلة',  value:data.length, color:'#1a56db', bg:'#ebf0fd' },
              { label:'متوسط الدرجة',   value:avgScore,    color:'#057a55', bg:'#e3f9ee' },
              { label:'أعلى درجة',      value:maxScore,    color:'#b45309', bg:'#fef3c7' },
              { label:'أدنى درجة',      value:minScore,    color:'#c81e1e', bg:'#fde8e8' },
            ].map((s,i) => (
              <div key={i} style={{ background:s.bg, border:`1.5px solid ${s.color}`, borderRadius:'var(--r)', padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:'#5f6b7e', fontWeight:700, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {data.length > 1 && (
            <div className="card" style={{ marginBottom:14 }}>
              <div className="card-title">📊 مستوى الجناح خلال الفترة</div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, padding: '10px 4px 0', minWidth: data.length * 48 }}>
                  {data.map((w, i) => {
                    const pct = (w.totalScore / 60) * 100
                    const col = sc(pct)
                    return (
                      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, minWidth:40, gap:4 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:col }}>{w.totalScore}</div>
                        <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background: col, height: `${Math.max(6, pct * 1.4)}px`, transition: 'height .4s ease', minHeight: 6 }} title={`${w.date}: ${w.totalScore}/60`} />
                        <div style={{ fontSize:9.5, color:'var(--text-muted)', transform:'rotate(-35deg)', transformOrigin:'top center', whiteSpace:'nowrap', marginTop:8 }}>{w.date.slice(5)}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:12, marginTop:20, paddingTop:8, borderTop:'1px solid var(--border)', justifyContent:'center', flexWrap:'wrap' }}>
                  {[{color:'#057a55',label:'ممتاز (50+)'},{color:'#b45309',label:'متوسط (35-49)'},{color:'#c81e1e',label:'يحتاج متابعة (-35)'}].map((x,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                      <div style={{ width:12, height:12, borderRadius:3, background:x.color }} />
                      <span style={{ color:'var(--text-muted)' }}>{x.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-title">📋 تفصيل الأيام — {m?.name} / {wLabel}</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    {AXES.map((ax,i)=><th key={i} style={{fontSize:10}}>{ax.label.replace(/[🎯🛡️💊🏠]/g,'').trim().split(' ')[0]}/15</th>)}
                    <th>الإجمالي/60</th><th>مستفيدون</th><th>مخالفات</th><th>المدخِل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((w,i) => {
                    const pct = (w.totalScore/60)*100
                    return (
                      <tr key={i}>
                        <td style={{fontWeight:700}}>{w.date}</td>
                        {w.axes.map((a,ai)=><td key={ai} style={{textAlign:'center',fontSize:12}}>{a.total}</td>)}
                        <td><span style={{display:'inline-block',padding:'2px 8px',borderRadius:20,fontSize:12,fontWeight:800,background:bg(pct),color:sc(pct),border:`1px solid ${sc(pct)}`}}>{w.totalScore}/60</span></td>
                        <td style={{textAlign:'center',color:'#1a56db'}}>{w.beneficiaries||'—'}</td>
                        <td style={{textAlign:'center',color:'#c81e1e'}}>{w.violations||0}</td>
                        <td style={{fontSize:11,color:'var(--text-muted)'}}>{w.savedBy||'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {['amni','fanni','baramij'].some(k => data.some(w=>w.obs?.[k])) && (
            <div className="card">
              <div className="card-title">📝 الملاحظات المرصودة خلال الفترة</div>
              {[
                {key:'amni',    label:'🛡️ المسار الأمني',  border:'#c81e1e', bg:'#fde8e8'},
                {key:'fanni',   label:'🔧 المسار الفني',    border:'#b45309', bg:'#fef3c7'},
                {key:'baramij', label:'📚 مسار البرامج',    border:'#057a55', bg:'#e3f9ee'},
              ].map(item => {
                const rows = data.filter(w=>w.obs?.[item.key]); if(!rows.length) return null
                return (
                  <div key={item.key} style={{marginBottom:12}}>
                    <div style={{fontSize:12.5,fontWeight:800,marginBottom:7,padding:'5px 10px',background:item.bg,borderRight:`4px solid ${item.border}`,borderRadius:'0 6px 6px 0'}}>{item.label}</div>
                    <div className="table-wrap"><table>
                      <thead><tr><th>التاريخ</th><th>الملاحظة</th></tr></thead>
                      <tbody>{rows.map((w,i)=><tr key={i}><td style={{fontWeight:700,whiteSpace:'nowrap'}}>{w.date}</td><td style={{fontSize:13}}>{w.obs[item.key]}</td></tr>)}</tbody>
                    </table></div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── تقرير الاحتياج ───────────────────────────────────────────────────────────
function NeedsReport() {
  const toast  = useToast()
  const [data,   setData]   = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'wingInventory'))
        setData(snap.docs.map(d => d.data()).filter(r => (r.shortage_qty || 0) > 0))
      } catch (e) { toast('❌ ' + e.message, 'error') }
    })()
  }, [toast])

  const filtered = data.filter(r => !search || r.itemName?.includes(search))

  return (
    <div className="animate-in">
      <div className="filters-bar">
        <div className="search-box" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف..." />
        </div>
      </div>
      <ExportBar count={filtered.length}
        onExcel={() => {
          const headers = ['الصنف','المساندة','الجناح','الحد المعياري','الموجود السليم','العجز']
          const rows = filtered.map(r => [r.itemName, r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'—', isNaN(r.wing)?r.wing:`جناح ${r.wing}`, r.standard_qty, r.good_qty, r.shortage_qty])
          exportToExcel(rows, headers, 'تقرير-الاحتياج')
        }}
        onPrint={() => {
          const headers = ['الصنف','الموقع','الحد المعياري','الموجود','العجز']
          const rows = filtered.map(r => [r.itemName, (r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'')+' '+(isNaN(r.wing)?r.wing:`جناح ${r.wing}`), r.standard_qty, r.good_qty, `-${r.shortage_qty}`])
          printTable('تقرير الاحتياج', headers, rows)
        }}
      />
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="es-icon">✅</div><div className="es-title">لا يوجد عجز حالياً</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الصنف</th><th>الموقع</th><th>الحد المعياري</th><th>الموجود</th><th>العجز</th></tr></thead>
            <tbody>
              {filtered.sort((a,b) => (b.shortage_qty||0)-(a.shortage_qty||0)).map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{r.itemName}</td>
                  <td style={{ fontSize: 12 }}>{r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'—'} — {isNaN(r.wing)?r.wing:`جناح ${r.wing}`}</td>
                  <td style={{ textAlign: 'center' }}>{r.standard_qty}</td>
                  <td style={{ textAlign: 'center', color: 'var(--green)' }}>{r.good_qty}</td>
                  <td><span className="badge badge-red">-{r.shortage_qty}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── تقرير الحركات ────────────────────────────────────────────────────────────
function MovementsReport() {
  const toast = useToast()
  const [data, setData] = useState([])
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'movements'))
      let recs = snap.docs.map(d => d.data())
      if (from) recs = recs.filter(r => r.movement_date >= from)
      if (to)   recs = recs.filter(r => r.movement_date <= to)
      if (typeFilter) recs = recs.filter(r => r.movement_type_id === typeFilter)
      recs.sort((a,b) => (b.movement_date||'') > (a.movement_date||'') ? 1 : -1)
      setData(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  return (
    <div className="animate-in">
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="filter-item form-group"><label>من</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="filter-item form-group"><label>إلى</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="filter-item form-group">
          <label>النوع</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">الكل</option>
            {MOVEMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={load}>عرض</button>
      </div>
      <ExportBar count={data.length}
        onExcel={() => {
          const headers = ['التاريخ','النوع','الصنف','الكمية','من','إلى','الحالة','أدخل']
          const rows = data.map(r => [r.movement_date, MOVEMENT_TYPES.find(t=>t.id===r.movement_type_id)?.label||r.movement_type_id, r.item_name, r.qty, r.from_location==='warehouse'?'المستودع':r.from_location||'', r.to_location==='warehouse'?'المستودع':r.to_location||'', r.status, r.created_by||''])
          exportToExcel(rows, headers, 'تقرير-الحركات')
        }}
        onPrint={() => {
          const headers = ['التاريخ','النوع','الصنف','الكمية','من','إلى','الحالة']
          const rows = data.map(r => [r.movement_date, MOVEMENT_TYPES.find(t=>t.id===r.movement_type_id)?.label||r.movement_type_id, r.item_name, r.qty, r.from_location==='warehouse'?'المستودع':r.from_location||'', r.to_location==='warehouse'?'المستودع':r.to_location||'', r.status])
          printTable('تقرير الحركات', headers, rows)
        }}
      />
      {data.length === 0 ? (
        <div className="empty-state"><div className="es-icon">🔄</div><div className="es-title">اضغط "عرض" لتحميل البيانات</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الصنف</th><th>الكمية</th><th>من</th><th>إلى</th><th>الحالة</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{r.movement_date}</td>
                  <td style={{ fontSize: 12 }}>{MOVEMENT_TYPES.find(t=>t.id===r.movement_type_id)?.label||r.movement_type_id}</td>
                  <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                  <td><span className="badge badge-accent">{r.qty}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.from_location==='warehouse'?'🏭 المستودع':r.from_location||'—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.to_location==='warehouse'?'🏭 المستودع':r.to_location||'—'}</td>
                  <td><span className={`badge ${r.status==='معتمدة'?'badge-green':r.status==='معلقة'?'badge-orange':'badge-dim'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── تقرير بلاغات الأدوات ─────────────────────────────────────────────────────
function ToolReport() {
  const toast = useToast()
  const [data, setData] = useState([])
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'toolFaultReports'))
      let recs = snap.docs.map(d => d.data())
      if (from) recs = recs.filter(r => r.report_date >= from)
      if (to)   recs = recs.filter(r => r.report_date <= to)
      if (statusFilter) recs = recs.filter(r => r.status === statusFilter)
      recs.sort((a,b) => (b.report_date||'') > (a.report_date||'') ? 1 : -1)
      setData(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  const statusStyle = {
    'يحتاج صيانة': { bg: 'rgba(227,179,65,.15)', color: '#b45309' },
    'تم سحبه':     { bg: 'rgba(26,86,219,.1)',   color: '#1a56db' },
    'تالف':        { bg: 'rgba(200,30,30,.1)',    color: '#c81e1e' },
  }

  return (
    <div className="animate-in">
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="filter-item form-group"><label>من</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="filter-item form-group"><label>إلى</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="filter-item form-group">
          <label>الحالة</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">الكل</option>
            {['يحتاج صيانة','تم سحبه','تالف'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={load}>عرض</button>
      </div>
      <ExportBar count={data.length}
        onExcel={() => {
          const headers = ['التاريخ','المساندة','الجناح','الصنف','الحالة','الأولوية','الوصف','أدخل']
          const rows = data.map(r => [r.report_date, r.masanda_name, r.wing?`جناح ${r.wing}`:'', r.item_name, r.status, r.priority, r.notes||r.description||'', r.created_by||''])
          exportToExcel(rows, headers, 'بلاغات-الأدوات')
        }}
        onPrint={() => {
          const headers = ['التاريخ','الموقع','الصنف','الحالة','الوصف']
          const rows = data.map(r => [r.report_date, r.masanda_name+' '+(r.wing?`جناح ${r.wing}`:''), r.item_name, r.status, r.notes||r.description||''])
          printTable('بلاغات أعطال الأدوات', headers, rows)
        }}
      />
      {data.length === 0 ? (
        <div className="empty-state"><div className="es-icon">🔧</div><div className="es-title">اضغط "عرض" لتحميل البيانات</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>الموقع</th><th>الصنف</th><th>الحالة</th><th>الأولوية</th><th>الوصف</th><th>أدخل</th></tr></thead>
            <tbody>
              {data.map((r, i) => {
                const st = statusStyle[r.status] || {}
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.report_date}</td>
                    <td style={{ fontSize: 12 }}>{r.masanda_name} {r.wing?`جناح ${r.wing}`:''}</td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td><span className="badge" style={{ background: st.bg||'var(--surface3)', color: st.color||'var(--text-muted)' }}>{r.status}</span></td>
                    <td style={{ fontSize: 12 }}>{r.priority}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>{r.notes||r.description||'—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--blue)' }}>{r.created_by}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── تقرير بلاغات الصيانة ────────────────────────────────────────────────────
function FacilityReport() {
  const toast = useToast()
  const [data, setData] = useState([])
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const FAULT_TYPES = ['سباكة','كهرباء','تكييف','نجارة','دهانات','أقفال','إنارة','أخرى']

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'facilityMaintenanceReports'))
      let recs = snap.docs.map(d => d.data())
      if (from) recs = recs.filter(r => r.report_date >= from)
      if (to)   recs = recs.filter(r => r.report_date <= to)
      if (typeFilter) recs = recs.filter(r => r.fault_type === typeFilter)
      recs.sort((a,b) => (b.report_date||'') > (a.report_date||'') ? 1 : -1)
      setData(recs)
    } catch (e) { toast('❌ ' + e.message, 'error') }
  }

  return (
    <div className="animate-in">
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="filter-item form-group"><label>من</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="filter-item form-group"><label>إلى</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="filter-item form-group">
          <label>نوع العطل</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">الكل</option>
            {FAULT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={load}>عرض</button>
      </div>
      <ExportBar count={data.length}
        onExcel={() => {
          const headers = ['التاريخ','المساندة','الجناح','نوع العطل','الوصف','الحالة','الجهة المنفذة','تاريخ الإنجاز']
          const rows = data.map(r => [r.report_date, r.masanda_name, r.wing?`جناح ${r.wing}`:'', r.fault_type, r.description, r.status, r.assigned_to||'', r.completed_at||''])
          exportToExcel(rows, headers, 'بلاغات-الصيانة')
        }}
        onPrint={() => {
          const headers = ['التاريخ','الموقع','نوع العطل','الوصف','الحالة','تاريخ الإنجاز']
          const rows = data.map(r => [r.report_date, r.masanda_name+' '+(r.wing?`جناح ${r.wing}`:''), r.fault_type, r.description, r.status, r.completed_at||''])
          printTable('بلاغات صيانة المرافق', headers, rows)
        }}
      />
      {data.length === 0 ? (
        <div className="empty-state"><div className="es-icon">🏗️</div><div className="es-title">اضغط "عرض" لتحميل البيانات</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>الموقع</th><th>نوع العطل</th><th>الوصف</th><th>الحالة</th><th>تاريخ الإنجاز</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{r.report_date}</td>
                  <td style={{ fontSize: 12 }}>{r.masanda_name} {r.wing?`جناح ${r.wing}`:''}</td>
                  <td style={{ fontWeight: 700 }}>{r.fault_type}</td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}>{r.description}</td>
                  <td><span className="badge badge-blue">{r.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--green)' }}>{r.completed_at||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── تقرير العهدة ─────────────────────────────────────────────────────────────
function InventoryReport() {
  const toast  = useToast()
  const [data, setData]   = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'wingInventory'))
        setData(snap.docs.map(d => d.data()))
      } catch (e) { toast('❌ ' + e.message, 'error') }
    })()
  }, [toast])

  const filtered = data.filter(r => !search || r.itemName?.includes(search))

  return (
    <div className="animate-in">
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="search-box" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الصنف..." />
        </div>
      </div>
      <ExportBar count={filtered.length}
        onExcel={() => {
          const headers = ['الصنف','المساندة','الجناح','سليم','معطل','تحت الصيانة','مفقود','الحد المعياري','العجز','اللجنة']
          const rows = filtered.map(r => [r.itemName, r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'—', isNaN(r.wing)?r.wing:`جناح ${r.wing}`, r.good_qty??0, r.faulty_qty??0, r.under_maintenance_qty??0, r.missing_qty??0, r.standard_qty??'', r.shortage_qty??0, r.current_committee||''])
          exportToExcel(rows, headers, 'تقرير-العهدة')
        }}
        onPrint={() => {
          const headers = ['الصنف','الموقع','سليم','معطل','الحد المعياري','العجز']
          const rows = filtered.map(r => [r.itemName, (r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'')+' '+(isNaN(r.wing)?r.wing:`جناح ${r.wing}`), r.good_qty??0, r.faulty_qty??0, r.standard_qty??'', r.shortage_qty>0?`-${r.shortage_qty}`:'✓'])
          printTable('تقرير عهدة الأجنحة', headers, rows)
        }}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>الصنف</th><th>الموقع</th><th>سليم</th><th>معطل</th><th>تحت الصيانة</th><th>مفقود</th><th>الحد المعياري</th><th>العجز</th><th>اللجنة</th></tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{r.itemName}</td>
                <td style={{ fontSize: 12 }}>{r.masandaId?MASANDAT.find(m=>m.id===r.masandaId)?.name:'—'} — {isNaN(r.wing)?r.wing:`جناح ${r.wing}`}</td>
                <td><span className="badge badge-green">{r.good_qty??0}</span></td>
                <td style={{ color: r.faulty_qty>0?'var(--red)':'var(--text-muted)', fontSize: 12 }}>{r.faulty_qty??0}</td>
                <td style={{ color: 'var(--orange)', fontSize: 12 }}>{r.under_maintenance_qty??0}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.missing_qty??0}</td>
                <td style={{ fontSize: 12 }}>{r.standard_qty??'—'}</td>
                <td>{r.shortage_qty>0?<span className="badge badge-red">-{r.shortage_qty}</span>:<span className="badge badge-green">✓</span>}</td>
                <td style={{ fontSize: 11, color: 'var(--blue)' }}>{r.current_committee||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
