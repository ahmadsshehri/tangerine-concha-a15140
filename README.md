# نظام إدارة المراكز التأهيلية — الإصدار 3.0 (خادم محلي)

النظام يعمل بالكامل على خادم داخل الشبكة الداخلية مثل منصة النزلاء والموارد البشرية:
لا Firebase، لا Vercel، ولا يحتاج اتصالاً بالإنترنت أثناء التشغيل.

```
المتصفح (أي جهاز في الشبكة)  ──►  http://<اسم-الخادم>:8080
                                     │
                                     ▼
                          server/index.js  (Node.js)
                          ├─ يعرض واجهة الموقع (dist/)
                          ├─ /api  ← تسجيل الدخول + البيانات
                          └─ data/rehab.db  (SQLite)  +  data/backups/ (نسخ يومية)
```

## 🏗️ هيكل المشروع

```
server/                ← الخادم المحلي (بدون أي مكتبات خارجية)
├── index.js           ← الخادم + واجهة API
├── db.js              ← قاعدة البيانات (SQLite المدمجة في Node.js)
├── auth.js            ← تسجيل الدخول وكلمات المرور والجلسات
├── backup.js          ← النسخ الاحتياطي اليومي
├── manage.js          ← أدوات الإدارة (إنشاء مدير، كلمات المرور، الاستيراد)
└── .env.example       ← الإعدادات
migration/             ← أداة تُستخدم مرة واحدة لتصدير البيانات من Firebase
deploy/                ← ملفات التثبيت على Windows / Linux / IIS / nginx
src/
├── lib/
│   ├── localDb.js     ← بديل firebase/firestore (نفس أسماء الدوال)
│   ├── localAuth.js   ← بديل firebase/auth
│   ├── api.js         ← الاتصال بالخادم
│   └── constants.js
├── hooks/useAuth.jsx
├── components/ …
└── modules/ …         ← الصفحات (لم يتغير منطقها)
public/fonts/          ← خط Cairo محلياً (يعمل بدون إنترنت)
```

---

## 🚀 التثبيت على الخادم الداخلي

### 1. المتطلبات
- خادم (أو جهاز يعمل دائماً) داخل الشبكة — Windows Server أو Linux
- **Node.js 22.13 أو أحدث** (يُنصح بـ 24 LTS) من https://nodejs.org
- منفذ مفتوح في جدار الحماية (الافتراضي 8080)

### 2. تجهيز الملفات
على جهاز فيه إنترنت (أو على الخادم نفسه):

```bash
git clone https://github.com/ahmadsshehri/tangerine-concha-a15140.git rehab-system
cd rehab-system
npm install
npm run build
```

بعدها يكفي نسخ هذه المجلدات إلى الخادم: `dist/` و `server/` و `deploy/` و `package.json`
(الخادم لا يحتاج `node_modules` ولا إنترنت لأنه بلا مكتبات خارجية).

### 3. الإعدادات (اختياري)
انسخ `server/.env.example` إلى `server/.env` وعدّل المنفذ ومكان البيانات إن لزم.

### 4. إنشاء حساب المدير الأول
(تخطَّ هذه الخطوة إذا كنت ستنقل البيانات من Firebase — الحسابات ستنتقل معها)

```bash
npm run manage -- create-admin admin@center.local "كلمة-مرور-قوية" "أحمد"
```

### 5. التشغيل

**Windows Server (الأسهل):** حزمة جاهزة فيها كل المتطلبات بما فيها مثبّت Node.js:
```bash
bash deploy/package-windows.sh      # ينتج release/RehabSystem.zip
```
فك الضغط على الخادم إلى `D:\RehabSystem` ثم زر أيمن على `setup.bat` ← **Run as administrator**.
المثبّت ينصّب Node.js عند الحاجة، ويجهّز البيانات، وينشئ حساب المدير، ويسجّل النظام ليعمل تلقائياً مع تشغيل الخادم، ويفتح المنفذ في جدار الحماية.
التفاصيل في `deploy/windows/INSTALL-AR.txt`. وللإيقاف والإعادة: `deploy\windows\restart.bat` و`uninstall.bat`.

**Linux:** انسخ المشروع إلى `/opt/rehab-system` ثم:
```bash
sudo useradd -r rehab && sudo chown -R rehab /opt/rehab-system
sudo cp deploy/linux/rehab.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rehab
```

**تشغيل يدوي للتجربة:** `npm start`

افتح من أي جهاز في الشبكة: `http://<اسم-الخادم-أو-IP>:8080`

