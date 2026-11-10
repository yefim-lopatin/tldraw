import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react()],
	root: fileURLToPath(new URL('./src/client', import.meta.url)),
	publicDir: fileURLToPath(new URL('./public', import.meta.url)),
	build: { outDir: '../../dist', emptyOutDir: true },
	server: {
		port: 5757,
		strictPort: true,
		proxy: {
			'/connect': { target: 'http://127.0.0.1:5858', ws: true },
			'/api': 'http://127.0.0.1:5858',
			'/uploads': 'http://127.0.0.1:5858',
		},
	},
	optimizeDeps: { exclude: ['@tldraw/assets'] },
})
