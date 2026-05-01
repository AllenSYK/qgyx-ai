"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage } from "@/lib/language";
import type { AnalysisResult, Quiz, StudyMode, WrongQuestion } from "@/types/quiz";

type FileMeta = {
  name: string;
  type: string;
  size: number;
  kind: "image" | "pdf" | "unsupported";
};

export type GenerationTaskState = {
  id: string;
  jobId: string;
  status: "idle" | "running" | "success" | "error";
  jobStatus: string;
  mode: StudyMode | null;
  language: AppLanguage;
  file: FileMeta | null;
  previewUrl: string;
  imageUrl: string;
  progress: number;
  step: string;
  error: string;
  quiz: Quiz | null;
  quizResult: unknown | null;
  analysis: AnalysisResult | null;
  originalExplanation: unknown | null;
  analysisText: string;
  sessionId: string;
  quizRecordId: string;
  analysisRecordId: string;
  remainingCredits: number | null;
  dailyUsed: number | null;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  speedMode: "fast" | "slow";
  answers: Record<number, number>;
  finished: boolean;
  wrongQuestions: WrongQuestion[];
  wrongExplanations: Record<string, unknown>;
  recordStatus: string;
  createdAt: string;
};

type StartGenerationInput = {
  file: File;
  originalFile?: File;
  mode: StudyMode;
  language: AppLanguage;
};

type GenerationTaskContextValue = {
  task: GenerationTaskState;
  tasks: GenerationTaskState[];
  activeTaskId: string;
  startGeneration: (input: StartGenerationInput) => Promise<void>;
  retryGeneration: () => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  clearTask: () => void;
  removeTask: (taskId: string) => void;
  selectTask: (taskId: string) => void;
  updateTask: (patch: Partial<GenerationTaskState>) => void;
};

const STORAGE_KEY = "qgyx:generation-tasks-v7";

const initialTask: GenerationTaskState = {
  id: "",
  jobId: "",
  status: "idle",
  jobStatus: "idle",
  mode: null,
  language: "zh",
  file: null,
  previewUrl: "",
  imageUrl: "",
  progress: 0,
  step: "等待上传",
  error: "",
  quiz: null,
  quizResult: null,
  analysis: null,
  originalExplanation: null,
  analysisText: "",
  sessionId: "",
  quizRecordId: "",
  analysisRecordId: "",
  remainingCredits: null,
  dailyUsed: null,
  dailyLimit: null,
  dailyRemaining: null,
  speedMode: "fast",
  answers: {},
  finished: false,
  wrongQuestions: [],
  wrongExplanations: {},
  recordStatus: "",
  createdAt: ""
};

const GenerationTaskContext = createContext<GenerationTaskContextValue | null>(null);

