import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // permite acceder desde una tablet en la misma red local
  },
  build: {
    rollupOptions: {
      output: {
        // Separa dependencias que cambian poco del código de la aplicación.
        // En celular/tablet el navegador puede descargarlas en paralelo y
        // conservarlas en caché cuando publiquemos una nueva versión.
        manualChunks(id) {
          const modulePath = id.replaceAll("\\\\", "/");
          if (!modulePath.includes("/node_modules/")) return undefined;
          if (
            modulePath.includes("/node_modules/react/") ||
            modulePath.includes("/node_modules/react-dom/") ||
            modulePath.includes("/node_modules/react-router/") ||
            modulePath.includes("/node_modules/react-router-dom/")
          ) return "react-core";
          if (modulePath.includes("/node_modules/@supabase/")) return "supabase-client";
          return undefined;
        },
      },
    },
  },
})
