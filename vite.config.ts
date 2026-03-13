import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: false,
  build: {
    outDir: "public/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
    },
  },
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "client"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 3000,
  },
});
