"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

type DeleteRecordButtonProps = {
  id: string;
  kind: "quiz" | "analysis";
};

export default function DeleteRecordButton({ id, kind }: DeleteRecordButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function deleteRecord() {
    setLoading(true);

    try {
      const endpoint = kind === "quiz" ? "/api/quiz-records" : "/api/analysis-records";
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });

      if (response.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={deleteRecord}
      disabled={loading}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-200 ease-out hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:opacity-60"
      aria-label="删除记录"
      title="删除记录"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
