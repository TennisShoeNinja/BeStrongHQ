"""Tests for the GDrive sync layer — dedup, force flag, multi-program resync."""

from __future__ import annotations

from unittest.mock import patch

import openpyxl
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from bestrong.gdrive import sync as sync_module
from bestrong.gdrive.sync import (
    _latest_import,
    _needs_import,
    _record_import,
    sync_folder,
)
from bestrong.models.orm import (
    Athlete,
    Base,
    GDriveImport,
    Program,
    Session as SessionRow,
)
from bestrong.parser.adapters import (
    AthleteInfo,
    BaseAdapter,
    ExerciseRow,
    ProgramData,
    SessionData,
    SessionInfo,
    _registry,
)
from bestrong.services import _write_many, import_file


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine)
    session = factory()
    yield session
    session.close()


def _make_program_data(
    athlete_name: str,
    program_number: int,
    weight_lbs: float,
) -> ProgramData:
    """Synthetic ProgramData for a single block, one session, one exercise."""
    return ProgramData(
        athlete=AthleteInfo(name=athlete_name),
        program_name=f"Block {program_number}",
        program_number=program_number,
        date_start="01/01/26",
        date_end="01/28/26",
        sessions=[
            SessionData(
                info=SessionInfo(
                    week_number=1,
                    day_number=1,
                    day_name="Monday",
                ),
                exercises=[
                    ExerciseRow(
                        exercise_name="Squat",
                        exercise_order=1,
                        exercise_group=1,
                        set_type="top",
                        lift_category="squat",
                        sets=1,
                        reps=5,
                        weight_lbs=weight_lbs,
                    ),
                ],
            ),
        ],
    )


class TestLatestImport:
    """Per-file dedup picks the freshest gdrive_imports row."""

    def test_returns_none_when_no_row(self, db):
        assert _latest_import(db, "fake-id") is None

    def test_returns_only_row_when_unique(self, db):
        row = GDriveImport(
            gdrive_file_id="file-1",
            gdrive_file_name="program.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
        )
        db.add(row)
        db.commit()

        result = _latest_import(db, "file-1")
        assert result is not None
        assert result.gdrive_modified_time == "2026-05-01T00:00:00Z"

    def test_returns_only_matching_file_id(self, db):
        """Multiple files in the table — _latest_import scopes by file_id."""
        db.add_all([
            GDriveImport(
                gdrive_file_id="file-a",
                gdrive_file_name="a.xlsx",
                gdrive_modified_time="2026-04-01T00:00:00Z",
                status="success",
            ),
            GDriveImport(
                gdrive_file_id="file-b",
                gdrive_file_name="b.xlsx",
                gdrive_modified_time="2026-05-01T00:00:00Z",
                status="success",
            ),
        ])
        db.commit()

        result = _latest_import(db, "file-a")
        assert result is not None
        assert result.gdrive_file_id == "file-a"


class TestNeedsImport:
    def test_new_file_needs_import(self, db):
        assert _needs_import(db, "new-id", "2026-05-01T00:00:00Z") is True

    def test_unchanged_skips(self, db):
        db.add(GDriveImport(
            gdrive_file_id="file-1",
            gdrive_file_name="program.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
        ))
        db.commit()
        assert _needs_import(db, "file-1", "2026-05-01T00:00:00Z") is False

    def test_modified_time_change_triggers_import(self, db):
        db.add(GDriveImport(
            gdrive_file_id="file-1",
            gdrive_file_name="program.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
        ))
        db.commit()
        assert _needs_import(db, "file-1", "2026-05-02T00:00:00Z") is True

    def test_prior_error_retries(self, db):
        db.add(GDriveImport(
            gdrive_file_id="file-1",
            gdrive_file_name="program.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="error",
            error_message="transient",
        ))
        db.commit()
        assert _needs_import(db, "file-1", "2026-05-01T00:00:00Z") is True


