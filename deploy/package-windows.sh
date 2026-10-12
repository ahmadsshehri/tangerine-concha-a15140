#!/usr/bin/env bash
# يبني حزمة جاهزة للنسخ إلى الخادم (مثل D:\RehabSystem) تتضمن مثبّت Node.js
# الاستخدام: bash deploy/package-windows.sh   →  release/RehabSystem.zip
set -euo pipefail
NODE_VERSION="${NODE_VERSION:-24.21.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release"
PKG="$OUT/RehabSystem"
MSI="node-v${NODE_VERSION}-x64.msi"
CACHE="$OUT/.cache"

cd "$ROOT"
npm ci --no-audit --no-fund
npm run build

rm -rf "$PKG" "$OUT/RehabSystem.zip"
mkdir -p "$PKG/requirements" "$PKG/migration" "$CACHE"

cp -r dist server deploy package.json README.md "$PKG/"
rm -f "$PKG/server/.env" "$PKG/deploy/package-windows.sh"
cp migration/export-firestore.mjs migration/package.json migration/.gitignore "$PKG/migration/"
cp deploy/windows/setup.bat "$PKG/setup.bat"
cp deploy/windows/INSTALL-AR.txt "$PKG/INSTALL-AR.txt"

# مثبّت Node.js (يُتحقق من سلامته بـ SHA-256 الرسمي)
if [ ! -f "$CACHE/$MSI" ]; then
  curl -fsSL -o "$CACHE/$MSI" "https://nodejs.org/dist/v${NODE_VERSION}/${MSI}"
  curl -fsSL -o "$CACHE/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
fi
(cd "$CACHE" && grep " ${MSI}\$" SHASUMS256.txt | sha256sum -c -)
cp "$CACHE/$MSI" "$PKG/requirements/"

# ضغط بصيغة Windows الأصلية (بدون صلاحيات Linux) ليفتح بلا مشاكل في مستكشف الملفات
python3 - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
with zipfile.ZipFile(os.path.join(out, 'RehabSystem.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(os.path.join(out, 'RehabSystem')):
        dirs.sort()
        for f in sorted(files):
            full = os.path.join(root, f)
            info = zipfile.ZipInfo.from_file(full, os.path.relpath(full, out))
            info.create_system = 0          # MS-DOS/Windows
            info.external_attr = 0x20       # ملف عادي (Archive) بدون صلاحيات Unix
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(full, 'rb') as fh:
                z.writestr(info, fh.read())
PY
echo "✅ $OUT/RehabSystem.zip"
