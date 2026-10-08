
import frappe
from frappe.tests.test_api import FrappeAPITestCase

from lms.lms.test_helpers import BaseTestUtils


class TestCourseProgressIDOR(BaseTestUtils, FrappeAPITestCase):
	"""A student must not be able to record progress for another member."""

	def setUp(self):
		super().setUp()
		hash = frappe.generate_hash(length=6)
		self.attacker = self._create_user(f"atk-{hash}@example.com", "At", "Tacker", ["LMS Student"])
		self.victim = self._create_user(f"vic-{hash}@example.com", "Vic", "Tim", ["LMS Student"])
		self.instructor = self._create_user(
			f"pinstr-{hash}@example.com", "Pat", "Instr", ["Course Creator", "Moderator"]
		)
		self.course = self._create_course(title=f"Progress Course {hash}", instructor=self.instructor.email)
		self.chapter = self._create_chapter(f"PChapter {hash}", self.course.name)
		self.lesson = self._create_lesson(f"PLesson {hash}", self.chapter.name, self.course.name)


	def test_student_cannot_insert_progress_for_another_member(self):
		frappe.session.user = self.attacker.email
		try:
			doc = frappe.get_doc(
				{
					"doctype": "LMS Course Progress",
					"member": self.victim.email,
					"course": self.course.name,
					"lesson": self.lesson.name,
					"status": "Complete",
				}
			)
			# ignore_permissions isolates the controller guard from the role-permission layer.
			with self.assertRaises(frappe.PermissionError):
				doc.insert(ignore_permissions=True)
		finally:
			frappe.session.user = "Administrator"

	def test_controller_rebinds_member_to_session_user(self):
		frappe.session.user = self.attacker.email
		try:
			doc = frappe.get_doc(
				{
					"doctype": "LMS Course Progress",
					"member": self.attacker.email,  # own account is allowed
					"course": self.course.name,
					"lesson": self.lesson.name,
					"status": "Complete",
				}
			)
			doc.insert(ignore_permissions=True)
			self.cleanup_items.append(("LMS Course Progress", doc.name))
			self.assertEqual(doc.member, self.attacker.email)
		finally:
			frappe.session.user = "Administrator"
