export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type Quiz = {
  title: string;
  summary: string;
  questions: QuizQuestion[];
};

export type WrongQuestion = QuizQuestion & {
  userAnswerIndex: number;
};

export type MistakeAnalysisItem = {
  question: string;
  userMistake: string;
  correctThinking: string;
  keyPoint: string;
};

export type ReviewResult = {
  weaknessSummary: string;
  mistakeAnalysis: MistakeAnalysisItem[];
  reviewNotes: string[];
  practiceQuestions: QuizQuestion[];
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  created_at: string;
  remaining: number;
  total_purchased: number;
};

export type AdminQuizSessionRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  title: string;
  created_at: string;
};
