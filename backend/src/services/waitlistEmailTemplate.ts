export const normalizeWaitlistEmail = (email: string) =>
  email.trim().toLowerCase();

export const buildWaitlistConfirmationHtml = () => `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#000000; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#eaeaea;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:60px 20px;">
      <tr>
        <td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#050505; border-radius:14px; padding:42px; border:1px solid #111;">
            <tr>
              <td style="font-size:13px; letter-spacing:1.5px; color:#8a8a8a;">
                IIL | INBOX INTELLIGENCE LAYER
              </td>
            </tr>
            <tr>
              <td style="padding-top:28px; font-size:28px; font-weight:600; color:#ffffff;">
                You're on the list.
              </td>
            </tr>
            <tr>
              <td style="padding-top:18px; font-size:15px; line-height:1.7; color:#b3b3b3;">
                Your early access request has been received.
              </td>
            </tr>
            <tr>
              <td style="padding-top:14px; font-size:15px; line-height:1.7; color:#b3b3b3;">
                IIL connects to your personal email and converts incoming
                messages into structured execution - tasks extracted, deadlines
                tracked, and replies prepared automatically.
              </td>
            </tr>
            <tr>
              <td style="padding-top:14px; font-size:15px; line-height:1.7; color:#b3b3b3;">
                We're onboarding users gradually to ensure high signal quality and safe automation across real-world inbox patterns.
              </td>
            </tr>
            <tr>
              <td style="padding-top:14px; font-size:15px; line-height:1.7; color:#b3b3b3;">
                You'll receive access instructions as soon as your slot opens.
              </td>
            </tr>
            <tr>
              <td style="padding-top:28px;">
                <div style="height:1px; background:#111;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px; font-size:13px; color:#777;">
                This email confirms your early access registration.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const buildWaitlistConfirmationPayload = (from: string, to: string) => ({
  from,
  to,
  subject: "You're on the list for IIL!",
  html: buildWaitlistConfirmationHtml(),
});
