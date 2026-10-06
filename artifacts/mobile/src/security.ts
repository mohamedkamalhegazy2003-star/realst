import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const AUTH_KEY = 'estate-manager-auth-v1';
const BIO_KEY = 'estate-manager-biometric-role';

export type AccountRole = 'primary' | 'alternate';

export type LocalAccount = {
  role: AccountRole;
  name: string;
  salt: string;
  passwordHash: string;
};

function getStoredItem(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

function setStoredItem(key: string, value: string): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.setItem(key, value)
    : SecureStore.setItemAsync(key, value);
}

function removeStoredItem(key: string): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.removeItem(key)
    : SecureStore.deleteItemAsync(key);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
}

export async function readAccounts(): Promise<LocalAccount[] | null> {
  try {
    const value = await getStoredItem(AUTH_KEY);
    if (!value) return null;
    const accounts = JSON.parse(value) as LocalAccount[];
    return Array.isArray(accounts) && accounts.length === 2 ? accounts : null;
  } catch {
    return null;
  }
}

export async function createAccounts(
  primaryName: string,
  primaryPassword: string,
  alternateName: string,
  alternatePassword: string,
): Promise<LocalAccount[]> {
  const accounts = await Promise.all(
    [
      { role: 'primary' as const, name: primaryName.trim(), password: primaryPassword },
      { role: 'alternate' as const, name: alternateName.trim(), password: alternatePassword },
    ].map(async (account) => {
      const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
      return {
        role: account.role,
        name: account.name,
        salt,
        passwordHash: await hashPassword(account.password, salt),
      };
    }),
  );
  await setStoredItem(AUTH_KEY, JSON.stringify(accounts));
  return accounts;
}

export async function verifyPassword(
  account: LocalAccount,
  password: string,
): Promise<boolean> {
  return (await hashPassword(password, account.salt)) === account.passwordHash;
}

export async function updateAccountName(
  accounts: LocalAccount[],
  role: AccountRole,
  name: string,
): Promise<LocalAccount[]> {
  const updated = accounts.map((account) =>
    account.role === role ? { ...account, name: name.trim() } : account,
  );
  await setStoredItem(AUTH_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateAccountPassword(
  accounts: LocalAccount[],
  role: AccountRole,
  password: string,
): Promise<LocalAccount[]> {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const updated = await Promise.all(
    accounts.map(async (account) =>
      account.role === role
        ? { ...account, salt, passwordHash: await hashPassword(password, salt) }
        : account,
    ),
  );
  await setStoredItem(AUTH_KEY, JSON.stringify(updated));
  return updated;
}

export async function setBiometricRole(role: AccountRole | null): Promise<void> {
  if (role) await setStoredItem(BIO_KEY, role);
  else await removeStoredItem(BIO_KEY);
}

export async function getBiometricRole(): Promise<AccountRole | null> {
  const role = await getStoredItem(BIO_KEY);
  return role === 'primary' || role === 'alternate' ? role : null;
}