function getFileKind(file: File): FileMeta["kind"] {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

function toSerializableTask(task: GenerationTaskState) {
  return {
    ...task,
    previewUrl: "",
    remainingCredits: null,
    dailyUsed: null,
    dailyLimit: null,
    dailyRemaining: null,
    speedMode: "fast" as const
  };
}

function sanitizeCachedTask(task: Partial<GenerationTaskState>): GenerationTaskState {
  const createdAt = typeof task.createdAt === "string" ? Date.parse(task.createdAt) : 0;
  const staleRunning =
    task.status === "running" &&
    (!createdAt || Number.isNaN(createdAt) || Date.now() - createdAt > 6 * 60 * 60 * 1000);

  return {
    ...initialTask,
    ...task,
    status: staleRunning ? "error" : task.status || initialTask.status,
    jobStatus: staleRunning ? "failed" : task.jobStatus || initialTask.jobStatus,
    step: staleRunning ? "历史任务已停止，可重新上传" : task.step || initialTask.step,
    error: staleRunning ? "这是本地缓存的旧任务状态，不会影响今日额度。" : task.error || "",
    previewUrl: "",
    remainingCredits: null,
    dailyUsed: null,
    dailyLimit: null,
    dailyRemaining: null,
    speedMode: "fast"
  };
}

function statusToLocalStatus(status: string): GenerationTaskState["status"] {
  if (status === "failed") return "error";
  if (status === "completed" || status === "quiz_done") return "success";
  if (!status || status === "idle") return "idle";
  return "running";
}

function statusText(status: string, fallback?: string | null) {
  if (fallback) return fallback;

  const map: Record<string, string> = {
    queued: "排队中",
    uploading: "正在上传图片",
    ocr_processing: "正在识别题目",
    generating_explanation: "正在生成原题解析",
    explanation_done: "原题解析已完成，Quiz 正在后台生成",
    generating_quiz: "正在生成练习题",
    quiz_done: "Quiz 已准备好",
    completed: "已完成",
    failed: "生成失败，可重试"
  };

  return map[status] || "处理中";
}

function readEnvelope(input: unknown) {
  if (!input || typeof input !== "object") {
    return { success: false, data: null, error: "服务返回异常" };
  }

  const value = input as { success?: boolean; data?: unknown; error?: string };

  if ("success" in value) {
    return value;
  }

  return {
    success: true,
    data: input,
    error: null
  };
}

function applyServerPayload(task: GenerationTaskState, payload: Record<string, unknown>): GenerationTaskState {
  const jobStatus = String(payload.status || task.jobStatus || "");
  const progress = typeof payload.progress === "number" ? payload.progress : task.progress;
  const analysis = (payload.analysis as AnalysisResult | null) || task.analysis;
  const quiz = (payload.quiz as Quiz | null) || task.quiz;
  const quizFailedAfterAnalysis = jobStatus === "failed" && Boolean(analysis) && !quiz;
  const payloadAnalysisText =
    typeof payload.analysisText === "string"
      ? payload.analysisText
      : typeof payload.markdown === "string"
        ? payload.markdown
        : "";

  return {
    ...task,
    jobId: String(payload.jobId || task.jobId || ""),
    language: (payload.language === "en" ? "en" : task.language) as AppLanguage,
    jobStatus,
    status: statusToLocalStatus(jobStatus),
    progress,
    step: quizFailedAfterAnalysis
      ? "Quiz 生成失败，可重试"
      : statusText(jobStatus, typeof payload.stage === "string" ? payload.stage : null),
    error: typeof payload.errorMessage === "string" ? payload.errorMessage : "",
    imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl : task.imageUrl,
    originalExplanation: payload.originalExplanation ?? task.originalExplanation,
    analysis,
    quiz,
    quizResult: payload.quizResult ?? task.quizResult,
    wrongExplanations: (payload.wrongExplanations as Record<string, unknown> | undefined) || task.wrongExplanations,
    analysisText: payloadAnalysisText || (analysis
      ? [
          `题目识别：${analysis.recognizedText}`,
          `正确答案：${analysis.answer}`,
          `解析：${analysis.explanation}`,
          `知识点：${analysis.knowledgePoints.join("、")}`
        ].join("\n\n")
      : task.analysisText),
    remainingCredits:
      typeof payload.remainingCredits === "number" ? payload.remainingCredits : task.remainingCredits,
    dailyUsed:
      typeof payload.dailyUsed === "number" ? payload.dailyUsed : typeof payload.daily_used === "number" ? payload.daily_used : task.dailyUsed,
    dailyLimit:
      typeof payload.dailyLimit === "number" ? payload.dailyLimit : typeof payload.daily_limit === "number" ? payload.daily_limit : task.dailyLimit,
    dailyRemaining:
      typeof payload.dailyRemaining === "number" ? payload.dailyRemaining : typeof payload.remaining === "number" ? payload.remaining : task.dailyRemaining,
    speedMode:
      payload.speedMode === "slow" || payload.speed_mode === "slow" ? "slow" : "fast",
    analysisRecordId:
      typeof payload.analysisRecordId === "string" ? payload.analysisRecordId : task.analysisRecordId
  };
}

type StreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

function parseStreamBlocks(buffer: string) {
  const events: StreamEvent[] = [];
  let nextBuffer = buffer.replace(/\r\n/g, "\n");

  while (true) {
    const boundary = nextBuffer.indexOf("\n\n");

    if (boundary === -1) {
      break;
    }

    const block = nextBuffer.slice(0, boundary);
    nextBuffer = nextBuffer.slice(boundary + 2);
    const eventLine = block
      .split("\n")
      .find((line) => line.startsWith("event:"));
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!data) {
      continue;
    }

    try {
      events.push({
        event: eventLine ? eventLine.slice(6).trim() : "message",
        data: JSON.parse(data) as Record<string, unknown>
      });
    } catch {
      events.push({
        event: "error",
        data: {
          errorMessage: "流式响应解析失败，请重试。"
        }
      });
    }
  }

  return { events, buffer: nextBuffer };
}

