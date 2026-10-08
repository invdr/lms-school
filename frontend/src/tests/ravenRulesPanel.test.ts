// @vitest-environment jsdom
/**
 * RulesPanel.vue's rule-validity guard: a rule is savable only once it is named,
 * complete and not a duplicate. A *persisted* invalid rule blocks the whole save,
 * because the backend replaces the rule list wholesale and would delete it.
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RulesPanel from '@/components/Settings/Raven/RulesPanel.vue'
import type { RavenMemberRule } from '@/types'

// The panel reads the LMS provider declaration for `reqd` (incomplete rules) and for
// the defaults a blank rule starts with.
// `providers`/`loading` are swapped per test to stand in for a declaration that has
// not landed (or never will). See the "no declaration" describe.
const decl = vi.hoisted(() => ({
	loading: false,
	providers: [
		{
			name: 'LMS',
			label: 'Frappe Learning',
			rule_types: [
				{
					type: 'All Enrolled Students',
					fields: [
						{
							fieldname: 'payment_filter',
							fieldtype: 'Select',
							label: 'Payment',
							options: ['Any', 'Paid', 'Free'],
							default: 'Any',
						},
					],
				},
				{
					type: 'Students of Courses',
					fields: [
						{
							fieldname: 'courses',
							fieldtype: 'MultiSelect',
							label: 'Courses',
							options: 'LMS Course',
							reqd: 1,
						},
					],
				},
				{
					type: 'Staff',
					fields: [
						{
							fieldname: 'staff_role',
							fieldtype: 'Select',
							label: 'Staff role',
							options: ['Instructor', 'Evaluator', 'Mentor', 'Any'],
							reqd: 1,
						},
					],
				},
			],
		},
	],
}))

vi.mock('frappe-ui', () => ({
	createResource: () => ({
		get data() {
			return decl.providers
		},
		get loading() {
			return decl.loading
		},
	}),
	Badge: { props: ['label'], template: `<span>{{ label }}</span>` },
	Button: {
		props: ['variant', 'ariaLabel', 'disabled'],
		// Declaring `emits` matters: without it `@click` also falls through as a native
		// listener, double-firing addRule() per click (real frappe-ui Button declares it).
		emits: ['click'],
		template: `<button :aria-label="ariaLabel" :disabled="disabled" @click="$emit('click')"><slot name="prefix" /><slot name="icon" /><slot /></button>`,
	},
	Dropdown: {
		name: 'Dropdown',
		props: ['options', 'placement'],
		template: `<span class="dropdown"><slot /></span>`,
	},
	TextInput: {
		props: ['modelValue', 'placeholder', 'ariaLabel', 'disabled'],
		template: `<input :placeholder="placeholder" :value="modelValue" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)" />`,
	},
}))

vi.mock('lucide-vue-next', () => ({
	Plus: { template: `<span class="icon-plus" />` },
	MoreHorizontal: { template: `<span class="icon-more" />` },
	Trash2: { template: `<span class="icon-trash" />` },
	AlertTriangle: { template: `<span data-testid="alert-triangle" />` },
	Ban: { template: `<span class="icon-ban" />` },
	CircleCheck: { template: `<span class="icon-circle-check" />` },
}))

vi.mock('@/components/Settings/Raven/RuleEditor.vue', () => ({
	default: {
		name: 'RuleEditor',
		props: ['modelValue', 'disabled'],
		template: `<div class="rule-editor" />`,
	},
}))

vi.stubGlobal('__', (s: string) => s)

const allEnrolled = (over: Partial<RavenMemberRule> = {}): RavenMemberRule => ({
	name: 'RMR-1',
	label: 'All enrolled',
	rule_type: 'All Enrolled Students',
	status: 'Active',
	payment_filter: 'Any',
	...over,
})

const staffRule = (over: Partial<RavenMemberRule> = {}): RavenMemberRule => ({
	name: 'RMR-2',
	label: 'Instructors',
	rule_type: 'Staff',
	status: 'Active',
	staff_role: 'Instructor',
	...over,
})

function mountPanel(rules: RavenMemberRule[]) {
	return mount(RulesPanel, {
		props: {
			title: 'Channel rules',
			rules,
			noActiveRulesMessage: 'No active rules',
		},
		global: { mocks: { __: (s: string) => s } },
	})
}

const addButton = (w: ReturnType<typeof mountPanel>) =>
	w.findAll('button').filter((b) => b.text() === 'Add rule')[0]

const lastPersisted = (w: ReturnType<typeof mountPanel>) => {
	const events = w.emitted('persist')!
	return events[events.length - 1][0] as RavenMemberRule[]
}

describe('RulesPanel: a persisted invalid rule blocks the save', () => {
	it('emits nothing at all rather than dropping the saved rule', async () => {
		const w = mountPanel([allEnrolled(), staffRule()])

		// Blank the saved rule's name. Withholding it from the payload would make the
		// backend's full-list replace hard-delete it, so nothing may be emitted.
		await w.findAll('input')[0].setValue('')
		await w.findAll('input')[0].trigger('focusout')

		expect(w.emitted('persist')).toBeUndefined()
	})
})

describe('RulesPanel: a rule from another provider is not ours to touch', () => {
	// `update_*` replaces the whole rule list, so a foreign rule missing from (or
	// rewritten in) the payload is silently corrupted or deleted.
	const foreignRule = (): RavenMemberRule => ({
		name: 'RMR-9',
		provider: 'Acme',
		rule_type: 'Widget Owners',
		status: 'Active',
		widget_tier: 'gold',
	})

	it('sends it back byte-for-byte when a sibling rule is saved', async () => {
		const w = mountPanel([allEnrolled(), foreignRule()])

		await w.findAll('input')[0].setValue('Everyone enrolled')
		await w.findAll('input')[0].trigger('focusout')

		const last = lastPersisted(w)
		expect(last).toHaveLength(2)
		expect(last[0].label).toBe('Everyone enrolled')
		expect(last[1]).toEqual(foreignRule())
	})
})

describe('RulesPanel: Disable is Any (OR) only', () => {
	const menuLabels = (w: ReturnType<typeof mount>) =>
		(
			w.findAllComponents({ name: 'Dropdown' })[0].props('options') as {
				label: string
			}[]
		).map((o) => o.label)

	it('hides Disable under All (AND), where dropping a rule would widen the population', () => {
		const w = mount(RulesPanel, {
			props: {
				title: 'Workspace rules',
				rules: [allEnrolled()],
				combinator: 'All (AND)',
				noActiveRulesMessage: 'No active rules',
			},
			global: { mocks: { __: (s: string) => s } },
		})
		expect(menuLabels(w)).not.toContain('Disable')
		expect(menuLabels(w)).toContain('Remove')
	})
})

describe('RulesPanel: a refetch must not destroy unsaved work', () => {
	// Every save round-trips: the parent reloads the mapping and hands down a fresh
	// `rules` array. Rebuilding the draft from it wholesale threw away work in progress.
	const editors = (w: ReturnType<typeof mountPanel>) =>
		w.findAllComponents({ name: 'RuleEditor' })
	const labelOf = (w: ReturnType<typeof mountPanel>, index = 0) =>
		(w.findAll('input')[index].element as HTMLInputElement).value

	it('keeps a named new card while its own save is still in flight', async () => {
		const w = mountPanel([staffRule()])
		await addButton(w).trigger('click')
		await w.findAll('input')[1].setValue('Cohort cap')
		await w.findAll('input')[1].trigger('focusout')
		expect(lastPersisted(w)).toHaveLength(2)

		// The reload that races the save still reports the old list.
		await w.setProps({ rules: [staffRule()] })

		expect(editors(w)).toHaveLength(2)
		expect(labelOf(w, 1)).toBe('Cohort cap')
	})

	it('does not overwrite a row whose edit has not been committed yet', async () => {
		const w = mountPanel([allEnrolled()])
		await w.findAll('input')[0].setValue('Half typed na')

		await w.setProps({ rules: [allEnrolled()] })

		expect(labelOf(w)).toBe('Half typed na')
	})
})

describe('RulesPanel: a saved new rule is not re-added as a duplicate', () => {
	it('claims the just-saved row when it reloads with a docname', async () => {
		const w = mountPanel([])
		;(w.vm as any).addRule()
		await w.vm.$nextTick()
		await w.find('input').setValue('Cohort cap')
		await w.find('input').trigger('focusout')

		// The row was emitted with no name (a brand-new rule); the backend persists it
		// and the refetch brings the same rule back WITH a docname. Before the fix the
		// panel kept the original `new-N` row too, producing a phantom duplicate.
		const saved = lastPersisted(w)[0]
		await w.setProps({ rules: [{ ...saved, name: 'RMR-NEW' }] })

		expect(w.findAll('input')).toHaveLength(1)
	})
})
