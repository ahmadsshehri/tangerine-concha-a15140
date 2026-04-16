// src/components/EvalGuideModal.jsx
// نافذة مرجع التقييم — تُستخدم في صفحة المشرف وصفحة القيّم

import { useState } from 'react'
import { AXES } from '../lib/constants'

// ─── بيانات شرح تقييم المشرف المسائي ────────────────────────────────────────
const SUPERVISOR_GUIDE = [
  {
    key: 'iltizam',
    label: 'محور الالتزام اليومي 🎯',
    color: 'var(--blue)',
    bg: 'var(--blue-dim)',
    items: [
      {
        name: 'التزام المستفيدين بالتعليمات الظاهرة',
        desc: 'يقيس مدى التزام المستفيدين بتعليمات المركز الظاهرة (الزي الموحد، قصات الشعر، الجلوس أمام التلفاز وغيرها)',
        scores: [
          { n: 1, label: 'أكثر من نصف الجناح غير ملتزم' },
          { n: 2, label: 'أكثر من نصف الجناح ملتزم مع ملاحظات كثيرة' },
          { n: 3, label: 'التزام جيد مع وجود ملاحظات' },
          { n: 4, label: 'التزام ممتاز مع ملاحظات بسيطة' },
          { n: 5, label: 'التزام تام من المستفيدين' },
        ]
      },
      {
        name: 'فعالية وتجاوب القيّم',
        desc: 'يقيس مدى حضور القيّم، تفاعله، وسيطرته الإيجابية على الجناح خلال الجولة',
        scores: [
          { n: 1, label: 'القيّم غير متواجد أو متواجد شكلياً ولا يتفاعل' },
          { n: 2, label: 'تواجد ضعيف، تأخر في التجاوب، ضعف في السيطرة' },
          { n: 3, label: 'تواجد مقبول مع ملاحظات على المتابعة' },
          { n: 4, label: 'متواجد ومتفاعل ويعالج الملاحظات فوراً' },
          { n: 5, label: 'حضور قوي، مبادر، مسيطر على الجناح بوضوح' },
        ]
      },
      {
        name: 'تطبيق المهام وعدم وجود مقاومة',
        desc: 'يقيس مدى تنفيذ التعليمات اليومية ومهام المخالفات دون اعتراض (يُقيَّم بالاطلاع على سجل الأحداث وملاحظة الجناح)',
        scores: [
          { n: 1, label: 'رفض واضح أو مقاومة جماعية' },
          { n: 2, label: 'تنفيذ ضعيف مع تذمر أو تعطيل' },
          { n: 3, label: 'تنفيذ مع ملاحظات فردية' },
          { n: 4, label: 'تنفيذ جيد وسلس' },
          { n: 5, label: 'تنفيذ كامل بدون أي مقاومة' },
        ]
      },
    ]
  },
  {
    key: 'suluk',
    label: 'محور السلوك والانضباط 🛡️',
    color: 'var(--purple)',
    bg: 'var(--purple-dim)',
    items: [
      {
        name: 'تجاوب المستفيدين بتعديل الملاحظات',
        desc: 'يقيس سرعة واستجابة الجناح للتنبيهات التي يعطيها المشرف أثناء الجولة',
        scores: [
          { n: 1, label: 'لا يوجد تجاوب' },
          { n: 2, label: 'تجاوب ضعيف ومتأخر' },
          { n: 3, label: 'تجاوب جزئي' },
          { n: 4, label: 'تجاوب جيد وسريع' },
          { n: 5, label: 'تجاوب فوري وواضح' },
        ]
      },
      {
        name: 'مستوى الهدوء العام داخل الجناح',
        desc: 'يقيس مستوى الإزعاج والصراخ في الجناح وعلو صوت التلفاز',
        scores: [
          { n: 1, label: 'فوضى وارتفاع أصوات' },
          { n: 2, label: 'ضوضاء مستمرة' },
          { n: 3, label: 'هدوء نسبي مع ملاحظات' },
          { n: 4, label: 'هدوء واضح' },
          { n: 5, label: 'هدوء تام ومنضبط' },
        ]
      },
      {
        name: 'وجود توترات أو تجمعات مقلقة',
        desc: 'كلما زادت التوترات والتجمعات المقلقة، كانت الدرجة أقل',
        scores: [
          { n: 1, label: 'تجمعات مقلقة أو مشادات واضحة' },
          { n: 2, label: 'مؤشرات توتر واضحة' },
          { n: 3, label: 'ملاحظات محدودة' },
          { n: 4, label: 'لا توجد توترات ظاهرة' },
          { n: 5, label: 'استقرار كامل' },
        ]
      },
    ]
  },
  {
    key: 'tafaul',
    label: 'محور التفاعل العلاجي 💊',
    color: 'var(--green)',
    bg: 'var(--green-dim)',
    items: [
      {
        name: 'وجود مؤشرات مقاومة أو سلوكيات سلبية',
        desc: 'يشمل: الاستهزاء، التنمر، استثارة الآخرين، تعمد مخالفة التعليمات أمام المجموعة. كلما زادت المؤشرات، قلت الدرجة',
        scores: [
          { n: 1, label: 'سلوكيات سلبية واضحة وكثيرة' },
          { n: 2, label: 'مؤشرات متكررة' },
          { n: 3, label: 'حالات فردية' },
          { n: 4, label: 'نادرة' },
          { n: 5, label: 'غير موجودة' },
        ]
      },
      {
        name: 'وجود برامج وأنشطة مسائية من اللجان',
        desc: 'يقيس عدد البرامج المنظمة من قبل اللجان وشارك فيها لا يقل عن 10 مستفيدين (كلمات بعد الصلاة، حلقة القرآن، NA، دوري ألعاب...)',
        scores: [
          { n: 1, label: 'أقل من 3 برامج' },
          { n: 2, label: '3 برامج' },
          { n: 3, label: '4 إلى 5 برامج' },
          { n: 4, label: '6 برامج' },
          { n: 5, label: 'أكثر من 6 برامج' },
        ]
      },
      {
        name: 'مستوى التفاعل الإيجابي للنزلاء ظاهرياً',
        desc: 'تفاعل وإيجابية المستفيدين في الجناح وأثناء البرامج خصوصاً المسائية',
        scores: [
          { n: 1, label: 'عزوف كامل' },
          { n: 2, label: 'تفاعل ضعيف' },
          { n: 3, label: 'تفاعل متوسط' },
          { n: 4, label: 'تفاعل جيد' },
          { n: 5, label: 'تفاعل إيجابي وواضح' },
        ]
      },
    ]
  },
  {
    key: 'sukan',
    label: 'محور السكن والنظام 🏠',
    color: 'var(--orange)',
    bg: 'var(--orange-dim)',
    items: [
      {
        name: 'النظافة العامة والترتيب الظاهر',
        desc: 'يشمل: الأرضيات، صالة الطعام، الحلاق، المغسلة، الممرات، العفش الزائد (بالملاحظة فقط)',
        scores: [
          { n: 1, label: 'إهمال واضح' },
          { n: 2, label: 'نظافة ضعيفة' },
          { n: 3, label: 'نظافة مقبولة' },
          { n: 4, label: 'نظافة جيدة' },
          { n: 5, label: 'نظافة ممتازة' },
        ]
      },
      {
        name: 'سلامة المرافق وعدم وجود عبث ظاهر',
        desc: 'يشمل: الأبواب، المفاتيح، الإنارة — أي كسر أو عبث',
        scores: [
          { n: 1, label: 'عبث أو تخريب واضح' },
          { n: 2, label: 'ملاحظات متعددة' },
          { n: 3, label: 'ملاحظات بسيطة' },
          { n: 4, label: 'سلامة جيدة' },
          { n: 5, label: 'سلامة تامة' },
        ]
      },
      {
        name: 'وجود ستائر داخل الغرف',
        desc: 'يشمل: الستائر على الشبابيك، الغرف، الأسرة، الستائر المعلقة في الزوايا',
        scores: [
          { n: 1, label: 'ستائر منتشرة بشكل واضح' },
          { n: 2, label: 'وجود ملحوظ' },
          { n: 3, label: 'حالات محدودة' },
          { n: 4, label: 'نادرة جداً' },
          { n: 5, label: 'غير موجودة إطلاقاً' },
        ]
      },
    ]
  },
]

