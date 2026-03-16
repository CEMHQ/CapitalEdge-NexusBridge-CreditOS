import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO_EMAIL = "cem.projects.hq@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await resend.emails.send({
      from: "NexusBridge Lending <onboarding@resend.dev>",
      to: TO_EMAIL,
      replyTo: email,
      subject: `Contact Form — ${subject} | ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>

        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>Name</strong></td><td>${name}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Subject</strong></td><td>${subject}</td></tr>
        </table>

        <h3>Message</h3>
        <p>${message.replace(/\n/g, "<br/>")}</p>

        <hr />
        <p style="color:#888;font-size:12px;">Submitted via NexusBridge Lending — Contact Form</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
