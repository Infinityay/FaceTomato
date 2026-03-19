from __future__ import annotations

from app.schemas.jd_match import JDMatchSummary
from app.schemas.resume_optimization import SuggestionItem, SuggestionLocation


def test_jd_match_summary_normalizes_percent_from_100_scale():
    summary = JDMatchSummary.model_validate(
        {
            "totalScore": 31,
            "maxScore": 40,
            "percent": 77.5,
            "byCategory": {
                "mustHave": 0.8,
                "niceToHave": 0.5,
                "degree": 1.0,
                "experience": 0.8,
                "techStack": 0.7,
                "jobDuties": 0.6,
            },
        }
    )
    assert 0.774 <= summary.percent <= 0.776


def test_jd_match_summary_normalizes_percent_string_with_symbol():
    summary = JDMatchSummary.model_validate(
        {
            "totalScore": 31,
            "maxScore": 40,
            "percent": "77.5%",
            "byCategory": {
                "mustHave": 0.8,
                "niceToHave": 0.5,
                "degree": 1.0,
                "experience": 0.8,
                "techStack": 0.7,
                "jobDuties": 0.6,
            },
        }
    )
    assert 0.774 <= summary.percent <= 0.776


def test_suggestion_item_maps_model_specific_issue_type_with_display_only_contract():
    item = SuggestionItem.model_validate(
        {
            "id": "SUG-WORK-001",
            "priority": 1,
            "issue_type": "jd_alignment",
            "location": SuggestionLocation(
                section="workExperience",
                item_index=0,
            ).model_dump(),
            "problem": "问题",
            "original": "原文",
            "suggestion": "建议",
        }
    )
    assert item.issue_type == "cross_section_issue"
    assert item.model_dump() == {
        "id": "SUG-WORK-001",
        "priority": 1,
        "issue_type": "cross_section_issue",
        "location": {
            "section": "workExperience",
            "item_index": 0,
        },
        "problem": "问题",
        "original": "原文",
        "suggestion": "建议",
    }