// ─── بيانات شرح تقييم القيّم ─────────────────────────────────────────────────
const QAYYIM_GUIDE = [
  {
    key: 'iltizam',
    label: 'محور الالتزام اليومي 🎯',
    color: 'var(--blue)',
    bg: 'var(--blue-dim)',
    items: [
      {
        name: 'التأخر عن أداء الصلاة جماعة',
        desc: 'عدد المستفيدين المتأخرين عن الصلاة الجماعية — يُحدد بناءً على بيانات اللجنة الدينية المسجلة في سجل الأحداث',
        scores: [
          { n: 1, label: 'أكثر من 15 متأخراً' },
          { n: 2, label: '10 إلى 15 متأخراً' },
          { n: 3, label: '5 إلى 10 متأخرين' },
          { n: 4, label: '5 متأخرين فأقل' },
          { n: 5, label: 'لا يوجد تأخير' },
        ]
      },
      {
        name: 'الالتزام بالبرنامج اليومي',
        desc: 'عدم تعطيل البرنامج أو التأخر عنه — يُقاس بعدد المخالفات الموثقة',
        scores: [
          { n: 1, label: 'أكثر من 25 مخالفة' },
          { n: 2, label: '15 إلى 25 مخالفة' },
          { n: 3, label: '10 إلى 15 مخالفة' },
          { n: 4, label: '5 إلى 10 مخالفات' },
          { n: 5, label: 'أقل من 5 مخالفات' },
        ]
      },
      {
        name: 'الالتزام بوقت النوم',
        desc: 'وجود جميع المستفيدين في وضع النوم (على السرير) وقت النوم، وعدم التواجد خارج الغرفة أو التجمع فيها',
        scores: [
          { n: 1, label: 'أكثر من 25 مخالف' },
          { n: 2, label: '15 إلى 25 مخالف' },
          { n: 3, label: '10 إلى 15 مخالف' },
          { n: 4, label: '5 مخالفين فأقل' },
          { n: 5, label: 'لا يوجد مخالف' },
        ]
      },
    ]
  },
  {
    key: 'suluk',
    label: 'محور السلوك والانضباط 🛡️',
    color: 'var(--purple)',
    bg: 'var(--purple-dim)',
    items: [
      {
        name: 'التجاوب في تنفيذ المهام',
        desc: 'يقيس مدى تقبل المستفيدين للمخالفات المسجلة وتقبل تنفيذها',
        scores: [
          { n: 1, label: 'رفض مجموعة من المستفيدين تنفيذ المهام' },
          { n: 2, label: 'رفض تنفيذ المهام من 1-2 مستفيد' },
          { n: 3, label: 'تأخير من 1-2 مستفيد في تنفيذ المهام' },
          { n: 4, label: 'اعتراض لفظي بسيط مع تنفيذ' },
          { n: 5, label: 'تنفيذ كامل دون اعتراض' },
        ]
      },
      {
        name: 'التعاون مع اللجان وعدم وجود توترات',
        desc: 'تعاون المستفيدين مع اللجان، واللجان مع بعضها، وعدم وجود خلافات أو مشاحنات',
        scores: [
          { n: 1, label: 'نزاع جماعي أو مستمر' },
          { n: 2, label: 'توترات متكررة' },
          { n: 3, label: 'توتر محدود تمت معالجته من قبل القيّم' },
          { n: 4, label: 'ملاحظة فردية بسيطة' },
          { n: 5, label: 'تعاون كامل دون توترات' },
        ]
      },
      {
        name: 'نسبة الالتزام بحلاقة الشعر والقصات',
        desc: 'قياس عدد المخالفين بإطالة الشعر أو عمل قصات غير مسموح بها',
        scores: [
          { n: 1, label: 'أكثر من 15 مخالف' },
          { n: 2, label: '10 إلى 15 مخالف' },
          { n: 3, label: '5 إلى 10 مخالفين' },
          { n: 4, label: '5 مخالفين فأقل' },
          { n: 5, label: 'لا يوجد مخالف' },
        ]
      },
    ]
  },
  {
    key: 'tafaul',
    label: 'محور التفاعل العلاجي 💊',
    color: 'var(--green)',
    bg: 'var(--green-dim)',
    items: [
      {
        name: 'الغياب عن حضور البيئة العلاجية',
        desc: 'يقيس عدد الغياب الكلي عن البيئة العلاجية سواء بعذر أو بدونه — لا تُحسب الطلبات خارج الجناح (المحكمة، المستوصف...)',
        scores: [
          { n: 1, label: 'أكثر من 20 غياب' },
          { n: 2, label: '15 إلى 20 غياب' },
          { n: 3, label: '10 إلى 15 غياب' },
          { n: 4, label: '5 إلى 10 غياب' },
          { n: 5, label: 'أقل من 5 غياب' },
        ]
      },
      {
        name: 'التأخير عن البيئة العلاجية والبرامج',
        desc: 'يقيس عدد التأخر عن حضور البيئة العلاجية والبرامج المجدولة',
        scores: [
          { n: 1, label: 'أكثر من 20 تأخير' },
          { n: 2, label: '15 إلى 20 تأخير' },
          { n: 3, label: '10 إلى 15 تأخير' },
          { n: 4, label: '5 إلى 10 تأخير' },
          { n: 5, label: 'أقل من 5 تأخير' },
        ]
      },
      {
        name: 'تفاعل وحضور القروبات العلاجية',
        desc: 'تفاعل المستفيدين في البيئة العلاجية والقروبات والأنشطة الأخرى',
        scores: [
          { n: 1, label: 'عدم تفاعل' },
          { n: 2, label: 'تفاعل ضعيف' },
          { n: 3, label: 'تفاعل متوسط' },
          { n: 4, label: 'تفاعل جيد' },
          { n: 5, label: 'مبادرة وتفاعل واضح وممتاز' },
        ]
      },
    ]
  },
  {
    key: 'sukan',
    label: 'محور السكن والنظام العام 🏠',
    color: 'var(--orange)',
    bg: 'var(--orange-dim)',
    items: [
      {
        name: 'الالتزام بتناول الطعام في صالة الطعام',
        desc: 'إلزام جميع المستفيدين بتناول جميع الوجبات في صالة الطعام',
        scores: [
          { n: 1, label: 'أكثر من 25 مخالف' },
          { n: 2, label: '15 إلى 25 مخالف' },
          { n: 3, label: '10 إلى 15 مخالف' },
          { n: 4, label: '5 مخالفين فأقل' },
          { n: 5, label: 'أقل من 5 مخالفين' },
        ]
      },
      {
        name: 'قيام المستفيدين بنظافة غرفهم',
        desc: 'المطلوب قيام المستفيدين بنظافة الغرفة (غسيل جاف أو بالماء، تفريغ سلة المهملات، غسيل دورة المياه) — لا يكفي أن تكون حالتها نظيفة',
        scores: [
          { n: 1, label: 'أكثر من 6 غرف لم يقوموا بالتنظيف' },
          { n: 2, label: '5 إلى 6 غرف لم يقوموا بالتنظيف' },
          { n: 3, label: '3 إلى 4 غرف لم يقوموا بالتنظيف' },
          { n: 4, label: '1 إلى 2 غرفة لم يتم تنظيفها' },
          { n: 5, label: 'الجميع قام بنظافة الغرف' },
        ]
      },
      {
        name: 'قيام اللجان بنظافة مرافق الجناح',
        desc: 'المطلوب قيام اللجان بالمرافق الخاصة بهم: الصالة، الممرات، التشميس، الحلاق، المغسلة، الديوانية، صالة الطعام، المكتبة — لا يكفي أن تكون حالتها نظيفة',
        scores: [
          { n: 1, label: 'أكثر من 6 مرافق لم تتم نظافتها' },
          { n: 2, label: '4 إلى 5 مرافق لم تتم نظافتها' },
          { n: 3, label: '3 مرافق لم تتم نظافتها' },
          { n: 4, label: '1 إلى 2 مرفق لم يتم نظافته' },
          { n: 5, label: 'تم نظافة جميع المرافق' },
        ]
      },
    ]
  },
]

