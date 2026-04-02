import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WaitlistJoinResponse = {
  success: true;
  status: 'created' | 'duplicate';
  message: string;
};

const createdResponse: WaitlistJoinResponse = {
  success: true,
  status: 'created',
  message: 'Your email has been added to the waitlist.',
};

const duplicateResponse: WaitlistJoinResponse = {
  success: true,
  status: 'duplicate',
  message: "You are already on the waitlist. We'll onboard you soon.",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const buildWaitlistConfirmationHtml = () => `<!DOCTYPE html>
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
                IIL connects to your personal email and converts incoming messages into structured execution - tasks extracted, deadlines tracked, and replies prepared automatically.
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

const sendConfirmationEmail = async (email: string) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.warn(
      'RESEND_API_KEY is not configured. Waitlist email skipped for:',
      email
    );
    return;
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "You're on the list for IIL!",
      html: buildWaitlistConfirmationHtml(),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || 'Resend email send failed');
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase function secrets are not configured');
    }

    const body = (await req.json()) as { email?: string };
    const rawEmail = body.email?.trim() ?? '';
    if (!emailRegex.test(rawEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = normalizeEmail(rawEmail);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: existing, error: existingError } = await supabase
      .from('waitlist')
      .select('id')
      .ilike('email', email)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify(duplicateResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: insertError } = await supabase
      .from('waitlist')
      .insert({ email });

    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify(duplicateResponse), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw insertError;
    }

    try {
      await sendConfirmationEmail(email);
    } catch (error) {
      console.error('Failed to send waitlist confirmation email:', error);
    }

    return new Response(JSON.stringify(createdResponse), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected function error';

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
