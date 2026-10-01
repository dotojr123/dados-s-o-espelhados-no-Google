import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

const provider = new GoogleAuthProvider();
// Adicionando as permissões necessárias para a automação do Workspace
provider.addScope('https://www.googleapis.com/auth/drive.file'); // Acesso apenas aos arquivos criados pelo app
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/calendar.events');

// In-memory cache for access token (recommended for security)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Fallback to check sessionStorage on initial reload if present
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem('workspace_access_token');
    if (stored) {
      cachedAccessToken = stored;
    }
  } catch {
    // ignore
  }
}

export const getWorkspaceToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    try {
      return sessionStorage.getItem('workspace_access_token');
    } catch {
      return null;
    }
  }
  return null;
};

export const setWorkspaceToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem('workspace_access_token', token);
      } else {
        sessionStorage.removeItem('workspace_access_token');
      }
    } catch {
      // ignore
    }
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(firebaseAuth, async (user: User | null) => {
    if (user) {
      const token = getWorkspaceToken();
      if (token && onAuthSuccess) {
        onAuthSuccess(user, token);
      } else if (!isSigningIn && onAuthFailure) {
        // User is logged into Firebase but token needs refresh / interaction
        if (onAuthSuccess) onAuthSuccess(user, null);
      }
    } else {
      setWorkspaceToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export interface AuthResult {
  user: User | null;
  accessToken: string | null;
  cancelled?: boolean;
  error?: string;
}

export const signInAndGetWorkspaceToken = async (): Promise<AuthResult> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(firebaseAuth, provider);

    // Esse é o token que vai orquestrar as chamadas REST para o Google
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || null;
    const user = result.user;

    if (!accessToken) {
      throw new Error('Falha ao obter token de acesso do Google Workspace.');
    }

    setWorkspaceToken(accessToken);
    return { user, accessToken, cancelled: false };
  } catch (error: any) {
    // Tratamento gracioso quando o usuário fecha o popup ou cancela voluntariamente
    if (
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.message?.includes('popup-closed-by-user')
    ) {
      console.info('Autenticação popup encerrada pelo usuário.');
      return { user: null, accessToken: null, cancelled: true };
    }

    if (error.code === 'auth/popup-blocked') {
      const msg = 'O navegador bloqueou a janela pop-up do Google. Por favor, permita pop-ups para este site.';
      console.warn(msg);
      return { user: null, accessToken: null, cancelled: false, error: msg };
    }

    console.error('Erro na orquestração de login:', error);
    return { user: null, accessToken: null, cancelled: false, error: error.message || 'Erro na autenticação' };
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  try {
    await signOut(firebaseAuth);
    setWorkspaceToken(null);
  } catch (error) {
    console.error('Erro ao deslogar:', error);
    throw error;
  }
};
