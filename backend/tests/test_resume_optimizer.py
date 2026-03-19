from app.schemas.resume_optimization import SectionSuggestions, SuggestionItem, SuggestionLocation
from app.services.resume_optimizer import _deduplicate_suggestions, _normalize_suggestions


def make_suggestion(*, section: str, item_index: int | None, original: str, suggestion: str):
    return SuggestionItem(
        id="",
        priority=1,
        issue_type="wording_issue",
        location=SuggestionLocation(section=section, item_index=item_index),
        problem="问题",
        original=original,
        suggestion=suggestion,
    )


def test_normalize_suggestions_assigns_stable_ids_and_global_priority():
    sections = [
        SectionSuggestions(
            section="workExperience",
            suggestions=[
                make_suggestion(
                    section="basicInfo",
                    item_index=0,
                    original="负责接口开发",
                    suggestion="主导接口开发与性能优化",
                ),
                make_suggestion(
                    section="workExperience",
                    item_index=1,
                    original="维护系统",
                    suggestion="推动系统稳定性治理",
                ),
            ],
        ),
        SectionSuggestions(
            section="projects",
            suggestions=[
                make_suggestion(
                    section="projects",
                    item_index=0,
                    original="开发管理后台",
                    suggestion="构建管理后台并完善权限模型",
                )
            ],
        ),
    ]

    _normalize_suggestions(sections)

    assert [item.id for section in sections for item in section.suggestions] == [
        "SUG-WORK-001",
        "SUG-WORK-002",
        "SUG-PROJ-001",
    ]
    assert [item.priority for section in sections for item in section.suggestions] == [1, 2, 3]
    assert sections[0].suggestions[0].location.section == "workExperience"


def test_deduplicate_suggestions_uses_display_key_instead_of_field_path():
    sections = [
        SectionSuggestions(
            section="workExperience",
            suggestions=[
                make_suggestion(
                    section="workExperience",
                    item_index=0,
                    original="负责接口开发",
                    suggestion="主导接口开发与性能优化",
                ),
                make_suggestion(
                    section="workExperience",
                    item_index=0,
                    original="负责接口开发",
                    suggestion="主导接口开发与性能优化",
                ),
                make_suggestion(
                    section="workExperience",
                    item_index=0,
                    original="负责接口开发",
                    suggestion="补充结果导向表达，突出业务影响",
                ),
            ],
        )
    ]

    removed = _deduplicate_suggestions(sections)

    assert removed == 1
    remaining = sections[0].suggestions
    assert len(remaining) == 2
    assert remaining[0].suggestion == "主导接口开发与性能优化"
    assert remaining[1].suggestion == "补充结果导向表达，突出业务影响"
