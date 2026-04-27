"use client";

import { useState } from "react";

export default function QuizCard({ quiz }: any) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const current = quiz.questions[currentIndex];

  async function handleSelect(index: number) {
    if (showResult) return;

    setSelected(index);
    setShowResult(true);

    // ❗答错 → 调用分析
    if (index !== current.answerIndex) {
      try {
        await fetch("/api/review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            originalAnalysisText: "基于题目生成的上下文",
            wrongQuestions: [
              {
                question: current.question,
                userAnswerIndex: index,
                correctAnswerIndex: current.answerIndex,
                explanation: current.explanation
              }
            ]
          })
        });
      } catch (err) {
        console.error("分析失败", err);
      }
    }
  }

  function next() {
    setSelected(null);
    setShowResult(false);
    setCurrentIndex((prev) => prev + 1);
  }

  return (
    <div>
      <h2>{current.question}</h2>

      <div>
        {current.options.map((opt: string, i: number) => (
          <button key={i} onClick={() => handleSelect(i)}>
            {opt}
          </button>
        ))}
      </div>

      {showResult && (
        <div>
          {selected === current.answerIndex ? "正确 ✅" : "错误 ❌"}
          <p>{current.explanation}</p>
        </div>
      )}

      {showResult && currentIndex < quiz.questions.length - 1 && (
        <button onClick={next}>下一题</button>
      )}
    </div>
  );
}
