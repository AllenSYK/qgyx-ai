export type QuizQuestion = {
  id?: string;
  question: string;
  options: string[];
  answerIndex: number;
  correctAnswer?: "A" | "B" | "C" | "D";
  explanation?: string;
  knowledgePoint: string;
  topic?: string;
  difficulty: "easy" | "medium" | "hard";
  tags?: string[];
  subject?: string;
  questionType?: string;
};

export type Quiz = {
  title: string;
  summary: string;
  subject?: string;
  questionType?: string;
  sourceType: "image" | "pdf";
  questions: QuizQuestion[];
};

export type StudyMode = "quiz" | "analysis" | "quiz_analysis";

export type ErrorType = "概念错误" | "审题错误" | "计算错误" | "知识混淆";

export type WrongQuestion = {
  question: string;
  options?: string[];
  answerIndex?: number;
  userAnswerIndex: number;
  correctAnswerIndex?: number;
  explanation: string;
  knowledgePoint?: string;
  difficulty?: "easy" | "medium" | "hard";
  sessionId?: string;
  subject?: string;
  questionType?: string;
  errorType?: ErrorType;
  errorReason?: string;
  improvementSuggestion?: string;
  tags?: string[];
};

export type StudyRecordPayload = {
  sessionId?: string;
  analysisRecordId?: string;
  mode?: StudyMode;
  quizTitle: string;
  questions?: QuizQuestion[];
  answers?: Record<number, number>;
  currentIndex?: number;
  isCompleted?: boolean;
  questionCount: number;
  correctCount: number;
  knowledgePoints: string[];
  wrongQuestions: WrongQuestion[];
};

export type QuizProgressPayload = StudyRecordPayload & {
  score?: number;
};

export type AnalysisResult = {
  recognizedText: string;
  answer: string;
  explanation: string;
  knowledgePoints: string[];
  commonMistakes: string[];
  similarIdeas: string[];
  subject?: string;
  difficulty?: QuizQuestion["difficulty"];
  tags?: string[];
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
  last_login_at?: string | null;
  last_login_ip?: string | null;
  ip_country?: string | null;
  ip_region?: string | null;
  ip_city?: string | null;
  used_count?: number;
  quiz_count?: number;
  analysis_count?: number;
  total_calls?: number;
  total_tokens?: number;
  last_used_at?: string | null;
  remaining: number;
  total_purchased: number;
  membership_level?: "free" | "pro" | "max";
  membership_expire_at?: string | null;
  daily_used?: number;
  daily_limit?: number;
  monthly_used?: number;
  monthly_limit?: number | null;
  speed_mode?: "fast" | "slow";
  is_banned?: boolean;
  ban_reason?: string | null;
  banned_at?: string | null;
};

export type AdminQuizSessionRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  title: string;
  created_at: string;
};