class TestRecordImport:
    def test_inserts_when_missing(self, db):
        _record_import(
            db, "file-1", "program.xlsx", "2026-05-01T00:00:00Z",
            program_id=42, status="success",
        )
        db.commit()
        rows = db.query(GDriveImport).filter(
            GDriveImport.gdrive_file_id == "file-1"
        ).all()
        assert len(rows) == 1
        assert rows[0].program_id == 42

    def test_upserts_when_present(self, db):
        db.add(GDriveImport(
            gdrive_file_id="file-1",
            gdrive_file_name="old.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
            program_id=1,
        ))
        db.commit()

        _record_import(
            db, "file-1", "new.xlsx", "2026-05-02T00:00:00Z",
            program_id=2, status="success",
        )
        db.commit()
        rows = db.query(GDriveImport).filter(
            GDriveImport.gdrive_file_id == "file-1"
        ).all()
        assert len(rows) == 1
        assert rows[0].gdrive_file_name == "new.xlsx"
        assert rows[0].gdrive_modified_time == "2026-05-02T00:00:00Z"
        assert rows[0].program_id == 2


class TestWriteManyHeadline:
    """_write_many picks the targeted program as the headline when it can."""

    def test_default_headline_is_last_block(self, db):
        program_list = [
            _make_program_data("Theo", 1, 100),
            _make_program_data("Theo", 2, 110),
            _make_program_data("Theo", 3, 120),
        ]
        result = _write_many(
            db, program_list,
            source_filename="theo.xlsx",
            athlete_name="Theo",
            candidate_name="theo.xlsx",
        )
        db.commit()

        # All three blocks landed.
        assert len(result["program_ids"]) == 3
        # Headline = last block (program_number=3).
        headline_program = db.query(Program).filter(
            Program.id == result["program_id"]
        ).first()
        assert headline_program.program_number == 3

    def test_targeted_program_id_promotes_to_headline(self, db):
        program_list = [
            _make_program_data("Theo", 1, 100),
            _make_program_data("Theo", 2, 110),
            _make_program_data("Theo", 3, 120),
        ]
        # First write to learn the program_ids.
        first = _write_many(
            db, program_list,
            source_filename="theo.xlsx",
            athlete_name="Theo",
            candidate_name="theo.xlsx",
        )
        db.commit()

        # The user is "resyncing" the middle block.
        middle_id = first["programs"][1]["program_id"]

        # Re-extract with athlete+program_number matching, asking for the
        # middle block as the headline.
        program_list_v2 = [
            _make_program_data("Theo", 1, 200),
            _make_program_data("Theo", 2, 210),
            _make_program_data("Theo", 3, 220),
        ]
        result = _write_many(
            db, program_list_v2,
            source_filename="theo_v2.xlsx",
            athlete_name="Theo",
            candidate_name="theo_v2.xlsx",
            targeted_program_id=middle_id,
        )
        db.commit()

        assert result["program_id"] == middle_id

    def test_targeted_program_id_falls_back_when_unmatched(self, db):
        program_list = [
            _make_program_data("Theo", 1, 100),
            _make_program_data("Theo", 2, 110),
        ]
        result = _write_many(
            db, program_list,
            source_filename="theo.xlsx",
            athlete_name="Theo",
            candidate_name="theo.xlsx",
            targeted_program_id=99999,  # not in the workbook
        )
        db.commit()

        # Unknown target → fall back to last block.
        headline_program = db.query(Program).filter(
            Program.id == result["program_id"]
        ).first()
        assert headline_program.program_number == 2


