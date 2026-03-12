import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendViaGmailRelay(payload: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const relayData = await callGmailRelay({
    action: "send_email",
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (!relayData.ok) {
    return { ok: false, error: relayData.error || "Gmail relay request failed." };
  }
  return { ok: true };
}

async function createMeetLinkViaRelay(payload: {
  consultationId: string;
  facultyEmail: string;
  studentEmail: string;
  title: string;
}): Promise<{ ok: boolean; meetLink?: string; error?: string }> {
  const relayData = await callGmailRelay({
    action: "create_meet",
    consultationId: payload.consultationId,
    facultyEmail: payload.facultyEmail,
    studentEmail: payload.studentEmail,
    title: payload.title,
  });

  if (!relayData.ok) {
    return { ok: false, error: relayData.error || "Failed to generate Google Meet link." };
  }

  const meetLink = String(relayData.meetLink || "").trim();
  if (!meetLink) {
    return { ok: false, error: "Relay did not return meetLink." };
  }

  return { ok: true, meetLink };
}

async function callGmailRelay(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; meetLink?: string }> {
  const gmailWebhookUrl = Deno.env.get("GMAIL_WEBHOOK_URL");
  const gmailWebhookSecret = Deno.env.get("GMAIL_WEBHOOK_SECRET");

  if (!gmailWebhookUrl) {
    return { ok: false, error: "GMAIL_WEBHOOK_URL is not configured." };
  }

  const relayResponse = await fetch(gmailWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: gmailWebhookSecret || "",
      ...payload,
    }),
  });

  const relayData = await relayResponse.json().catch(() => ({}));
  if (!relayResponse.ok || relayData?.ok === false) {
    return { ok: false, error: relayData?.error || "Gmail relay request failed." };
  }

  return {
    ok: true,
    meetLink: relayData?.meetLink || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
  }

  try {
    const { consultationId, facultyId, facultyEmail } = await req.json();
    if (!consultationId) {
      return jsonResponse({ error: "Missing consultationId." }, 400);
    }
    if (!facultyId || !facultyEmail) {
      return jsonResponse({ error: "Missing faculty context." }, 400);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const normalizedEmail = String(facultyEmail).toLowerCase();

    const { data: facultyRows, error: facultyError } = await serviceClient
      .from("faculty")
      .select("id, email, full_name, name")
      .eq("id", facultyId)
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1);

    if (facultyError || !Array.isArray(facultyRows) || facultyRows.length === 0) {
      return jsonResponse({ error: "Faculty record not found." }, 403);
    }

    const faculty = facultyRows[0];

    const { data: consultRows, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, student_number, concern, preferred_time, meet_link")
      .eq("id", consultationId)
      .eq("faculty_id", faculty.id)
      .limit(1);

    if (consultError || !Array.isArray(consultRows) || consultRows.length === 0) {
      return jsonResponse({ error: "Consultation not found or not assigned to this faculty." }, 404);
    }

    const consultation = consultRows[0];

    const { data: studentRows, error: studentError } = await serviceClient
      .from("students")
      .select("student_number, full_name, email")
      .eq("student_number", consultation.student_number)
      .limit(1);

    if (studentError || !Array.isArray(studentRows) || studentRows.length === 0) {
      return jsonResponse({ error: "Student record not found." }, 404);
    }

    const student = studentRows[0];
    if (!student.email) {
      return jsonResponse({ error: "Student email is empty." }, 400);
    }

    const facultyDisplayName = (faculty.full_name || faculty.name || "Faculty").trim();

    let meetLink = String(consultation.meet_link || "").trim();
    if (!meetLink) {
      const generated = await createMeetLinkViaRelay({
        consultationId: String(consultation.id),
        facultyEmail: String(faculty.email || "").trim(),
        studentEmail: String(student.email || "").trim(),
        title: `EARIST Interview - ${student.full_name || student.student_number}`,
      });
      if (!generated.ok || !generated.meetLink) {
        return jsonResponse(
          {
            error:
              generated.error ||
              "Failed to generate Google Meet link. Update Apps Script with create_meet action.",
          },
          500
        );
      }
      meetLink = generated.meetLink;
    }

    const subject = "Interview Started - EARIST Queue System";
    const html = `
      <h2>Hello ${student.full_name || student.student_number},</h2>
      <p>Your faculty has started the interview session.</p>
      <ul>
        <li><strong>Faculty:</strong> ${facultyDisplayName}</li>
        <li><strong>Concern:</strong> ${consultation.concern || "N/A"}</li>
        <li><strong>Preferred Time:</strong> ${consultation.preferred_time || "N/A"}</li>
      </ul>
      <p><strong>Join Link:</strong> <a href="${meetLink}" target="_blank" rel="noopener noreferrer">${meetLink}</a></p>
      <p>Please join as soon as possible.</p>
    `;
    const text = [
      `Hello ${student.full_name || student.student_number},`,
      "",
      "Your faculty has started the interview session.",
      `Faculty: ${facultyDisplayName}`,
      `Concern: ${consultation.concern || "N/A"}`,
      `Preferred Time: ${consultation.preferred_time || "N/A"}`,
      `Join Link: ${meetLink}`,
      "",
      "Please join as soon as possible.",
    ].join("\n");

    const studentSend = await sendViaGmailRelay({
      to: student.email,
      subject,
      text,
      html,
    });
    if (!studentSend.ok) {
      return jsonResponse({ error: `Failed sending student email: ${studentSend.error}` }, 500);
    }

    if (faculty.email) {
      await sendViaGmailRelay({
        to: faculty.email,
        subject: `You started an interview with ${student.full_name || student.student_number}`,
        text: `Interview started.\nStudent: ${student.full_name || student.student_number}\nJoin Link: ${meetLink}`,
        html: `<p>Interview started with <strong>${student.full_name || student.student_number}</strong>.</p><p><a href="${meetLink}">Open Meet Link</a></p>`,
      });
    }

    const updatePayload: Record<string, unknown> = {
      status: "interviewing",
      interview_started_at: new Date().toISOString(),
    };

    // If meet_link column exists, store/reuse the link for UI continuity.
    updatePayload.meet_link = meetLink;

    const { error: updateError } = await serviceClient
      .from("consultations")
      .update(updatePayload)
      .eq("id", consultation.id)
      .eq("faculty_id", faculty.id);

    if (updateError) {
      const fallback = await serviceClient
        .from("consultations")
        .update({ status: "interviewing", meet_link: meetLink })
        .eq("id", consultation.id)
        .eq("faculty_id", faculty.id);
      if (fallback.error) {
        return jsonResponse({ error: `Failed to update consultation status: ${fallback.error.message}` }, 500);
      }
    }

    return jsonResponse({ ok: true, meetLink }, 200);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});
