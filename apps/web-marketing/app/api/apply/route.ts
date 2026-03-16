import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO_EMAIL = "cem.projects.hq@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      loanAmount,
      propertyValue,
      loanPurpose,
      propertyType,
      propertyAddress,
      exitStrategy,
    } = body;

    if (!firstName || !lastName || !email || !phone || !loanAmount || !propertyValue || !loanPurpose || !propertyType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await resend.emails.send({
      from: "NexusBridge Lending <onboarding@resend.dev>",
      to: TO_EMAIL,
      replyTo: email,
      subject: `New Loan Inquiry — ${firstName} ${lastName} | ${loanPurpose} | ${loanAmount}`,
      html: `
        <h2>New Loan Application Inquiry</h2>

        <h3>Borrower Information</h3>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>Name</strong></td><td>${firstName} ${lastName}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${phone}</td></tr>
        </table>

        <h3>Loan Request</h3>
        <table cellpadding="6" style="border-collapse:collapse;">
          <tr><td><strong>Loan Amount</strong></td><td>${loanAmount}</td></tr>
          <tr><td><strong>Property Value</strong></td><td>${propertyValue}</td></tr>
          <tr><td><strong>Loan Purpose</strong></td><td>${loanPurpose}</td></tr>
          <tr><td><strong>Property Type</strong></td><td>${propertyType}</td></tr>
          <tr><td><strong>Property Address</strong></td><td>${propertyAddress || "Not provided"}</td></tr>
        </table>

        <h3>Exit Strategy</h3>
        <p>${exitStrategy || "Not provided"}</p>

        <hr />
        <p style="color:#888;font-size:12px;">Submitted via NexusBridge Lending — Apply Form</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Apply form error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
