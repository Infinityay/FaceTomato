/**
 * API module for backend communication.
 */

import type { ResumeData, ResumeParseMeta } from '../types/resume';
import type {
  ResumeOverview,
  ResumeSuggestions,
  MatchReport,
} from '../store/optimizationStore';

export type RuntimeModelProvider = 'openai' | 'anthropic' | 'google_genai';

export interface RuntimeConfig {
  modelProvider?: RuntimeModelProvider | '';
  apiKey?: string;
  baseURL?: string;
  model?: string;
  ocrApiKey?: string;
  speechAppKey?: string;
  speechAccessKey?: string;
}

export interface ResumeParseResult {
  data: ResumeData;
  meta: ResumeParseMeta;
}

export interface JDData {
  basicInfo: {
    jobTitle: string;
    jobType: string;
    location: string;
    company: string;
    department: string;
    updateTime: string;
  };
  requirements: {
    degree: string;
    experience: string;
    techStack: string[];
    mustHave: string[];
    niceToHave: string[];
    jobDuties: string[];
  };
}

export class ApiError extends Error {
  details?: Record<string, unknown>;

  constructor(
    public message: string,
    public status: number,
    public code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}

interface ResumeParseResponse {
  data: ResumeData;
  meta: ResumeParseMeta;
}

interface ApiErrorResponse {
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  detail?: string | {
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  };
}

const normalizeRuntimeValue = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const hasRuntimeConfig = (runtimeConfig?: RuntimeConfig | null): runtimeConfig is RuntimeConfig => {
  if (!runtimeConfig) {
    return false;
  }

  return Boolean(
    normalizeRuntimeValue(runtimeConfig.modelProvider) ||
      normalizeRuntimeValue(runtimeConfig.apiKey) ||
      normalizeRuntimeValue(runtimeConfig.baseURL) ||
      normalizeRuntimeValue(runtimeConfig.model) ||
      normalizeRuntimeValue(runtimeConfig.ocrApiKey) ||
      normalizeRuntimeValue(runtimeConfig.speechAppKey) ||
      normalizeRuntimeValue(runtimeConfig.speechAccessKey)
  );
};

export const sanitizeRuntimeConfig = (runtimeConfig?: RuntimeConfig | null): RuntimeConfig | undefined => {
  if (!runtimeConfig) {
    return undefined;
  }

  const sanitized = {
    modelProvider: normalizeRuntimeValue(runtimeConfig.modelProvider) as RuntimeModelProvider | undefined,
    apiKey: normalizeRuntimeValue(runtimeConfig.apiKey),
    baseURL: normalizeRuntimeValue(runtimeConfig.baseURL),
    model: normalizeRuntimeValue(runtimeConfig.model),
    ocrApiKey: normalizeRuntimeValue(runtimeConfig.ocrApiKey),
    speechAppKey: normalizeRuntimeValue(runtimeConfig.speechAppKey),
    speechAccessKey: normalizeRuntimeValue(runtimeConfig.speechAccessKey),
  } satisfies RuntimeConfig;

  return hasRuntimeConfig(sanitized) ? sanitized : undefined;
};

const handleApiError = async (response: Response): Promise<never> => {
  let errorMessage = `服务器错误，状态码: ${response.status}`;
  let errorCode = 'UNKNOWN_ERROR';
  let errorDetails: Record<string, unknown> | undefined;

  try {
    const errorData: ApiErrorResponse = await response.json();
    if (errorData.error) {
      errorMessage = errorData.error.message;
      errorCode = errorData.error.code;
      errorDetails = errorData.error.details;
    } else if (errorData.detail) {
      if (typeof errorData.detail === 'string') {
        errorMessage = errorData.detail;
      } else if (typeof errorData.detail === 'object' && errorData.detail.error) {
        errorMessage = errorData.detail.error.message;
        errorCode = errorData.detail.error.code;
        errorDetails = errorData.detail.error.details;
      }
    }
  } catch {
    // ignore invalid json
  }

  throw new ApiError(errorMessage, response.status, errorCode, errorDetails);
};

const postJson = async <TResponse>(
  url: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json() as Promise<TResponse>;
};

export const analyzeResume = async (
  file: File,
  runtimeConfig?: RuntimeConfig | null
): Promise<ResumeParseResult> => {
  const formData = new FormData();
  formData.append('file', file);

  const sanitizedRuntimeConfig = sanitizeRuntimeConfig(runtimeConfig);
  if (sanitizedRuntimeConfig?.modelProvider) {
    formData.append('runtime_model_provider', sanitizedRuntimeConfig.modelProvider);
  }
  if (sanitizedRuntimeConfig?.apiKey) {
    formData.append('runtime_api_key', sanitizedRuntimeConfig.apiKey);
  }
  if (sanitizedRuntimeConfig?.baseURL) {
    formData.append('runtime_base_url', sanitizedRuntimeConfig.baseURL);
  }
  if (sanitizedRuntimeConfig?.model) {
    formData.append('runtime_model', sanitizedRuntimeConfig.model);
  }
  if (sanitizedRuntimeConfig?.ocrApiKey) {
    formData.append('runtime_ocr_api_key', sanitizedRuntimeConfig.ocrApiKey);
  }

  const response = await fetch('/api/resume/parse', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json() as Promise<ResumeParseResponse>;
};

export const getSpeechStatus = async (
  runtimeConfig?: RuntimeConfig | null
): Promise<{ available: boolean }> => {
  const sanitizedRuntimeConfig = sanitizeRuntimeConfig(runtimeConfig);
  const params = new URLSearchParams();
  if (sanitizedRuntimeConfig?.speechAppKey) {
    params.set('runtime_speech_app_key', sanitizedRuntimeConfig.speechAppKey);
  }
  if (sanitizedRuntimeConfig?.speechAccessKey) {
    params.set('runtime_speech_access_key', sanitizedRuntimeConfig.speechAccessKey);
  }
  const query = params.toString();
  const response = await fetch(`/api/speech/status${query ? `?${query}` : ''}`);
  if (!response.ok) {
    await handleApiError(response);
  }
  return response.json() as Promise<{ available: boolean }>;
};

export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await fetch('/health');
    return response.ok;
  } catch {
    return false;
  }
};

