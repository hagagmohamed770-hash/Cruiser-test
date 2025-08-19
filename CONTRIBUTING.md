# دليل المساهمة

شكراً لاهتمامك بالمساهمة في تطوير تطبيق مدير الاستثمار العقاري! هذا الدليل سيساعدك على البدء في المساهمة.

## 🚀 كيفية البدء

### المتطلبات الأساسية

- معرفة بـ JavaScript (ES6+)
- فهم أساسي لـ HTML5 و CSS3
- معرفة بـ IndexedDB (اختياري)
- Git و GitHub

### إعداد البيئة التطويرية

1. **Fork المشروع**
   ```bash
   # انسخ المشروع إلى حسابك
   git clone https://github.com/YOUR_USERNAME/estate-management-app.git
   cd estate-management-app
   ```

2. **تشغيل التطبيق محلياً**
   ```bash
   # باستخدام npm
   npm start
   
   # أو باستخدام Python
   python -m http.server 8000
   
   # أو باستخدام Node.js
   npx serve .
   ```

3. **فتح التطبيق**
   - اذهب إلى `http://localhost:8000`
   - تأكد من أن التطبيق يعمل بشكل صحيح

## 📋 أنواع المساهمات المطلوبة

### 🐛 إصلاح الأخطاء
- الإبلاغ عن الأخطاء
- إصلاح الأخطاء الموجودة
- تحسين معالجة الأخطاء

### ✨ إضافة ميزات جديدة
- تحسين واجهة المستخدم
- إضافة وظائف جديدة
- تحسين الأداء

### 📚 تحسين التوثيق
- تحديث README
- إضافة تعليقات للكود
- تحسين دليل الاستخدام

### 🎨 تحسينات التصميم
- تحسين واجهة المستخدم
- إضافة أنماط جديدة
- تحسين التجاوب

## 🔧 إرشادات التطوير

### هيكل الكود

```
estate-management-app/
├── index.html          # الصفحة الرئيسية
├── app.js             # المنطق الرئيسي
├── db.js              # عمليات قاعدة البيانات
├── style.css          # التصميم
├── sw.js              # Service Worker
├── manifest.json      # PWA Manifest
└── README.md          # التوثيق
```

### معايير الكود

#### JavaScript
- استخدم ES6+ features
- اتبع معايير ESLint
- أضف تعليقات توضيحية
- استخدم أسماء متغيرات واضحة

```javascript
// ✅ جيد
const customerName = 'أحمد محمد';
const customerData = {
    id: generateId(),
    name: customerName,
    phone: '+201234567890'
};

// ❌ سيء
const cn = 'أحمد محمد';
const cd = { id: gid(), n: cn, p: '+201234567890' };
```

#### CSS
- استخدم متغيرات CSS
- اتبع BEM methodology
- أضف تعليقات للأقسام المعقدة

```css
/* ✅ جيد */
.customer-card {
    background: var(--card-bg);
    border-radius: var(--border-radius);
    padding: var(--spacing-md);
}

.customer-card__title {
    font-size: var(--font-size-lg);
    color: var(--text-primary);
}

/* ❌ سيء */
.cc {
    background: #fff;
    border-radius: 8px;
    padding: 16px;
}
```

#### HTML
- استخدم semantic HTML
- أضف attributes للوصول
- اتبع معايير accessibility

```html
<!-- ✅ جيد -->
<main class="main-content" role="main">
    <section class="customers-section" aria-labelledby="customers-title">
        <h2 id="customers-title">العملاء</h2>
        <div class="customers-list" role="list">
            <!-- محتوى العملاء -->
        </div>
    </section>
</main>

<!-- ❌ سيء -->
<div class="main">
    <div class="customers">
        <div class="title">العملاء</div>
        <div class="list">
            <!-- محتوى العملاء -->
        </div>
    </div>
</div>
```

### إضافة ميزات جديدة

1. **إنشاء فرع جديد**
   ```bash
   git checkout -b feature/new-feature-name
   ```

2. **تطوير الميزة**
   - اكتب الكود
   - اختبر الميزة
   - أضف التوثيق

