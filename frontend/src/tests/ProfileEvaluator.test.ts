// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProfileEvaluator from '@/pages/ProfileEvaluator.vue'

const { calls } = vi.hoisted(() => ({ calls: [] as { url: string; params: any }[] }))
const evaluator = 'evaluator@example.com'
vi.stubGlobal('__', (text: string) => text)
vi.mock('frappe-ui', async () => {
	const { createResource } = await import('frappe-ui/src/resources/resources.js')
	return {
		createResource: (options: any) => createResource({
			...options,
			resourceFetcher: async ({ url, params }: any) => {
				calls.push({ url, params: structuredClone(params) })
				if (url.endsWith('get_evaluator_details')) return {
					slots: { schedule: [{ name: 42, day: 'Monday', start_time: '09:00', end_time: '10:00' }] },
				}
				return {}
			},
		}),
		toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
		Button: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
		Badge: { template: '<span><slot /></span>' },
		FormControl: {
			props: ['modelValue', 'type', 'label', 'options', 'id', 'disabled'],
			emits: ['update:modelValue'],
			template: '<input :id="id" :data-type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
	}
})
vi.mock('@/utils', () => ({ convertToTitleCase: (text: string) => text }))

describe('evaluator availability uses ownership-checked endpoints', () => {
	it('routes slot changes and date-picker updates with evaluator identity', async () => {
		calls.length = 0
		const wrapper = mount(ProfileEvaluator, {
			props: { profile: { data: { name: evaluator, username: 'evaluator' } } },
			global: {
				provide: { $user: { data: { name: evaluator, email: evaluator, is_evaluator: true } } },
				mocks: { __: (text: string) => text },
			},
		})
		await flushPromises()
		await wrapper.findAll('[data-type="select"]')[0].setValue('Friday')
		await wrapper.get('[aria-label="Delete slot"]').trigger('click')
		await flushPromises()
		await wrapper.get('#new-slot-start-time').setValue('11:00')
		await wrapper.get('#new-slot-end-time').setValue('12:00')
		await wrapper.findAll('[data-type="select"]')[1].setValue('Tuesday')
		await wrapper.findAll('[data-type="date"]')[0].setValue('2026-08-01')
		await flushPromises()
		const writes = calls.filter(({ url }) => !url.endsWith('get_evaluator_details'))
		expect(writes).toEqual([
			{ url: 'lms.lms.api.update_evaluator_slot', params: { evaluator, slot: 42, fieldname: 'day', value: 'Friday' } },
			{ url: 'lms.lms.api.delete_evaluator_slot', params: { evaluator, slot: 42 } },
			{ url: 'lms.lms.api.add_evaluator_slot', params: { evaluator, day: 'Tuesday', start_time: '11:00', end_time: '12:00' } },
			{ url: 'lms.lms.api.set_evaluator_unavailability', params: { evaluator, fieldname: 'unavailable_from', value: '2026-08-01' } },
		])
		wrapper.unmount()
	})
})
