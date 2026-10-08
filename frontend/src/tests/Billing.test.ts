// @vitest-environment jsdom
/** Billing.vue: India state validation and checkout error surfacing. */
// A case-sensitive state whitelist that also omitted every union territory
// rejected "GUJARAT", and the rejection reached the user as an empty toast
// (toast.error was handed the raw Error), so the button looked dead.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import Billing from '@/pages/Billing.vue'

type BillingAddress = Record<string, unknown>
type SubmittedCall = { url: string; params: { address: BillingAddress } }

const { toastMock, submitted } = vi.hoisted(() => ({
	toastMock: { success: vi.fn(), error: vi.fn() },
	submitted: [] as SubmittedCall[],
}))

const ACCESS_URL = 'lms.lms.api.validate_billing_access'
const SUMMARY_URL = 'lms.lms.utils.get_order_summary'
const PAYMENT_URL = 'lms.lms.payments.get_payment_link'

let addressFixture: Record<string, unknown> | null = null

const FIELD_META = {
	billing_name: { reqd: 1 },
	address_line1: { reqd: 1 },
	city: { reqd: 1 },
	state: { reqd: 0 },
	country: { reqd: 1, default: 'India' },
	pincode: { reqd: 0 },
	phone: { reqd: 0 },
	source: { reqd: 0 },
	gstin: { reqd: 0 },
	pan: { reqd: 0 },
}

const SUMMARY = {
	title: 'Batch',
	original_amount_formatted: '₹ 2,000',
	gst_amount_formatted: '₹ 360',
	total_amount_formatted: '₹ 2,360',
	total_amount: 2360,
	gst_applied: 360,
}

vi.mock('frappe-ui', async () => {
	const { createResource } = await import('frappe-ui/src/resources/resources.js')
	return {
		toast: toastMock,
		call: vi.fn(),
		usePageMeta: vi.fn(),
		createResource: (options: any) => createResource({
			...options,
			resourceFetcher: async ({ url, params }: any) => {
				submitted.push({ url, params: JSON.parse(JSON.stringify(params)) })
				if (url === ACCESS_URL) return { access: true, address: addressFixture, billing_field_meta: FIELD_META }
				if (url === SUMMARY_URL) return SUMMARY
				return '#checkout'
			},
		}),
		Breadcrumbs: { template: '<div />' },
		Button: {
			emits: ['click'],
			template: `<button @click="$emit('click')"><slot /></button>`,
		},
		FormControl: {
			props: [
				'modelValue',
				'label',
				'type',
				'required',
				'disabled',
				'placeholder',
			],
			emits: ['update:modelValue', 'input'],
			template: `<input
				:data-testid="'fc-' + label"
				:type="type || 'text'"
				:value="modelValue"
				@change="$emit('update:modelValue', type === 'checkbox' ? $event.target.checked : $event.target.value)"
			/>`,
		},
		Combobox: {
			props: ['modelValue', 'options', 'label', 'required', 'placeholder'],
			emits: ['update:modelValue'],
			template: `<select
				:data-testid="'combobox-' + label"
				:value="modelValue"
				@change="$emit('update:modelValue', $event.target.value)"
			>
				<option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
			</select>`,
		},
	}
})

vi.mock('frappe-ui/frappe', () => ({
	useTelemetry: () => ({ capture: vi.fn() }),
}))
vi.mock('@/stores/session', () => ({
	sessionStore: () => ({ brand: { favicon: '' } }),
}))
vi.mock('@/components/NotPermitted.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/components/Controls/Link.vue', () => ({
	default: {
		props: ['value', 'doctype', 'label', 'required'],
		emits: ['change'],
		template: `<select
			:data-testid="'link-' + label"
			:value="value"
			@change="$emit('change', $event.target.value)"
		/>`,
	},
}))
vi.mock('@/utils/basePath', () => ({ getLmsRoute: (r: string) => `/lms/${r}` }))

vi.stubGlobal('__', (s: string) => s)

const address = (over: Record<string, unknown> = {}) => ({
	billing_name: 'Channeltech Systems Pvt Ltd',
	address_line1: 'Best Paper Mill Compound',
	address_line2: '',
	city: 'Vapi',
	state: 'Gujarat',
	country: 'India',
	pincode: '396195',
	phone: '9974447180',
	...over,
})

const mountBilling = async (over: Record<string, unknown> = {}) => {
	addressFixture = address(over)
	const wrapper = mount(Billing, {
		props: { type: 'batch', name: 'BATCH-01' },
		global: {
			provide: { $user: { data: { name: 'a@b.c' } } },
			mocks: { __: (s: string) => s },
			stubs: { RouterLink: true },
		},
	})
	await flushPromises()
	return wrapper
}

const consent = async (wrapper: VueWrapper) => {
	const box = wrapper
		.findAll('input[type="checkbox"]')
		.find((i) => i.attributes('data-testid')?.includes('consent'))
	if (!box) throw new Error('consent checkbox not rendered')
	await box.setValue(true)
}

const proceed = async (wrapper: VueWrapper) => {
	const button = wrapper
		.findAll('button')
		.find((b) => b.text().includes('Proceed to Payment'))
	if (!button) throw new Error('checkout button not rendered')
	await button.trigger('click')
	await flushPromises()
}

const checkout = () => submitted.find((s) => s.url === PAYMENT_URL)

const checkoutAddress = () => {
	const call = checkout()
	if (!call) throw new Error('checkout was never submitted')
	return call.params.address
}

describe('Billing: India state field', () => {
	beforeEach(() => {
		submitted.length = 0
		vi.clearAllMocks()
	})

	it('canonicalises an all-caps saved state so checkout proceeds', async () => {
		const wrapper = await mountBilling({ state: 'GUJARAT' })
		await consent(wrapper)
		await proceed(wrapper)

		expect(toastMock.error).not.toHaveBeenCalled()
		expect(checkout()).toBeTruthy()
		expect(checkoutAddress().state).toBe('Gujarat')
	})

	it('still blocks a state that is not a real one', async () => {
		const wrapper = await mountBilling({ state: 'Gujrat' })
		await consent(wrapper)
		await proceed(wrapper)

		expect(checkout()).toBeFalsy()
		expect(toastMock.error).toHaveBeenCalled()
	})

})
