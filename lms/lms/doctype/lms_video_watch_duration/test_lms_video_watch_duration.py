# Copyright (c) 2025, Frappe and Contributors
# See license.txt

import frappe
from frappe.tests import UnitTestCase


class UnitTestLMSVideoWatchDuration(UnitTestCase):
	"""Schema-level tests for LMS Video Watch Duration (no fixtures required)."""

	def test_lookup_index_exists(self):
		"""The (member, lesson, source) lookup in track_video_watch_duration
		must be index-backed; guards against the index being dropped."""
		self.assertTrue(frappe.db.has_index("tabLMS Video Watch Duration", "member_lesson_source_index"))
