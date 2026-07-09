# إعداد لوحة الإدارة الإنتاجية — المستشار اليمني القانوني

## الخطوة 1: إنشاء مشروع Supabase

1. اذهب إلى [supabase.com](https://supabase.com)
2. أنشئ حساب مجاني
3. أنشئ مشروع جديد
4. احفظ **Project URL** و **anon key**

## الخطوة 2: إنشاء قاعدة البيانات

1. في Supabase Dashboard → SQL Editor
2. انسخ محتوى `supabase-schema.sql` والصقه
3. اضغط Run

## الخطوة 3: تحديث الإعدادات

في ملف `backend.js`، استبدل:

```javascript
SUPABASE_URL: 'https://xxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJxxxx...',
```

## الخطوة 4: إنشاء المستخدم الأول

في Supabase Dashboard → Authentication → Users:
1. أضف مستخدم جديد
2. البريد: `admin@lawbook-ye.local`
3. كلمة المرور: `777287583`

## الخطوة 5: النشر

ارفع الملفات إلى GitHub Pages أو أي استضافة static.

---

## البدائل المجانية

إذا لم ترد Supabase:

| الخدمة | المميزات | الحد المجاني |
|--------|---------|-------------|
| Supabase | PostgreSQL + Auth + Storage | 500MB DB + 1GB Storage |
| Neon | PostgreSQL فقط | 512MB |
| PlanetScale | MySQL | 5GB |
| Firebase | Firestore + Auth | 1GB Storage |

## بدون Backend

إذا لم تُعد backend، النظام يعمل بـ IndexedDB محلياً (جهاز واحد فقط).