3. **إضافة الاختبارات** (اختياري)
   ```javascript
   // مثال على اختبار بسيط
   function testCustomerCreation() {
       const customer = createCustomer('أحمد', '01234567890');
       assert(customer.name === 'أحمد');
       assert(customer.phone === '01234567890');
   }
   ```

4. **التأكد من الجودة**
   ```bash
   # تشغيل التطبيق
   npm start
   
   # فحص الكود
   npm run lint
   
   # تحليل الأداء
   npm run analyze
   ```

## 📝 إرشادات الـ Commit

### تنسيق الرسائل

```
type(scope): description

[optional body]

[optional footer]
```

### أنواع الـ Commits

- `feat`: ميزة جديدة
- `fix`: إصلاح خطأ
- `docs`: تحديث التوثيق
- `style`: تحسينات التصميم
- `refactor`: إعادة هيكلة الكود
- `test`: إضافة أو تحديث الاختبارات
- `chore`: مهام الصيانة

### أمثلة

```bash
# إضافة ميزة جديدة
git commit -m "feat(customers): إضافة خاصية البحث المتقدم"

# إصلاح خطأ
git commit -m "fix(database): إصلاح مشكلة حفظ البيانات"

# تحديث التوثيق
git commit -m "docs(readme): تحديث دليل التثبيت"

# تحسين التصميم
git commit -m "style(ui): تحسين تصميم الجداول"
```

## 🔄 عملية الـ Pull Request

1. **إنشاء PR**
   - اذهب إلى GitHub
   - انقر على "New Pull Request"
   - اختر الفرع المصدر والهدف

2. **ملء النموذج**
   ```markdown
   ## وصف التغييرات
   وصف مختصر للتغييرات المضافة

   ## نوع التغيير
   - [ ] إصلاح خطأ
   - [ ] ميزة جديدة
   - [ ] تحسين التوثيق
   - [ ] تحسين التصميم

   ## الاختبار
   - [ ] تم اختبار الميزة محلياً
   - [ ] لا توجد أخطاء في Console
   - [ ] يعمل على المتصفحات المختلفة

   ## لقطات شاشة (إن وجدت)
   أضف لقطات شاشة للتغييرات البصرية
   ```

3. **مراجعة الكود**
   - انتظر مراجعة الكود
   - استجب للتعليقات
   - أضف التعديلات المطلوبة

4. **الدمج**
   - بعد الموافقة، سيتم دمج الكود
   - احذف الفرع المحلي

## 🐛 الإبلاغ عن الأخطاء

### نموذج تقرير الخطأ

```markdown
## وصف الخطأ
وصف واضح ومختصر للخطأ

## خطوات إعادة الإنتاج
1. اذهب إلى '...'
2. انقر على '...'
3. انتقل إلى '...'
4. شاهد الخطأ

## السلوك المتوقع
ما كان يجب أن يحدث

## السلوك الفعلي
ما حدث بالفعل

## معلومات إضافية
- المتصفح: Chrome 120.0
- نظام التشغيل: Windows 11
- إصدار التطبيق: 4.0.0

## لقطات شاشة
أضف لقطات شاشة للخطأ
```

## 💡 اقتراح الميزات

### نموذج اقتراح الميزة

```markdown
## وصف الميزة
وصف واضح للميزة المطلوبة

## المشكلة التي تحلها
كيف ستساعد هذه الميزة المستخدمين

## الحل المقترح
وصف للحل المقترح

## البدائل المدروسة
الحلول الأخرى التي تم النظر فيها

## معلومات إضافية
أي معلومات إضافية مفيدة
```

## 🏆 الاعتراف بالمساهمات

سيتم إضافة جميع المساهمين إلى:
- قائمة المساهمين في README
- ملف CONTRIBUTORS.md
- صفحة GitHub Contributors

## 📞 التواصل

- **Issues**: للإبلاغ عن الأخطاء واقتراح الميزات
- **Discussions**: للنقاشات العامة
- **Email**: developer@example.com

## 📄 الترخيص

بالمساهمة في هذا المشروع، فإنك توافق على أن مساهماتك ستكون مرخصة تحت رخصة MIT.

---

شكراً لك على مساهمتك في تطوير هذا التطبيق! 🎉