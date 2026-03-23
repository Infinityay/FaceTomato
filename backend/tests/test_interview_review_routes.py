from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.mock_interview import MockInterviewSessionSnapshot
from app.schemas.interview_review import (
    ReviewConversationMessage,
    ReviewExportReportResponse,
    ReviewGenerateReportResponse,
    ReviewOptimizationResponse,
    ReviewSessionDetail,
    ReviewSessionListItem,
    ReviewUploadSessionResponse,
)
from app.services.interview_review_service import get_interview_review_service


class StubInterviewReviewService:
    def __init__(self):
        self.last_generate_snapshot = None
        self.last_uploaded_snapshot = None

    def list_reviews(self):
        return [
            ReviewSessionListItem(
                id="session-1",
                title="Frontend Engineer模拟面试复盘",
                role="Frontend Engineer",
                round="模拟面试",
                interviewAt="2026-03-19 10:00",
                reportStatus="ready",
                overallScore=82,
                topicCount=4,
            )
        ]

    def get_review(self, session_id: str):
        if session_id != "session-1":
            return None
        return ReviewSessionDetail(
            id="session-1",
            title="Frontend Engineer模拟面试复盘",
            role="Frontend Engineer",
            round="模拟面试",
            interviewAt="2026-03-19 10:00",
            reportStatus="ready",
            defaultSelectedTopicId="topic-1",
            overallScore=82,
            summary="summary",
            strengths=["strength"],
            risks=["risk"],
            priority="priority",
            topics=[],
        )

    def generate_review(
        self, session_id: str, snapshot: MockInterviewSessionSnapshot | None = None
    ):
        if session_id != "session-1":
            return None
        self.last_generate_snapshot = snapshot
        return ReviewGenerateReportResponse(sessionId=session_id, reportStatus="ready")

    def upload_snapshot(self, snapshot: MockInterviewSessionSnapshot):
        self.last_uploaded_snapshot = snapshot
        return ReviewUploadSessionResponse(
            sessionId=snapshot.sessionId,
            title="Uploaded Mock Interview复盘",
            role="Frontend Engineer",
            round="模拟面试",
            interviewAt="2026-03-19 10:00",
            reportStatus="pending",
            topicCount=snapshot.interviewPlan.total_rounds,
        )

    def export_review(self, session_id: str):
        if session_id != "session-1":
            return None
        return ReviewExportReportResponse(
            sessionId=session_id,
            exportStatus="ready",
            downloadUrl=f"/api/interview-reviews/{session_id}/export/download",
            fileName=f"interview-review-{session_id}.json",
        )

    def optimize_topic(self, request):
        if request.sessionId != "session-1" or request.topicId != "topic-1":
            return None
        assistant = ReviewConversationMessage(
            messageId="assistant-1",
            sessionId=request.sessionId,
            topicId=request.topicId,
            role="assistant",
            content="optimized",
            createdAt="2026-03-19T10:00:00Z",
            suggestions=["suggestion"],
        )
        return ReviewOptimizationResponse(
            topicId=request.topicId,
            reply="optimized",
            optimizedAnswer="optimized answer",
            suggestions=["suggestion"],
            message=assistant,
            conversation=[assistant],
        )


stub_service = StubInterviewReviewService()
client = TestClient(app)


def setup_module():
    app.dependency_overrides[get_interview_review_service] = lambda: stub_service


def teardown_module():
    app.dependency_overrides.clear()


def test_list_interview_reviews_route_returns_items():
    response = client.get("/api/interview-reviews")

    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == "session-1"


def test_get_interview_review_detail_route_returns_detail():
    response = client.get("/api/interview-reviews/session-1")

    assert response.status_code == 200
    assert response.json()["defaultSelectedTopicId"] == "topic-1"


def test_generate_interview_review_route_returns_ready_status():
    response = client.post("/api/interview-reviews/session-1/generate")

    assert response.status_code == 200
    assert response.json()["reportStatus"] == "ready"