export function GenerationTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<GenerationTaskState[]>([]);
  const [activeTaskId, setActiveTaskId] = useState("");
  const lastInputRef = useRef<StartGenerationInput | null>(null);
  const previewUrlsRef = useRef(new Map<string, string>());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const saved = JSON.parse(raw) as {
          tasks?: GenerationTaskState[];
          activeTaskId?: string;
        };
        const savedTasks = Array.isArray(saved.tasks)
          ? saved.tasks.map((item) => sanitizeCachedTask(item))
          : [];
        setTasks(savedTasks);
        setActiveTaskId(saved.activeTaskId || savedTasks[0]?.id || "");
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tasks: tasks.map(toSerializableTask).slice(0, 12),
        activeTaskId
      })
    );
  }, [activeTaskId, tasks]);

  const updateTaskById = useCallback((taskId: string, patch: Partial<GenerationTaskState>) => {
    setTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? {
              ...item,
              ...patch
            }
          : item
      )
    );
  }, []);

  const updateTask = useCallback(
    (patch: Partial<GenerationTaskState>) => {
      if (!activeTaskId) return;
      updateTaskById(activeTaskId, patch);
    },
    [activeTaskId, updateTaskById]
  );

  const pollJob = useCallback(async (taskId: string, jobId: string) => {
    const response = await fetch(`/api/analyze/status?jobId=${encodeURIComponent(jobId)}`);
    const raw = await response.json().catch(() => null);
    const envelope = readEnvelope(raw);

    if (!response.ok || !envelope.success || !envelope.data) {
      updateTaskById(taskId, {
        status: "error",
        jobStatus: "failed",
        error: envelope.error || "读取任务状态失败。",
        step: "生成失败，可重试",
        progress: 100
      });
      return;
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? applyServerPayload(item, envelope.data as Record<string, unknown>)
          : item
      )
    );
  }, [updateTaskById]);

  useEffect(() => {
    const activePollTargets = tasks.filter(
      (item) =>
        item.jobId &&
        item.jobStatus !== "completed" &&
        item.jobStatus !== "failed" &&
        item.status !== "error"
    );

    if (activePollTargets.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      activePollTargets.forEach((item) => {
        void pollJob(item.id, item.jobId);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pollJob, tasks]);

  const clearTask = useCallback(() => {
    if (!activeTaskId) {
      return;
    }

    const previewUrl = previewUrlsRef.current.get(activeTaskId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(activeTaskId);
    }

    setTasks((current) => {
      const next = current.filter((item) => item.id !== activeTaskId);
      setActiveTaskId(next[0]?.id || "");
      return next;
    });
  }, [activeTaskId]);

  const removeTask = useCallback((taskId: string) => {
    const previewUrl = previewUrlsRef.current.get(taskId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(taskId);
    }

    setTasks((current) => {
      const next = current.filter((item) => item.id !== taskId);

      if (activeTaskId === taskId) {
        setActiveTaskId(next[0]?.id || "");
      }

      return next;
    });
  }, [activeTaskId]);

  const startGeneration = useCallback(
    async ({ file, originalFile, mode, language }: StartGenerationInput) => {
      lastInputRef.current = { file, originalFile, mode, language };
      const displayFile = originalFile || file;
      const kind = getFileKind(displayFile);
      const taskId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const previewUrl = kind === "image" ? URL.createObjectURL(displayFile) : "";

      if (previewUrl) {
        previewUrlsRef.current.set(taskId, previewUrl);
      }

      const nextTask: GenerationTaskState = {
        ...initialTask,
        id: taskId,
        status: "running",
        jobStatus: "uploading",
        mode,
        language,
        file: {
          name: displayFile.name,
          type: displayFile.type,
          size: displayFile.size,
          kind
        },
        previewUrl,
        progress: 10,
        step: "正在上传图片",
        createdAt: new Date().toISOString()
      };

      setTasks((current) => [nextTask, ...current].slice(0, 12));
      setActiveTaskId(taskId);

      if (kind === "unsupported") {
        updateTaskById(taskId, {
          status: "error",
          jobStatus: "failed",
          progress: 0,
          step: "文件类型不支持",
          error: "当前支持 jpg、png、webp 和 pdf 文件。"
        });
        return;
      }

      if (kind === "pdf" && file.size > 10 * 1024 * 1024) {
        updateTaskById(taskId, {
          status: "error",
          jobStatus: "failed",
          progress: 0,
          step: "PDF 过大",
          error: "PDF 不能超过 10MB。"
        });
        return;
      }

      const uploadFile = file;

      if (kind === "image") {
        if (uploadFile.size > 5 * 1024 * 1024) {
          updateTaskById(taskId, {
            status: "error",
            jobStatus: "failed",
            progress: 0,
            step: "图片过大",
            error: "图片压缩后仍超过 5MB，请上传更清晰、裁剪后的题目图片。"
          });
          return;
        }
      }

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("mode", mode);
      formData.append("language", language);

      try {
        updateTaskById(taskId, {
          progress: 25,
          step: kind === "image" ? "正在读取题目..." : "正在识别题目"
        });

        if (kind === "image") {
          const response = await fetch("/api/analyze/stream", {
            method: "POST",
            body: formData
          });
          const contentType = response.headers.get("content-type") || "";

          if (!response.ok || !response.body || !contentType.includes("text/event-stream")) {
            const raw = await response.json().catch(() => null);
            const envelope = readEnvelope(raw);

            updateTaskById(taskId, {
              status: "error",
              jobStatus: "failed",
              progress: 100,
              step: "生成失败，可重试",
              error: envelope.error || "生成结果失败，请稍后再试。"
            });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const parsed = parseStreamBlocks(buffer);
            buffer = parsed.buffer;

            for (const item of parsed.events) {
              if (item.event === "delta") {
                const text = typeof item.data.text === "string" ? item.data.text : "";

                if (!text) {
                  continue;
                }

                setTasks((current) =>
                  current.map((taskItem) =>
                    taskItem.id === taskId
                      ? {
                          ...taskItem,
                          status: "running",
                          jobStatus: "generating_explanation",
                          progress: typeof item.data.progress === "number" ? item.data.progress : Math.max(taskItem.progress, 55),
                          step: typeof item.data.stage === "string" ? item.data.stage : "正在生成解析...",
                          analysisText: `${taskItem.analysisText}${text}`
                        }
                      : taskItem
                  )
                );
                continue;
              }

              if (item.event === "error") {
                setTasks((current) =>
                  current.map((taskItem) =>
                    taskItem.id === taskId
                      ? {
                          ...taskItem,
                          status: "error",
                          jobStatus: "failed",
                          progress: 100,
                          step: typeof item.data.stage === "string" ? item.data.stage : "生成失败，可重试",
                          error:
                            typeof item.data.errorMessage === "string"
                              ? item.data.errorMessage
                              : "生成结果失败，请稍后再试。",
                          analysisText:
                            typeof item.data.analysisText === "string"
                              ? item.data.analysisText
                              : taskItem.analysisText
                        }
                      : taskItem
                  )
                );
                continue;
              }

              if (item.event === "meta" || item.event === "done") {
                setTasks((current) =>
                  current.map((taskItem) =>
                    taskItem.id === taskId
                      ? applyServerPayload(taskItem, item.data)
                      : taskItem
                  )
                );
              }
            }
          }

          return;
        }

        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData
        });
        const raw = await response.json().catch(() => null);
        const envelope = readEnvelope(raw);

        if (!response.ok || !envelope.success || !envelope.data) {
          updateTaskById(taskId, {
            status: "error",
            jobStatus: "failed",
            progress: 100,
            step: "生成失败，可重试",
            error: envelope.error || "生成结果失败，请稍后再试。"
          });
          return;
        }

        setTasks((current) =>
          current.map((item) =>
            item.id === taskId
              ? applyServerPayload(item, envelope.data as Record<string, unknown>)
              : item
          )
        );
      } catch {
        updateTaskById(taskId, {
          status: "error",
          jobStatus: "failed",
          step: "网络或服务器异常",
          error: "网络或服务器异常，请稍后再试。"
        });
      }
    },
    [updateTaskById]
  );

  const retryJob = useCallback(
    async (jobId: string) => {
      const currentTask = tasks.find((item) => item.jobId === jobId);
      if (!currentTask) return;

      updateTaskById(currentTask.id, {
        status: "running",
        jobStatus: "queued",
        progress: 10,
        step: "正在重试任务",
        error: ""
      });

      const response = await fetch("/api/analyze/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId })
      });
      const raw = await response.json().catch(() => null);
      const envelope = readEnvelope(raw);

      if (!response.ok || !envelope.success || !envelope.data) {
        updateTaskById(currentTask.id, {
          status: "error",
          jobStatus: "failed",
          progress: 100,
          step: "重试失败",
          error: envelope.error || "重试失败，请选择更清晰、完整的题目图片。"
        });
        return;
      }

      setTasks((items) =>
        items.map((item) =>
          item.id === currentTask.id
            ? applyServerPayload(item, envelope.data as Record<string, unknown>)
            : item
        )
      );
    },
    [tasks, updateTaskById]
  );

  const retryGeneration = useCallback(async () => {
    const current = tasks.find((item) => item.id === activeTaskId);

    if (current?.jobId && (current.analysis || current.originalExplanation || current.quiz)) {
      await retryJob(current.jobId);
      return;
    }

    if (!lastInputRef.current) {
      updateTask({
        status: "error",
        error: "刷新后无法恢复本地文件，请重新选择图片或 PDF。"
      });
      return;
    }

    await startGeneration(lastInputRef.current);
  }, [activeTaskId, retryJob, startGeneration, tasks, updateTask]);

  const task = tasks.find((item) => item.id === activeTaskId) || initialTask;

  const value = useMemo(
    () => ({
      task,
      tasks,
      activeTaskId,
      startGeneration,
      retryGeneration,
      retryJob,
      clearTask,
      removeTask,
      selectTask: setActiveTaskId,
      updateTask
    }),
    [activeTaskId, clearTask, removeTask, retryGeneration, retryJob, startGeneration, task, tasks, updateTask]
  );

  return <GenerationTaskContext.Provider value={value}>{children}</GenerationTaskContext.Provider>;
}

export function useGenerationTask() {
  const context = useContext(GenerationTaskContext);

  if (!context) {
    throw new Error("useGenerationTask must be used inside GenerationTaskProvider");
  }

  return context;
}
