"""Tests for the OpenPowerlifting HTTP client."""

from __future__ import annotations

import pytest
import requests

from bestrong.opl import client as opl_client
from bestrong.opl.client import OplError, fetch_lifter_csv, search_lifters


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text

    def json(self):
        if isinstance(self._json_data, Exception):
            raise self._json_data
        return self._json_data


def _ranking_row(
    *,
    name="Jane Lifter",
    slug="jane-lifter",
    total=1100.5,
    dots=430.2,
):
    row = [None] * 24
    row[2] = name
    row[3] = slug
    row[6] = "USA"
    row[7] = "TX"
    row[8] = "USAPL"
    row[9] = "2026-04-01"
    row[13] = "F"
    row[14] = "Raw"
    row[15] = "24-34"
    row[16] = "Open"
    row[18] = "148"
    row[22] = total
    row[23] = dots
    return row


def test_search_lifters_fetches_search_offset_then_rankings_slice(monkeypatch):
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append((url, params, headers, timeout))
        if url.endswith("/api/search/rankings/"):
            return _FakeResponse(json_data={"next_index": 12})
        if url.endswith("/api/rankings/by-dots"):
            return _FakeResponse(
                json_data={
                    "rows": [
                        _ranking_row(),
                        _ranking_row(name="Other Athlete", slug="other"),
                        _ranking_row(name="Jane Lifter", slug="jane-lifter"),
                    ]
                }
            )
        raise AssertionError(f"unexpected URL {url}")

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    result = search_lifters("Jane", limit=10)

    assert result == [
        {
            "slug": "jane-lifter",
            "name": "Jane Lifter",
            "federation": "USAPL",
            "country": "USA",
            "state": "TX",
            "sex": "F",
            "equipment": "Raw",
            "age_class": "24-34",
            "division": "Open",
            "best_total_lbs": 1100.5,
            "best_dots": 430.2,
            "weight_class_lbs": "148",
            "last_meet_date": "2026-04-01",
        }
    ]
    assert calls[0] == (
        "https://www.openpowerlifting.org/api/search/rankings/",
        {"q": "Jane", "start": 0},
        {"User-Agent": "BeStrongHQ/1.0 (+https://bestronghq.com)"},
        15.0,
    )
    assert calls[1][0] == "https://www.openpowerlifting.org/api/rankings/by-dots"
    assert calls[1][1] == {
        "start": 12,
        "end": 20,
        "lang": "en",
        "units": "lbs",
    }


def test_search_lifters_honors_limit(monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        if url.endswith("/api/search/rankings/"):
            return _FakeResponse(json_data={"next_index": 0})
        return _FakeResponse(
            json_data={
                "rows": [
                    _ranking_row(name="Jane One", slug="jane-one"),
                    _ranking_row(name="Jane Two", slug="jane-two"),
                ]
            }
        )

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    assert search_lifters("Jane", limit=1) == [
        {
            "slug": "jane-one",
            "name": "Jane One",
            "federation": "USAPL",
            "country": "USA",
            "state": "TX",
            "sex": "F",
            "equipment": "Raw",
            "age_class": "24-34",
            "division": "Open",
            "best_total_lbs": 1100.5,
            "best_dots": 430.2,
            "weight_class_lbs": "148",
            "last_meet_date": "2026-04-01",
        }
    ]


def test_search_lifters_returns_empty_for_blank_query(monkeypatch):
    def fake_get(*_args, **_kwargs):
        raise AssertionError("blank query should not call HTTP")

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    assert search_lifters("   ") == []


def test_search_lifters_returns_empty_for_no_result(monkeypatch):
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(json_data={"next_index": -1}),
    )

    assert search_lifters("Nobody") == []


def test_search_lifters_returns_empty_on_http_error(monkeypatch):
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(status_code=500),
    )

    assert search_lifters("Jane") == []


