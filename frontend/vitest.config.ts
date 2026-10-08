import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
	plugins: [vue()],
	test: {
		environment: 'node',
		globals: true,
		maxWorkers: 2,
		server: { deps: { inline: ['frappe-ui', 'pdfjs-dist'] } },
		include: ['src/tests/**/*.test.{ts,js}'],
	},
	resolve: {
		alias: {
			'@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src'),
			// The pinned package exports only its full UI barrel. Resolve the actual
			// resource implementation for the external-contract test without loading
			// unrelated editors/charts/icons into the quick gate.
			'frappe-ui/src/resources/resources.js': path.resolve(
				path.dirname(fileURLToPath(import.meta.url)),
				'node_modules/frappe-ui/src/resources/resources.js'
			),
		},
		dedupe: ['vue', 'frappe-ui'],
	},
})
