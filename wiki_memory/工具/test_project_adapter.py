"""Regression checks for Mysimple's read-only legacy metadata adapter.

Run with: python -m unittest discover -s wiki_memory/工具 -p test_*.py
The upstream memory tool's general-purpose suite is outside this project's scope.
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


TOOL = Path(__file__).with_name("memory.py")
SPEC = importlib.util.spec_from_file_location("mysimple_memory_adapter", TOOL)
memory = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = memory
SPEC.loader.exec_module(memory)


def legacy_log(category="工程维护", timestamp="2026-10-30 19:20:00"):
    return (
        "# 第001次\r\n\r\n"
        f"- 时间：{timestamp}（北京时间）\r\n"
        f"- 对话类型：{category}\r\n"
        "- 主题标签：迁移、历史保全\r\n"
        "- 源自原轮次：无\r\n"
        "- 本轮目标：核实历史资料，不推断任务已完成\r\n"
        "\r\n## 测试与验证\r\n\r\n未运行产品测试。\r\n"
    )


class LegacyAdapterTests(unittest.TestCase):
    def metadata_errors(self, page):
        with tempfile.TemporaryDirectory(prefix="mysimple-memory-test-") as directory:
            project = Path(directory)
            root = project / "wiki_memory"
            root.mkdir()
            errors, _ = memory.inspect(
                project, root, [page], date(2026, 10, 30), 90,
                metadata_only=True, config_bytes=None,
            )
            return errors

    def test_numbered_logs_read_explicit_category_and_preserve_bytes(self):
        for kind, category in memory.LOG_CATEGORIES.items():
            with self.subTest(category=category):
                path = Path("日志") / category / "第001次.md"
                text = legacy_log(category)
                page = memory.parse_page(path, text)
                self.assertEqual(page.fields["type"], "log")
                self.assertEqual(page.fields["status"], "archived")
                self.assertEqual(page.fields["kind"], kind)
                self.assertEqual(page.fields["updated"], "2026-10-30")
                self.assertEqual(page.fields["timestamp"], "2026-10-30 19:20:00")
                self.assertEqual(page.fields["topic"], path.with_suffix("").as_posix())
                self.assertNotIn("task_status", page.fields)
                self.assertEqual(page.body, text)
                self.assertEqual(page.original, text.encode("utf-8"))
                self.assertEqual(self.metadata_errors(page), [])

    def test_real_numbered_log_corpus_passes_metadata_checks_unchanged(self):
        root = TOOL.parents[1]
        paths = sorted((root / "日志").rglob("第*次.md"))
        self.assertTrue(paths, "the migrated historical log corpus must remain available")
        pages = []
        for path in paths:
            with self.subTest(path=path.relative_to(root)):
                original = path.read_bytes()
                page = memory.parse_page(path.relative_to(root), original.decode("utf-8"))
                self.assertEqual(page.fields["type"], "log")
                self.assertEqual(page.fields["status"], "archived")
                self.assertEqual(page.original, original)
                self.assertEqual(page.fields["topic"], path.relative_to(root).with_suffix("").as_posix())
                pages.append(page)
        with tempfile.TemporaryDirectory(prefix="mysimple-memory-test-") as directory:
            project = Path(directory)
            errors, _ = memory.inspect(
                project, project / "wiki_memory", pages, date(2026, 10, 30), 90,
                metadata_only=True, config_bytes=None,
            )
        self.assertEqual(errors, [])

    def test_original_unprefixed_log_fields_are_supported(self):
        text = legacy_log("功能添加").replace("- ", "")
        page = memory.parse_page(Path("日志/功能添加/第001次.md"), text)
        self.assertEqual(page.fields["kind"], "feature")
        self.assertEqual(page.fields["updated"], "2026-10-30")
        self.assertEqual(self.metadata_errors(page), [])
        self.assertEqual(page.original, text.encode("utf-8"))
        self.assertIn("核实历史资料，不推断任务已完成", memory.log_table_link(page))

    def test_body_examples_cannot_override_recorded_metadata(self):
        text = legacy_log() + "\r\n- 时间：2020-01-01 00:00:00\r\n- 对话类型：Bug处理\r\n"
        page = memory.parse_page(Path("日志/工程维护/第001次.md"), text)
        self.assertEqual(page.fields["kind"], "maintenance")
        self.assertEqual(page.fields["updated"], "2026-10-30")
        self.assertEqual(page.original, text.encode("utf-8"))

    def test_missing_or_unknown_category_is_rejected_not_guessed_from_folder(self):
        path = Path("日志/工程维护/第001次.md")
        for category in ("", "其他"):
            with self.subTest(category=category):
                page = memory.parse_page(path, legacy_log(category))
                self.assertEqual(page.fields["kind"], "")
                self.assertTrue(any("log kind" in error for error in self.metadata_errors(page)))

    def test_duplicate_header_fields_are_rejected_in_both_historical_styles(self):
        for prefix in ("", "- "):
            with self.subTest(prefix=prefix):
                text = legacy_log().replace("\r\n## 测试与验证", f"\r\n{prefix}对话类型：Bug处理\r\n## 测试与验证")
                page = memory.parse_page(Path("日志/工程维护/第001次.md"), text)
                self.assertTrue(any("duplicate log field" in error for error in self.metadata_errors(page)))
                self.assertEqual(page.original, text.encode("utf-8"))

    def test_invalid_clock_time_is_rejected_even_when_calendar_date_is_valid(self):
        for clock in ("24:00:00", "19:60:00", "19:20:60"):
            with self.subTest(clock=clock):
                page = memory.parse_page(Path("日志/工程维护/第001次.md"), legacy_log(timestamp="2026-10-30 " + clock))
                self.assertTrue(any("invalid log timestamp" in error for error in self.metadata_errors(page)))

    def test_missing_or_invalid_calendar_date_is_rejected(self):
        path = Path("日志/工程维护/第001次.md")
        for timestamp in ("", "昨天", "2026-02-30 19:20:00", "2026-13-01 19:20:00"):
            with self.subTest(timestamp=timestamp):
                page = memory.parse_page(path, legacy_log(timestamp=timestamp))
                self.assertTrue(any("date" in error for error in self.metadata_errors(page)))

    def test_plain_non_log_markdown_does_not_receive_legacy_metadata(self):
        for path in (Path("知识/第001次.md"), Path("README.md"), Path("日志/笔记.md")):
            with self.subTest(path=path):
                page = memory.parse_page(path, legacy_log())
                self.assertEqual(page.fields, {})

    def test_legacy_page_types_are_normalized_only_in_memory(self):
        for old_type, new_type in (("adr", "decision"), ("topic", "knowledge"), ("procedure", "knowledge")):
            with self.subTest(old_type=old_type):
                text = (
                    f"---\r\ntype: {old_type}\r\nstatus: accepted\r\n"
                    "updated: 2026-10-30\r\n---\r\n\r\n# 既有决定\r\n\r\n历史结论。\r\n"
                )
                path = Path("决策/ADR-001.md")
                page = memory.parse_page(path, text)
                self.assertEqual(page.fields["type"], new_type)
                self.assertEqual(page.fields["status"], "active")
                self.assertEqual(page.fields["topic"], "决策/ADR-001")
                self.assertEqual(page.original, text.encode("utf-8"))
                self.assertIn("历史结论。", page.body)

    def test_superseded_adr_and_existing_topic_are_retained(self):
        text = (
            "---\ntype: adr\nstatus: superseded\nupdated: 2026-10-30\n"
            "topic: storage\nsuperseded_by: ADR-003\n---\n\n# 旧决定\n"
        )
        page = memory.parse_page(Path("决策/ADR-002.md"), text)
        self.assertEqual(page.fields["status"], "superseded")
        self.assertEqual(page.fields["topic"], "storage")
        self.assertEqual(page.fields["superseded_by"], "ADR-003")
        self.assertEqual(page.original, text.encode("utf-8"))

    def test_standard_frontmatter_is_not_overridden_by_body_fields(self):
        text = (
            "---\r\ntype: log\r\nstatus: archived\r\nupdated: 2026-10-29\r\n"
            "topic: explicit-topic\r\nkind: bug\r\ntask_status: blocked\r\n---\r\n\r\n"
            + legacy_log()
        )
        page = memory.parse_page(Path("日志/工程维护/第001次.md"), text)
        self.assertEqual(page.fields, {
            "type": "log", "status": "archived", "updated": "2026-10-29",
            "topic": "explicit-topic", "kind": "bug", "task_status": "blocked",
        })
        self.assertEqual(page.original, text.encode("utf-8"))

    def test_index_uses_recorded_timestamp_and_objective_without_claiming_success(self):
        early = memory.parse_page(
            Path("日志/工程维护/第001次.md"), legacy_log(timestamp="2026-10-30 09:00:00"),
        )
        late = memory.parse_page(
            Path("日志/Bug处理/第001次.md"), legacy_log("Bug处理", "2026-10-30 20:00:00"),
        )
        table = memory.index_contents([early, late])[memory.LOG_INDEX]
        self.assertLess(table.index("| bug |"), table.index("| maintenance |"))
        self.assertIn("核实历史资料，不推断任务已完成", table)
        self.assertEqual(table.count("未记录"), 2)


if __name__ == "__main__":
    unittest.main()
