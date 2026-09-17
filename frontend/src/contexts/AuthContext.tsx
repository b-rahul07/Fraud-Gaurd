import { createContext, useContext, ReactNode } from 'react';

interface AuthContextType {
  user: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const fakeUser = { uid: 'demo-user', email: 'demo@fraud-guard.local', displayName: 'Demo User' };

  return (
    <AuthContext.Provider value={{
      user: fakeUser,
      loading: false,
      signIn: async () => {},
      signUp: async () => {},
      signInWithGoogle: async () => {},
      signOut: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
