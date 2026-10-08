// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ChapterModal from '@/components/Modals/ChapterModal.vue'

interface SubmitOptions {
	makeParams?: () => Record<string, unknown>
	validate?: () => string | undefined
	onSuccess?: (data: unknown) => void
	onError?: (error: unknown) => void
}

interface DialogAction {
	label: string
	onClick: (ctx: { close: () => void }) => Promise<void>
}

const { toastMock, closeMock, resourceCall, updateOnboardingStepMock } =
	vi.hoisted(() => ({
		toastMock: { success: vi.fn(), error: vi.fn() },
		closeMock: vi.fn(),
		resourceCall: vi.fn(),
		updateOnboardingStepMock: vi.fn(),
	}))

vi.mock('frappe-ui', async () => {
	const { createResource } = await import('frappe-ui/src/resources/resources.js')
	return {
		toast: toastMock,
		createResource: (options: SubmitOptions) => createResource({
			...options, resourceFetcher: ({ params }: any) => resourceCall(params),
		}),
		Dialog: {
			name: 'Dialog',
			props: ['open', 'title', 'actions'],
			setup() {
				return { closeMock }
			},
			template: `
				<div v-if="open">
					<slot />
					<button
						v-for="a in actions"
						:key="a.label"
						:data-testid="'action-' + a.label"
						@click="a.onClick({ close: closeMock })"
					>{{ a.label }}</button>
				</div>
			`,
		},
		FormControl: {
			props: ['modelValue', 'label'],
			emits: ['update:modelValue'],
			template: `
				<input
					data-testid="field-title"
					:value="modelValue"
					@input="$emit('update:modelValue', $event.target.value)"
				/>
			`,
		},
		FileUploader: { template: '<div />' },
		Button: { template: '<button><slot /></button>' },
	}
})

vi.mock('frappe-ui/frappe', () => ({
	useOnboarding: () => ({ updateOnboardingStep: updateOnboardingStepMock }),
	useTelemetry: () => ({ capture: vi.fn() }),
}))

vi.mock('@/components/Controls/BooleanSwitch.vue', () => ({
	default: {
		props: ['modelValue', 'label', 'size', 'description'],
		emits: ['update:modelValue'],
		template: `
			<button
				data-testid="scorm-toggle"
				@click="$emit('update:modelValue', modelValue ? 0 : 1)"
			/>
		`,
	},
}))

vi.mock('@/utils/', () => ({ getFileSize: () => '1 KB' }))

vi.stubGlobal('__', (s: string) => s)

const mountModal = (
	props: Record<string, unknown> = {},
	isSystemManager = false
) =>
	mount(ChapterModal, {
		props: { modelValue: true, course: 'course-1', ...props },
		global: {
			provide: { $user: { data: { is_system_manager: isSystemManager } } },
			mocks: { __: (s: string) => s },
		},
	})

type Wrapper = ReturnType<typeof mountModal>

// Drive the Dialog action the way the real Dialog does: await the handler, the
// way Dialog.vue's `await action.onClick(ctx)` wrapper does.
const clickAction = (w: Wrapper, label: string): Promise<void> => {
	const actions = w
		.findComponent({ name: 'Dialog' })
		.props('actions') as DialogAction[]
	const action = actions.find((a) => a.label === label)
	if (!action) throw new Error(`No dialog action labelled ${label}`)
	return action.onClick({ close: closeMock })
}

beforeEach(() => {
	toastMock.success.mockReset()
	toastMock.error.mockReset()
	closeMock.mockReset()
	resourceCall.mockReset()
	resourceCall.mockResolvedValue({ name: 'chapter-1' })
	updateOnboardingStepMock.mockReset()
})

describe('ChapterModal — payload', () => {
	it('sends the chapter name on edit, so upsert updates instead of inserting', async () => {
		const w = mountModal()
		await w.setProps({
			chapterDetail: { name: 'chapter-1', title: 'Module 1' },
		})
		await flushPromises()

		await clickAction(w, 'Edit')

		expect(resourceCall).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'chapter-1',
				title: 'Module 1',
				course: 'course-1',
			})
		)
	})

	it('posts an object when the SCORM File row is gone and only a docname survives', async () => {
		const w = mountModal()
		await w.setProps({
			chapterDetail: {
				name: 'chapter-1',
				title: 'Module 1',
				is_scorm_package: 1,
				// build_outline leaves the raw docname when the File is deleted.
				scorm_package: 'orphaned-file-docname',
			},
		})
		await flushPromises()

		await clickAction(w, 'Edit')

		// upsert_chapter does frappe._dict(scorm_package or {}) — a string is a
		// ValueError, i.e. a 500 that makes the chapter unrenameable.
		const [payload] = resourceCall.mock.calls[0] as [Record<string, unknown>]
		expect(payload.scorm_package).toEqual({
			name: 'orphaned-file-docname',
			file_name: 'orphaned-file-docname',
		})
	})
})
