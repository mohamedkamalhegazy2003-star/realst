import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  testID?: string;
  style?: object;
}) {
  const colors = useColors();
  const backgroundColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.destructive
        : variant === 'secondary'
          ? colors.secondary
          : 'transparent';
  const color =
    variant === 'primary' || variant === 'danger'
      ? colors.primaryForeground
      : variant === 'ghost'
        ? colors.primary
        : colors.secondaryForeground;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.52 : pressed ? 0.78 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonText, { color }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  ...props
}: TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlign="right"
        autoCapitalize="sentences"
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
          multiline && styles.multiline,
        ]}
      />
    </View>
  );
}

export function Label({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.label, { color: muted ? colors.mutedForeground : colors.foreground }]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, { color: colors.foreground }]}>{title}</Text>
      {trailing}
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldWrap: {
    marginBottom: 13,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    textAlign: 'right',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    fontSize: 15,
    writingDirection: 'rtl',
  },
  multiline: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'right',
  },
  sectionTitle: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
});
