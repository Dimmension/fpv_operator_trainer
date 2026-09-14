import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { AttentionPage } from "./pages/AttentionPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { MemoryPage } from "./pages/MemoryPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="modules/attention" element={<AttentionPage />} />
        <Route path="modules/memory" element={<MemoryPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
