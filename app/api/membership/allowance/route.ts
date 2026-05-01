import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { createGenerationAllowancePayload, getGenerationAllowance } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录。", 401);
    }

    const admin = createSupabaseAdminClient();
    const allowance = await getGenerationAllowance(admin, user.id);

    return apiSuccess(createGenerationAllowancePayload(allowance));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取会员额度失败。";
    return apiError(message, 500);
  }
}
