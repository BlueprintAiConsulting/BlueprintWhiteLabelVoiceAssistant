import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocFromServer, writeBatch } from "firebase/firestore";

// Multi-tenant / Multi-environment configurations
export const BLUEPRINT_CONFIG = {
  projectId: "blueprint-operations",
  appId: "1:1055948083267:web:a019dc91de16c2d367c4f6",
  apiKey: "AIzaSyDGaK7iwPiXzNJ9YbPL4R3Yr9QSCW9tspE",
  authDomain: "blueprint-operations.firebaseapp.com",
  firestoreDatabaseId: "(default)",
  storageBucket: "blueprint-operations.firebasestorage.app",
  messagingSenderId: "1055948083267",
  measurementId: "G-206D5JPB6V"
};

export const LUNAR_CONFIG = {
  projectId: "beach-house-tanning-lounge",
  appId: "1:430439016431:web:b877d5f1300561df06781a",
  apiKey: "AIzaSyBwkuslAVMBJ7MrkOzp-H3XaycVNo6n944",
  authDomain: "beach-house-tanning-lounge.firebaseapp.com",
  firestoreDatabaseId: "(default)",
  storageBucket: "beach-house-tanning-lounge.firebasestorage.app",
  messagingSenderId: "430439016431",
  measurementId: ""
};

export function getActiveFirebaseConfig() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("lunar-hvac") || host.includes("beach-house-tanning-lounge") || host.includes("sv-receptionist")) {
      return LUNAR_CONFIG;
    }
  }
  return BLUEPRINT_CONFIG;
}

// Initialize Firebase SDK with active environment
const activeConfig = getActiveFirebaseConfig();
const app = initializeApp(activeConfig);
export const db = getFirestore(app, activeConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handling for Firestore
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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
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
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection in client environments
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  testConnection();
}



export { 
  signInWithPopup, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  writeBatch,
  serverTimestamp 
};
export type { User };
