// @vitest-environment jsdom
// Money-sensitive applicable-item changes must reach one document save.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import CouponDetails from '@/components/Settings/Coupons/CouponDetails.vue'

// Replace the document/network boundary; the real editor and child-row component run.
const { setValueSubmit, insertSubmit, reloadMock, toastMock, docHolder } =
	vi.hoisted(() => ({
		setValueSubmit: vi.fn(),
		insertSubmit: vi.fn(),
		reloadMock: vi.fn(),
		toastMock: { success: vi.fn(), error: vi.fn() },
		docHolder: { doc: null as Record<string, unknown> | null },
	}))

vi.mock('frappe-ui', () => ({
	toast: toastMock,
	Button: {
		emits: ['click'],
		template: `<button @click="$emit('click')"><slot name="prefix" /><slot /></button>`,
	},
	FormControl: {
		props: ['modelValue', 'label', 'type', 'disabled', 'required'],
		emits: ['update:modelValue', 'input'],
		template: `<input
			:data-testid="'fc-' + label"
			:value="modelValue"
			@input="$emit('update:modelValue', $event.target.value)"
		/>`,
	},
	createDocumentResource: () => ({
		doc: docHolder.doc,
		setValue: { submit: setValueSubmit },
		reload: vi.fn(),
	}),
}))

vi.mock('@/components/Controls/BooleanSwitch.vue', () => ({
	default: {
		props: ['modelValue', 'label', 'size', 'description'],
		emits: ['update:modelValue'],
		template: `<button data-testid="switch" @click="$emit('update:modelValue', !modelValue)" />`,
	},
}))

vi.mock('@/components/Controls/Select.vue', () => ({
	default: {
		props: ['modelValue', 'options', 'label', 'required'],
		emits: ['update:modelValue'],
		template: `<select
			:data-testid="'select-' + (label || 'doctype')"
			:value="modelValue"
			@change="$emit('update:modelValue', $event.target.value)"
		><option /></select>`,
	},
}))

vi.mock('@/components/Controls/Link.vue', () => ({
	default: {
		props: ['doctype', 'modelValue'],
		emits: ['update:modelValue'],
		template: `<input
			:data-testid="'link-' + (modelValue ?? 'empty')"
			:value="modelValue"
			@input="$emit('update:modelValue', $event.target.value)"
		/>`,
	},
}))

vi.mock('@/components/Layouts/SettingsLayout.vue', () => ({
	default: { template: `<div><slot name="header-actions" /><slot /></div>` },
}))

vi.mock('lucide-vue-next', () => ({
	Plus: { template: '<i />' },
	X: { template: '<i />' },
}))

vi.stubGlobal('__', (s: string) => s)

const seedDoc = () =>
	reactive({
		name: 'WELCOME11',
		code: 'WELCOME11',
		enabled: true,
		discount_type: 'Fixed Amount',
		fixed_amount_discount: 0,
		usage_limit: 2,
		redemption_count: 0,
		expires_on: '2026-06-30',
		applicable_items: [
			{
				name: 'item-1',
				reference_doctype: 'LMS Course',
				reference_name: 'ABCE',
				parent: 'WELCOME11',
				parenttype: 'LMS Coupon',
				parentfield: 'applicable_items',
			},
		],
	})

const mountEditor = async () => {
	const wrapper = mount(CouponDetails, {
		props: {
			data: { name: 'WELCOME11' },
			coupons: {
				insert: { submit: insertSubmit },
				setValue: { submit: vi.fn() },
				reload: reloadMock,
				update: () => {},
				data: [],
			},
		} as never,
		global: { mocks: { __: (s: string) => s } },
	})
	await flushPromises()
	return wrapper
}

const clickSave = async (w: VueWrapper) => {
	const save = w.findAll('button').find((b) => b.text().trim() === 'Save')
	if (!save) throw new Error('Save button not found')
	await save.trigger('click')
	await flushPromises()
}

const clickAddRow = async (w: VueWrapper) => {
	const add = w.findAll('button').find((b) => b.text().includes('Add Row'))
	if (!add) throw new Error('Add Row button not found')
	await add.trigger('click')
	await flushPromises()
}

const savedItems = () => setValueSubmit.mock.calls[0][0].applicable_items

beforeEach(() => {
	setValueSubmit.mockReset()
	insertSubmit.mockReset()
	reloadMock.mockReset()
	toastMock.success.mockReset()
	toastMock.error.mockReset()
	docHolder.doc = seedDoc()
})

describe('coupon editor: saving applicable items', () => {
	it('persists an in-place edit of an existing row in the single save', async () => {
		const w = await mountEditor()
		await w.get('[data-testid="link-ABCE"]').setValue('ABCD')
		await clickAddRow(w)
		await w.get('[data-testid="link-empty"]').setValue('NEW-COURSE')
		await clickSave(w)

		expect(setValueSubmit).toHaveBeenCalledTimes(1)
		expect(savedItems()).toEqual([
			{
				name: 'item-1',
				reference_doctype: 'LMS Course',
				reference_name: 'ABCD',
				parent: 'WELCOME11',
				parenttype: 'LMS Coupon',
				parentfield: 'applicable_items',
			},
			expect.objectContaining({ reference_doctype: 'LMS Course', reference_name: 'NEW-COURSE' }),
		])
	})

})