def test_search_lifters_ignores_malformed_rankings_rows(monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        if url.endswith("/api/search/rankings/"):
            return _FakeResponse(json_data={"next_index": 0})
        return _FakeResponse(json_data={"rows": [[], [None] * 10]})

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    assert search_lifters("Jane") == []


def test_fetch_lifter_csv_parses_meets_and_attempts(monkeypatch):
    csv_text = "\n".join(
        [
            (
                "MeetName,Date,Federation,ParentFederation,MeetCountry,MeetState,"
                "Event,Equipment,Division,AgeClass,WeightClassKg,BodyweightKg,"
                "TotalKg,Sex,Place,Dots,Tested,Squat1Kg,Squat2Kg,Squat3Kg,"
                "Bench1Kg,Bench2Kg,Bench3Kg,Deadlift1Kg,Deadlift2Kg,Deadlift3Kg"
            ),
            (
                "Test Open,2026-04-01,USAPL,IPF,USA,TX,SBD,Raw,Open,24-34,"
                "67.5,66.4,452.5,F,1,430.25,Yes,140,-150,0,80,,85,180,-190,192.5"
            ),
        ]
    )

    def fake_get(url, params=None, headers=None, timeout=None):
        assert url == "https://www.openpowerlifting.org/api/liftercsv/jane-lifter"
        return _FakeResponse(text=csv_text)

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    result = fetch_lifter_csv("jane-lifter")

    assert len(result) == 1
    meet = result[0]
    assert meet["meet_path"] == "USAPL|2026-04-01|Test Open"
    assert meet["meet_name"] == "Test Open"
    assert meet["meet_date"] == "2026-04-01"
    assert meet["federation"] == "USAPL"
    assert meet["parent_federation"] == "IPF"
    assert meet["meet_country"] == "USA"
    assert meet["meet_state"] == "TX"
    assert meet["event"] == "SBD"
    assert meet["equipment"] == "Raw"
    assert meet["division"] == "Open"
    assert meet["age_class"] == "24-34"
    assert meet["weight_class_kg"] == "67.5"
    assert meet["bodyweight_kg"] == 66.4
    assert meet["total_kg"] == 452.5
    assert meet["sex"] == "F"
    assert meet["place"] == "1"
    assert meet["dots"] == 430.25
    assert meet["tested"] is True
    assert meet["attempts"] == [
        {
            "lift": "squat",
            "attempt_number": 1,
            "weight_lbs": 308.65,
            "made": True,
        },
        {
            "lift": "squat",
            "attempt_number": 2,
            "weight_lbs": 330.69,
            "made": False,
        },
        {
            "lift": "bench",
            "attempt_number": 1,
            "weight_lbs": 176.37,
            "made": True,
        },
        {
            "lift": "bench",
            "attempt_number": 3,
            "weight_lbs": 187.39,
            "made": True,
        },
        {
            "lift": "deadlift",
            "attempt_number": 1,
            "weight_lbs": 396.83,
            "made": True,
        },
        {
            "lift": "deadlift",
            "attempt_number": 2,
            "weight_lbs": 418.88,
            "made": False,
        },
        {
            "lift": "deadlift",
            "attempt_number": 3,
            "weight_lbs": 424.39,
            "made": True,
        },
    ]


def test_fetch_lifter_csv_url_encodes_slug(monkeypatch):
    seen = []

    def fake_get(url, params=None, headers=None, timeout=None):
        seen.append(url)
        return _FakeResponse(text="")

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    assert fetch_lifter_csv("Jane Lifter/Raw") == []
    assert seen == [
        "https://www.openpowerlifting.org/api/liftercsv/Jane%20Lifter%2FRaw"
    ]


def test_fetch_lifter_csv_empty_response_returns_empty_list(monkeypatch):
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(text=" \n "),
    )

    assert fetch_lifter_csv("empty") == []


def test_fetch_lifter_csv_handles_incomplete_row(monkeypatch):
    csv_text = "MeetName,Date,Squat1Kg\nBad Row,2026-04-01,not-a-number\n"
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(text=csv_text),
    )

    assert fetch_lifter_csv("bad-row") == [
        {
            "meet_path": "2026-04-01|Bad Row",
            "meet_name": "Bad Row",
            "meet_date": "2026-04-01",
            "federation": None,
            "parent_federation": None,
            "meet_country": None,
            "meet_state": None,
            "event": None,
            "equipment": None,
            "division": None,
            "age_class": None,
            "weight_class_kg": None,
            "bodyweight_kg": None,
            "total_kg": None,
            "sex": None,
            "place": None,
            "dots": None,
            "tested": None,
            "attempts": [],
        }
    ]


def test_fetch_lifter_csv_requires_slug(monkeypatch):
    def fake_get(*_args, **_kwargs):
        raise AssertionError("missing slug should not call HTTP")

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    with pytest.raises(OplError, match="slug is required"):
        fetch_lifter_csv("")


def test_fetch_lifter_csv_raises_for_not_found(monkeypatch):
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(status_code=404),
    )

    with pytest.raises(OplError, match="profile not found"):
        fetch_lifter_csv("missing")


def test_fetch_lifter_csv_raises_for_non_200(monkeypatch):
    monkeypatch.setattr(
        opl_client.requests,
        "get",
        lambda *_args, **_kwargs: _FakeResponse(status_code=429),
    )

    with pytest.raises(OplError, match="returned 429"):
        fetch_lifter_csv("limited")


def test_http_get_wraps_request_exception(monkeypatch):
    def fake_get(*_args, **_kwargs):
        raise requests.RequestException("network down")

    monkeypatch.setattr(opl_client.requests, "get", fake_get)

    with pytest.raises(OplError, match="Could not reach OpenPowerlifting"):
        opl_client._http_get("/api/search/rankings/")
