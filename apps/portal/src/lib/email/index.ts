import { Resend } from 'resend'

const resend = new Resend(process.env.NEXUSBRIDGE_PORTAL_KEY)

const ADMIN_EMAIL = 'cem.projects.hq@gmail.com'
const FROM_ADDRESS = 'NexusBridge CreditOS <onboarding@resend.dev>'

export async function sendApplicationSubmittedEmail({
  applicationNumber,
  borrowerEmail,
  borrowerName,
  loanPurpose,
  requestedAmount,
  applicationId,
}: {
  applicationNumber: string
  borrowerEmail: string
  borrowerName: string
  loanPurpose: string
  requestedAmount: string
  applicationId: string
}) {
  const purposeLabels: Record<string, string> = {
    bridge: 'Bridge Loan',
    renovation: 'Renovation / Fix & Flip',
    contingency: 'Contingency / GAP Funding',
    other: 'Other',
  }

  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(parseFloat(requestedAmount))

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: ADMIN_EMAIL,
    subject: `New Application Submitted — ${applicationNumber}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">New Loan Application Submitted</h2>
        <p style="font-size: 14px; color: #555; margin: 0 0 24px;">A new application has been submitted and is ready for review.</p>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #888; width: 40%;">Application #</td>
            <td style="padding: 10px 0; font-weight: 500;">${applicationNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #888;">Borrower</td>
            <td style="padding: 10px 0; font-weight: 500;">${borrowerName || borrowerEmail}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #888;">Email</td>
            <td style="padding: 10px 0;">${borrowerEmail}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #888;">Loan Purpose</td>
            <td style="padding: 10px 0;">${purposeLabels[loanPurpose] ?? loanPurpose}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #888;">Requested Amount</td>
            <td style="padding: 10px 0; font-weight: 500;">${amount}</td>
          </tr>
        </table>

        <div style="margin-top: 28px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/admin/applications/${applicationId}"
             style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Review Application
          </a>
        </div>

        <p style="font-size: 12px; color: #aaa; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          NexusBridge CreditOS · Managed by Capital Edge Management
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('Failed to send application notification email:', error)
  }
}
