# إعداد Supabase — المستشار اليمني القانوني

## ✅ تم الربط

تم ربط الموقع بمشروع Supabase الخاص بك.

### الإعدادات المُعدّة:
- **Project URL**: `https://ocucwsjzrqrnivgytapk.supabase.co`
- **Anon Key**: مُعدّ في `backend.js`

## ⚠️ خطوة مطلوبة: إنشاء الجداول

يجب تشغيل مخطط قاعدة البيانات في Supabase:

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **SQL Editor**
4. انسخ محتوى `supabase-schema.sql`
5. اضغط **Run**

### الجداول التي سيتم إنشاؤها:
- `admin_users` — إدارة المستخدمين
- `knowledge_base` — قاعدة المعرفة القانونية
- `site_analytics` — تتبع الزيارات والتحليلات
- `audit_log` — سجل العمليات
- `advisor_settings` — إعدادات المستشار
- `uploaded_files` — الملفات المرفوعة

## 🔐 إنشاء مستخدم الإدارة

في Supabase Dashboard → Authentication → Users:
1. Add User
2. Email: `admin@lawbook-ye.local`
3. Password: `777287583`
4. Confirm

## 🧪 اختبار

بعد إنشاء الجداول:
1. افتح `admin.html`
2. سجل الدخول بـ `admin` / `777287583`
3. تحقق من عمل لوحة التحكم

## 📊 المميزات المُفعّلة

| الميزة | الحالة |
|--------|--------|
| مصادقة مركزية | ✅ |
| قاعدة بيانات مركزية | ✅ |
| تحليلات مركزية | ✅ |
| سجل عمليات مركزي | ✅ |
| إعدادات مركزية | ✅ |
| إدارة مستخدمين | ✅ |
| تخزين ملفات | ⚠️ يتطلب Storage bucket |
| بحث نصي كامل | ⚠️ يتطلب تفعيل pg_trgm |

## 🔧 تفعيل البحث النصي (اختياري)

في SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## 📁 تفعيل تخزين الملفات (اختياري)

في Supabase Dashboard → Storage:
1. Create Bucket: `legal-files`
2. Set as Public
