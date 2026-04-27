"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenText,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Sparkles,
  UploadCloud
} from "lucide-react";
import clsx from "clsx";
import MathText from "@/components/MathText";
import QuizCard from "@/components/QuizCard";
import ReviewCard from "@/components/ReviewCard";
import type { Quiz, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type UploadCardProps = {
  initialRemainingCredits: number;
  userEmail?: string | null;
};

const stages = ["正在识别题目", "正在分析考点", "正在生成同类型练习", "正在整理解析"];

function getFileKind(file: File | null) {
  if (!file) return "none";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

export default function UploadCard({ initialRemainingCredits, userEmail }: UploadCardProps) {
  const [remainingCredits, setRemainingCredits] = useState(initialRemainingCredits);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [error, setError] = useState("");
  const [recordStatus, setRecordStatus] = useState("");

  const fileKind = useMemo(() => getFileKind(file), [file]);

  useEffect(() => {
    if (!file || fileKind !== "image") {
      setPreviewUrl("");
      return;
    }
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [file, fileKind]);

  useEffect(() => {
    if (!loading) return;
    setActiveStage(0);
    const timer = window.setInterval(() => {
      setActiveStage((c) => Math.min(c + 1, stages.length - 1));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [loading]);

  function resetGeneratedState() {
    setQuiz(null);
    setSessionId("");
    setAnalysisText("");
    setWrongQuestions([]);
    setRecordStatus("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    resetGeneratedState();

    if (!file) return setError("请先选择文件");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    const res = await fetch("/api/analyze", { method: "POST", body: formData });
    const data = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) return setError(data?.error || "失败");

    setRemainingCredits(data.remainingCredits);
    setAnalysisText(data.analysisText);
    setSessionId(data.sessionId || "");
    setQuiz(data.quiz);
  }

  async function saveStudyRecord(payload: StudyRecordPayload) {
    setRecordStatus("正在保存...");
    const res = await fetch("/api/study-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setRecordStatus(res.ok ? "已保存" : "保存失败");
  }

  return (
    <div className="space-y-6">
      {quiz && (
        <QuizCard
          quiz={quiz}
          sessionId={sessionId}
          onComplete={(payload: StudyRecordPayload) => void saveStudyRecord(payload)}
          onRequestReview={(nextWrongQuestions: WrongQuestion[]) => setWrongQuestions(nextWrongQuestions)}
        />
      )}

      {wrongQuestions.length > 0 && (
        <ReviewCard originalAnalysisText={analysisText} wrongQuestions={wrongQuestions} />
      )}
    </div>
  );
}
