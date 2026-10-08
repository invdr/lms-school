// @vitest-environment jsdom
// Only explicit field opt-in may expose merchant/payment attachments.
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('frappe-ui', () => ({
	FileUploader: {
		name: 'FileUploader',
		props: ['uploadArgs', 'fileTypes', 'fileType', 'validateFile'],
		template: '<div />',
	},
	Button: { template: '<button><slot /></button>' },
	FormLabel: { props: ['label', 'required'], template: '<label />' },
	toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/utils', () => ({ validateFile: () => undefined }))
vi.mock('@/components/Controls/Link.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/Controls/CodeEditor.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/Controls/BooleanSwitch.vue', () => ({ default: { template: '<div />' } }))

vi.stubGlobal('__', (s: string) => s)

const uploadArgsOf = (wrapper: ReturnType<typeof mount>): unknown =>
	wrapper.findComponent({ name: 'FileUploader' }).props('uploadArgs')

describe('SettingFields leaves privacy to the field', () => {
	const mountFields = async (field: Record<string, unknown>) => {
		const SettingFields = (
			await import('@/components/Settings/SettingFields.vue')
		).default
		return mount(SettingFields, {
			props: {
				sections: [{ columns: [{ fields: [field] }] }],
				data: {},
			},
			global: { mocks: { __: (s: string) => s } },
		})
	}

	it('uploads public only when the field opts in', async () => {
		const w = await mountFields({
			label: 'Meta Image',
			name: 'meta_image',
			type: 'Upload',
			public: true,
		})
		expect(uploadArgsOf(w)).toMatchObject({ private: false })
	})

	it('keeps a gateway attachment private by default', async () => {
		const w = await mountFields({
			label: 'Merchant QR',
			name: 'merchant_qr',
			type: 'Upload',
		})
		expect(uploadArgsOf(w)).toMatchObject({ private: true })
	})
})
