// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from '@/utils/markdownParser'

vi.stubGlobal('__', (text: string) => text)
const parse = (html: string) => new Markdown({
	data: {}, api: {}, readOnly: false, config: {},
})._parsePastedHTMLToBlocks(html)

describe('pasted HTML security before insertion into the editor', () => {
	it('keeps safe links and rejects script and protocol-relative targets', () => {
		expect(parse('<p><a href="https://example.com">safe</a></p>')[0].data.text)
			.toBe('<a href="https://example.com">safe</a>')
		expect(parse('<p><a href="/courses/1">local</a></p>')[0].data.text)
			.toBe('<a href="/courses/1">local</a>')
		for (const href of ['javascript:alert(1)', '//evil.example/x']) {
			expect(parse(`<p><a href="${href}">text</a></p>`)[0].data.text).toBe('text')
		}
	})
	it('rejects unsafe images while retaining an HTTPS image', () => {
		expect(parse('<p><img src="https://example.com/image.png"></p>')[0].data.url)
			.toBe('https://example.com/image.png')
		for (const src of ['javascript:alert(1)', '//evil.example/image.png']) {
			expect(parse(`<p><img src="${src}"></p>`).filter((block: any) => block.type === 'image'))
				.toHaveLength(0)
		}
	})
	it('escapes text so pasted markup cannot become live HTML', () => {
		const holder = document.createElement('div')
		holder.innerHTML = parse('<p>&lt;img src=x onerror=alert(1)&gt; &amp; text</p>')[0].data.text
		expect(holder.querySelector('img')).toBeNull()
		expect(holder.textContent).toBe('<img src=x onerror=alert(1)> & text')
	})
})