class TestMultiProgramResync:
    """The whole point of the bug: resync of a multi-program workbook must
    re-extract every block, not just the targeted (primary) program."""

    @pytest.fixture()
    def fake_multi_adapter(self):
        """Register a fake adapter that yields N programs from one workbook."""

        class FakeMultiAdapter(BaseAdapter):
            name = "test_multi"
            description = "test multi-program adapter"

            @staticmethod
            def can_parse(workbook):
                return False  # never auto-selected

            def extract(self, workbook, filename: str = ""):
                # Single-program path returns the latest block.
                return _make_program_data("Athlete X", 3, 300)

            def extract_all(self, workbook, filename: str = ""):
                return [
                    _make_program_data("Athlete X", 1, 100),
                    _make_program_data("Athlete X", 2, 200),
                    _make_program_data("Athlete X", 3, 300),
                ]

        _registry.append(FakeMultiAdapter)
        try:
            yield FakeMultiAdapter
        finally:
            _registry.remove(FakeMultiAdapter)

    @pytest.fixture()
    def empty_workbook(self, tmp_path):
        path = tmp_path / "fake.xlsx"
        wb = openpyxl.Workbook()
        wb.save(path)
        return path

    def test_first_import_writes_all_blocks(
        self, db, fake_multi_adapter, empty_workbook
    ):
        result = import_file(
            path=empty_workbook,
            db=db,
            title="fake.xlsx",
            athlete_name="Athlete X",
            parser_id="test_multi",
        )
        db.commit()

        assert len(result["program_ids"]) == 3
        programs = db.query(Program).filter(Program.athlete_id == result["athlete_id"]).all()
        assert sorted(p.program_number for p in programs) == [1, 2, 3]

    def test_resync_with_existing_program_id_refreshes_all_blocks(
        self, db, fake_multi_adapter, empty_workbook
    ):
        """Regression: previously, passing existing_program_id suppressed
        multi-extract, so only the targeted block got refreshed and the
        other blocks went stale on every resync."""
        # Initial import — three blocks at weight 100/200/300.
        first = import_file(
            path=empty_workbook,
            db=db,
            title="fake.xlsx",
            athlete_name="Athlete X",
            parser_id="test_multi",
        )
        db.commit()

        # Pretend gdrive_imports recorded program 3 as primary.
        primary_id = first["program_id"]
        block1_id = first["programs"][0]["program_id"]
        block2_id = first["programs"][1]["program_id"]

        # Record the original weights so we can detect a true refresh.
        from bestrong.models.orm import ExerciseEntry

        def block_weight(program_id):
            sess_ids = [
                s.id for s in db.query(SessionRow).filter(
                    SessionRow.program_id == program_id
                ).all()
            ]
            entry = db.query(ExerciseEntry).filter(
                ExerciseEntry.session_id.in_(sess_ids)
            ).first()
            return entry.weight_lbs if entry else None

        assert block_weight(block1_id) == 100
        assert block_weight(block2_id) == 200
        assert block_weight(primary_id) == 300

        # Bump the adapter's output to simulate edited weights.
        # We swap extract_all on the live adapter class for this run.
        bumped = [
            _make_program_data("Athlete X", 1, 111),
            _make_program_data("Athlete X", 2, 222),
            _make_program_data("Athlete X", 3, 333),
        ]
        with patch.object(
            fake_multi_adapter, "extract_all", lambda self, wb, filename="": bumped
        ):
            # Resync: caller passes existing_program_id (the primary).
            # Pre-fix, this suppressed multi-extract and only block 3 got
            # the new weight; block 1 + 2 stayed at 100/200.
            result = import_file(
                path=empty_workbook,
                db=db,
                title="fake.xlsx",
                athlete_name="Athlete X",
                parser_id="test_multi",
                existing_program_id=primary_id,
            )
            db.commit()

        # All three blocks must reflect the bumped weights.
        assert block_weight(block1_id) == 111
        assert block_weight(block2_id) == 222
        assert block_weight(primary_id) == 333

        # Headline still refers to the targeted program, not the last block.
        # In this case primary_id IS the last block, so they match either
        # way; targeting is exercised in TestWriteManyHeadline.
        assert result["program_id"] == primary_id


