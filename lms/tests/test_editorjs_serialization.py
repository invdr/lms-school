"""EditorJS JSON must survive Frappe's second, Text-field sanitization pass."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.model.base_document import BaseDocument

from lms.lms.utils import sanitize_editorjs


class TestEditorJSSerialization(unittest.TestCase):
	def round_trip(self, text):
		serialized = sanitize_editorjs(json.dumps({"blocks": [{"type": "paragraph", "data": {"text": text}}]}))
		self.assertNotIn("<", serialized)
		self.assertNotIn(">", serialized)
		values = {"content": serialized}
		# Run the actual framework pass without requiring a database or DocType.
		document = SimpleNamespace(
			get_valid_dict=lambda **kwargs: values.copy(),
			meta=SimpleNamespace(get_field=lambda name: frappe._dict(fieldtype="Text")),
			docstatus=SimpleNamespace(is_cancelled=lambda: False, is_submitted=lambda: False),
			set=lambda name, value: values.__setitem__(name, value),
		)
		with patch.object(frappe, "flags", frappe._dict(in_install=False)):
			BaseDocument._sanitize_content(document)
		return json.loads(values["content"])["blocks"][0]["data"]["text"]

	def test_russian_link_and_arabic_span_survive(self):
		text = '<a href="https://example.com/lesson">Урок</a> <span dir="rtl" lang="ar">بَ</span>'
		result = self.round_trip(text)
		self.assertIn('href="https://example.com/lesson"', result)
		self.assertIn("Урок", result)
		self.assertIn("بَ", result)
		self.assertIn('dir="rtl"', result)

	def test_nested_html_is_still_sanitized(self):
		result = self.round_trip('<img src="x" onerror="alert(1)"><script>alert(2)</script>')
		self.assertNotIn("onerror", result)
		self.assertNotIn("<script", result)

	def test_double_pass_keeps_the_same_content(self):
		raw = json.dumps({
			"blocks": [{"type": "paragraph", "data": {"text": '<a href="https://example.com">سَلَام</a>'}}]
		})
		once = sanitize_editorjs(raw)
		self.assertEqual(json.loads(sanitize_editorjs(once)), json.loads(once))

	def test_dangerous_link_is_not_restored_by_json_decoding(self):
		result = self.round_trip('<a href="javascript:alert(1)">unsafe</a>')
		self.assertNotIn("javascript:", result.lower())

	def test_non_json_content_keeps_existing_fallback(self):
		for raw in (None, "", "plain text", "<p>legacy HTML</p>"):
			self.assertEqual(sanitize_editorjs(raw), raw)


if __name__ == "__main__":
	unittest.main()
