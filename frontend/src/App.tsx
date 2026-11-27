import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { getAuthToken, removeAuthToken } from "./api/client";
import { Layout } from "./components/Layout";
import { AttentionPage } from "./pages/AttentionPage";
import { AuthPage } from "./pages/AuthPage";
import { CorrectionPage } from "./pages/CorrectionPage";
import { HistoryDetailPage } from "./pages/HistoryDetailPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { MemoryPage } from "./pages/MemoryPage";
import { MotorPage } from "./pages/MotorPage";
import { SwitchingPage } from "./pages/SwitchingPage";
import { TappingPage } from "./pages/TappingPage";

export function App() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getAuthToken());

  useEffect(() => {
    const handleAuthExpired = () => {
      removeAuthToken();
      setIsAuthenticated(false);
      navigate("/auth", { replace: true });
    };
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, [navigate]);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage onLogin={() => setIsAuthenticated(true)} />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout onLogout={() => { removeAuthToken(); setIsAuthenticated(false); }} />}>
        <Route index element={<HomePage />} />
        <Route path="modules/attention" element={<AttentionPage />} />
        <Route path="modules/memory" element={<MemoryPage />} />
        <Route path="modules/endurance" element={<CorrectionPage moduleCode="attention-endurance" />} />
        <Route path="modules/divided" element={<CorrectionPage moduleCode="divided-attention" />} />
        <Route path="modules/switching" element={<SwitchingPage />} />
        <Route path="modules/motor" element={<MotorPage />} />
        <Route path="modules/tapping" element={<TappingPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:id" element={<HistoryDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