class TestSyncFolderForce:
    """Force flag bypasses the modifiedTime dedup in sync_folder."""

    def _stub_drive(self, sheets):
        """Patch the gdrive client + auth + parser resolver so sync_folder can
        run offline against an in-memory test database (no cloud registry)."""
        from contextlib import ExitStack

        stack = ExitStack()
        stack.enter_context(patch.multiple(
            sync_module.client,
            is_authenticated=lambda **kw: True,
            get_watched_folders=lambda **kw: [
                {"id": "folder-1", "name": "athletes"}
            ],
            get_watched_folder_id=lambda **kw: "folder-1",
            get_excluded_folders=lambda **kw: [],
            list_sheets_in_folder=lambda folder_id, **kw: sheets,
            list_folders=lambda folder_id, **kw: [],
            export_sheet_as_xlsx=lambda *a, **kw: b"",  # not reached
            get_connected_email=lambda **kw: "coach@example.com",
        ))
        stack.enter_context(patch.object(
            sync_module, "resolve_parser_id", lambda *a, **kw: None,
        ))
        stack.enter_context(patch.object(
            sync_module, "has_adapter", lambda parser_id: True,
        ))
        # Skip the post-sync email scrape — needs Drive client too.
        stack.enter_context(patch.object(
            sync_module, "_update_athlete_emails_from_sharing",
            lambda *a, **kw: None,
        ))
        return stack

    def test_unchanged_file_is_skipped_by_default(self, db):
        # Pre-existing import with matching modifiedTime.
        db.add(GDriveImport(
            gdrive_file_id="sheet-1",
            gdrive_file_name="Theo's Program 1.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
            program_id=1,
        ))
        athlete = Athlete(name="Theo")
        db.add(athlete)
        db.flush()
        db.add(Program(
            id=1, athlete_id=athlete.id, program_number=1, program_name="Block 1",
        ))
        db.commit()

        sheets = [{
            "id": "sheet-1",
            "name": "Theo's Program 1.xlsx",
            "modifiedTime": "2026-05-01T00:00:00Z",
            "mimeType": "application/vnd.google-apps.spreadsheet",
        }]

        with self._stub_drive(sheets):
            result = sync_folder(db=db)

        # Default behavior: unchanged file is skipped.
        assert any(s["id"] == "sheet-1" for s in result.skipped)
        assert not any(i["id"] == "sheet-1" for i in result.imported)

    def test_force_bypasses_dedup(self, db):
        """force=True re-imports even when modifiedTime matches."""
        # Pre-existing import with matching modifiedTime.
        athlete = Athlete(name="Theo")
        db.add(athlete)
        db.flush()
        program = Program(
            athlete_id=athlete.id, program_number=1, program_name="Block 1",
        )
        db.add(program)
        db.flush()

        db.add(GDriveImport(
            gdrive_file_id="sheet-1",
            gdrive_file_name="Theo's Program 1.xlsx",
            gdrive_modified_time="2026-05-01T00:00:00Z",
            status="success",
            program_id=program.id,
        ))
        db.commit()

        sheets = [{
            "id": "sheet-1",
            "name": "Theo's Program 1.xlsx",
            "modifiedTime": "2026-05-01T00:00:00Z",
            "mimeType": "application/vnd.google-apps.spreadsheet",
        }]

        # We don't need a real xlsx round-trip — just confirm the dedup
        # gate didn't short-circuit. The import will then fail at the
        # xlsx parsing stage and land in errors, which is fine for this
        # test: errors mean "sync layer attempted re-download," skipped
        # would mean "dedup blocked it."
        with self._stub_drive(sheets):
            result = sync_folder(db=db, force=True)

        assert not any(s["id"] == "sheet-1" for s in result.skipped)
        # The file was attempted (either imported or errored); either way
        # the dedup did not block it.
        attempted = (
            [i["id"] for i in result.imported]
            + [e["id"] for e in result.errors]
        )
        assert "sheet-1" in attempted


class TestIsProgramSheet:
    """Sync defers the 'is this a program?' decision to the parser.

    Only the universal non-program filename patterns (attempt selectors,
    cuts, calculators) are filtered upstream. Custom adapters with their
    own filename conventions must flow through so the parser's can_parse
    is the authoritative classifier.
    """

    def test_universal_skip_patterns_still_rejected(self):
        from bestrong.gdrive.sync import _is_program_sheet
        assert _is_program_sheet("Attempt Selection.xlsx") is False
        assert _is_program_sheet("Gut Cut Plan.xlsx") is False
        assert _is_program_sheet("Water Cut.xlsx") is False
        assert _is_program_sheet("Warmup Loads Calculator.xlsx") is False

    def test_custom_adapter_filenames_pass_through(self):
        from bestrong.gdrive.sync import _is_program_sheet
        # Filenames without the "program" keyword used to be rejected.
        assert _is_program_sheet("Athlete Name 6.xlsx") is True
        assert _is_program_sheet("Athlete Name Mesocycle 78.xlsx") is True
        assert _is_program_sheet("Athlete Name R3.xlsx") is True
        assert _is_program_sheet("Athlete (9/5/21-9/26/21).xlsx") is True

    def test_bundled_template_filenames_still_pass(self):
        from bestrong.gdrive.sync import _is_program_sheet
        assert _is_program_sheet("Athlete Program 1.xlsx") is True
        assert _is_program_sheet("Program 5 (9/26/25).xlsx") is True