// ─── مكوّن الزر الذي يفتح النافذة ─────────────────────────────────────────────
export function EvalGuideButton({ type = 'supervisor' }) {
  const [open, setOpen] = useState(false)
  const label = type === 'supervisor' ? '📖 مرجع التقييم المسائي' : '📖 مرجع تقييم القيّم'

  return (
    <>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {label}
      </button>
      {open && <EvalGuideModal type={type} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── المكوّن الرئيسي للنافذة ──────────────────────────────────────────────────
export default function EvalGuideModal({ type = 'supervisor', onClose }) {
  const [activeAxis, setActiveAxis] = useState(0)
  const guide = type === 'supervisor' ? SUPERVISOR_GUIDE : QAYYIM_GUIDE
  const title = type === 'supervisor' ? 'مرجع التقييم — المشرف المسائي' : 'مرجع التقييم — القيّم الأسبوعي'
  const ax = guide[activeAxis]

  const scoreColor = (n) => {
    if (n >= 5) return { bg: '#e3f9ee', color: '#057a55', border: '#057a55' }
    if (n === 4) return { bg: '#ebf0fd', color: '#1a56db', border: '#1a56db' }
    if (n === 3) return { bg: '#fef3c7', color: '#b45309', border: '#b45309' }
    if (n === 2) return { bg: '#fde8e8', color: '#c81e1e', border: '#c81e1e' }
    return { bg: '#fde2e2', color: '#9b1c1c', border: '#9b1c1c' }
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-start', paddingTop: 20 }}
    >
      <div className="modal modal-lg" style={{ maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1e3a8a,#1a56db)', borderRadius: '16px 16px 0 0' }}>
          <div>
            <div className="modal-title" style={{ color: '#fff', fontSize: 16 }}>📖 {title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
              مرجع سريع لفهم معايير كل بند وما يعنيه كل رقم
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}
          >✕</button>
        </div>

        {/* Axis Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '12px 16px',
          background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
          overflowX: 'auto', flexShrink: 0
        }}>
          {guide.map((g, i) => (
            <button
              key={i}
              onClick={() => setActiveAxis(i)}
              style={{
                padding: '7px 14px', borderRadius: 'var(--rs)', border: 'none',
                fontFamily: 'Cairo', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'all .15s',
                background: activeAxis === i ? g.color : 'var(--surface3)',
                color: activeAxis === i ? '#fff' : 'var(--text-muted)',
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: '20px 22px', flex: 1 }}>
          {/* Axis header */}
          <div style={{
            padding: '10px 16px', borderRadius: 'var(--rs)',
            background: ax.bg, borderRight: `4px solid ${ax.color}`,
            marginBottom: 16, fontSize: 14, fontWeight: 800, color: ax.color
          }}>
            {ax.label} — {ax.items.length} بنود × 5 درجات = {ax.items.length * 5} درجة
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ax.items.map((item, ii) => (
              <div key={ii} style={{
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                overflow: 'hidden'
              }}>
                {/* Item header */}
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--surface2)',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 5 }}>
                    {ii + 1}. {item.name}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
                    padding: '6px 10px', background: 'var(--surface3)',
                    borderRadius: 'var(--rxs)', borderRight: `3px solid ${ax.color}`
                  }}>
                    📌 {item.desc}
                  </div>
                </div>

                {/* Scores */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...item.scores].reverse().map((s) => {
                    const c = scoreColor(s.n)
                    return (
                      <div key={s.n} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 12px', borderRadius: 'var(--rxs)',
                        background: c.bg, border: `1px solid ${c.border}22`
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: c.color, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 900, fontSize: 13, flexShrink: 0
                        }}>{s.n}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.color }}>
                          {s.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Note at bottom */}
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'var(--surface2)', borderRadius: 'var(--rs)',
            border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)'
          }}>
            💡 <strong>تذكر:</strong> كل محور من 4 محاور يتكون من 3 بنود × 5 درجات = 15 درجة. المجموع الكلي = 60 درجة.
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  )
}
