import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// When VITE_API_BASE_URL is set (e.g. on Vercel pointing at Render),
// all API calls are prefixed with that URL.
// In development the env var is unset and relative paths are used as before.
if (import.meta.env.VITE_API_BASE_URL) {
  setBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

createRoot(document.getElementById("root")!).render(<App />);
