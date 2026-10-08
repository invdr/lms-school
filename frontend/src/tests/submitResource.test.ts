import { describe, expect, it, vi } from 'vitest'
import { setImmediate } from 'node:timers/promises'
// Exercise frappe-ui's actual callback/exception contract; only the network is replaced.
import { createResource } from 'frappe-ui/src/resources/resources.js'
import { submitResource } from '@/utils/resource'

vi.mock('frappe-ui', () => ({ toast: { error: vi.fn() } }))
vi.stubGlobal('__', (value: string) => value)

describe('saved-record error handling', () => {
	it('surfaces a success-callback bug without reporting a saved record as a failed request', async () => {
		const onError = vi.fn()
		const failure = new TypeError('view refresh failed after save')
		const resource = createResource({
			url: '/api/method/isolated-test',
			resourceFetcher: async () => ({ name: 'saved-record' }),
		})
		await expect(submitResource(resource, {}, {
			onSuccess() { throw failure },
			onError,
		})).rejects.toBe(failure)
		expect(onError).not.toHaveBeenCalled()
		expect(resource.data).toEqual({ name: 'saved-record' })
	})

	it('waits for chained saves before reporting completion', async () => {
		let release: () => void = () => {}
		const chained = new Promise<void>((resolve) => { release = resolve })
		const resource = createResource({
			url: '/api/method/isolated-test',
			resourceFetcher: async () => ({ name: 'saved-record' }),
		})
		let complete = false
		const pending = submitResource(resource, {}, { onSuccess: () => chained })
			.then(() => { complete = true })
		// Flush the event loop so all runnable resource callbacks settle.
		await setImmediate()
		expect(complete).toBe(false)
		release()
		await pending
		expect(complete).toBe(true)
	})
})
