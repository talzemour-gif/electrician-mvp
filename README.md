# Electrician MVP

MVP למערכת ניהול עבור בודק חשמל בישראל.

## מה כבר קיים
- דשבורד ראשוני
- מסך לקוחות עם חיפוש
- הוספת לקוח חדש + כתובת ראשונה
- שלד למסך יומן
- מחירון ראשוני
- סכמת PostgreSQL מלאה ל-Supabase
- תמיכה במספר כתובות ללקוח
- מונה הזזות פגישה + טבלת היסטוריית הזזות

## הרצה מקומית
1. התקן Node.js.
2. בתיקיית הפרויקט הרץ:
   npm install
3. לאחר מכן:
   npm run dev
4. פתח http://localhost:3000

## חיבור Supabase
1. פתח פרויקט Supabase.
2. העתק `.env.example` ל-`.env.local` והכנס URL + Publishable Key.
3. פתח SQL Editor ב-Supabase והרץ את `supabase/schema.sql`.

## חשוב
כרגע מסך הלקוחות משתמש בנתוני דמו בזיכרון בלבד, כדי שנוכל לאשר את UX לפני חיבור ממשי למסד הנתונים.
השלב הבא: חיבור Customers + Customer Addresses ל-Supabase ואז בניית היומן.
