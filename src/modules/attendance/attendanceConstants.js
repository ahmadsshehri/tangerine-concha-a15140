// ── حالات الحضور الافتراضية ──────────────────────────────────────────────────
// كل حالة: id · label · color (CSS var name) · hasDetail (هل تحتاج تفاصيل)
// يمكن للمسؤول إضافة / تعديل حالات مخصصة من إعدادات النظام (Firestore: attendanceStatuses)
// هذه القائمة تُستخدم كـ fallback إذا لم توجد بيانات في Firestore

export const DEFAULT_STATUSES = [
  { id: 'present',  label: 'حاضر',        color: 'green',  hasDetail: false },
  { id: 'absent',   label: 'غائب',         color: 'red',    hasDetail: false },
  { id: 'leave',    label: 'إجازة',        color: 'orange', hasDetail: true  },
  { id: 'task',     label: 'مكلَّف',       color: 'gray',   hasDetail: true  },
  { id: 'mission',  label: 'مهمة',      color: 'blue',   hasDetail: true  },
  { id: 'friday',   label: 'مسلم',         color: 'purple', hasDetail: false },
  { id: 'death',    label: 'حالة وفاة',    color: 'gray',   hasDetail: true  },
  { id: 'appt',     label: 'موعد',         color: 'blue',   hasDetail: true  },
  { id: 'sick',     label: 'راحة مرضية',  color: 'orange', hasDetail: true  },
  { id: 'permit',   label: 'رخصة',         color: 'purple', hasDetail: true  },
]

// ── طبيعة العمل الافتراضية ───────────────────────────────────────────────────
export const DEFAULT_JOB_TYPES = [
  { id: 'admin',    label: 'إداري',        color: 'blue'   },
  { id: 'therapist',label: 'معالج',        color: 'purple' },
  { id: 'housing',  label: 'مشرف سكن',    color: 'orange' },
  { id: 'guide',    label: 'مرشد تعافي',  color: 'teal'   },
]

// ── تفاصيل الحالات (sub-types) ───────────────────────────────────────────────
export const LEAVE_TYPES = [
  { id: 'annual',   label: 'اعتيادية' },
  { id: 'casual',   label: 'عرضية'    },
  { id: 'death',    label: 'حالة وفاة ' },
]

export const TASK_DURATION_TYPES = [
  { id: 'open',    label: 'مفتوحة'   },
  { id: 'fixed',   label: 'محدَّدة'  },
]

export const MISSION_TYPES = [
  { id: 'mamoriya',  label: 'مأمورية'          },
  { id: 'training',  label: 'دورة تدريبية'     },
  { id: 'other',     label: 'مهمة أخرى'        },
]

export const APPT_TYPES = [
  { id: 'hospital', label: 'موعد مستشفى' },
  { id: 'escort',   label: 'مرافق'        },
  { id: 'other',    label: 'موعد آخر'    },
]

export const PERMIT_TYPES = [
  { id: 'reward',   label: 'مكافأة ' },
  { id: 'leave_req',label: 'استئذان'       },
]

// ── خريطة الألوان → CSS vars الموقع ─────────────────────────────────────────
export const COLOR_MAP = {
  green:  { bg: 'var(--green-dim)',  text: 'var(--green)'  },
  red:    { bg: 'var(--red-dim)',    text: 'var(--red)'    },
  orange: { bg: 'var(--orange-dim)', text: 'var(--orange)' },
  blue:   { bg: 'var(--blue-dim)',   text: 'var(--blue)'   },
  purple: { bg: 'var(--purple-dim)', text: 'var(--purple)' },
  gray:   { bg: 'var(--bg3)',        text: 'var(--text-muted)' },
  teal:   { bg: 'rgba(5,150,105,.1)',text: '#059669'       },
}
