import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, reload, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { registerAndSavePushToken } from '../services/notifications';

type Role = 'customer' | 'admin' | null;

interface AuthContextValue {
  user: User | null;
  role: Role;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          setRole((snap.data()?.role as Role) ?? null);
        } catch {
          setRole(null);
        }
        registerAndSavePushToken(firebaseUser.uid).catch(() => null);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    // auth.currentUser is a new object reference after reload — triggers re-renders
    setUser(auth.currentUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