### 6. ربطه برابط داخلي مثل باقي المنصات (اختياري)
إذا كانت منصة النزلاء والموارد البشرية تعمل عبر IIS أو nginx باسم داخلي، اطلب من إدارة التقنية:
- إضافة سجل DNS داخلي مثل `rehab.intranet.local` يشير للخادم
- استخدام `deploy/windows/web.config` (IIS + URL Rewrite + ARR) أو `deploy/linux/nginx.conf`
- عند استخدام HTTPS اجعل `TRUST_PROXY=true` و `SECURE_COOKIES=true` في `server/.env`

---

## 🔄 نقل البيانات من Firebase (مرة واحدة)

> أوقف إدخال البيانات في النظام القديم أثناء النقل حتى لا تضيع أي تعديلات.

**أ) تصدير البيانات**
1. لوحة Firebase ← ⚙️ Project settings ← **Service accounts** ← **Generate new private key**
   واحفظ الملف باسم `migration/service-account.json` (ملف سري — لا ترفعه لـ GitHub)
2. ```bash
   cd migration
   npm install
   node export-firestore.mjs
   ```
   ينتج `migration/firestore-export.json`

**ب) تصدير حسابات الدخول (لتبقى كلمات المرور القديمة كما هي)**
```bash
npx firebase-tools login
npx firebase-tools auth:export auth-users.json --format=json --project src-jed1
```
ثم من لوحة Firebase ← **Authentication** ← **Users** ← قائمة ⋮ ← **Password hash parameters**
وانسخ القيم إلى ملف `migration/hash-config.json`:
```json
{ "base64_signer_key": "...", "base64_salt_separator": "...", "rounds": 8, "mem_cost": 14 }
```

**ج) الاستيراد على الخادم المحلي**
```bash
npm run manage -- import migration/firestore-export.json migration/auth-users.json migration/hash-config.json
npm run manage -- list-users
```
- كل المستخدمين يدخلون بنفس البريد ونفس كلمة المرور القديمة.
- إذا لم تتوفر ملفات (ب)، تُنقل الحسابات بدون كلمات مرور، ويعيّن المدير كلمة مرور لكل مستخدم
  من **⚙️ الإدارة ← 🔒 كلمة المرور**، أو: `npm run manage -- reset-password <email> <password>`

بعد التأكد من سلامة البيانات احذف ملفات `migration/*.json` (تحتوي بيانات حساسة)،
ويمكن لاحقاً إيقاف مشروع Firebase ومشروع Vercel.

---

## 💾 النسخ الاحتياطي
- نسخة تلقائية يومياً (الساعة 2 فجراً افتراضياً) في `data/backups/` ويُحتفظ بآخر 30 نسخة
- نسخة فورية: `npm run manage -- backup`
- **الاستعادة:** أوقف الخادم ← انسخ ملف النسخة مكان `data/rehab.db` ← شغّل الخادم
- يُنصح بأن يكون مجلد `data` ضمن النسخ الاحتياطي المركزي لإدارة التقنية (أو اضبط `BACKUP_DIR` على قرص شبكي)

## 🔧 التحديث مستقبلاً
```bash
git pull
npm install
npm run build
```
ثم أعد تشغيل الخدمة (`deploy\windows\restart.bat` في Windows، أو `sudo systemctl restart rehab` في Linux).
البيانات في `data/` لا تتأثر بالتحديث.

## 🧑‍💻 التطوير على جهازك
```bash
npm run dev:server   # نافذة 1 — الخادم على المنفذ 8080
npm run dev          # نافذة 2 — الواجهة مع إعادة التحميل الفوري
```

---

## 🗄️ المجموعات (نفس أسماء Firestore السابقة)

| المجموعة | الوصف |
|---|---|
| `users` | بيانات المستخدمين والأدوار والصلاحيات |
| `wings` | تقييمات المشرفين المسائية |
| `qayyim` | تقييمات القيّمين الأسبوعية |
| `items` / `wingInventory` / `warehouseInventory` / `movements` | العهدة والمستودع |
| `committees` / `committeeHandovers` | اللجان ومحاضر التسليم |
| `toolFaultReports` / `facilityMaintenanceReports` | البلاغات |
| `hrStaff` / `hrAttendance` … | الموارد البشرية والحضور |

## 👤 أدوار المستخدمين

| الدور | الصلاحيات |
|---|---|
| `admin` (مدير) | كامل الصلاحيات + إدارة المستخدمين وكلمات المرور |
| `supervisor` (مشرف) | حسب الصلاحيات المحددة له من صفحة الإدارة |
