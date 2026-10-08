import frappe

from lms.lms.email_account import create_email_account
from lms.lms.test_helpers import BaseTestUtils


class TestEmailAccountAccess(BaseTestUtils):
	def setUp(self):
		super().setUp()
		self.original_user = frappe.session.user
		frappe.set_user("Administrator")
		self.student = self._create_user("email-guard@example.test", "Email", "Guard", ["LMS Student"])

	def tearDown(self):
		frappe.set_user("Administrator")
		try:
			super().tearDown()
		finally:
			frappe.set_user(self.original_user)

	def test_guest_and_student_cannot_provision_email_account(self):
		before = frappe.db.count("Email Account")
		for user in ("Guest", self.student.name):
			with self.subTest(user=user):
				frappe.set_user(user)
				with self.assertRaises(frappe.PermissionError):
					create_email_account({"service": "GMail", "email_id": "test@example.test"})
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("Email Account"), before)
