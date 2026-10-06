import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AppData,
  emptyData,
  emptyUtilities,
  OtherService,
  PaymentRecord,
  PaymentType,
  PropertyRecord,
  UtilityAmounts,
} from './models';

const STORAGE_KEY = 'estate-manager-data';
const LEGACY_KEYS = ['estate.data.v2', 'estate.data'];

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function addMonths(iso: string, months: number): string {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function readUtilities(source: Record<string, unknown>): UtilityAmounts {
  const nested = (source.utilitiesDue ?? source.utilities_due) as
    | Record<string, unknown>
    | undefined;
  return {
    electricity: numberValue(nested?.electricity ?? source.electricity),
    water: numberValue(nested?.water ?? source.water),
    gas: numberValue(nested?.gas),
  };
}

function migrateSnapshot(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const source = raw as Record<string, unknown>;
  const rawProperties = Array.isArray(source.properties) ? source.properties : [];
  const rawPayments = Array.isArray(source.payments) ? source.payments : [];

  const properties: PropertyRecord[] = rawProperties.map((value, index) => {
    const old = (value ?? {}) as Record<string, unknown>;
    const id = Math.max(1, Math.floor(numberValue(old.id) || index + 1));
    const initialDueDate = stringValue(
      old.initialDueDate ?? old.initial_due_date ?? old.dueDate ?? old.due_date,
    ).slice(0, 10);
    const images = (key: string, legacyKey: string): string[] => {
      const collection = old[key] ?? old[legacyKey];
      if (Array.isArray(collection)) {
        return collection.filter((item): item is string => typeof item === 'string').slice(0, 20);
      }
      const legacy = stringValue(old[legacyKey]);
      return legacy ? [legacy] : [];
    };
    const servicesRaw = old.otherServices ?? old.other_services;
    const otherServices: OtherService[] = Array.isArray(servicesRaw)
      ? servicesRaw.map((service, serviceIndex) => {
          const item = (service ?? {}) as Record<string, unknown>;
          return {
            id: stringValue(item.id) || `service-${id}-${serviceIndex}`,
            note: stringValue(item.note),
            amount: numberValue(item.amount),
            createdAt: stringValue(item.createdAt ?? item.created_at) || new Date().toISOString(),
          };
        })
      : [];
    return {
      id,
      name: stringValue(old.name) || `عقار ${id}`,
      address: stringValue(old.address),
      location: stringValue(old.location ?? old.address),
      tenantName: stringValue(old.tenantName ?? old.tenant_name),
      tenantPhone: stringValue(old.tenantPhone ?? old.tenant_phone),
      tenantAlternatePhone: stringValue(
        old.tenantAlternatePhone ?? old.tenant_alternate_phone ?? old.alternatePhone,
      ),
      rent: numberValue(old.rent ?? old.rentAmount ?? old.rent_amount),
      deposit: numberValue(old.deposit ?? old.depositAmount ?? old.deposit_amount),
      utilitiesDue: readUtilities(old),
      status: old.status === 'vacant' || old.status === 'شاغر' ? 'vacant' : 'rented',
      dueDate: stringValue(old.dueDate ?? old.due_date).slice(0, 10),
      initialDueDate,
      contractImages: images('contractImages', 'contractPath').length
        ? images('contractImages', 'contractPath')
        : images('contract_images', 'contract_path'),
      tenantImages: images('tenantImages', 'tenantPath').length
        ? images('tenantImages', 'tenantPath')
        : images('tenant_images', 'id_card_path'),
      otherServices,
      receiptCounter: Math.max(0, Math.floor(numberValue(old.receiptCounter ?? old.receipt_counter))),
      createdAt: stringValue(old.createdAt ?? old.created_at) || new Date().toISOString(),
    };
  });

  const counters = new Map<number, number>();
  const payments: PaymentRecord[] = rawPayments.map((value, index) => {
    const old = (value ?? {}) as Record<string, unknown>;
    const propertyId = Math.max(
      1,
      Math.floor(numberValue(old.propertyId ?? old.property_id) || properties[0]?.id || 1),
    );
    const serial = numberValue(old.receiptSerial ?? old.receipt_serial);
    const counter = counters.get(propertyId) ?? 0;
    const receiptSerial = serial || propertyId * 100000 + counter + 1;
    counters.set(propertyId, Math.max(counter + 1, receiptSerial - propertyId * 100000));
    const total = numberValue(old.total ?? old.amount);
    const rentAmount = numberValue(old.rentAmount ?? old.rent_amount) || total;
    const utilitiesAmount = numberValue(old.utilitiesAmount ?? old.utilities_amount);
    const serviceAmount = numberValue(old.serviceAmount ?? old.service_amount);
    const utilityRaw = (old.utilityBreakdown ?? old.utility_breakdown ?? {}) as Record<
      string,
      unknown
    >;
    const utilityBreakdown: UtilityAmounts = {
      electricity: numberValue(utilityRaw.electricity),
      water: numberValue(utilityRaw.water),
      gas: numberValue(utilityRaw.gas),
    };
    return {
      id: stringValue(old.id) || `legacy-${propertyId}-${index}`,
      propertyId,
      receiptSerial,
      propertyName: stringValue(old.propertyName ?? old.property_name),
      tenantName: stringValue(old.tenantName ?? old.tenant_name),
      tenantPhone: stringValue(old.tenantPhone ?? old.tenant_phone),
      rentAmount,
      utilitiesAmount,
      serviceAmount,
      total: total || rentAmount + utilitiesAmount + serviceAmount,
      type: (old.type as PaymentType) || 'rent',
      paidAt: stringValue(old.paidAt ?? old.paid_at) || new Date().toISOString(),
      note: stringValue(old.note),
      dueDateBefore: stringValue(old.dueDateBefore ?? old.due_date_before),
      dueDateAfter: stringValue(old.dueDateAfter ?? old.due_date_after),
      utilityBreakdown,
      servicesSettled: Array.isArray(old.servicesSettled)
        ? (old.servicesSettled as OtherService[])
        : [],
    };
  });

  for (const property of properties) {
    property.receiptCounter = Math.max(
      property.receiptCounter,
      counters.get(property.id) ?? 0,
    );
    if (!property.initialDueDate) property.initialDueDate = property.dueDate;
  }

  return {
    version: 3,
    nextPropertyId: Math.max(
      Math.floor(numberValue(source.nextPropertyId) || 1),
      ...properties.map((property) => property.id + 1),
    ),
    properties,
    payments,
  };
}

function dueDateAfterPayments(
  property: PropertyRecord,
  payments: PaymentRecord[],
): string {
  const base = property.initialDueDate || property.dueDate;
  const rentPayments = payments.filter(
    (payment) => payment.propertyId === property.id && payment.rentAmount > 0,
  ).length;
  return addMonths(base, rentPayments);
}

export type PaymentInput = {
  rentAmount?: number;
  utilitiesAmount?: number;
  serviceAmount?: number;
  type: PaymentType;
  note: string;
  settledServiceIds?: string[];
};

type AppStateValue = {
  data: AppData;
  ready: boolean;
  addProperty: (record: Omit<PropertyRecord, 'id' | 'receiptCounter' | 'createdAt'>) => Promise<number>;
  updateProperty: (id: number, changes: Partial<PropertyRecord>) => Promise<void>;
  deleteProperty: (id: number) => Promise<void>;
  updateUtilities: (id: number, amounts: UtilityAmounts) => Promise<void>;
  addService: (id: number, note: string, amount: number) => Promise<void>;
  makePayment: (id: number, input: PaymentInput) => Promise<PaymentRecord | null>;
  updatePaymentTotal: (id: string, newTotal: number) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) {
          for (const key of LEGACY_KEYS) {
            saved = await AsyncStorage.getItem(key);
            if (saved) break;
          }
        }
        const migrated = migrateSnapshot(saved ? JSON.parse(saved) : null);
        if (active) {
          setData(migrated);
          setReady(true);
          if (saved) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      } catch (error) {
        console.error('Unable to read local property data', error);
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback(async (next: AppData) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setData(next);
  }, []);

  const addProperty = useCallback<AppStateValue['addProperty']>(
    async (record) => {
      const id = data.nextPropertyId;
      const property: PropertyRecord = {
        ...record,
        id,
        receiptCounter: 0,
        createdAt: new Date().toISOString(),
      };
      await commit({
        ...data,
        version: 3,
        nextPropertyId: id + 1,
        properties: [property, ...data.properties],
      });
      return id;
    },
    [commit, data],
  );

  const updateProperty = useCallback<AppStateValue['updateProperty']>(
    async (id, changes) => {
      const properties = data.properties.map((property) =>
        property.id === id
          ? { ...property, ...changes, id, receiptCounter: property.receiptCounter }
          : property,
      );
      await commit({ ...data, properties });
    },
    [commit, data],
  );

  const deleteProperty = useCallback<AppStateValue['deleteProperty']>(
    async (id) => {
      await commit({
        ...data,
        properties: data.properties.filter((property) => property.id !== id),
        payments: data.payments.filter((payment) => payment.propertyId !== id),
      });
    },
    [commit, data],
  );

  const updateUtilities = useCallback<AppStateValue['updateUtilities']>(
    async (id, amounts) => {
      await updateProperty(id, { utilitiesDue: amounts });
    },
    [updateProperty],
  );

  const addService = useCallback<AppStateValue['addService']>(
    async (id, note, amount) => {
      const property = data.properties.find((item) => item.id === id);
      if (!property) return;
      const service: OtherService = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        note: note.trim(),
        amount,
        createdAt: new Date().toISOString(),
      };
      await updateProperty(id, { otherServices: [...property.otherServices, service] });
    },
    [data.properties, updateProperty],
  );

  const makePayment = useCallback<AppStateValue['makePayment']>(
    async (propertyId, input) => {
      const property = data.properties.find((item) => item.id === propertyId);
      if (!property) return null;

      const settledServices = property.otherServices.filter((service) =>
        input.settledServiceIds?.includes(service.id),
      );
      const servicesAmount = settledServices.reduce((total, item) => total + item.amount, 0);
      const serviceAmount = input.serviceAmount ?? servicesAmount;
      const utilitiesAmount = input.utilitiesAmount ?? 0;
      const rentAmount = input.rentAmount ?? 0;
      const before = property.dueDate;
      const utilityBreakdown =
        utilitiesAmount > 0 ? { ...property.utilitiesDue } : emptyUtilities();
      const nextPayment: PaymentRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        propertyId,
        receiptSerial: propertyId * 100000 + property.receiptCounter + 1,
        propertyName: property.name,
        tenantName: property.tenantName,
        tenantPhone: property.tenantPhone,
        rentAmount,
        utilitiesAmount,
        serviceAmount,
        total: rentAmount + utilitiesAmount + serviceAmount,
        type: input.type,
        paidAt: new Date().toISOString(),
        note: input.note.trim(),
        dueDateBefore: before,
        dueDateAfter: before,
        utilityBreakdown,
        servicesSettled: settledServices,
      };
      const payments = [nextPayment, ...data.payments];
      const withCounter = data.properties.map((item) =>
        item.id === propertyId
          ? {
              ...item,
              receiptCounter: item.receiptCounter + 1,
              utilitiesDue:
                utilitiesAmount > 0
                  ? emptyUtilities()
                  : item.utilitiesDue,
              otherServices: item.otherServices.filter(
                (service) => !input.settledServiceIds?.includes(service.id),
              ),
            }
          : item,
      );
      const dueDate = dueDateAfterPayments(
        { ...property, initialDueDate: property.initialDueDate || property.dueDate },
        payments,
      );
      const properties = withCounter.map((item) =>
        item.id === propertyId ? { ...item, dueDate } : item,
      );
      nextPayment.dueDateAfter = dueDate;
      await commit({ ...data, properties, payments });
      return nextPayment;
    },
    [commit, data],
  );

  const updatePaymentTotal = useCallback<AppStateValue['updatePaymentTotal']>(
    async (id, newTotal) => {
      const old = data.payments.find((payment) => payment.id === id);
      if (!old) return;
      const property = data.properties.find((item) => item.id === old.propertyId);
      if (!property) return;
      const paymentsWithoutOld = data.payments.filter((payment) => payment.id !== id);
      let rentAmount = old.rentAmount;
      let utilitiesAmount = old.utilitiesAmount;
      let serviceAmount = old.serviceAmount;
      if (old.type === 'rent') rentAmount = newTotal;
      else if (old.type === 'utilities') utilitiesAmount = newTotal;
      else if (old.type === 'service') serviceAmount = newTotal;
      else {
        const ratio = old.total > 0 ? newTotal / old.total : 0;
        rentAmount *= ratio;
        utilitiesAmount *= ratio;
        serviceAmount *= ratio;
      }

      const restoredUtilities: UtilityAmounts = {
        electricity: property.utilitiesDue.electricity + old.utilityBreakdown.electricity,
        water: property.utilitiesDue.water + old.utilityBreakdown.water,
        gas: property.utilitiesDue.gas + old.utilityBreakdown.gas,
      };
      let remainingToPay = Math.max(0, utilitiesAmount);
      const utilityBreakdown = emptyUtilities();
      for (const key of ['electricity', 'water', 'gas'] as const) {
        const settled = Math.min(restoredUtilities[key], remainingToPay);
        utilityBreakdown[key] = settled;
        restoredUtilities[key] -= settled;
        remainingToPay -= settled;
      }
      const keepServices = Math.abs(newTotal - old.total) < 0.01;
      const updated: PaymentRecord = {
        ...old,
        rentAmount,
        utilitiesAmount,
        serviceAmount,
        total: rentAmount + utilitiesAmount + serviceAmount,
        utilityBreakdown,
        servicesSettled: keepServices ? old.servicesSettled : [],
      };
      const serviceRefund = keepServices ? [] : old.servicesSettled;
      const payments = [updated, ...paymentsWithoutOld];
      const updatedProperty: PropertyRecord = {
        ...property,
        utilitiesDue: restoredUtilities,
        otherServices: [...property.otherServices, ...serviceRefund],
      };
      const dueDate = dueDateAfterPayments(updatedProperty, payments);
      await commit({
        ...data,
        properties: data.properties.map((item) =>
          item.id === property.id ? { ...updatedProperty, dueDate } : item,
        ),
        payments,
      });
    },
    [commit, data],
  );

  const deletePayment = useCallback<AppStateValue['deletePayment']>(
    async (id) => {
      const payment = data.payments.find((item) => item.id === id);
      if (!payment) return;
      const property = data.properties.find((item) => item.id === payment.propertyId);
      const payments = data.payments.filter((item) => item.id !== id);
      const properties = data.properties.map((item) => {
        if (!property || item.id !== property.id) return item;
        const restored: PropertyRecord = {
          ...item,
          utilitiesDue: {
            electricity: item.utilitiesDue.electricity + payment.utilityBreakdown.electricity,
            water: item.utilitiesDue.water + payment.utilityBreakdown.water,
            gas: item.utilitiesDue.gas + payment.utilityBreakdown.gas,
          },
          otherServices: [...item.otherServices, ...payment.servicesSettled],
        };
        return { ...restored, dueDate: dueDateAfterPayments(restored, payments) };
      });
      await commit({ ...data, properties, payments });
    },
    [commit, data],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      data,
      ready,
      addProperty,
      updateProperty,
      deleteProperty,
      updateUtilities,
      addService,
      makePayment,
      updatePaymentTotal,
      deletePayment,
    }),
    [
      data,
      ready,
      addProperty,
      updateProperty,
      deleteProperty,
      updateUtilities,
      addService,
      makePayment,
      updatePaymentTotal,
      deletePayment,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}
