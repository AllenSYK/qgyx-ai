import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export const AnswerLetterSchema = z.enum(["A", "B", "C", "D"]);

export const StepSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  formula: z.string().optional().default("")
});

export const OriginalExplanationSchema = z
  .object({
    title: z.string().min(1),
    detectedText: z.string().min(1),
    subject: z.string().min(1),
    topic: z.string().min(1),
    difficulty: DifficultySchema,
    explanation: z.string().min(1),
    keySteps: z.array(z.string().min(1)).min(1).max(4),
    knowledgePoints: z.array(z.string().min(1)).min(1).max(4).optional(),
    finalAnswer: z.string().min(1),
    commonMistake: z.string().min(1),
    similarIdeas: z.array(z.string().min(1)).min(1).max(3),
    steps: z.array(StepSchema).optional().default([]),
    formulas: z.array(z.string()).optional().default([]),
    warnings: z.array(z.string()).optional().default([])
  })
  .strict();

export const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctAnswer: AnswerLetterSchema,
    topic: z.string().min(1),
    difficulty: DifficultySchema
  })
  .strict();

export const QuizResultSchema = z
  .object({
    questions: z.array(QuizQuestionSchema).min(3).max(4)
  })
  .strict();

export const WrongExplanationSchema = z
  .object({
    questionId: z.string().min(1),
    userAnswer: AnswerLetterSchema,
    correctAnswer: AnswerLetterSchema,
    whyWrong: z.string().min(1),
    explanation: z.string().min(1),
    correctMethod: z.string().min(1),
    similarTip: z.string().min(1)
  })
  .strict();

export const RecognitionSchema = z
  .object({
    detectedText: z.string().min(1),
    imageSummary: z.string().min(1)
  })
  .strict();

export type OriginalExplanation = z.infer<typeof OriginalExplanationSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizResult = z.infer<typeof QuizResultSchema>;
export type WrongExplanation = z.infer<typeof WrongExplanationSchema>;
export type RecognitionResult = z.infer<typeof RecognitionSchema>;

export const ORIGINAL_EXPLANATION_JSON_SHAPE = `{
  "title": "",
  "detectedText": "",
  "subject": "",
  "topic": "",
  "difficulty": "easy|medium|hard",
  "finalAnswer": "",
  "explanation": "",
  "keySteps": [],
  "knowledgePoints": [],
  "commonMistake": "",
  "similarIdeas": [],
  "steps": [{"title": "", "content": "", "formula": ""}],
  "formulas": [],
  "warnings": []
}`;

export const QUIZ_JSON_SHAPE = `{
  "questions": [
    {
      "id": "",
      "question": "",
      "options": ["", "", "", ""],
      "correctAnswer": "A",
      "topic": "",
      "difficulty": "medium"
    }
  ]
}`;

export const WRONG_EXPLANATION_JSON_SHAPE = `{
  "questionId": "",
  "userAnswer": "A",
  "correctAnswer": "B",
  "whyWrong": "",
  "explanation": "",
  "correctMethod": "",
  "similarTip": ""
}`;

export const RECOGNITION_JSON_SHAPE = `{
  "detectedText": "",
  "imageSummary": ""
}`;
