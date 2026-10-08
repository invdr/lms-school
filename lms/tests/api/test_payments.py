from unittest.mock import Mock

import frappe

from lms.lms import payments as payments_module
from lms.lms.test_helpers import BaseTestUtils


class TestPaymentLink(BaseTestUtils):
	"""Checkout writes real billing/payment records and delegates to the external gateway."""

	def setUp(self):
		super().setUp()
		self.controller = Mock(spec=["get_payment_url"])
		self.controller.get_payment_url.return_value = "https://example.test/checkout"
		self.original_get_controller = payments_module.get_controller
		payments_module.get_controller = lambda gateway: self.controller

		self.original_gateway = frappe.db.get_single_value("LMS Settings", "payment_gateway")
		frappe.db.set_single_value("LMS Settings", "payment_gateway", "Razorpay")

		hash = frappe.generate_hash(length=6)
		self.instructor = self._create_user(
			f"payinstr-{hash}@example.com", "Ina", "Instructor", ["Course Creator"]
		)
		self.course = self._create_course(
			title=f"Paid Payments Course {hash}", instructor=self.instructor.email
		)
		self.course.db_set({"paid_course": 1, "course_price": 500, "currency": "INR"}, update_modified=False)

	def tearDown(self):
		payments_module.get_controller = self.original_get_controller
		frappe.db.set_single_value("LMS Settings", "payment_gateway", self.original_gateway)
		super().tearDown()

	def _buy_course(self):
		return payments_module.get_payment_link(
			doctype="LMS Course",
			docname=self.course.name,
			address={
				"billing_name": "Test Buyer",
				"address_line1": "1 Test Street",
				"city": "Test City",
				"country": "India",
				"pincode": "560001",
				"source": "Website",
				"member_consent": 1,
			},
			payment_for_certificate=0,
		)

	def test_checkout_persists_payment_and_delegates_once_to_gateway(self):
		self.assertEqual(self._buy_course(), "https://example.test/checkout")
		self.controller.get_payment_url.assert_called_once()
		request = self.controller.get_payment_url.call_args.kwargs
		self.assertEqual(request["amount"], 500)
		self.assertEqual(request["currency"], "INR")
		self.assertNotIn("order_id", request)
		payment = frappe.get_doc("LMS Payment", request["payment"])
		self.cleanup_items.extend([("Address", payment.address), ("LMS Payment", payment.name)])
		self.assertEqual(payment.amount, 500)
		self.assertEqual(payment.member, frappe.session.user)
		self.assertFalse(payment.payment_received)
