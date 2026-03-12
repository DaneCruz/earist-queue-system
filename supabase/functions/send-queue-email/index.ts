import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to,
      studentName,
      studentNumber,
      facultyName,
      concern,
      preferredTime,
      subject: customSubject,
      html: customHtml,
      text: customText,
    } = await req.json();
    const safeStudentName = escapeHtml(String(studentName || "Student"));
    const safeStudentNumber = escapeHtml(String(studentNumber || "N/A"));
    const safeFacultyName = escapeHtml(String(facultyName || "Faculty"));
    const safeConcern = escapeHtml(String(concern || "N/A"));
    const safePreferredTime = escapeHtml(String(preferredTime || "N/A"));

    if (!to) {
      return jsonResponse({ error: "Missing recipient email." }, 400);
    }

    const defaultSubject = "Queue Confirmation - EARIST Queue System";
    const defaultHtml = `
      <h2 style="margin:0 0 12px 0;">Hello ${safeStudentName},</h2>
      <p style="margin:0 0 12px 0;">Your consultation queue has been filed successfully.</p>
      <ul>
        <li><strong>Student #:</strong> ${safeStudentNumber}</li>
        <li><strong>Faculty:</strong> ${safeFacultyName}</li>
        <li><strong>Concern:</strong> ${safeConcern}</li>
        <li><strong>Preferred Time:</strong> ${safePreferredTime}</li>
      </ul>
      <p style="margin-top:14px;">Please wait for your turn. Thank you.</p>
      <p style="font-size:12px;color:#666;margin-top:20px;">EARIST Queue System Notification</p>
    `;
    const defaultText = [
      `Hello ${studentName || "Student"},`,
      "",
      "Your consultation queue has been filed successfully.",
      `Student #: ${studentNumber || "N/A"}`,
      `Faculty: ${facultyName || "Faculty"}`,
      `Concern: ${concern || "N/A"}`,
      `Preferred Time: ${preferredTime || "N/A"}`,
      "",
      "Please wait for your turn. Thank you.",
      "EARIST Queue System Notification",
    ].join("\n");

    const subject = String(customSubject || defaultSubject);
    const html = String(customHtml || defaultHtml);
    const text = String(customText || defaultText);

    // Priority 1: Gmail via Google Apps Script relay (best for no-domain testing).
    const gmailWebhookUrl = Deno.env.get("GMAIL_WEBHOOK_URL");
    const gmailWebhookSecret = Deno.env.get("GMAIL_WEBHOOK_SECRET");
    if (gmailWebhookUrl) {
      const relayResponse = await fetch(gmailWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-relay-secret": gmailWebhookSecret || "",
        },
        body: JSON.stringify({
          secret: gmailWebhookSecret || "",
          to,
          subject,
          html,
          text,
        }),
      });

      const relayData = await relayResponse.json().catch(() => ({}));
      if (!relayResponse.ok || relayData?.ok === false) {
        return jsonResponse({ error: relayData || "Gmail relay failed." }, 500);
      }

      return jsonResponse({ ok: true, provider: "gmail-relay", data: relayData }, 200);
    }

    // Priority 2: Resend (current production path).
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Queue System <onboarding@resend.dev>";
    if (!resendApiKey) {
      return jsonResponse(
        {
          error: "Missing provider config. Set GMAIL_WEBHOOK_URL or RESEND_API_KEY.",
        },
        500
      );
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return jsonResponse({ error: data }, 500);
    }

    return jsonResponse({ ok: true, provider: "resend", data }, 200);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
