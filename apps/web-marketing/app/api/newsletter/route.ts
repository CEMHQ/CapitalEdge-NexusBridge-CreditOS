import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO_EMAIL = "cem.projects.hq@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    await resend.emails.send({
      from: "NexusBridge Lending <onboarding@resend.dev>",
      to: TO_EMAIL,
      replyTo: email,
      subject: `Newsletter Signup — ${email}`,
      text: `New newsletter subscriber: ${email}`,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
