export function renderRegisterCodeEmail(code: string) {
  return `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>空与梦 AI 验证码</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f1e8;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      你的空与梦 AI 注册验证码是 ${code}，10 分钟内有效。
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#f7f3ea 0%,#edf4fb 46%,#fffaf0 100%);padding:56px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
            <tr>
              <td style="padding:0 0 22px 0;text-align:center;">
                <div style="font-size:13px;letter-spacing:0.34em;color:#9a7a42;font-weight:700;">
                  QGYX.ASIA
                </div>
                <div style="margin-top:10px;font-size:13px;color:#8f8578;letter-spacing:0.16em;">
                  空与梦 AI 学习助手
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:rgba(255,255,255,0.82);border:1px solid rgba(226,213,190,0.9);border-radius:34px;box-shadow:0 30px 90px rgba(116,92,54,0.16);overflow:hidden;">
                <div style="height:7px;background:linear-gradient(90deg,#d7b46a,#87aee8,#ead9b7);"></div>

                <div style="padding:44px 42px 38px;">
                  <div style="width:62px;height:62px;border-radius:22px;background:linear-gradient(135deg,#eef5ff,#fff1d6);margin:0 auto 26px;box-shadow:inset 0 0 0 1px rgba(180,150,90,0.22);text-align:center;line-height:62px;font-size:28px;">
                    ✦
                  </div>

                  <h1 style="margin:0;text-align:center;font-size:30px;line-height:1.35;color:#27231d;font-weight:650;letter-spacing:-0.03em;">
                    验证你的邮箱
                  </h1>

                  <p style="margin:18px auto 0;max-width:430px;text-align:center;font-size:15px;line-height:1.9;color:#6f665b;">
                    感谢使用空与梦 AI 学习助手。请在注册页面输入下方 8 位验证码，完成账号验证。
                  </p>

                  <div style="margin:34px auto 30px;max-width:430px;border-radius:28px;background:linear-gradient(135deg,#fbf4e6,#eef5ff);border:1px solid rgba(215,188,132,0.72);padding:28px 20px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">
                    <div style="font-size:12px;letter-spacing:0.24em;color:#9a7a42;font-weight:700;margin-bottom:14px;">
                      EMAIL VERIFICATION CODE
                    </div>

                    <div style="font-size:42px;line-height:1.1;letter-spacing:0.24em;color:#242019;font-weight:760;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">
                      ${code}
                    </div>

                    <div style="margin-top:16px;font-size:12px;color:#8d8275;">
                      10 分钟内有效
                    </div>
                  </div>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                    <tr>
                      <td style="border-top:1px solid #eadfce;padding-top:22px;">
                        <p style="margin:0;font-size:13px;line-height:1.85;color:#8f8578;text-align:center;">
                          若非你本人操作，请忽略这封邮件。为了账号安全，请勿将验证码转发给任何人。
                        </p>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 8px 0;text-align:center;color:#aaa095;font-size:12px;line-height:1.8;">
                qgyx.asia · 让错题变成真正会做的题
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
