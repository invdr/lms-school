// @vitest-environment jsdom
/**
 * MappingRules.vue v2: persisting the first rule on an UNMAPPED workspace adopts it
 * via ensureMapped, then previews the change before replacing the whole rule list.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import MappingRules from '@/components/Settings/Raven/MappingRules.vue'

const h = vi.hoisted(() => ({
	resources: [] as any[],
	detailData: null as any,
	toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('frappe-ui', () => ({
	toast: h.toast,
	createResource: (config: any) => {
		const url = String(config.url)
		const res: any = reactive({
			url,
			config,
			data: null,
			loading: false,
			error: null,
		})
		res.reset = vi.fn(() => {
			res.data = null
		})
		res.reload = vi.fn()
		res.submit = vi.fn(async (payload: any) => {
			res.lastPayload = payload
			if (url.includes('.get_')) {
				res.data = h.detailData
				config.onSuccess?.(h.detailData)
				return h.detailData
			}
			return undefined
		})
		h.resources.push(res)
		return res
	},
}))

vi.mock('@/components/Settings/Raven/RulesPanel.vue', () => ({
	default: {
		name: 'RulesPanel',
		props: [
			'title',
			'description',
			'subtitle',
			'rules',
			'noActiveRulesMessage',
		],
		emits: ['persist', 'set-status'],
		template: `<div data-testid="rules-panel" />`,
	},
}))
vi.mock('@/components/Settings/Raven/MassRemovalConfirmDialog.vue', () => ({
	default: {
		name: 'MassRemovalConfirmDialog',
		props: ['open', 'removedCount', 'targetLabel'],
		emits: ['confirm', 'cancel'],
		template: `<div />`,
	},
}))

vi.stubGlobal('__', (s: string) => s)
// `String.prototype.format` is a frappe global used in the panel's title copy.
String.prototype.format = function (...args: unknown[]) {
	return this.replace(/\{(\d+)\}/g, (_m: string, i: number) => String(args[i]))
}

const res = (fragment: string) =>
	h.resources.find((r) => r.url.includes(fragment))

const A_RULE = [
	{
		rule_type: 'All Enrolled Students',
		status: 'Active',
		payment_filter: 'Any',
	},
]

const unmappedWorkspaceRow = () => ({
	name: null,
	key: 'WS-RAW',
	mapped: false,
	ravenId: 'WS-RAW',
	label: 'Design HQ',
	type: 'Public',
	rule_combinator: null,
	paused: false,
	stale: false,
	record: {},
})
const mappedWorkspaceRow = () => ({
	name: 'RWM-1',
	key: 'WS-1',
	mapped: true,
	ravenId: 'WS-1',
	label: 'Managed',
	type: 'Public',
	rule_combinator: 'Any (OR)',
	paused: false,
	stale: false,
	record: {},
})

const emitPersist = async (w: any, rules: unknown[]) => {
	w.findComponent({ name: 'RulesPanel' }).vm.$emit('persist', rules)
	await flushPromises()
}

const mountRules = (props: Record<string, unknown>) =>
	mount(MappingRules, {
		props,
		global: { mocks: { __: (s: string) => s } },
	})

beforeEach(() => {
	h.resources = []
	h.detailData = null
	h.toast.success.mockReset()
	h.toast.error.mockReset()
})

describe('MappingRules: unmapped workspace adopts on first rule', () => {
	const adoptAndPersist = async (mappingName = 'RWM-new') => {
		const ensureMapped = vi.fn(async () => mappingName)
		const row = unmappedWorkspaceRow()
		const w = mountRules({ entity: 'workspace', row, ensureMapped })
		await flushPromises()
		await emitPersist(w, A_RULE)
		return { w, row, ensureMapped }
	}

	// ensureMapped can RECOVER a mapping another admin already created (link_*
	// hits a DuplicateEntryError and resolves the existing docname). That mapping
	// has rules and members, and update_* replaces the whole list. The adopt
	// path has to be previewed like any other membership change.

	it('holds a mass removal on the adopted mapping behind the confirmation', async () => {
		const { w } = await adoptAndPersist('RWM-existing')

		res('.compute_rule_diff').config.onSuccess({
			added: 0,
			removed: 118,
			removed_users: [],
		})
		await flushPromises()

		const dialog = w.findComponent({ name: 'MassRemovalConfirmDialog' })
		expect(dialog.props('open')).toBe(true)
		expect(dialog.props('removedCount')).toBe(118)
		expect(res('.update_workspace').submit).not.toHaveBeenCalled()

		dialog.vm.$emit('confirm')
		await flushPromises()
		expect(res('.update_workspace').lastPayload).toMatchObject({
			name: 'RWM-existing',
			label: 'Design HQ',
		})
	})

	it('writes nothing when the mass removal on an adopted mapping is cancelled', async () => {
		const { w } = await adoptAndPersist('RWM-existing')

		res('.compute_rule_diff').config.onSuccess({
			added: 0,
			removed: 118,
			removed_users: [],
		})
		await flushPromises()

		w.findComponent({ name: 'MassRemovalConfirmDialog' }).vm.$emit('cancel')
		await flushPromises()

		expect(res('.update_workspace').submit).not.toHaveBeenCalled()
	})

	it('drops the pending rules when the adopted mapping cannot be previewed', async () => {
		const { w } = await adoptAndPersist('RWM-existing')

		res('.compute_rule_diff').config.onError({ messages: ['nope'] })
		await flushPromises()

		expect(h.toast.error).toHaveBeenCalledWith('nope')
		w.findComponent({ name: 'MassRemovalConfirmDialog' }).vm.$emit('confirm')
		await flushPromises()
		expect(res('.update_workspace').submit).not.toHaveBeenCalled()
	})
})

describe('MappingRules: mapped row keeps the diff flow', () => {

	// `update_workspace` replaces the whole rule list, so a rule this app does not own
	// has to come back out of the UI exactly as it went in, provider included.
	it('sends another provider rule back untouched when an LMS rule is saved', async () => {
		const foreign = {
			name: 'RMR-9',
			label: 'Widget owners',
			provider: 'Acme',
			rule_type: 'Widget Owners',
			status: 'Active',
			config: { widget_tier: 'gold' },
		}
		h.detailData = {
			name: 'RWM-1',
			member_rules: [
				{
					name: 'RMR-1',
					label: 'Old name',
					provider: 'LMS',
					rule_type: 'All Enrolled Students',
					status: 'Active',
					config: { payment_filter: 'Any' },
				},
				foreign,
			],
			member_count: 3,
			workspace_label: 'Managed',
			workspace_type: 'Public',
			rule_combinator: 'Any (OR)',
		}
		const w = mountRules({
			entity: 'workspace',
			row: mappedWorkspaceRow(),
			ensureMapped: vi.fn(async () => 'RWM-1'),
		})
		await flushPromises()

		// The panel hands back what it was given, with one LMS rule renamed.
		const panel = w.findComponent({ name: 'RulesPanel' })
		const current = panel.props('rules') as Record<string, unknown>[]
		await emitPersist(w, [{ ...current[0], label: 'New name' }, current[1]])

		const sent = res('.update_workspace').lastPayload.rules
		expect(sent[0]).toMatchObject({ provider: 'LMS', label: 'New name' })
		expect(sent[1]).toEqual(foreign)
	})

})
