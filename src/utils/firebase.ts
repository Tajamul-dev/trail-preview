import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User } from '../types';

const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with firestoreDatabaseId from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
// Sign-in opens Google's login in the browser. Popup is used first (most reliable in real
// browsers); if the popup is blocked or the environment refuses it, we automatically fall
// back to a full-page redirect to Google's account chooser.
setPersistence(auth, browserSessionPersistence).catch((e: unknown) =>
  console.warn('Could not set auth persistence:', e)
);
export const googleProvider = new GoogleAuthProvider();
// Always show the account picker and consent screen on every sign-in.
googleProvider.setCustomParameters({ prompt: 'consent select_account' });

// Verify connection
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client appears offline.');
    }
  }
}
testFirestoreConnection();

// Opens Google's login (popup window in the browser, or full-page redirect as fallback).
// The signed-in user is returned directly for popups, or arrives via onAuthStateChanged
// after the redirect back.
export async function loginWithGoogle(): Promise<User | null> {
  try {
    let result: Awaited<ReturnType<typeof signInWithPopup>>;
    try {
      result = await signInWithPopup(auth, googleProvider);
    } catch (popupErr: any) {
      const code = popupErr?.code || '';
      const popupImpossible =
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/popup-failed';
      if (popupImpossible) {
        await signInWithRedirect(auth, googleProvider);
        return null; // page is navigating to Google
      }
      throw popupErr;
    }

    const fbUser = result.user;
    if (!fbUser) return null;

    const email = fbUser.email || 'user@globaloils.us';
    const name = fbUser.displayName || email.split('@')[0];
    const initials = name
      .split(' ')
      .map(w => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const isSuper = email.toLowerCase() === 'tajamul.sales@globaloils.us' || email.toLowerCase() === 'strangersyco@gmail.com';
    return {
      email,
      name,
      initials: initials || 'G',
      role: isSuper ? 'super_admin' : 'admin',
      isAdmin: true,
      isSuperAdmin: isSuper,
    };
  } catch (error: any) {
    console.error('Google Sign-In failed:', error);
    if (error?.code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
      const enhancedError = new Error(
        `Firebase domain unauthorized: "${currentHost}" has not been added to Authorized Domains in Firebase Console.`
      );
      (enhancedError as any).code = 'auth/unauthorized-domain';
      (enhancedError as any).domain = currentHost;
      (enhancedError as any).projectId = firebaseConfig.projectId;
      throw enhancedError;
    }
    throw error;
  }
}

// Save signed-in profile to Firestore (called from the auth state listener).
export async function saveUserProfile(fbUser: FirebaseUser, user: User) {
  try {
    await setDoc(doc(db, 'users', fbUser.uid), {
      email: user.email,
      name: user.name,
      role: user.role,
      lastLogin: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn('Could not persist user profile to Firestore:', e);
  }
}

export async function logoutUser() {
  await fbSignOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