interface JDMatchApiResponse {
  summary: {
    totalScore: number;
    maxScore: number;
    percent: number;
    byCategory: {
      mustHave: number;
      niceToHave: number;
      degree: number;
      experience: number;
      techStack: number;
      jobDuties: number;
    };
  };
  headline: string;
  matches: Array<{
    requirementId: string;
    requirementText: string;
    category: string;
    score: number;
    rationale: string;
    evidence: string[];
  }>;
  gaps: Array<{
    id: string;
    category: string;
    text: string;
  }>;
}

const categoryLabels: Record<string, string> = {
  mustHave: '必备条件',
  niceToHave: '加分项',
  degree: '学历要求',
  experience: '经验要求',
  techStack: '技术栈',
  jobDuties: '岗位职责',
};

const categoryWeights: Record<string, number> = {
  mustHave: 0.5,
  degree: 0.5,
  experience: 0.5,
  niceToHave: 0.2,
  techStack: 0.2,
  jobDuties: 0.1,
};

const transformJdMatchResponse = (data: JDMatchApiResponse): MatchReport => {
  const scoreBreakdown = Object.entries(data.summary.byCategory).map(([category, score]) => ({
    category,
    label: categoryLabels[category] || category,
    score,
    weight: categoryWeights[category] || 0,
  }));

  const getMatchStatus = (score: number): 'matched' | 'partial' | 'missing' => {
    if (score >= 1) return 'matched';
    if (score > 0) return 'partial';
    return 'missing';
  };

  const requirements = data.matches.map((match) => ({
    id: match.requirementId,
    text: match.requirementText,
    category: match.category,
    status: getMatchStatus(match.score),
    score: match.score,
    rationale: match.rationale,
    evidence: match.evidence ?? [],
  }));

  const gaps = data.gaps.map((gap) => ({
    id: gap.id,
    text: gap.text,
    category: gap.category,
    status: 'missing' as const,
    score: 0,
    rationale: '',
  }));

  return {
    overallScore: data.summary.totalScore,
    maxScore: data.summary.maxScore,
    percent: data.summary.percent,
    headline: data.headline,
    scoreBreakdown,
    requirements,
    gaps,
  };
};

export const getResumeOverview = async (
  resume: ResumeData,
  runtimeConfig?: RuntimeConfig | null
): Promise<ResumeOverview> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  return postJson<ResumeOverview>('/api/resume/overview', {
    ...resume,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
};

export const getResumeSuggestions = async (
  resume: ResumeData,
  runtimeConfig?: RuntimeConfig | null
): Promise<ResumeSuggestions> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  return postJson<ResumeSuggestions>('/api/resume/suggestions', {
    ...resume,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
};

export const getJdMatch = async (
  resume: ResumeData,
  jdText: string,
  jdData?: JDData,
  runtimeConfig?: RuntimeConfig | null
): Promise<MatchReport> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  const data = await postJson<JDMatchApiResponse>('/api/resume/jd/match', {
    resumeData: resume,
    jdText,
    jdData,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
  return transformJdMatchResponse(data);
};

export const getJdOverview = async (
  resume: ResumeData,
  jdText: string,
  jdData?: JDData,
  runtimeConfig?: RuntimeConfig | null
): Promise<ResumeOverview> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  return postJson<ResumeOverview>('/api/resume/jd/overview', {
    resumeData: resume,
    jdText,
    jdData,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
};

export const getJdSuggestions = async (
  resume: ResumeData,
  jdText: string,
  jdData?: JDData,
  runtimeConfig?: RuntimeConfig | null
): Promise<ResumeSuggestions> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  return postJson<ResumeSuggestions>('/api/resume/jd/suggestions', {
    resumeData: resume,
    jdText,
    jdData,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
};

export const extractJdData = async (
  jdText: string,
  runtimeConfig?: RuntimeConfig | null
): Promise<JDData> => {
  const sanitized = sanitizeRuntimeConfig(runtimeConfig);
  const result = await postJson<{ data: JDData }>('/api/jd/extract', {
    text: jdText,
    ...(sanitized ? { runtimeConfig: sanitized } : {}),
  });
  return result.data;
};
