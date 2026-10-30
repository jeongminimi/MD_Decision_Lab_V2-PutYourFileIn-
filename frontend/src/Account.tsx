import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { apiFetch, setTokenProvider } from "./http";
import "./account.css";

interface Runtime {
  mode: "local" | "demo" | "private";
  auth_enabled: boolean;
  supabase_url: string | null;
  supabase_key: string | null;
}

interface AccountState {
  runtime: Runtime; user: User | null; client: SupabaseClient | null; canUpload: boolean;
}
const AccountContext = createContext<AccountState | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("AccountProvider is required");
  return value;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function init() {
      const response = await apiFetch("/api/runtime");
      if (!response.ok) throw new Error("서버에 연결할 수 없습니다.");
      const config = await response.json() as Runtime;
      if (!active) return;
      if (config.auth_enabled && config.supabase_url && config.supabase_key) {
        const auth = createClient(config.supabase_url, config.supabase_key);
        setTokenProvider(async () => {
          const result = await auth.auth.getSession();
          return result.data.session?.access_token || null;
        });
        const { data } = await auth.auth.getSession();
        if (!active) return;
        setClient(auth);
        setUser(data.session?.user || null);
        const { data: listener } = auth.auth.onAuthStateChange((_event, session) => {
          if (active) setUser(session?.user || null);
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      }
      // Establish the signed guest cookie before the screen issues parallel API calls.
      const me = await apiFetch("/api/me");
      if (!me.ok) throw new Error("작업공간 연결에 실패했습니다. 로그인 상태나 서버 설정을 확인해 주세요.");
      if (active) setRuntime(config);
    }
    void init().catch((err) => { if (active) setError(err instanceof Error ? err.message : "연결에 실패했습니다."); });
    return () => { active = false; unsubscribe?.(); setTokenProvider(null); };
  }, []);
  if (error) return <main className="account-start"><h1>작업공간 연결 확인</h1><p role="alert">{error}</p><button onClick={() => window.location.reload()}>다시 연결</button>{client && <button onClick={() => void client.auth.signOut({ scope: "local" }).then(() => window.location.reload())}>로그인 상태 초기화</button>}</main>;
  if (!runtime) return <main className="account-start" role="status">작업공간을 준비하고 있습니다…</main>;
  return <AccountContext.Provider value={{ runtime, user, client, canUpload: runtime.mode === "local" || !!user }}>
    <div key={user?.id || "guest"}>{children}</div>
  </AccountContext.Provider>;
}

export function AccountControls() {
  const { runtime, user, client } = useAccount();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (runtime.mode === "local") return null;
  async function logout() {
    const result = await client?.auth.signOut();
    if (result?.error) setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
  }
  return <div className="account-controls">
    <span>{user ? "내 비공개 작업공간" : "개인 데모 · 24시간"}</span>
    {runtime.auth_enabled && (user ? <button className="photo-toggle" onClick={() => void logout()}>로그아웃</button> :
      <button className="photo-toggle" onClick={() => setOpen(true)}>로그인 / 가입</button>)}
    {error && <small role="alert">{error}</small>}
    {open && client && <LoginDialog client={client} onClose={() => setOpen(false)}/>}
  </div>;
}

function LoginDialog({ client, onClose }: { client: SupabaseClient; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = signup ? await client.auth.signUp({ email, password,
        options: { emailRedirectTo: window.location.origin } }) : await client.auth.signInWithPassword({ email, password });
      if (result.error) { setMessage(signup ? "가입 요청을 확인해 주세요. 이메일 형식·비밀번호 또는 잠시 후 재시도를 확인하세요." : "이메일·비밀번호와 이메일 인증 여부를 확인해 주세요."); return; }
      if (result.data.session) onClose();
      else setMessage("이메일의 인증 링크를 연 다음 로그인해 주세요. 이미 가입한 경우 로그인 탭을 사용하세요.");
    } catch { setMessage("로그인 서버에 연결할 수 없습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="account-dialog" aria-labelledby="login-title" onCancel={onClose}>
    <button className="account-close" aria-label="닫기" onClick={onClose}>×</button>
    <h2 id="login-title">{signup ? "계정 만들기" : "내 작업공간 로그인"}</h2>
    <p>파일과 판단 기록은 로그인한 계정에만 저장됩니다. 데모 기록은 계정으로 자동 이전되지 않습니다.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label>이메일<input autoFocus type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label>비밀번호<input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <button className="button button-primary" disabled={busy}>{busy ? "확인 중…" : signup ? "가입하기" : "로그인"}</button>
    </form>
    <p role="status">{message}</p>
    <button className="button button-secondary" onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "로그인으로 돌아가기" : "처음이라면 계정 만들기"}</button>
  </dialog>;
}
