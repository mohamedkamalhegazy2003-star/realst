export type UtilityAmounts = {
  electricity: number;
  water: number;
  gas: number;
};

export type OtherService = {
  id: string;
  note: string;
  amount: number;
  createdAt: string;
};

export type PropertyRecord = {
  id: number;
  name: string;
  address: string;
  location: string;
  tenantName: string;
  tenantPhone: string;
  tenantAlternatePhone: string;
  rent: number;
  deposit: number;
  utilitiesDue: UtilityAmounts;
  status: 'rented' | 'vacant';
  dueDate: string;
  initialDueDate: string;
  contractImages: string[];
  tenantImages: string[];
  otherServices: OtherService[];
  receiptCounter: number;
  createdAt: string;
};

export type PaymentType = 'rent' | 'utilities' | 'service' | 'combined';

export type PaymentRecord = {
  id: string;
  propertyId: number;
  receiptSerial: number;
  propertyName: string;
  tenantName: string;
  tenantPhone: string;
  rentAmount: number;
  utilitiesAmount: number;
  serviceAmount: number;
  total: number;
  type: PaymentType;
  paidAt: string;
  note: string;
  dueDateBefore: string;
  dueDateAfter: string;
  utilityBreakdown: UtilityAmounts;
  servicesSettled: OtherService[];
};

export type AppData = {
  version: 3;
  nextPropertyId: number;
  properties: PropertyRecord[];
  payments: PaymentRecord[];
};

export const emptyUtilities = (): UtilityAmounts => ({
  electricity: 0,
  water: 0,
  gas: 0,
});

export const emptyData = (): AppData => ({
  version: 3,
  nextPropertyId: 1,
  properties: [],
  payments: [],
});

export function money(value: number): string {
  return `${new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)} ج.م`;
}

export function formatDate(value: string): string {
  if (!value) return 'غير محدد';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'غير محدد';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function utilityTotal(amounts: UtilityAmounts): number {
  return amounts.electricity + amounts.water + amounts.gas;
}

export function propertyIncome(propertyId: number, payments: PaymentRecord[]): number {
  return payments
    .filter((payment) => payment.propertyId === propertyId)
    .reduce((total, payment) => total + payment.total, 0);
}
