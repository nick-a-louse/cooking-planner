import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The image build passes the version (sha-<commit> or a v-tag) in VITE_APP_VERSION.
// It's shown in the footer and used to cache-bust the static files in index.html.
process.env.VITE_APP_VERSION ||= "dev";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/healthz": "http://localhost:8000",
      "/metrics": "http://localhost:8000",
    },
  },
});
