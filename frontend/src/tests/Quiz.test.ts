// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Quiz from '@/components/Quiz.vue'

const resourceState = vi.hoisted(() => ({
	request: vi.fn(),
	response: null as any,
}))

vi.mock('frappe-ui', async () => {
	const { createResource: realResource } = await import('frappe-ui/src/resources/resources.js')
	const createResource = (options: any) => realResource({
		...options,
		resourceFetcher: async ({ url, params }: any) => {
			resourceState.request(url, params)
			return structuredClone(resourceState.response)
		},
	})

	const empty = { template: '<div><slot /></div>' }

	return {
		createResource,
		call: vi.fn(),
		toast: { warning: vi.fn(), error: vi.fn() },
		Button: {
			emits: ['click'],
			template: `<button @click="$emit('click')"><slot /></button>`,
		},
		Badge: empty,
		Checkbox: empty,
		Dialog: {
			props: ['open'],
			template: '<div v-if="open"><slot /></div>',
		},
		FormControl: empty,
		ListView: empty,
		LoadingIndicator: empty,
		TextEditor: empty,
	}
})

vi.mock('@/components/ProgressBar.vue', () => ({
	default: { template: '<div />' },
}))

vi.stubGlobal('__', (value: string) => value)

// `String.format` is supplied by Frappe in the browser runtime.
String.prototype.format = function (...args: unknown[]) {
	return this.replace(/\{(\d+)\}/g, (_match: string, index: number) =>
		String(args[index]),
	)
}

const quizResponse = () => ({
	quiz: {
		name: 'QUIZ-1',
		title: 'Quiz cache regression',
		duration: 0,
		passing_percentage: 70,
		shuffle_questions: 0,
		show_answers: 0,
		show_submission_history: 0,
		questions: [
			{ question: 'Q1', marks: 1 },
			{ question: 'DELETED', marks: 1 },
		],
	},
	questions_by_name: {
		Q1: {
			name: 'Q1',
			question: 'Visible question body',
			type: 'Choices',
			multiple: 0,
			option_1: 'Correct answer',
			is_correct_1: 1,
		},
	},
})

const mountQuiz = () =>
	mount(Quiz, {
		props: { quizName: 'QUIZ-1' },
		global: {
			provide: { $user: { data: { name: 'learner@example.com' } } },
			mocks: { __: (value: string) => value },
		},
	})

beforeEach(() => {
	resourceState.request.mockReset()
	resourceState.response = quizResponse()
	localStorage.clear()
})

describe('Quiz remount', () => {
	it('starts the remaining question after reopening the same quiz', async () => {
		const first = mountQuiz()
		await flushPromises()

		first.unmount()

		const second = mountQuiz()
		await flushPromises()

		const start = second
			.findAll('button')
			.find((button) => button.text() === 'Start')
		expect(start).toBeDefined()
		await start!.trigger('click')
		await flushPromises()

		expect(second.text()).toContain('Visible question body')
		expect((second.vm as any).questions).toEqual([{ question: 'Q1', marks: 1 }])
		second.unmount()
	})
})
