/**
 * useSpeechInput — 浏览器采集麦克风 PCM 音频，经 WebSocket 发送给后端语音识别服务。
 */
import { useCallback, useEffect, useRef, useState } from "react";

type UseSpeechInputOptions = {
  language?: string;
  enabled?: boolean;
  speechAppKey?: string;
  speechAccessKey?: string;
  onPartialText?: (text: string) => void;
  onFinalText?: (text: string) => void;
};

type SpeechServerEvent =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "end_of_turn" }
  | { type: "error"; message: string };

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;
const INITIAL_SILENCE_FRAMES = 1600;

function isBrowserSpeechSupported() {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    window.WebSocket &&
      window.AudioContext &&
      navigator.mediaDevices?.getUserMedia
  );
}

function getSpeechSocketUrl(speechAppKey?: string, speechAccessKey?: string) {
  const configuredUrl = import.meta.env.VITE_SPEECH_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/api/speech/transcribe`);
  if (speechAppKey?.trim()) {
    url.searchParams.set("runtime_speech_app_key", speechAppKey.trim());
  }
  if (speechAccessKey?.trim()) {
    url.searchParams.set("runtime_speech_access_key", speechAccessKey.trim());
  }
  return url.toString();
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate >= inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function convertFloat32ToInt16(float32Buffer: Float32Array) {
  const buffer = new ArrayBuffer(float32Buffer.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < float32Buffer.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32Buffer[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

export function useSpeechInput({
  language = "zh-CN",
  enabled = true,
  speechAppKey,
  speechAccessKey,
  onPartialText,
  onFinalText,
}: UseSpeechInputOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const closingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [browserSupported] = useState(() => isBrowserSpeechSupported());
  const supported = browserSupported && enabled;

  const cleanup = useCallback((options?: { sendStop?: boolean }) => {
    closingRef.current = true;
    stopRequestedRef.current = false;

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    processorNodeRef.current?.disconnect();
    processorNodeRef.current = null;

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    const stream = mediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    mediaStreamRef.current = null;

    const audioContext = audioContextRef.current;
    if (audioContext) {
      void audioContext.close();
    }
    audioContextRef.current = null;

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (options?.sendStop) {
        try {
          socket.send(JSON.stringify({ type: "stop" }));
        } catch {
          /* ignore */
        }
      }
      socket.close();
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    socketRef.current = null;

    setIsListening(false);
    setInterimText("");

    window.setTimeout(() => {
      closingRef.current = false;
    }, 0);
  }, []);

  const stop = useCallback(() => {
    processorNodeRef.current?.disconnect();
    processorNodeRef.current = null;

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    const stream = mediaStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    mediaStreamRef.current = null;

    const audioContext = audioContextRef.current;
    if (audioContext) {
      void audioContext.close();
    }
    audioContextRef.current = null;

    setIsListening(false);
    stopRequestedRef.current = true;

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "stop" }));
      } catch {
        cleanup();
        return;
      }

      // Volcengine nostream returns the final result after stop; keep the socket
      // open briefly so the backend can push the final transcript back.
      closeTimeoutRef.current = window.setTimeout(() => {
        cleanup();
      }, 15000);
      return;
    }

    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!browserSupported) {
      setError("当前浏览器不支持麦克风流式上传");
      return;
    }
    if (!enabled) {
      setError("当前服务端未启用语音识别");
      return;
    }

    if (socketRef.current || isListening) {
      return;
    }

    setError(null);
    setInterimText("");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = mediaStream;

      const socket = new WebSocket(getSpeechSocketUrl(speechAppKey, speechAccessKey));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = async () => {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error("当前浏览器不支持 AudioContext");
        }

        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        sourceNodeRef.current = sourceNode;

        const processorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processorNodeRef.current = processorNode;

        socket.send(
          JSON.stringify({
            type: "start",
            language,
            encoding: "linear16",
            sampleRate: TARGET_SAMPLE_RATE,
            speechAppKey,
            speechAccessKey,
          })
        );

        // Prime the upstream stream so the provider does not close before the first mic frame arrives.
        socket.send(new ArrayBuffer(INITIAL_SILENCE_FRAMES * 2));

        let chunkCount = 0;
        processorNode.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, TARGET_SAMPLE_RATE);
          const pcmBuffer = convertFloat32ToInt16(downsampled);

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(pcmBuffer);
            chunkCount += 1;
            if (chunkCount <= 5 || chunkCount % 20 === 0) {
              console.debug("speech chunk sent", {
                index: chunkCount,
                bytes: pcmBuffer.byteLength,
              });
            }
          }
        };

        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
        setIsListening(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as SpeechServerEvent;
          if (payload.type === "partial") {
            setInterimText(payload.text);
            onPartialText?.(payload.text);
            return;
          }
          if (payload.type === "final") {
            setInterimText("");
            onFinalText?.(payload.text);
            if (stopRequestedRef.current) {
              cleanup();
            }
            return;
          }
          if (payload.type === "end_of_turn") {
            setInterimText("");
            if (stopRequestedRef.current) {
              cleanup();
            }
            return;
          }
          if (payload.type === "error") {
            setError(payload.message || "语音识别服务异常");
            cleanup();
          }
        } catch {
          setError("语音识别返回了无法解析的数据");
          cleanup();
        }
      };

      socket.onerror = () => {
        setError("语音识别连接失败");
        cleanup();
      };

      socket.onclose = () => {
        if (!closingRef.current) {
          setError("语音识别连接已断开");
        }
        cleanup({ sendStop: false });
      };
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "无法访问麦克风，请检查浏览器权限"
      );
      cleanup();
    }
  }, [
    browserSupported,
    cleanup,
    enabled,
    isListening,
    language,
    onFinalText,
    onPartialText,
    speechAccessKey,
    speechAppKey,
  ]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    supported,
    start,
    stop,
    isListening,
    interimText,
    error,
  };
}
