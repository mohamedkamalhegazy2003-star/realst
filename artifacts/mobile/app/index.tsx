import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { useColors } from '@/hooks/useColors';
import { AppButton, Divider, Field, Label, Panel, SectionTitle } from '@/src/components';
import { useAppState, PaymentInput } from '@/src/app-state';
import {
  formatDate,
  money,
  OtherService,
  PaymentRecord,
  PaymentType,
  PropertyRecord,
  utilityTotal,
} from '@/src/models';
import {
  AccountRole,
  createAccounts,
  getBiometricRole,
  LocalAccount,
  readAccounts,
  setBiometricRole,
  updateAccountName,
  updateAccountPassword,
  verifyPassword,
} from '@/src/security';
import {
  areFourHourRemindersEnabled,
  disableFourHourReminders,
  enableFourHourReminders,
  requestNotificationPermission,
} from '@/src/notifications';
import { exportAllPropertiesReport, exportPropertyReport, exportReceipt } from '@/src/pdf';

type MainTab = 'properties' | 'payments' | 'reports' | 'settings';
type ModalState =
  | { type: 'property'; propertyId?: number }
  | { type: 'details'; propertyId: number }
  | { type: 'payment'; paymentId: string }
  | null;

const TABS: { id: MainTab; title: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'properties', title: 'العقارات', icon: 'home' },
  { id: 'payments', title: 'التحصيل', icon: 'credit-card' },
  { id: 'reports', title: 'التقارير', icon: 'bar-chart-2' },
  { id: 'settings', title: 'الإعدادات', icon: 'settings' },
];

function showError(error: unknown) {
  Alert.alert(
    'تعذر إتمام العملية',
    error instanceof Error ? error.message : 'حدث خطأ غير متوقع. حاول مرة أخرى.',
  );
}

function askToDelete(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: onConfirm },
  ]);
}

function IconAction({
  icon,
  onPress,
  color,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ padding: 7, opacity: pressed ? 0.55 : 1 })}
    >
      <Feather name={icon} size={19} color={color || colors.foreground} />
    </Pressable>
  );
}

