/**
 * Recovery when two administrators try to adopt the same workspace concurrently.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import { useMappingList } from '@/composables/raven/useMappingList'

const h = vi.hoisted(() => ({
	resources: [] as any[],
	linkResult: null as string | null,
	linkError: null as any,
	toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('frappe-ui', () => ({
	toast: h.toast,
	createResource: (config: any) => {
		const url = String(config.url)
		const res: any = reactive({
			url,
			params: config.params,
			loading: false,
			data: null,
			error: null,
		})
		res.reset = vi.fn(() => {
			res.data = null
		})
		res.reload = vi.fn(async () => res.data)
		res.submit = vi.fn(async (payload: any) => {
			res.lastPayload = payload
			if (url.includes('.link_')) {
				res.error = h.linkError
				if (h.linkError) {
					config.onError?.(h.linkError)
					return null
				}
				return h.linkResult
			}
			// create_* resolves with a name the composable consumes via onSuccess.
			return undefined
		})
		h.resources.push(res)
		return res
	},
}))

vi.stubGlobal('__', (s: string) => s)

const res = (fragment: string) =>
	h.resources.find((r) => r.url.includes(fragment))

const unmappedWorkspace = () => ({
	name: null,
	mapped: false,
	raven_workspace: 'WS-RAW',
	workspace_label: 'Design HQ',
	workspace_type: 'Public',
	rule_combinator: null,
	enabled: 1,
	stale: 0,
})
async function workspaceList(records: any[]) {
	const list = useMappingList({ entity: 'workspace' })
	res('list_workspaces').data = records
	await nextTick()
	return list
}

beforeEach(() => {
	h.resources = []
	h.linkResult = null
	h.linkError = null
	h.toast.success.mockReset()
	h.toast.error.mockReset()
})

describe('useMappingList: ensureMapped duplicate race', () => {
	it('recovers from a DuplicateEntryError by resolving the existing mapping', async () => {
		const list = await workspaceList([unmappedWorkspace()])
		const row = list.rows.value[0]

		// The link races and loses: the row was already adopted elsewhere.
		h.linkError = { exc_type: 'DuplicateEntryError' }
		h.linkResult = null
		const listRes = res('list_workspaces')
		listRes.reload = vi.fn(async () => {
			listRes.data = [
				{
					name: 'RWM-existing',
					mapped: true,
					raven_workspace: 'WS-RAW',
					workspace_label: 'Design HQ',
					workspace_type: 'Public',
					rule_combinator: 'Any (OR)',
					enabled: 1,
					stale: 0,
				},
			]
			return listRes.data
		})

		const name = await list.ensureMapped(row)

		expect(name).toBe('RWM-existing')
		expect(listRes.reload).toHaveBeenCalled()
		// A duplicate race is benign: no error toast.
		expect(h.toast.error).not.toHaveBeenCalled()
	})
})
