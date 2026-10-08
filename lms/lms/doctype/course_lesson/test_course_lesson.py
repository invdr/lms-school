# Copyright (c) 2021, FOSS United and Contributors
# See license.txt

import unittest
from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, now_datetime

from lms.lms.doctype.course_lesson.course_lesson import (
	UNTITLED_LESSON_TITLE,
	rename_settled_untitled_lessons,
)
from lms.lms.test_helpers import BaseTestUtils


class TestApplyEnforcementFlags(unittest.TestCase):
	def _call(self, *, quiz_done, assignment_done, enforce_quiz, enforce_assignment):
		from lms.lms.doctype.course_lesson.course_lesson import (
			apply_enforcement_flags,
		)

		settings = {
			"enforce_quiz_completion": enforce_quiz,
			"enforce_assignment_completion": enforce_assignment,
		}
		return apply_enforcement_flags(
			quiz_done=quiz_done,
			assignment_done=assignment_done,
			settings=settings,
		)

	def test_both_enforced_passes_through(self):
		self.assertEqual(
			self._call(quiz_done=True, assignment_done=True, enforce_quiz=1, enforce_assignment=1),
			(True, True),
		)
		self.assertEqual(
			self._call(quiz_done=False, assignment_done=True, enforce_quiz=1, enforce_assignment=1),
			(False, True),
		)
		self.assertEqual(
			self._call(quiz_done=True, assignment_done=False, enforce_quiz=1, enforce_assignment=1),
			(True, False),
		)

	def test_quiz_off_returns_true_for_quiz(self):
		self.assertEqual(
			self._call(quiz_done=False, assignment_done=False, enforce_quiz=0, enforce_assignment=1),
			(True, False),
		)

	def test_assignment_off_returns_true_for_assignment(self):
		self.assertEqual(
			self._call(quiz_done=False, assignment_done=False, enforce_quiz=1, enforce_assignment=0),
			(False, True),
		)

	def test_both_off_returns_true_true(self):
		self.assertEqual(
			self._call(quiz_done=False, assignment_done=False, enforce_quiz=0, enforce_assignment=0),
			(True, True),
		)

	def test_missing_settings_keys_treated_as_enforced(self):
		from lms.lms.doctype.course_lesson.course_lesson import (
			apply_enforcement_flags,
		)

		self.assertEqual(
			apply_enforcement_flags(quiz_done=False, assignment_done=True, settings={}),
			(False, True),
		)




class TestServePrivateFileVersionSafe(unittest.TestCase):
	"""serve_resource must not pass `filename=` to a Frappe whose send_private_file
	predates that kwarg (LMS supports frappe>=14). Regression for the student-view 500:
	TypeError: send_private_file() got an unexpected keyword argument 'filename'."""

	def _run(self, stub):
		from lms.lms.doctype.course_lesson import course_lesson

		original = course_lesson.send_private_file
		course_lesson.send_private_file = stub
		try:
			return course_lesson._serve_private_file("/files/x.pdf", "nice.pdf")
		finally:
			course_lesson.send_private_file = original

	def test_old_frappe_without_filename_kwarg(self):
		calls = []

		def old_stub(path):  # pre-filename Frappe: only accepts the path
			calls.append((path,))
			return "sent"

		self.assertEqual(self._run(old_stub), "sent")
		self.assertEqual(calls, [("/files/x.pdf",)])

	def test_new_frappe_passes_filename(self):
		calls = []

		def new_stub(path, filename=None):
			calls.append((path, filename))
			return "sent"

		self.assertEqual(self._run(new_stub), "sent")
		self.assertEqual(calls, [("/files/x.pdf", "nice.pdf")])






class TestRenameSettledUntitledLessons(BaseTestUtils):
	def setUp(self):
		super().setUp()
		# _create_course() defaults instructor="frappe@example.com"; create it so the
		# course's instructor Link resolves on a fresh DB (mirrors TestLMSCourse.setUp).
		self.instructor = self._create_user(
			"frappe@example.com", "Frappe", "Admin", ["Moderator", "Course Creator"]
		)
		self.course = self._create_course(title="Rename Untitled Course")
		self.chapter = self._create_chapter("Rename Chapter", self.course.name)

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def _make_untitled_lesson(self):
		lesson = self._create_lesson(UNTITLED_LESSON_TITLE, self.chapter.name, self.course.name)
		self.assertTrue(lesson.name.endswith(f" {UNTITLED_LESSON_TITLE}"))
		return lesson

	def _retitle(self, lesson, title):
		frappe.db.set_value("Course Lesson", lesson.name, "title", title, update_modified=False)

	def _age_modified(self, name, days):
		frappe.db.set_value(
			"Course Lesson", name, "modified", add_to_date(now_datetime(), days=days), update_modified=False
		)

	def test_settled_lesson_is_renamed(self):
		lesson = self._make_untitled_lesson()
		prefix = lesson.name.split(" ", 1)[0]
		self._retitle(lesson, "Real Title")
		self._age_modified(lesson.name, days=-2)

		rename_settled_untitled_lessons()

		expected = f"{prefix} Real Title"
		self.assertFalse(frappe.db.exists("Course Lesson", lesson.name))
		self.assertTrue(frappe.db.exists("Course Lesson", expected))
		self.cleanup_items.append(("Course Lesson", expected))

	def test_recently_modified_lesson_is_not_renamed(self):
		lesson = self._make_untitled_lesson()
		self._retitle(lesson, "Fresh Edit")

		rename_settled_untitled_lessons()

		self.assertTrue(frappe.db.exists("Course Lesson", lesson.name))

	def test_still_untitled_lesson_is_not_renamed(self):
		lesson = self._make_untitled_lesson()
		self._age_modified(lesson.name, days=-2)

		rename_settled_untitled_lessons()

		self.assertTrue(frappe.db.exists("Course Lesson", lesson.name))

	def test_translated_placeholder_lesson_is_renamed(self):
		translated = "Titre provisoire"
		lang = "fr"
		user = self._create_user("french-author@example.com", "French", "Author", ["LMS Student"])
		frappe.db.set_value("User", user.name, "language", lang)

		lesson = self._create_lesson(translated, self.chapter.name, self.course.name)
		self.assertTrue(lesson.name.endswith(f" {translated}"))
		prefix = lesson.name.split(" ", 1)[0]
		self._retitle(lesson, "Titre Réel")
		self._age_modified(lesson.name, days=-2)

		def fake_translations(target_lang):
			return {UNTITLED_LESSON_TITLE: translated} if target_lang == lang else {}

		with patch("frappe.translate.get_all_translations", side_effect=fake_translations):
			rename_settled_untitled_lessons()

		expected = f"{prefix} Titre Réel"
		self.assertFalse(frappe.db.exists("Course Lesson", lesson.name))
		self.assertTrue(frappe.db.exists("Course Lesson", expected))
		self.cleanup_items.append(("Course Lesson", expected))
