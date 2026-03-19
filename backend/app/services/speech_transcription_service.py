from app.core.config import get_settings
from app.services.runtime_config import ResolvedSpeechConfig


def create_transcription_service(speech_config: ResolvedSpeechConfig | None = None):
    from app.services.volcengine_speech_transcription_service import (
        VolcengineRealtimeTranscriptionService,
        VolcengineTranscriptionService,
    )

    settings = get_settings()
    speech_config = speech_config or ResolvedSpeechConfig(
        app_key=settings.volcengine_speech_app_key,
        access_key=settings.volcengine_speech_access_key,
    )

    if settings.volcengine_speech_mode == "nostream":
        return VolcengineTranscriptionService(speech_config=speech_config)
    return VolcengineRealtimeTranscriptionService(speech_config=speech_config)
