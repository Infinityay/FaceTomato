from fastapi.testclient import TestClient

from app.main import app
from app.schemas.jd import JDData, JDBasicInfo, JDRequirements
from app.schemas.resume import ResumeData
from app.schemas.resume_optimization import ResumeSuggestionsResponse, SectionSuggestions, SuggestionItem, SuggestionLocation

client = TestClient(app)


class StubMatcher:
    async def get_jd_suggestions(self, resume_data: ResumeData, jd_text: str, jd_data: JDData | None = None):
        return (
            ResumeSuggestionsResponse(
                sections=[
                    SectionSuggestions(
                        section="projects",
                        suggestions=[
                            SuggestionItem(
                                id="SUG-PROJ-001",
                                priority=1,
                                issue_type="cross_section_issue",
                                location=SuggestionLocation(section="projects", item_index=0),
                                problem="未突出与 JD 相关的技术关键词",
                                original="开发管理后台",
                                suggestion="突出管理后台中的 React 与 TypeScript 实践",
                            )
                        ],
                    )
                ]
            ),
            0.21,
        )


class RuntimeConfigStub:
    model_provider = "anthropic"
    api_key = "runtime-key"
    base_url = "https://example.com/v1"
    model = "claude-sonnet"


def test_jd_suggestions_route_returns_same_display_only_contract(monkeypatch):
    captured = {}

    def fake_resolve_runtime_config(runtime_config=None):
        captured["runtime_config_request"] = runtime_config.model_dump() if runtime_config else None
        return RuntimeConfigStub()

    def fake_matcher_from_runtime_config(runtime_config):
        captured["resolved_runtime_config"] = {
            "model_provider": runtime_config.model_provider,
            "api_key": runtime_config.api_key,
            "base_url": runtime_config.base_url,
            "model": runtime_config.model,
        }
        return StubMatcher()

    monkeypatch.setattr(
        "app.api.routes.jd_optimization.resolve_runtime_config",
        fake_resolve_runtime_config,
    )
    monkeypatch.setattr(
        "app.api.routes.jd_optimization.JDResumeMatcher.from_runtime_config",
        fake_matcher_from_runtime_config,
    )

    response = client.post(
        "/api/resume/jd/suggestions",
        json={
            "resumeData": ResumeData().model_dump(),
            "jdText": "熟悉 React 和 TypeScript",
            "runtimeConfig": {"modelProvider": "anthropic"},
            "jdData": JDData(
                basicInfo=JDBasicInfo(jobTitle="前端开发工程师"),
                requirements=JDRequirements(techStack=["React", "TypeScript"]),
            ).model_dump(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    suggestion = payload["sections"][0]["suggestions"][0]
    assert suggestion == {
        "id": "SUG-PROJ-001",
        "priority": 1,
        "issue_type": "cross_section_issue",
        "location": {
            "section": "projects",
            "item_index": 0,
        },
        "problem": "未突出与 JD 相关的技术关键词",
        "original": "开发管理后台",
        "suggestion": "突出管理后台中的 React 与 TypeScript 实践",
    }
    assert captured["runtime_config_request"] == {
        "modelProvider": "anthropic",
        "apiKey": None,
        "baseURL": None,
        "model": None,
        "ocrApiKey": None,
        "speechAppKey": None,
        "speechAccessKey": None,
    }
    assert captured["resolved_runtime_config"] == {
        "model_provider": "anthropic",
        "api_key": "runtime-key",
        "base_url": "https://example.com/v1",
        "model": "claude-sonnet",
    }
    assert "suggestion_type" not in suggestion
    assert "field_path" not in suggestion["location"]
    assert "field_label" not in suggestion["location"]