function Tag({ text, tone = 'green' }: { text: string; tone?: 'green' | 'orange' | 'gray' }) {
  const colors = useColors();
  const palette =
    tone === 'orange'
      ? { bg: colors.accent, fg: colors.accentForeground }
      : tone === 'gray'
        ? { bg: colors.muted, fg: colors.mutedForeground }
        : { bg: colors.secondary, fg: colors.primary };
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[styles.tagText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

function Metric({
  title,
  value,
  accent = false,
  icon,
}: {
  title: string;
  value: string;
  accent?: boolean;
  icon: keyof typeof Feather.glyphMap;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: accent ? colors.primary : colors.card },
      ]}
    >
      <View style={styles.metricIcon}>
        <Feather
          name={icon}
          size={16}
          color={accent ? colors.primaryForeground : colors.primary}
        />
      </View>
      <Text style={[styles.metricTitle, { color: accent ? '#d9e6df' : colors.mutedForeground }]}>
        {title}
      </Text>
      <Text style={[styles.metricValue, { color: accent ? colors.primaryForeground : colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

function ReceiptRow({
  payment,
  onEdit,
  onDelete,
  onExport,
}: {
  payment: PaymentRecord;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.receiptRow}>
      <View style={styles.receiptMain}>
        <View style={styles.receiptTitleLine}>
          <Text style={[styles.receiptAmount, { color: colors.foreground }]}>{money(payment.total)}</Text>
          <Tag text={`إيصال ${payment.receiptSerial}`} />
        </View>
        <Text style={[styles.receiptProperty, { color: colors.foreground }]}>
          {payment.propertyName || 'عقار'} · {payment.tenantName || 'مستأجر'}
        </Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          {formatDate(payment.paidAt)} · {paymentTypeName(payment.type)}
          {payment.note ? ` · ${payment.note}` : ''}
        </Text>
      </View>
      <View style={styles.receiptActions}>
        <IconAction icon="file-text" onPress={onExport} testID="export-receipt" />
        <IconAction icon="edit-2" onPress={onEdit} testID="edit-payment" />
        <IconAction
          icon="trash-2"
          onPress={onDelete}
          color={colors.destructive}
          testID="delete-payment"
        />
      </View>
    </View>
  );
}

function paymentTypeName(type: PaymentType): string {
  if (type === 'rent') return 'إيجار';
  if (type === 'utilities') return 'مرافق';
  if (type === 'service') return 'خدمات أخرى';
  return 'سداد مجمع';
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  detail: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={25} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: colors.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

function Sheet({
  title,
  visible,
  onClose,
  children,
  height = '92%',
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: number | `${number}%`;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: 'rgba(15,34,27,0.38)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              height,
              maxHeight: '96%',
              backgroundColor: colors.background,
              paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
            <IconAction icon="x" onPress={onClose} testID="close-sheet" />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
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
  } = useAppState();
  const [accounts, setAccounts] = useState<LocalAccount[] | null>();
  const [biometricRole, setBiometricRoleState] = useState<AccountRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AccountRole>('primary');
  const [currentUser, setCurrentUser] = useState<LocalAccount | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [setupNames, setSetupNames] = useState({ primary: '', alternate: '' });
  const [setupPasswords, setSetupPasswords] = useState({ primary: '', alternate: '' });
  const [activeTab, setActiveTab] = useState<MainTab>('properties');
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([readAccounts(), getBiometricRole()]).then(([savedAccounts, role]) => {
      setAccounts(savedAccounts);
      setBiometricRoleState(role);
    });
    if (Platform.OS !== 'web') {
      void areFourHourRemindersEnabled()
        .then(setNotificationsEnabled)
        .catch(() => setNotificationsEnabled(false));
    }
  }, []);

  useEffect(() => {
    if (currentUser) setSettingsName(currentUser.name);
  }, [currentUser]);

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    if (!query) return data.properties;
    return data.properties.filter((property) =>
      [
        property.name,
        property.address,
        property.location,
        property.tenantName,
        property.tenantPhone,
        property.tenantAlternatePhone,
      ]
        .join(' ')
        .toLocaleLowerCase('ar')
        .includes(query),
    );
  }, [data.properties, search]);

  const totalIncome = data.payments.reduce((total, payment) => total + payment.total, 0);
  const totalUtilities = data.properties.reduce(
    (total, property) => total + utilityTotal(property.utilitiesDue),
    0,
  );
  const totalServices = data.properties.reduce(
    (total, property) =>
      total + property.otherServices.reduce((sum, service) => sum + service.amount, 0),
    0,
  );
  const currentProperty =
    modal?.type === 'details'
      ? data.properties.find((property) => property.id === modal.propertyId)
      : modal?.type === 'property' && modal.propertyId
        ? data.properties.find((property) => property.id === modal.propertyId)
        : undefined;
  const currentPayment =
    modal?.type === 'payment'
      ? data.payments.find((payment) => payment.id === modal.paymentId)
      : undefined;

  const finishSetup = async () => {
    const mainPassword = setupPasswords.primary;
    const otherPassword = setupPasswords.alternate;
    if (!setupNames.primary.trim() || !setupNames.alternate.trim()) {
      Alert.alert('أكمل البيانات', 'أدخل اسمي المستخدمين.');
      return;
    }
    if (mainPassword.length < 6 || otherPassword.length < 6) {
      Alert.alert('كلمة المرور قصيرة', 'استخدم 6 أحرف أو أرقام على الأقل لكل حساب.');
      return;
    }
    if (mainPassword === otherPassword) {
      Alert.alert('كلمتا المرور متطابقتان', 'اختر كلمة مرور مختلفة للحساب البديل.');
      return;
    }
    setSaving(true);
    try {
      const created = await createAccounts(
        setupNames.primary,
        mainPassword,
        setupNames.alternate,
        otherPassword,
      );
      setAccounts(created);
      const permitted = await requestNotificationPermission();
      if (permitted) {
        try {
          setNotificationsEnabled(await enableFourHourReminders());
        } catch {
          setNotificationsEnabled(false);
        }
      }
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const login = async () => {
    const account = accounts?.find((item) => item.role === selectedRole);
    if (!account || !loginPassword) return;
    setSaving(true);
    try {
      if (!(await verifyPassword(account, loginPassword))) {
        Alert.alert('تعذر تسجيل الدخول', 'تحقق من كلمة المرور ثم حاول مرة أخرى.');
        return;
      }
      setCurrentUser(account);
      setLoginPassword('');
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const loginWithBiometrics = async () => {
    if (!biometricRole) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'تأكيد الهوية للدخول إلى إدارة العقارات',
        cancelLabel: 'استخدام كلمة المرور',
        disableDeviceFallback: false,
      });
      if (result.success) {
        const account = accounts?.find((item) => item.role === biometricRole);
        if (account) {
          setSelectedRole(biometricRole);
          setCurrentUser(account);
        }
      }
    } catch (error) {
      showError(error);
    }
  };

  const saveProfileName = async () => {
    if (!currentUser || !settingsName.trim() || !accounts) return;
    try {
      const updated = await updateAccountName(accounts, currentUser.role, settingsName);
      setAccounts(updated);
      setCurrentUser(updated.find((item) => item.role === currentUser.role) ?? null);
      Alert.alert('تم الحفظ', 'تم تحديث اسم المستخدم.');
    } catch (error) {
      showError(error);
    }
  };

  const savePassword = async () => {
    if (!currentUser || !accounts) return;
    if (!(await verifyPassword(currentUser, currentPassword))) {
      Alert.alert('كلمة المرور غير صحيحة', 'أدخل كلمة المرور الحالية بشكل صحيح.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('كلمة المرور قصيرة', 'استخدم 6 أحرف أو أرقام على الأقل.');
      return;
    }
    try {
      const updated = await updateAccountPassword(accounts, currentUser.role, newPassword);
      setAccounts(updated);
      setCurrentUser(updated.find((item) => item.role === currentUser.role) ?? null);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('تم تغيير كلمة المرور', 'استخدم كلمة المرور الجديدة في المرة القادمة.');
    } catch (error) {
      showError(error);
    }
  };

  const toggleBiometrics = async () => {
    if (!currentUser) return;
    if (biometricRole === currentUser.role) {
      await setBiometricRole(null);
      setBiometricRoleState(null);
      Alert.alert('تم الإيقاف', 'تم إيقاف تسجيل الدخول بالبصمة.');
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('غير متاح', 'تسجيل الدخول بالبصمة متاح على الهاتف فقط.');
      return;
    }
    try {
      const [hardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hardware || !enrolled) {
        Alert.alert('البصمة غير جاهزة', 'أضف بصمة أو وسيلة تحقق إلى إعدادات الجهاز أولاً.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'فعّل الدخول بالبصمة لهذا الحساب',
      });
      if (result.success) {
        await setBiometricRole(currentUser.role);
        setBiometricRoleState(currentUser.role);
        Alert.alert('تم التفعيل', 'سيُفتح هذا الحساب بالبصمة على هذا الجهاز.');
      }
    } catch (error) {
      showError(error);
    }
  };

  const toggleNotifications = async () => {
    if (notificationsEnabled) {
      try {
        await disableFourHourReminders();
        setNotificationsEnabled(false);
      } catch (error) {
        showError(error);
      }
      return;
    }
    try {
      const permitted = await requestNotificationPermission();
      if (!permitted) {
        Alert.alert('الإشعارات موقوفة', 'اسمح بالإشعارات من إعدادات الجهاز لتفعيل التذكير.');
        return;
      }
      setNotificationsEnabled(await enableFourHourReminders());
    } catch (error) {
      showError(error);
    }
  };

  const pay = async (property: PropertyRecord, input: PaymentInput) => {
    try {
      const receipt = await makePayment(property.id, input);
      if (!receipt) return;
      Alert.alert('تم تسجيل السداد', `رقم الإيصال ${receipt.receiptSerial}`, [
        { text: 'إغلاق', style: 'cancel' },
        {
          text: 'مشاركة PDF',
          onPress: () => void exportReceipt(receipt).catch(showError),
        },
      ]);
    } catch (error) {
      showError(error);
    }
  };

  const openPdf = async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      showError(error);
    }
  };

  const openDeletePayment = (payment: PaymentRecord) =>
    askToDelete(
      'حذف عملية السداد؟',
      `سيتم حذف الإيصال ${payment.receiptSerial} وإعادة أي مستحقات مرافق أو خدمات مرتبطة به.`,
      () => void deletePayment(payment.id).catch(showError),
    );

  const registerProperty = async (
    propertyId: number | undefined,
    value: Omit<PropertyRecord, 'id' | 'receiptCounter' | 'createdAt'>,
  ) => {
    try {
      if (propertyId) await updateProperty(propertyId, value);
      else await addProperty(value);
      setModal(null);
    } catch (error) {
      showError(error);
    }
  };

  if (!ready || accounts === undefined) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="home-city-outline" size={27} color="#fffefa" />
        </View>
        <Text style={[styles.brandTitle, { color: colors.foreground }]}>إدارة العقارات</Text>
      </View>
    );
  }

  if (!accounts) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[
            styles.authContent,
            {
              paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : 24,
              paddingBottom: Platform.OS === 'web' ? 34 : 28,
            },
          ]}
          bottomOffset={70}
        >
          <View style={[styles.authIllustration, { backgroundColor: colors.primary }]}>
            <View style={styles.arch}>
              <MaterialCommunityIcons name="home-city-outline" size={46} color="#fffefa" />
            </View>
            <Text style={styles.eyebrowLight}>مساحة واحدة لكل ممتلكاتك</Text>
            <Text style={styles.authHero}>رتّب عقاراتك،{'\n'}وتابع كل جنيه.</Text>
          </View>
          <View style={styles.authForm}>
            <Text style={[styles.authHeading, { color: colors.foreground }]}>إنشاء حسابَي الدخول</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground, marginBottom: 17 }]}>
              أول استخدام: أنشئ الحساب الرئيسي والحساب البديل. بيانات الدخول محلية ولا تُرسل إلى خادم.
            </Text>
            <Panel>
              <Text style={[styles.formSubtitle, { color: colors.primary }]}>الحساب الرئيسي</Text>
              <Field
                label="اسم المستخدم"
                value={setupNames.primary}
                onChangeText={(value) => setSetupNames((previous) => ({ ...previous, primary: value }))}
                placeholder="الاسم الظاهر"
                autoComplete="name"
              />
              <Field
                label="كلمة المرور"
                value={setupPasswords.primary}
                onChangeText={(value) => setSetupPasswords((previous) => ({ ...previous, primary: value }))}
                placeholder="6 أحرف أو أرقام على الأقل"
                secureTextEntry
                autoComplete="new-password"
              />
              <Divider />
              <Text style={[styles.formSubtitle, { color: colors.accentForeground, marginTop: 15 }]}>
                الحساب البديل
              </Text>
              <Field
                label="اسم المستخدم"
                value={setupNames.alternate}
                onChangeText={(value) => setSetupNames((previous) => ({ ...previous, alternate: value }))}
                placeholder="اسم صاحب الحساب البديل"
                autoComplete="name"
              />
              <Field
                label="كلمة المرور"
                value={setupPasswords.alternate}
                onChangeText={(value) => setSetupPasswords((previous) => ({ ...previous, alternate: value }))}
                placeholder="كلمة مرور مختلفة"
                secureTextEntry
                autoComplete="new-password"
              />
              <AppButton
                title="حفظ وفتح التطبيق"
                onPress={() => void finishSetup()}
                loading={saving}
                testID="create-local-accounts"
                style={{ marginTop: 4 }}
              />
            </Panel>
          </View>
        </KeyboardAwareScrollViewCompat>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    const primary = accounts.find((account) => account.role === 'primary');
    const alternate = accounts.find((account) => account.role === 'alternate');
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[
            styles.loginContent,
            { paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : 34 },
          ]}
          bottomOffset={70}
        >
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="home-city-outline" size={29} color="#fffefa" />
          </View>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>مرحباً بعودتك</Text>
          <Text style={[styles.smallText, { color: colors.mutedForeground, marginBottom: 23 }]}>
            سجّل الدخول لمتابعة عقاراتك وحساباتك.
          </Text>
          <View style={[styles.segmented, { backgroundColor: colors.secondary }]}>
            {([
              ['primary', primary],
              ['alternate', alternate],
            ] as const).map(([role, account]) => (
              <Pressable
                key={role}
                testID={`select-${role}-account`}
                onPress={() => setSelectedRole(role)}
                style={[
                  styles.segment,
                  selectedRole === role && { backgroundColor: colors.card, shadowColor: '#18372d' },
                ]}
              >
                <Text style={[styles.segmentText, { color: selectedRole === role ? colors.primary : colors.mutedForeground }]}>
                  {role === 'primary' ? 'الرئيسي' : 'البديل'}
                </Text>
                <Text style={[styles.segmentName, { color: selectedRole === role ? colors.foreground : colors.mutedForeground }]}>
                  {account?.name || 'المستخدم'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Panel style={{ marginTop: 20 }}>
            <Field
              label="كلمة المرور"
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="أدخل كلمة المرور"
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={() => void login()}
              autoComplete="current-password"
            />
            <AppButton
              title="تسجيل الدخول"
              onPress={() => void login()}
              loading={saving}
              testID="login-button"
            />
            {biometricRole && Platform.OS !== 'web' && (
              <AppButton
                title="الدخول بالبصمة"
                onPress={() => void loginWithBiometrics()}
                variant="secondary"
                icon={<MaterialCommunityIcons name="fingerprint" size={20} color={colors.primary} />}
                style={{ marginTop: 10 }}
                testID="biometric-login"
              />
            )}
          </Panel>
          <View style={styles.secureNote}>
            <Feather name="shield" size={15} color={colors.mutedForeground} />
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
              بيانات الدخول محفوظة بأمان على هذا الجهاز
            </Text>
          </View>
        </KeyboardAwareScrollViewCompat>
      </SafeAreaView>
    );
  }

  const renderPropertyCard = (property: PropertyRecord) => (
    <Pressable
      key={property.id}
      testID={`property-${property.id}`}
      onPress={() => setModal({ type: 'details', propertyId: property.id })}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      <Panel style={styles.propertyCard}>
        <View style={styles.propertyCardHead}>
          <View style={[styles.propertySymbol, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="home-outline" size={23} color={colors.primary} />
          </View>
          <View style={styles.propertyCardActions}>
            <IconAction
              icon="edit-2"
              onPress={() => setModal({ type: 'property', propertyId: property.id })}
              testID={`edit-property-${property.id}`}
            />
            <Tag text={property.status === 'rented' ? 'مؤجر' : 'شاغر'} tone={property.status === 'rented' ? 'green' : 'gray'} />
          </View>
        </View>
        <Text style={[styles.propertyName, { color: colors.foreground }]}>{property.name}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          {property.tenantName || 'لا يوجد مستأجر'}{property.location ? ` · ${property.location}` : ''}
        </Text>
        <Divider />
        <View style={styles.propertyFoot}>
          <View>
            <Text style={[styles.footLabel, { color: colors.mutedForeground }]}>الإيجار الشهري</Text>
            <Text style={[styles.propertyRent, { color: colors.foreground }]}>{money(property.rent)}</Text>
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={[styles.footLabel, { color: colors.mutedForeground }]}>الاستحقاق القادم</Text>
            <Text style={[styles.footValue, { color: colors.foreground }]}>{formatDate(property.dueDate)}</Text>
          </View>
          <Feather name="chevron-left" size={20} color={colors.mutedForeground} />
        </View>
      </Panel>
    </Pressable>
  );

  const renderProperties = () => (
    <>
      <Panel style={[styles.dashboardHero, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        <View style={styles.heroTop}>
          <View style={styles.heroAvatar}>
            <MaterialCommunityIcons name="home-city-outline" size={21} color="#fffefa" />
          </View>
          <Tag text={`${data.properties.length} عقار`} />
        </View>
        <Text style={styles.eyebrowLight}>ملخص ممتلكاتك</Text>
        <Text style={[styles.heroTotal, { color: colors.primaryForeground }]}>{money(totalIncome)}</Text>
        <Text style={styles.heroCaption}>إجمالي التحصيلات المسجلة</Text>
        <View style={[styles.heroMetrics, { borderColor: 'rgba(255,255,255,0.19)' }]}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{data.properties.length}</Text>
            <Text style={styles.heroMetricLabel}>العقارات</Text>
          </View>
          <View style={styles.heroMetricRule} />
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{data.payments.length}</Text>
            <Text style={styles.heroMetricLabel}>الإيصالات</Text>
          </View>
          <View style={styles.heroMetricRule} />
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricValue}>{data.properties.filter((item) => item.status === 'rented').length}</Text>
            <Text style={styles.heroMetricLabel}>مؤجّر</Text>
          </View>
        </View>
      </Panel>
      <SectionTitle
        title="مستحقات تحتاج متابعة"
        trailing={<Tag text={money(totalUtilities + totalServices)} tone="orange" />}
      />
      {(totalUtilities > 0 || totalServices > 0) && (
        <Pressable
          onPress={() => setActiveTab('payments')}
          style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        >
          <Panel style={styles.dueBanner}>
            <View style={[styles.dueIcon, { backgroundColor: colors.accent }]}>
              <Feather name="bell" size={18} color={colors.accentForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>مرافق وخدمات أخرى</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
                مستحقات استثنائية على {data.properties.filter((item) => utilityTotal(item.utilitiesDue) + item.otherServices.reduce((sum, service) => sum + service.amount, 0) > 0).length} عقار
              </Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Panel>
        </Pressable>
      )}
      <SectionTitle
        title="عقاراتك"
        trailing={
          <Pressable
            testID="add-property"
            onPress={() => setModal({ type: 'property' })}
            style={({ pressed }) => [styles.inlineAction, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="plus" size={17} color={colors.primary} />
            <Text style={[styles.inlineActionText, { color: colors.primary }]}>إضافة عقار</Text>
          </Pressable>
        }
      />
      <Field
        label="بحث"
        value={search}
        onChangeText={setSearch}
        placeholder="ابحث بالعقار أو المستأجر أو الموقع"
        accessibilityLabel="البحث في العقارات"
      />
      {filteredProperties.length ? (
        filteredProperties.map(renderPropertyCard)
      ) : (
        <EmptyState
          icon={search ? 'search' : 'home'}
          title={search ? 'لا توجد نتائج' : 'ابدأ بإضافة عقارك الأول'}
          detail={search ? 'جرّب اسماً أو موقعاً مختلفاً.' : 'أضف بيانات العقار والمستأجر لتبدأ متابعة الإيجارات.'}
        />
      )}
    </>
  );

  const renderPayments = () => (
    <>
      <Panel style={styles.pageHero}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>سجل التحصيل</Text>
        <Text style={[styles.pageHeroValue, { color: colors.foreground }]}>{money(totalIncome)}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          {data.payments.length} عملية سداد · {money(totalUtilities + totalServices)} مستحقات استثنائية
        </Text>
        <View style={styles.paymentQuickActions}>
          <AppButton
            title="تحصيل إيجار"
            onPress={() => {
              const property = data.properties.find((item) => item.status === 'rented');
              if (!property) {
                Alert.alert('لا توجد عقارات مؤجرة', 'أضف عقاراً وحدد حالته كمؤجر أولاً.');
                return;
              }
              setModal({ type: 'details', propertyId: property.id });
            }}
            icon={<Feather name="plus" size={17} color="#fffefa" />}
            style={{ flex: 1 }}
            testID="quick-rent-collection"
          />
          <AppButton
            title="المستحقات"
            onPress={() => setActiveTab('properties')}
            variant="secondary"
            icon={<Feather name="zap" size={16} color={colors.primary} />}
            style={{ flex: 1 }}
          />
        </View>
      </Panel>
      <SectionTitle title="آخر الحركات" trailing={<Tag text={`${data.payments.length} إيصال`} />} />
      {data.payments.length ? (
        <Panel style={{ paddingVertical: 2 }}>
          {data.payments.map((payment, index) => (
            <React.Fragment key={payment.id}>
              <ReceiptRow
                payment={payment}
                onEdit={() => setModal({ type: 'payment', paymentId: payment.id })}
                onDelete={() => openDeletePayment(payment)}
                onExport={() => void openPdf(() => exportReceipt(payment))}
              />
              {index < data.payments.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Panel>
      ) : (
        <EmptyState icon="credit-card" title="لا توجد تحصيلات بعد" detail="سجّل أول عملية سداد من صفحة العقار." />
      )}
    </>
  );

  const renderReports = () => (
    <>
      <Panel style={styles.pageHero}>
        <View style={[styles.reportIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="bar-chart-2" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>نظرة مالية مجمعة</Text>
        <Text style={[styles.pageHeroValue, { color: colors.foreground }]}>{money(totalIncome)}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          إيرادات {data.properties.length} عقاراً من {data.payments.length} إيصالاً
        </Text>
        <AppButton
          title="استخراج التقرير الشامل PDF"
          onPress={() => void openPdf(() => exportAllPropertiesReport(data.properties, data.payments))}
          icon={<Feather name="download" size={17} color="#fffefa" />}
          style={{ marginTop: 17 }}
          testID="export-all-report"
        />
      </Panel>
      <SectionTitle title="إيراد كل عقار" />
      {data.properties.length ? (
        <Panel style={{ paddingVertical: 2 }}>
          {data.properties.map((property, index) => {
            const total = data.payments
              .filter((payment) => payment.propertyId === property.id)
              .reduce((sum, payment) => sum + payment.total, 0);
            const count = data.payments.filter((payment) => payment.propertyId === property.id).length;
            return (
              <React.Fragment key={property.id}>
                <Pressable
                  onPress={() => setModal({ type: 'details', propertyId: property.id })}
                  style={styles.reportPropertyRow}
                >
                  <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>{property.name}</Text>
                    <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
                      العقار {property.id} · {count} إيصال
                    </Text>
                  </View>
                  <Text style={[styles.reportAmount, { color: colors.primary }]}>{money(total)}</Text>
                </Pressable>
                <AppButton
                  title="حساب خاص وتقرير PDF"
                  variant="ghost"
                  onPress={() =>
                    void openPdf(() => exportPropertyReport(property, data.payments))
                  }
                  icon={<Feather name="file-text" size={15} color={colors.primary} />}
                  style={styles.reportButton}
                  testID={`export-property-${property.id}`}
                />
                {index < data.properties.length - 1 && <Divider />}
              </React.Fragment>
            );
          })}
        </Panel>
      ) : (
        <EmptyState icon="file-text" title="أضف عقاراً لإنشاء تقرير" detail="سيظهر هنا ملخص الإيرادات والحسابات الخاصة." />
      )}
      {data.payments.length > 0 && (
        <>
          <SectionTitle title="سجل الإيصالات" />
          <Panel style={{ paddingVertical: 2 }}>
            {data.payments.map((payment, index) => (
              <React.Fragment key={`report-${payment.id}`}>
                <ReceiptRow
                  payment={payment}
                  onEdit={() => setModal({ type: 'payment', paymentId: payment.id })}
                  onDelete={() => openDeletePayment(payment)}
                  onExport={() => void openPdf(() => exportReceipt(payment))}
                />
                {index < data.payments.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Panel>
        </>
      )}
    </>
  );

  const renderSettings = () => (
    <>
      <Panel style={styles.profileCard}>
        <View style={[styles.profileAvatar, { backgroundColor: colors.secondary }]}>
          <Feather name="user" size={23} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{currentUser.name}</Text>
          <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
            {currentUser.role === 'primary' ? 'الحساب الرئيسي' : 'الحساب البديل'}
          </Text>
        </View>
        <Tag text="محمي" />
      </Panel>

      <SectionTitle title="بيانات المستخدم" />
      <Panel>
        <Field label="الاسم الظاهر" value={settingsName} onChangeText={setSettingsName} />
        <AppButton title="حفظ الاسم" variant="secondary" onPress={() => void saveProfileName()} />
        <Divider />
        <Text style={[styles.formSubtitle, { color: colors.foreground, marginTop: 15 }]}>تغيير كلمة المرور</Text>
        <Field
          label="كلمة المرور الحالية"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <Field
          label="كلمة المرور الجديدة"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <AppButton title="تحديث كلمة المرور" onPress={() => void savePassword()} variant="secondary" />
      </Panel>

      <SectionTitle title="الحماية والتنبيهات" />
      <Panel style={{ paddingVertical: 4 }}>
        <Pressable onPress={() => void toggleBiometrics()} style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="fingerprint" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>تسجيل الدخول بالبصمة</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
              {biometricRole === currentUser.role ? 'مفعّل لهذا الحساب' : 'استخدم بصمة الجهاز أو التعرّف على الوجه'}
            </Text>
          </View>
          <Tag text={biometricRole === currentUser.role ? 'مفعّل' : 'إيقاف'} tone={biometricRole === currentUser.role ? 'green' : 'gray'} />
        </Pressable>
        <Divider />
        <Pressable onPress={() => void toggleNotifications()} style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.accent }]}>
            <Feather name="bell" size={18} color={colors.accentForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>تذكير كل 4 ساعات</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
              {notificationsEnabled ? 'الإشعارات الدورية مفعّلة' : 'فعّل الإشعار من الجهاز'}
            </Text>
          </View>
          <Tag text={notificationsEnabled ? 'مفعّل' : 'إيقاف'} tone={notificationsEnabled ? 'green' : 'gray'} />
        </Pressable>
      </Panel>
      <AppButton
        title="تسجيل الخروج"
        variant="ghost"
        onPress={() => setCurrentUser(null)}
        icon={<Feather name="log-out" size={16} color={colors.primary} />}
        testID="logout-button"
      />
      <Text style={[styles.versionText, { color: colors.mutedForeground }]}>إدارة العقارات · إصدار محلي</Text>
    </>
  );

  const activeTitle = TABS.find((item) => item.id === activeTab)?.title ?? 'العقارات';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.appHeader, { paddingTop: Platform.OS === 'web' ? 67 : 11 }]}>
        <View style={styles.headerGreeting}>
          <Text style={[styles.headerGreetingText, { color: colors.mutedForeground }]}>
            {activeTab === 'properties' ? `صباح الخير، ${currentUser.name}` : 'إدارة العقارات'}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{activeTitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('settings')}
          style={[styles.headerAvatar, { backgroundColor: colors.secondary }]}
        >
          <Feather name="user" size={18} color={colors.primary} />
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.pageContent,
          { paddingBottom: Platform.OS === 'web' ? 118 : Math.max(insets.bottom, 18) + 90 },
        ]}
      >
        {activeTab === 'properties' && renderProperties()}
        {activeTab === 'payments' && renderPayments()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'settings' && renderSettings()}
      </ScrollView>
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 7),
          },
        ]}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              testID={`tab-${tab.id}`}
              accessibilityRole="button"
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={styles.tabButton}
            >
              <Feather
                name={tab.icon}
                size={19}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.primary : colors.mutedForeground },
                  active && styles.tabLabelActive,
                ]}
              >
                {tab.title}
              </Text>
              {active && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </Pressable>
          );
        })}
      </View>

      <PropertyFormSheet
        visible={modal?.type === 'property'}
        property={modal?.type === 'property' ? currentProperty : undefined}
        onClose={() => setModal(null)}
        onSave={(value) => registerProperty(modal?.type === 'property' ? modal.propertyId : undefined, value)}
      />
      {modal?.type === 'details' && currentProperty && (
        <PropertyDetailsSheet
          key={currentProperty.id}
          property={currentProperty}
          payments={data.payments}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: 'property', propertyId: currentProperty.id })}
          onDelete={() =>
            askToDelete(
              'حذف العقار؟',
              'سيتم حذف العقار وكل إيصالاته من هذا الجهاز.',
              () => {
                void deleteProperty(currentProperty.id).catch(showError);
                setModal(null);
              },
            )
          }
          onAddService={(note, amount) => addService(currentProperty.id, note, amount)}
          onSaveUtilities={(value) => updateUtilities(currentProperty.id, value)}
          onPay={(input) => pay(currentProperty, input)}
          onEditPayment={(payment) => setModal({ type: 'payment', paymentId: payment.id })}
          onDeletePayment={openDeletePayment}
          onExport={() => void openPdf(() => exportPropertyReport(currentProperty, data.payments))}
          onExportReceipt={(payment) => void openPdf(() => exportReceipt(payment))}
        />
      )}
      {modal?.type === 'payment' && currentPayment && (
        <EditPaymentSheet
          payment={currentPayment}
          onClose={() => setModal(null)}
          onSave={async (total) => {
            await updatePaymentTotal(currentPayment.id, total);
            setModal(null);
            Alert.alert('تم تحديث السداد', 'تم تحديث المبلغ والحسابات المرتبطة به.');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PropertyFormSheet({
  visible,
  property,
  onClose,
  onSave,
}: {
  visible: boolean;
  property?: PropertyRecord;
  onClose: () => void;
  onSave: (value: Omit<PropertyRecord, 'id' | 'receiptCounter' | 'createdAt'>) => Promise<void>;
}) {
  const colors = useColors();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [gas, setGas] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'rented' | 'vacant'>('rented');
  const [contractImages, setContractImages] = useState<string[]>([]);
  const [tenantImages, setTenantImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(property?.name ?? '');
    setAddress(property?.address ?? '');
    setLocation(property?.location ?? '');
    setTenantName(property?.tenantName ?? '');
    setPhone(property?.tenantPhone ?? '');
    setAlternatePhone(property?.tenantAlternatePhone ?? '');
    setRent(property ? String(property.rent) : '');
    setDeposit(property ? String(property.deposit) : '');
    setElectricity(property ? String(property.utilitiesDue.electricity) : '');
    setWater(property ? String(property.utilitiesDue.water) : '');
    setGas(property ? String(property.utilitiesDue.gas) : '');
    setDueDate(property?.dueDate ?? property?.initialDueDate ?? '');
    setStatus(property?.status ?? 'rented');
    setContractImages(property?.contractImages ?? []);
    setTenantImages(property?.tenantImages ?? []);
  }, [property, visible]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('اسم العقار مطلوب', 'أدخل اسماً لتمييز هذا العقار.');
      return;
    }
    const numeric = (value: string) => Math.max(0, Number(value.replace(',', '.')) || 0);
    setLoading(true);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        location: location.trim(),
        tenantName: tenantName.trim(),
        tenantPhone: phone.trim(),
        tenantAlternatePhone: alternatePhone.trim(),
        rent: numeric(rent),
        deposit: numeric(deposit),
        utilitiesDue: {
          electricity: numeric(electricity),
          water: numeric(water),
          gas: numeric(gas),
        },
        status,
        dueDate: dueDate.trim(),
        initialDueDate: property
          ? dueDate.trim() !== property.dueDate
            ? dueDate.trim()
            : property.initialDueDate || dueDate.trim()
          : dueDate.trim(),
        contractImages,
        tenantImages,
        otherServices: property?.otherServices ?? [],
      });
    } finally {
      setLoading(false);
    }
  };

  const chooseImages = async (
    kind: 'contract' | 'tenant',
    values: string[],
    setValues: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (values.length >= 20) {
      Alert.alert('وصلت للحد الأقصى', 'يمكن إرفاق 20 صورة كحد أقصى لكل مستند.');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('صلاحية الصور مطلوبة', 'اسمح للتطبيق بالوصول إلى المعرض لاختيار الصور.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 20 - values.length),
        quality: 0.82,
      });
      if (result.canceled) return;
      const newUris: string[] = [];
      for (const asset of result.assets.slice(0, 20 - values.length)) {
        let uri = asset.uri;
        if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
          const folder = `${FileSystem.documentDirectory}property-documents/`;
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
          const extension = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
          const destination = `${folder}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
          await FileSystem.copyAsync({ from: asset.uri, to: destination });
          uri = destination;
        }
        newUris.push(uri);
      }
      setValues([...values, ...newUris].slice(0, 20));
    } catch (error) {
      showError(error);
    }
  };

  const photoGroup = (
    label: string,
    values: string[],
    setValues: React.Dispatch<React.SetStateAction<string[]>>,
    kind: 'contract' | 'tenant',
  ) => (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.photoHeader}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700', marginBottom: 7 }}>
          {label}
        </Text>
        <Tag text={`${values.length}/20`} tone={values.length >= 20 ? 'orange' : 'gray'} />
      </View>
      <View style={styles.photoGrid}>
        {values.map((uri, index) => (
          <Pressable
            key={`${uri}-${index}`}
            onPress={() => setValues(values.filter((_, itemIndex) => itemIndex !== index))}
            style={styles.photoThumbWrap}
          >
            <Image source={{ uri }} style={styles.photoThumb} />
            <View style={styles.photoRemove}>
              <Feather name="x" size={12} color="#ffffff" />
            </View>
          </Pressable>
        ))}
        {values.length < 20 && (
          <Pressable
            testID={`${kind}-images-add`}
            onPress={() => void chooseImages(kind, values, setValues)}
            style={[styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          >
            <Feather name="image" size={18} color={colors.primary} />
            <Text style={[styles.addPhotoText, { color: colors.primary }]}>إضافة صور</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 7 }]}>
        الحد الأقصى 20 صورة لهذا المستند. اضغط على صورة لإزالتها.
      </Text>
    </View>
  );

  return (
    <Sheet
      title={property ? 'تعديل العقار' : 'إضافة عقار'}
      visible={visible}
      onClose={onClose}
      height="94%"
    >
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.sheetContent}
        bottomOffset={70}
        keyboardShouldPersistTaps="handled"
      >
        <Panel>
          <Text style={[styles.formSubtitle, { color: colors.primary }]}>بيانات العقار</Text>
          <Field label="اسم العقار *" value={name} onChangeText={setName} placeholder="مثال: شقة النخيل" />
          <Field label="عنوان العقار" value={address} onChangeText={setAddress} placeholder="الشارع ورقم المبنى" />
          <Field label="موقع العقار" value={location} onChangeText={setLocation} placeholder="الحي أو المدينة" />
          <Field
            label="الإيجار الشهري"
            value={rent}
            onChangeText={setRent}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <Field
            label="مبلغ التأمين"
            value={deposit}
            onChangeText={setDeposit}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <Field
            label="موعد استحقاق الإيجار"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <View style={styles.statusChoices}>
            {([
              ['rented', 'مؤجر'],
              ['vacant', 'شاغر'],
            ] as const).map(([value, title]) => (
              <Pressable
                key={value}
                onPress={() => setStatus(value)}
                style={[
                  styles.statusChoice,
                  {
                    backgroundColor: status === value ? colors.primary : colors.secondary,
                    borderColor: status === value ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: status === value ? '#fffefa' : colors.foreground, fontWeight: '700' }}>
                  {title}
                </Text>
              </Pressable>
            ))}
          </View>
        </Panel>
        <Panel>
          <Text style={[styles.formSubtitle, { color: colors.primary }]}>بيانات المستأجر</Text>
          <Field label="اسم المستأجر" value={tenantName} onChangeText={setTenantName} placeholder="الاسم الكامل" />
          <Field label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="رقم الهاتف الأساسي" keyboardType="phone-pad" />
          <Field
            label="رقم هاتف بديل"
            value={alternatePhone}
            onChangeText={setAlternatePhone}
            placeholder="رقم إضافي للتواصل"
            keyboardType="phone-pad"
          />
        </Panel>
        <Panel>
          <Text style={[styles.formSubtitle, { color: colors.primary }]}>مستحقات المرافق الحالية</Text>
          <Field label="الكهرباء" value={electricity} onChangeText={setElectricity} keyboardType="decimal-pad" placeholder="0" />
          <Field label="المياه" value={water} onChangeText={setWater} keyboardType="decimal-pad" placeholder="0" />
          <Field label="الغاز" value={gas} onChangeText={setGas} keyboardType="decimal-pad" placeholder="0" />
        </Panel>
        <Panel>
          <Text style={[styles.formSubtitle, { color: colors.primary, marginBottom: 12 }]}>صور المستندات</Text>
          {photoGroup('صور العقد', contractImages, setContractImages, 'contract')}
          {photoGroup('صور بطاقة المستأجر', tenantImages, setTenantImages, 'tenant')}
        </Panel>
        <AppButton
          title={property ? 'حفظ التعديلات' : 'حفظ العقار'}
          onPress={() => void save()}
          loading={loading}
          testID="save-property"
        />
        <AppButton title="إلغاء" onPress={onClose} variant="ghost" style={{ marginTop: 8 }} />
      </KeyboardAwareScrollViewCompat>
    </Sheet>
  );
}

function PropertyDetailsSheet({
  property,
  payments,
  onClose,
  onEdit,
  onDelete,
  onAddService,
  onSaveUtilities,
  onPay,
  onEditPayment,
  onDeletePayment,
  onExport,
  onExportReceipt,
}: {
  property: PropertyRecord;
  payments: PaymentRecord[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddService: (note: string, amount: number) => Promise<void>;
  onSaveUtilities: (value: PropertyRecord['utilitiesDue']) => Promise<void>;
  onPay: (input: PaymentInput) => Promise<void>;
  onEditPayment: (payment: PaymentRecord) => void;
  onDeletePayment: (payment: PaymentRecord) => void;
  onExport: () => void;
  onExportReceipt: (payment: PaymentRecord) => void;
}) {
  const colors = useColors();
  const [tab, setTab] = useState<'overview' | 'utilities' | 'services' | 'ledger'>('overview');
  const [electricity, setElectricity] = useState(String(property.utilitiesDue.electricity));
  const [water, setWater] = useState(String(property.utilitiesDue.water));
  const [gas, setGas] = useState(String(property.utilitiesDue.gas));
  const [serviceNote, setServiceNote] = useState('');
  const [serviceAmount, setServiceAmount] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setElectricity(String(property.utilitiesDue.electricity));
    setWater(String(property.utilitiesDue.water));
    setGas(String(property.utilitiesDue.gas));
  }, [property.utilitiesDue]);
  const propertyPayments = payments.filter((payment) => payment.propertyId === property.id);
  const income = propertyPayments.reduce((sum, payment) => sum + payment.total, 0);
  const utilityDue = utilityTotal(property.utilitiesDue);
  const servicesDue = property.otherServices.reduce((sum, item) => sum + item.amount, 0);
  const tenantsPhotos = property.tenantImages;
  const contractPhotos = property.contractImages;

  const saveUtilities = async () => {
    const value = {
      electricity: Math.max(0, Number(electricity.replace(',', '.')) || 0),
      water: Math.max(0, Number(water.replace(',', '.')) || 0),
      gas: Math.max(0, Number(gas.replace(',', '.')) || 0),
    };
    setSaving(true);
    try {
      await onSaveUtilities(value);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const saveService = async () => {
    const amount = Math.max(0, Number(serviceAmount.replace(',', '.')) || 0);
    if (!serviceNote.trim() || amount <= 0) {
      Alert.alert('أكمل بيانات الخدمة', 'أدخل ملاحظة وقيمة أكبر من صفر.');
      return;
    }
    setSaving(true);
    try {
      await onAddService(serviceNote, amount);
      setServiceNote('');
      setServiceAmount('');
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: typeof tab; title: string }[] = [
    { id: 'overview', title: 'الملخص' },
    { id: 'utilities', title: 'المرافق' },
    { id: 'services', title: 'خدمات أخرى' },
    { id: 'ledger', title: 'الحساب' },
  ];

  return (
    <Sheet title={`العقار ${property.id} · ${property.name}`} visible onClose={onClose} height="94%">
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <View style={styles.propertyDetailHeading}>
          <View style={[styles.propertySymbolLarge, { backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="home-city-outline" size={30} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.propertyDetailName, { color: colors.foreground }]}>{property.name}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
              {property.location || property.address || 'موقع العقار غير محدد'}
            </Text>
          </View>
          <IconAction icon="edit-2" onPress={onEdit} testID="edit-current-property" />
          <IconAction icon="trash-2" onPress={onDelete} color={colors.destructive} testID="delete-current-property" />
        </View>
        <View style={styles.detailTabs}>
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[
                styles.detailTab,
                tab === item.id && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.detailTabText,
                  { color: tab === item.id ? '#fffefa' : colors.mutedForeground },
                ]}
              >
                {item.title}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'overview' && (
          <>
            <View style={styles.metricGrid}>
              <Metric title="الإيجار الشهري" value={money(property.rent)} icon="repeat" />
              <Metric title="الإيراد المسجل" value={money(income)} accent icon="trending-up" />
              <Metric title="مستحقات المرافق" value={money(utilityDue)} icon="zap" />
              <Metric title="خدمات أخرى" value={money(servicesDue)} icon="plus-circle" />
            </View>
            <Panel>
              <SectionTitle title="بيانات المستأجر" />
              <DetailRow label="الاسم" value={property.tenantName || 'غير محدد'} />
              <DetailRow label="الهاتف" value={property.tenantPhone || 'غير محدد'} />
              <DetailRow label="رقم بديل" value={property.tenantAlternatePhone || 'غير محدد'} />
              <DetailRow label="العنوان" value={property.address || 'غير محدد'} />
              <DetailRow label="موقع العقار" value={property.location || 'غير محدد'} />
              <DetailRow label="الاستحقاق القادم" value={formatDate(property.dueDate)} />
            </Panel>
            <Panel>
              <SectionTitle title="صور المستندات" trailing={<Tag text={`${contractPhotos.length + tenantsPhotos.length} صورة`} />} />
              <PhotoStrip title="العقد" images={contractPhotos} />
              <PhotoStrip title="بطاقة المستأجر" images={tenantsPhotos} />
            </Panel>
            <AppButton
              title="استخراج الحساب الخاص PDF"
              onPress={onExport}
              icon={<Feather name="download" size={16} color="#fffefa" />}
              testID="export-single-report"
            />
          </>
        )}

        {tab === 'utilities' && (
          <>
            <Panel style={styles.utilitiesHero}>
              <View style={[styles.dueIcon, { backgroundColor: colors.accent }]}>
                <Feather name="zap" size={19} color={colors.accentForeground} />
              </View>
              <Text style={[styles.pageHeroValue, { color: colors.foreground }]}>{money(utilityDue)}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>مستحقات مرافق هذا العقار</Text>
            </Panel>
            <Panel>
              <Text style={[styles.formSubtitle, { color: colors.primary }]}>تحديث المستحقات الحالية</Text>
              <Field label="الكهرباء" value={electricity} onChangeText={setElectricity} keyboardType="decimal-pad" />
              <Field label="المياه" value={water} onChangeText={setWater} keyboardType="decimal-pad" />
              <Field label="الغاز" value={gas} onChangeText={setGas} keyboardType="decimal-pad" />
              <AppButton title="حفظ المستحقات" onPress={() => void saveUtilities()} variant="secondary" loading={saving} />
            </Panel>
            <AppButton
              title={`تحصيل المرافق · ${money(utilityDue)}`}
              onPress={() => {
                if (utilityDue <= 0) {
                  Alert.alert('لا توجد مستحقات', 'أدخل قيمة مرافق أولاً.');
                  return;
                }
                void onPay({
                  type: 'utilities',
                  rentAmount: 0,
                  utilitiesAmount: utilityDue,
                  note: `تحصيل مرافق · ${property.name}`,
                }).then(() => {
                  setElectricity('0');
                  setWater('0');
                  setGas('0');
                });
              }}
              icon={<Feather name="check-circle" size={17} color="#fffefa" />}
              disabled={utilityDue <= 0}
              testID="collect-utilities"
            />
            {utilityDue <= 0 && (
              <Text style={[styles.centerNote, { color: colors.mutedForeground }]}>
                يتم تصفير المستحقات تلقائياً بعد تسجيل السداد.
              </Text>
            )}
          </>
        )}

        {tab === 'services' && (
          <>
            <Panel>
              <Text style={[styles.formSubtitle, { color: colors.primary }]}>إضافة خدمة أخرى</Text>
              <Field
                label="ملاحظات"
                value={serviceNote}
                onChangeText={setServiceNote}
                placeholder="وصف الخدمة أو سبب التحصيل"
                multiline
              />
              <Field
                label="القيمة"
                value={serviceAmount}
                onChangeText={setServiceAmount}
                placeholder="0"
                keyboardType="decimal-pad"
              />
              <AppButton
                title="إضافة إلى المستحقات"
                onPress={() => void saveService()}
                loading={saving}
                icon={<Feather name="plus" size={16} color="#fffefa" />}
              />
            </Panel>
            <SectionTitle title="الخدمات المستحقة" trailing={<Tag text={money(servicesDue)} tone="orange" />} />
            {property.otherServices.length ? (
              property.otherServices.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  onPay={() =>
                    void onPay({
                      type: 'service',
                      rentAmount: 0,
                      serviceAmount: service.amount,
                      settledServiceIds: [service.id],
                      note: service.note,
                    })
                  }
                />
              ))
            ) : (
              <EmptyState icon="check-circle" title="لا توجد خدمات مستحقة" detail="أضف بند خدمة وملاحظته وقيمته عند الحاجة." />
            )}
          </>
        )}

        {tab === 'ledger' && (
          <>
            <Panel style={styles.ledgerSummary}>
              <Text style={styles.eyebrowLight}>إجمالي المقبوضات للعقار</Text>
              <Text style={styles.heroTotal}>{money(income)}</Text>
              <Text style={styles.heroCaption}>{propertyPayments.length} حركة مالية مسجلة</Text>
            </Panel>
      {propertyPayments.length ? (
              <Panel style={{ paddingVertical: 2 }}>
                {propertyPayments.map((payment, index) => (
                  <React.Fragment key={payment.id}>
                    <ReceiptRow
                      payment={payment}
                      onEdit={() => onEditPayment(payment)}
                      onDelete={() => onDeletePayment(payment)}
                      onExport={() => onExportReceipt(payment)}
                    />
                    {index < propertyPayments.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </Panel>
            ) : (
              <EmptyState icon="activity" title="الحساب فارغ" detail="ستظهر هنا الإيجارات والمرافق والخدمات بعد تحصيلها." />
            )}
            <AppButton
              title="استخراج تقرير الحساب PDF"
              onPress={onExport}
              icon={<Feather name="download" size={16} color={colors.primaryForeground} />}
              style={{ marginTop: 6 }}
              testID="export-ledger-report"
            />
            <AppButton
              title="تسجيل سداد إيجار"
              onPress={() => {
                if (property.rent <= 0) {
                  Alert.alert('قيمة الإيجار غير محددة', 'عدّل بيانات العقار وأدخل الإيجار الشهري.');
                  return;
                }
                void onPay({
                  type: 'rent',
                  rentAmount: property.rent,
                  note: `إيجار شهري · ${property.name}`,
                });
              }}
              icon={<Feather name="plus" size={17} color="#fffefa" />}
              testID="collect-rent"
            />
          </>
        )}

        <Text style={[styles.detailFootnote, { color: colors.mutedForeground }]}>
          رقم الإيصال التالي يبدأ من {property.id * 100000 + property.receiptCounter + 1}
        </Text>
      </ScrollView>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function PhotoStrip({ title, images }: { title: string; images: string[] }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.smallText, { color: colors.mutedForeground, marginBottom: 8 }]}>
        {title} · {images.length}
      </Text>
      {images.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {images.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              style={[styles.detailPhoto, { backgroundColor: colors.secondary }]}
            />
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>لا توجد صور مرفقة.</Text>
      )}
    </View>
  );
}

function ServiceRow({ service, onPay }: { service: OtherService; onPay: () => void }) {
  const colors = useColors();
  return (
    <Panel style={styles.serviceRow}>
      <View style={[styles.dueIcon, { backgroundColor: colors.accent }]}>
        <Feather name="file-text" size={17} color={colors.accentForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{service.note}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{formatDate(service.createdAt)}</Text>
        <Text style={[styles.serviceAmount, { color: colors.primary }]}>{money(service.amount)}</Text>
      </View>
      <AppButton title="تحصيل" onPress={onPay} style={styles.compactButton} testID="collect-service" />
    </Panel>
  );
}

function EditPaymentSheet({
  payment,
  onClose,
  onSave,
}: {
  payment: PaymentRecord;
  onClose: () => void;
  onSave: (amount: number) => Promise<void>;
}) {
  const colors = useColors();
  const [amount, setAmount] = useState(String(payment.total));
  const [loading, setLoading] = useState(false);
  const save = async () => {
    const parsed = Math.max(0, Number(amount.replace(',', '.')) || 0);
    if (parsed <= 0) {
      Alert.alert('قيمة غير صالحة', 'أدخل قيمة أكبر من صفر.');
      return;
    }
    setLoading(true);
    try {
      await onSave(parsed);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Sheet title={`تعديل إيصال ${payment.receiptSerial}`} visible onClose={onClose} height="55%">
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.sheetContent} bottomOffset={60}>
        <Panel>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{payment.propertyName}</Text>
          <Text style={[styles.smallText, { color: colors.mutedForeground, marginBottom: 15 }]}>
            {paymentTypeName(payment.type)} · {formatDate(payment.paidAt)}
          </Text>
          <Field label="قيمة السداد الجديدة" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Text style={[styles.smallText, { color: colors.mutedForeground, marginBottom: 13 }]}>
            عند تعديل أو حذف سداد المرافق، يعاد احتساب المستحقات المرتبطة به.
          </Text>
          <AppButton title="حفظ التعديل" onPress={() => void save()} loading={loading} testID="save-payment-edit" />
        </Panel>
        <AppButton title="إلغاء" onPress={onClose} variant="ghost" />
      </KeyboardAwareScrollViewCompat>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13 },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { fontSize: 18, fontWeight: '800' },
  authContent: { paddingHorizontal: 20, gap: 20 },
  authIllustration: {
    minHeight: 242,
    borderRadius: 28,
    padding: 23,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  arch: {
    position: 'absolute',
    top: 20,
    left: 21,
    width: 90,
    height: 102,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    borderBottomWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrowLight: { color: '#c7d9cf', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  authHero: { color: '#fffefa', fontSize: 31, fontWeight: '800', lineHeight: 41, textAlign: 'right', marginTop: 8 },
  authForm: { gap: 4 },
  authHeading: { fontSize: 22, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
  formSubtitle: { fontSize: 15, fontWeight: '800', textAlign: 'right', marginBottom: 14 },
  loginContent: { paddingHorizontal: 21, paddingBottom: 35, alignItems: 'stretch' },
  loginTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 17 },
  smallText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  segmented: { flexDirection: 'row-reverse', borderRadius: 16, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 62,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    elevation: 1,
  },
  segmentText: { fontSize: 11, fontWeight: '600' },
  segmentName: { fontSize: 14, fontWeight: '800' },
  secureNote: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 17 },
  appHeader: {
    paddingHorizontal: 19,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerGreeting: { alignItems: 'flex-start', flex: 1 },
  headerGreetingText: { fontSize: 12, textAlign: 'right' },
  headerTitle: { fontSize: 24, fontWeight: '800', marginTop: 2, textAlign: 'right' },
  headerAvatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pageContent: { paddingHorizontal: 18, paddingTop: 7, gap: 2 },
  dashboardHero: {
    backgroundColor: '#215746',
    borderColor: '#215746',
    padding: 19,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  heroAvatar: { width: 39, height: 39, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroTotal: { color: '#fffefa', fontSize: 29, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  heroCaption: { color: '#c7d9cf', fontSize: 12, textAlign: 'right', marginTop: 2 },
  heroMetrics: { flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'center', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.19)' },
  heroMetric: { flex: 1, alignItems: 'center', gap: 3 },
  heroMetricValue: { color: '#fffefa', fontSize: 19, fontWeight: '800' },
  heroMetricLabel: { color: '#c7d9cf', fontSize: 11 },
  heroMetricRule: { height: 28, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  tag: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 11, fontWeight: '700' },
  dueBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, paddingVertical: 14 },
  dueIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  inlineAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, padding: 4 },
  inlineActionText: { fontSize: 13, fontWeight: '800' },
  propertyCard: { padding: 15 },
  propertyCardHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  propertySymbol: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  propertyCardActions: { flexDirection: 'row-reverse', alignItems: 'center' },
  propertyName: { fontSize: 18, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  propertyFoot: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  footLabel: { fontSize: 11, textAlign: 'right', marginBottom: 4 },
  footValue: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  propertyRent: { fontSize: 14, fontWeight: '800', textAlign: 'right' },
  emptyState: { alignItems: 'center', paddingVertical: 33, paddingHorizontal: 22 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 5 },
  emptyDetail: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  pageHero: { padding: 18 },
  eyebrow: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  pageHeroValue: { fontSize: 25, fontWeight: '800', textAlign: 'right', marginVertical: 5 },
  paymentQuickActions: { flexDirection: 'row-reverse', gap: 9, marginTop: 16 },
  receiptRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 13, gap: 8 },
  receiptMain: { flex: 1, gap: 4 },
  receiptTitleLine: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  receiptAmount: { fontSize: 15, fontWeight: '800' },
  receiptProperty: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  receiptActions: { flexDirection: 'row-reverse', alignItems: 'center' },
  reportIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  reportPropertyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingVertical: 13 },
  reportAmount: { fontSize: 13, fontWeight: '800', maxWidth: 120, textAlign: 'left' },
  reportButton: { minHeight: 41, marginBottom: 12 },
  profileCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  profileAvatar: { width: 47, height: 47, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  settingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 13 },
  settingIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  versionText: { textAlign: 'center', fontSize: 11, marginTop: 17 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 73,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  tabButton: { minWidth: 68, alignItems: 'center', gap: 3, paddingTop: 3 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  tabLabelActive: { fontWeight: '800' },
  tabIndicator: { height: 3, width: 20, borderRadius: 2, marginTop: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden', alignSelf: 'center' },
  sheetHandle: { height: 4, width: 43, borderRadius: 3, alignSelf: 'center', marginTop: 9 },
  sheetHeader: { minHeight: 53, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  sheetContent: { paddingHorizontal: 17, paddingTop: 7, paddingBottom: 17 },
  photoHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  photoGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 13 },
  photoRemove: { position: 'absolute', top: 4, left: 4, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,34,27,0.75)' },
  addPhoto: { height: 72, minWidth: 91, paddingHorizontal: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 5 },
  addPhotoText: { fontSize: 11, fontWeight: '700' },
  statusChoices: { flexDirection: 'row-reverse', gap: 8, marginTop: 1 },
  statusChoice: { flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  propertyDetailHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginBottom: 15 },
  propertySymbolLarge: { width: 55, height: 55, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  propertyDetailName: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  detailTabs: { flexDirection: 'row-reverse', backgroundColor: '#e7eee8', borderRadius: 14, padding: 4, marginBottom: 15 },
  detailTab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 4 },
  detailTabText: { fontSize: 11, fontWeight: '700' },
  metricGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 9, marginBottom: 5 },
  metric: { width: '47%', minHeight: 104, borderRadius: 17, padding: 12, justifyContent: 'space-between' },
  metricIcon: { alignSelf: 'flex-end' },
  metricTitle: { fontSize: 11, textAlign: 'right' },
  metricValue: { fontSize: 15, fontWeight: '800', textAlign: 'right' },
  detailRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 },
  detailValue: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'left' },
  detailPhoto: { height: 88, width: 88, borderRadius: 14, backgroundColor: '#e7eee8' },
  utilitiesHero: { alignItems: 'flex-end' },
  centerNote: { textAlign: 'center', fontSize: 12, paddingVertical: 11 },
  serviceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 13 },
  serviceAmount: { fontSize: 13, fontWeight: '800', textAlign: 'right', marginTop: 4 },
  compactButton: { minHeight: 39, paddingHorizontal: 14 },
  ledgerSummary: { backgroundColor: '#215746', borderColor: '#215746' },
  detailFootnote: { textAlign: 'center', fontSize: 11, marginTop: 13, marginBottom: 6 },
});
