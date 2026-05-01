export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return apiSuccess({
        received: false,
        message: "支付通道配置中，webhook 暂未启用。"
      });
    }

    const signature = request.headers.get("x-payment-signature");

    if (signature !== webhookSecret) {
      return apiError("Webhook 签名校验失败。", 401);
    }

    return apiSuccess({
      received: true,
      message: "Webhook 接口已预留，请按支付渠道补充验签和订单更新逻辑。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "支付回调处理失败。";
    return apiError(message, 500);
  }
}
