// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import CodeBox from '@/utils/code'

const makeBox = (data: Record<string, any>, readOnly = true) =>
	new CodeBox({
		data,
		api: { listeners: { on: vi.fn(), off: vi.fn() } },
		config: {},
		readOnly,
	})

const renderArea = (data: Record<string, any>, readOnly = true) => {
	const holder = makeBox(data, readOnly).render()
	return holder.querySelector('.codeBoxTextArea') as HTMLElement
}

describe('CodeBox legacy data normalization', () => {

	it('renders escaped markup as text, never as elements', () => {
		const area = renderArea({
			code: '&lt;img src=x onerror=alert(1)&gt;',
			language: 'Auto-detect',
		})
		expect(area.querySelector('img')).toBeNull()
		expect(area.textContent).toContain('<img src=x onerror=alert(1)>')
	})

})

describe('CodeBox storage escaping (server sanitizer safety)', () => {
	it('save() entity-escapes the plain text so nh3 cannot mangle it', () => {
		const stored = 'a -&gt; b &amp;&amp; c &lt; d'
		const box = makeBox({ code: stored, format: 'text', language: 'plaintext' }, false)
		box.render()
		expect(box.data.code).toBe('a -> b && c < d')
		const saved = box.save(null)
		expect(saved.code).toBe(stored)
		expect(box.data.code).toBe('a -> b && c < d')
	})

	it('decodes stored entities on load (round-trip)', () => {
		const area = renderArea({
			code: '&lt;div class="x"&gt; &amp;&amp; a -&gt; b',
			format: 'text',
			language: 'plaintext',
		})
		expect(area.textContent).toBe('<div class="x"> && a -> b')
	})
})
