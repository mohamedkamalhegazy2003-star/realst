import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDate, money, PaymentRecord, PropertyRecord } from './models';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shell(title: string, content: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
  <style>
    @page{margin:22mm 16mm}*{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#18372d;direction:rtl;text-align:right;font-size:12px}
    header{border-bottom:2px solid #215746;padding-bottom:16px;margin-bottom:20px}
    h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:22px 0 8px}
    .muted{color:#67766e}.summary{background:#eff4f0;border-radius:10px;padding:14px;margin:10px 0}
    .grid{display:flex;gap:12px;flex-wrap:wrap}.tile{flex:1;min-width:130px;background:#f7f7f2;padding:10px;border-radius:8px}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{text-align:right;border-bottom:1px solid #dce2dc;padding:9px 6px}
    th{background:#f1f4ef}.total{font-size:20px;font-weight:bold;color:#215746}
    footer{margin-top:26px;color:#77827b;font-size:10px}
  </style></head><body><header><h1>${escapeHtml(title)}</h1>
  <div class="muted">إدارة العقارات · ${escapeHtml(formatDate(new Date().toISOString()))}</div></header>
  ${content}<footer>تم إنشاء هذا التقرير من تطبيق إدارة العقارات.</footer></body></html>`;
}

function paymentRows(payments: PaymentRecord[]): string {
  if (!payments.length) return '<tr><td colspan="7">لا توجد حركات مالية مسجلة.</td></tr>';
  return payments
    .map(
      (payment) => `<tr>
        <td>${escapeHtml(formatDate(payment.paidAt))}</td>
        <td>${escapeHtml(payment.propertyName)} · ${escapeHtml(payment.tenantName || '—')}</td>
        <td>${escapeHtml(String(payment.receiptSerial))}</td>
        <td>${escapeHtml(money(payment.rentAmount))}</td>
        <td>${escapeHtml(money(payment.utilitiesAmount))}</td>
        <td>${escapeHtml(money(payment.serviceAmount))}</td>
        <td>${escapeHtml(money(payment.total))}</td>
      </tr>`,
    )
    .join('');
}

export async function exportPropertyReport(
  property: PropertyRecord,
  payments: PaymentRecord[],
): Promise<void> {
  const propertyPayments = payments.filter((payment) => payment.propertyId === property.id);
  const total = propertyPayments.reduce((sum, item) => sum + item.total, 0);
  const html = shell(
    `الحساب الخاص · ${property.name}`,
    `<div class="summary grid">
      <div class="tile"><span class="muted">المستأجر</span><br>${escapeHtml(property.tenantName || 'غير محدد')}</div>
      <div class="tile"><span class="muted">رقم العقار</span><br>${property.id}</div>
      <div class="tile"><span class="muted">الإيجار الشهري</span><br>${escapeHtml(money(property.rent))}</div>
      <div class="tile"><span class="muted">إجمالي المقبوضات</span><br><span class="total">${escapeHtml(money(total))}</span></div>
    </div>
    <h2>تفاصيل الحركة المالية</h2>
    <table><thead><tr><th>التاريخ</th><th>البيان</th><th>رقم الإيصال</th><th>الإيجار</th><th>المرافق</th><th>خدمات أخرى</th><th>الإجمالي</th></tr></thead>
    <tbody>${paymentRows(propertyPayments)}</tbody></table>`,
  );
  await sharePdf(html, `حساب-العقار-${property.id}.pdf`);
}

export async function exportAllPropertiesReport(
  properties: PropertyRecord[],
  payments: PaymentRecord[],
): Promise<void> {
  const total = payments.reduce((sum, item) => sum + item.total, 0);
  const propertyRows = properties
    .map((property) => {
      const income = payments
        .filter((payment) => payment.propertyId === property.id)
        .reduce((sum, item) => sum + item.total, 0);
      return `<tr><td>${property.id}</td><td>${escapeHtml(property.name)}</td>
        <td>${escapeHtml(property.tenantName || '—')}</td><td>${escapeHtml(money(income))}</td></tr>`;
    })
    .join('');
  const html = shell(
    'التقرير المالي المجمع',
    `<div class="summary grid">
      <div class="tile">عدد العقارات<br><span class="total">${properties.length}</span></div>
      <div class="tile">عدد الإيصالات<br><span class="total">${payments.length}</span></div>
      <div class="tile">إجمالي الإيرادات<br><span class="total">${escapeHtml(money(total))}</span></div>
    </div>
    <h2>إيرادات العقارات</h2>
    <table><thead><tr><th>المعرّف</th><th>العقار</th><th>المستأجر</th><th>الإيراد</th></tr></thead>
    <tbody>${propertyRows || '<tr><td colspan="4">لا توجد عقارات مسجلة.</td></tr>'}</tbody></table>
    <h2>كل الإيصالات والحركات</h2>
    <table><thead><tr><th>التاريخ</th><th>العقار والمستأجر</th><th>رقم الإيصال</th><th>الإيجار</th><th>المرافق</th><th>خدمات أخرى</th><th>الإجمالي</th></tr></thead>
    <tbody>${paymentRows(payments)}</tbody></table>`,
  );
  await sharePdf(html, 'التقرير-المالي-المجمع.pdf');
}

export async function exportReceipt(payment: PaymentRecord): Promise<void> {
  const html = shell(
    `إيصال رقم ${payment.receiptSerial}`,
    `<div class="summary">
      <p>العقار: <b>${escapeHtml(payment.propertyName)}</b></p>
      <p>المستأجر: <b>${escapeHtml(payment.tenantName || '—')}</b></p>
      <p>تاريخ السداد: ${escapeHtml(formatDate(payment.paidAt))}</p>
      <p>الإيجار: ${escapeHtml(money(payment.rentAmount))}</p>
      <p>المرافق: ${escapeHtml(money(payment.utilitiesAmount))}</p>
      <p>الخدمات الأخرى: ${escapeHtml(money(payment.serviceAmount))}</p>
      <p class="total">الإجمالي: ${escapeHtml(money(payment.total))}</p>
      <p>ملاحظات: ${escapeHtml(payment.note || '—')}</p>
    </div>`,
  );
  await sharePdf(html, `إيصال-${payment.receiptSerial}.pdf`);
}

async function sharePdf(html: string, fileName: string): Promise<void> {
  const file = await Print.printToFileAsync({ html });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('مشاركة ملفات PDF غير متاحة على هذا الجهاز');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: fileName,
    UTI: 'com.adobe.pdf',
  });
}