def test_generate_interview_review_route_accepts_snapshot_body():
    response = client.post(
        "/api/interview-reviews/session-1/generate",
        json={
            "snapshotVersion": 3,
            "sessionId": "session-1",
            "interviewType": "实习",
            "category": "大模型算法",
            "status": "completed",
            "limits": {
                "durationMinutes": 60,
                "softInputChars": 1200,
                "maxInputChars": 1500,
                "contextWindowMessages": 8,
                "sessionTtlMinutes": 90,
            },
            "jdText": "负责大模型算法研发",
            "jdData": None,
            "resumeSnapshot": {
                "basicInfo": {
                    "name": "测试用户",
                    "personalEmail": "test@example.com",
                    "phoneNumber": "13800138000",
                    "age": "",
                    "born": "",
                    "gender": "",
                    "desiredPosition": "算法实习生",
                    "desiredLocation": [],
                    "currentLocation": "",
                    "placeOfOrigin": "",
                    "rewards": [],
                },
                "workExperience": [],
                "education": [],
                "projects": [],
                "academicAchievements": [],
            },
            "retrieval": {
                "queryText": "",
                "appliedFilters": {
                    "category": None,
                    "interviewType": None,
                    "company": None,
                },
                "items": [],
            },
            "interviewPlan": {
                "plan": [
                    {"round": 1, "topic": "开场介绍", "description": "自我介绍"},
                    {"round": 2, "topic": "项目经历", "description": "介绍项目"},
                    {"round": 3, "topic": "LeetCode 编码", "description": "编码题"},
                ],
                "total_rounds": 3,
                "estimated_duration": "30 分钟",
                "leetcode_problem": "两数之和",
            },
            "interviewState": {
                "currentRound": 3,
                "questionsPerRound": {"1": 1, "2": 1, "3": 1},
                "assistantQuestionCount": 3,
                "turnCount": 3,
                "reflectionHistory": [],
                "closed": True,
            },
            "messages": [
                {"id": "assistant-1", "role": "assistant", "content": "请先自我介绍"},
                {"id": "user-1", "role": "user", "content": "我做过大模型训练项目"},
            ],
            "developerContext": None,
            "developerTrace": [],
            "resumeFingerprint": "fp-1",
            "createdAt": "2026-03-19T10:00:00Z",
            "lastActiveAt": "2026-03-19T10:10:00Z",
            "expiresAt": "2026-03-20T10:00:00Z",
        },
    )

    assert response.status_code == 200
    assert response.json()["reportStatus"] == "ready"
    assert stub_service.last_generate_snapshot is not None
    assert stub_service.last_generate_snapshot.sessionId == "session-1"


def test_upload_interview_review_snapshot_route_accepts_standard_json():
    response = client.post(
        "/api/interview-reviews/upload",
        json={
            "snapshotVersion": 3,
            "sessionId": "uploaded-session-1",
            "interviewType": "\u5b9e\u4e60",
            "category": "\u5927\u6a21\u578b\u7b97\u6cd5",
            "status": "completed",
            "limits": {
                "durationMinutes": 60,
                "softInputChars": 1200,
                "maxInputChars": 1500,
                "contextWindowMessages": 8,
                "sessionTtlMinutes": 90,
            },
            "jdText": "负责大模型算法研究",
            "jdData": None,
            "resumeSnapshot": {
                "basicInfo": {
                    "name": "测试用户",
                    "personalEmail": "test@example.com",
                    "phoneNumber": "13800138000",
                    "age": "",
                    "born": "",
                    "gender": "",
                    "desiredPosition": "算法实习生",
                    "desiredLocation": [],
                    "currentLocation": "",
                    "placeOfOrigin": "",
                    "rewards": [],
                },
                "workExperience": [],
                "education": [],
                "projects": [],
                "academicAchievements": [],
            },
            "retrieval": {
                "queryText": "",
                "appliedFilters": {
                    "category": None,
                    "interviewType": None,
                    "company": None,
                },
                "items": [],
            },
            "interviewPlan": {
                "plan": [
                    {"round": 1, "topic": "开场介绍", "description": "自我介绍"},
                    {"round": 2, "topic": "项目经历", "description": "介绍项目"},
                    {"round": 3, "topic": "算法题", "description": "编码考察"},
                ],
                "total_rounds": 3,
                "estimated_duration": "20 分钟",
                "leetcode_problem": "两数之和",
            },
            "interviewState": {
                "currentRound": 3,
                "questionsPerRound": {"1": 1, "2": 1, "3": 1},
                "assistantQuestionCount": 3,
                "turnCount": 3,
                "reflectionHistory": [],
                "closed": True,
            },
            "messages": [
                {"id": "assistant-1", "role": "assistant", "content": "请先自我介绍"},
                {"id": "user-1", "role": "user", "content": "我做过大模型训练项目"},
            ],
            "developerContext": None,
            "developerTrace": [],
            "resumeFingerprint": "fp-uploaded",
            "createdAt": "2026-03-19T10:00:00Z",
            "lastActiveAt": "2026-03-19T10:10:00Z",
            "expiresAt": "2026-03-20T10:00:00Z",
        },
    )

    assert response.status_code == 200
    assert response.json()["sessionId"] == "uploaded-session-1"
    assert response.json()["reportStatus"] == "pending"
    assert response.json()["topicCount"] == 3
    assert stub_service.last_uploaded_snapshot is not None
    assert stub_service.last_uploaded_snapshot.sessionId == "uploaded-session-1"


def test_optimize_interview_review_topic_route_returns_result():
    response = client.post(
        "/api/interview-reviews/session-1/topics/topic-1/optimize",
        json={
            "sessionId": "session-1",
            "topicId": "topic-1",
            "message": "how to improve",
            "conversation": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["topicId"] == "topic-1"
