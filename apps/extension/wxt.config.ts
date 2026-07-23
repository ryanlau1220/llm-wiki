import { defineConfig } from 'wxt'
import react from '@vitejs/plugin-react'

const EXTENSION_DEV_SERVER_PORT = 3003

export default defineConfig({
  manifest: {
    name: 'LLM Wiki Capture',
    description: 'Explicitly capture selected browser research into a local LLM Wiki inbox.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [
      'http://localhost:3001/*',
      'http://127.0.0.1:3001/*',
    ],
  },
  dev: {
    server: {
      port: EXTENSION_DEV_SERVER_PORT,
      strictPort: true,
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
})
