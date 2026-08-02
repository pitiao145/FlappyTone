import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
// basic-ssl serves the dev server over HTTPS (self-signed cert) so
// getUserMedia works when testing on a phone over the LAN — browsers
// only allow mic access in a secure context.
export default defineConfig({
  plugins: [react(), basicSsl()],
  // Reachable from the phone on the LAN (soundboard + on-device testing).
  server: { host: true },
})
