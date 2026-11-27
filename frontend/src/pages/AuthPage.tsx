import { useState } from "react";
import { Radar, Loader2 } from "lucide-react";
import { api, setAuthToken } from "../api/client";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ErrorNotice } from "../components/ErrorNotice";

export function AuthPage({ onLogin }: { onLogin: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let res;
      if (isLogin) {
        res = await api.login({ email, password });
      } else {
        res = await api.register({ email, password, name, callsign: callsign || undefined });
      }
      setAuthToken(res.access_token);
      onLogin();
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 animate-[rise_.3s_ease-out]">
        <div className="flex flex-col items-center mb-8">
          <span className="grid size-14 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.15)] mb-4">
            <Radar className="size-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-widest uppercase text-white">Контур</h1>
          <p className="text-sm text-slate-400 mt-1">Идентификация оператора</p>
        </div>

        {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <>
              <input type="text" placeholder="ФИО" required value={name} onChange={(e) => setName(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 text-white outline-none focus:border-cyan-300/50" />
              <input type="text" placeholder="Позывной (необязательно)" value={callsign} onChange={(e) => setCallsign(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 text-white outline-none focus:border-cyan-300/50" />
            </>
          )}
          <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 text-white outline-none focus:border-cyan-300/50" />
          <input type="password" placeholder="Пароль" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 text-white outline-none focus:border-cyan-300/50" />
          
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? <Loader2 className="animate-spin size-5" /> : isLogin ? "Войти в систему" : "Зарегистрироваться"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "Нет профиля? " : "Уже есть профиль? "}
          <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="text-cyan-300 hover:underline">
            {isLogin ? "Создать" : "Войти"}
          </button>
        </p>
      </Card>
    </div>
  );
}