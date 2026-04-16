# نظام إدارة المراكز التأهيلية — الإصدار 2.0

## 🏗️ هيكل المشروع

```
src/
├── lib/
│   ├── firebase.js        ← إعدادات Firebase
│   └── constants.js       ← جميع الثوابت (مساندات، محاور، أصناف...)
├── hooks/
│   └── useAuth.jsx        ← إدارة المصادقة
├── components/
│   ├── LoginScreen.jsx    ← شاشة تسجيل الدخول
│   ├── Topbar.jsx         ← شريط التنقل العلوي
│   └── Toast.jsx          ← إشعارات النجاح والخطأ
├── modules/
│   ├── supervisor/        ← التقييم المسائي للمشرفين
│   ├── caretaker/         ← التقييم الأسبوعي للقيّمين
│   ├── custody/           ← نظام إدارة العهدة الكامل
│   │   ├── CustodyPage.jsx
│   │   ├── WingInventoryPage.jsx
│   │   ├── items/         ← إدارة الأصناف
│   │   ├── movements/     ← سجل الحركات
│   │   ├── committees/    ← إدارة اللجان ومحاضر التسليم
│   │   └── warehouse/     ← المستودع الرئيسي
│   ├── maintenance/
│   │   ├── ToolReportsPage.jsx     ← بلاغات أعطال الأدوات
│   │   └── FacilityReportsPage.jsx ← بلاغات صيانة المرافق
│   ├── reports/           ← التقارير والإحصاءات
│   └── admin/             ← إدارة المستخدمين
├── App.jsx
├── main.jsx
└── index.css
```

## 🚀 خطوات النشر

### 1. المتطلبات
- Node.js 18+
- حساب GitHub
- حساب Vercel
- مشروع Firebase موجود (src-jed1)

### 2. رفع المشروع على GitHub

```bash
# من داخل مجلد rehab-system
git init
git add .
git commit -m "Initial commit - v2.0"

# أنشئ مستودعاً جديداً في GitHub واسمه rehab-system
# ثم:
git remote add origin https://github.com/YOUR_USERNAME/rehab-system.git
git push -u origin main
```

### 3. النشر على Vercel

1. اذهب إلى [vercel.com](https://vercel.com)
2. اضغط **"New Project"**
3. اختر المستودع `rehab-system`
4. Vercel سيكتشف أنه Vite تلقائياً
5. اضغط **"Deploy"**

### 4. تحديث الموقع مستقبلاً

```bash
git add .
git commit -m "وصف التعديل"
git push
```
Vercel ينشر تلقائياً عند كل push ✅

---

## 🔥 مجموعات Firestore المستخدمة

| المجموعة | الوصف |
|---|---|
| `users` | بيانات المستخدمين والأدوار |
| `wings` | تقييمات المشرفين المسائية |
| `qayyim` | تقييمات القيّمين الأسبوعية |
| `items` | قائمة الأصناف والأدوات |
| `wingInventory` | عهدة كل جناح |
| `warehouseInventory` | رصيد المستودع |
| `movements` | سجل جميع الحركات |
| `committees` | سجل اللجان |
| `committeeHandovers` | محاضر الاستلام والتسليم |
| `toolFaultReports` | بلاغات أعطال الأدوات |
| `facilityMaintenanceReports` | بلاغات صيانة المرافق |

---

## 👤 أدوار المستخدمين

| الدور | الصلاحيات |
|---|---|
| `admin` (مدير) | كامل الصلاحيات + إدارة المستخدمين + حذف البيانات |
| `supervisor` (مشرف) | إدخال التقييمات + بلاغات العهدة |
| `warehouse` (أمين مستودع) | إدارة المستودع + الحركات |
| `maintenance` (مسؤول صيانة) | عرض البلاغات وتحديث حالتها |

---

## 📌 ملاحظات مهمة

- **البيانات القديمة محفوظة 100%** — نفس Firebase ونفس المجموعات
- التصميم الجديد: Dark Theme + Teal Accent
- يعمل على الجوال والكمبيوتر
- لإضافة مستخدم جديد: ادخل من **⚙️ الإدارة** ← **مستخدم جديد**
