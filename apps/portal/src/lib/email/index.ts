import { Resend } from 'resend'

const resend = new Resend(process.env.NEXUSBRIDGE_PORTAL_KEY)

const ADMIN_EMAIL  = 'cem.projects.hq@gmail.com'
const FROM_ADDRESS = 'NexusBridge CreditOS <onboarding@resend.dev>'
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? ''

// ─── Shared email helpers ──────────────────────────────────────────────────

function emailWrapper(body: string) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111;">
      ${body}
      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
        NexusBridge CreditOS &middot; Managed by Capital Edge Management
      </p>
    </div>
  `
}

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

// ─── Application status change → borrower notification ────────────────────

const APPLICATION_STATUS_COPY: Record<string, { subject: string; heading: string; body: string; cta?: string }> = {
  under_review: {
    subject:  'Your application is under review',
    heading:  'Your application is under review',
    body:     'Our underwriting team has received your application and is currently reviewing it. We will notify you as soon as a decision has been made.',
    cta:      'View Application',
  },
  approved: {
    subject:  'Your application has been approved',
    heading:  'Congratulations — your application has been approved',
    body:     'We are pleased to inform you that your loan application has been approved. Our team will be in touch shortly to discuss next steps and funding details.',
    cta:      'View Application',
  },
  rejected: {
    subject:  'Update on your loan application',
    heading:  'Application decision',
    body:     'Thank you for your application. After careful review, we are unable to move forward with your request at this time. If you have questions or would like to discuss alternatives, please contact us.',
    cta:      'View Application',
  },
  documents_pending: {
    subject:  'Action required — documents needed',
    heading:  'Additional documents required',
    body:     'Your application requires additional documentation before we can proceed. Please log in to your portal and upload the requested documents.',
    cta:      'Upload Documents',
  },
  funding_scheduled: {
    subject:  'Your loan funding has been scheduled',
    heading:  'Funding scheduled',
    body:     'Great news — your loan funding has been scheduled. You will receive the funds according to the disbursement timeline discussed with your loan officer.',
    cta:      'View Application',
  },
  funded: {
    subject:  'Your loan has been funded',
    heading:  'Your loan has been funded',
    body:     'Your loan has been successfully funded. Please log in to your portal to view your loan details and repayment schedule.',
    cta:      'View Loan Details',
  },
}

export async function sendApplicationStatusEmail({
  borrowerEmail,
  borrowerName,
  applicationNumber,
  applicationId: _applicationId,
  newStatus,
  notes,
}: {
  borrowerEmail: string
  borrowerName: string
  applicationNumber: string
  applicationId: string
  newStatus: string
  notes?: string | null
}) {
  const copy = APPLICATION_STATUS_COPY[newStatus]
  if (!copy) return // no email for this status transition

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to:   borrowerEmail,
    subject: `${copy.subject} — ${applicationNumber}`,
    html: emailWrapper(`
      <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">${copy.heading}</h2>
      <p style="font-size:14px;color:#555;margin:0 0 20px;">Hi ${borrowerName || 'there'},</p>
      <p style="font-size:14px;color:#444;margin:0 0 20px;">${copy.body}</p>
      ${notes ? `<div style="background:#f9f9f9;border-left:3px solid #ddd;padding:12px 16px;margin:0 0 20px;font-size:14px;color:#555;"><strong>Note from our team:</strong><br>${notes}</div>` : ''}
      <p style="font-size:14px;color:#888;margin:0 0 24px;">Application #${applicationNumber}</p>
      ${copy.cta ? `<a href="${APP_URL}/dashboard/borrower/applications" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">${copy.cta}</a>` : ''}
    `),
  })

  if (error) {
    console.error('[email] Failed to send application status email:', error)
  }
}

// ─── Document review decision → uploader notification ─────────────────────

export async function sendDocumentReviewEmail({
  uploaderEmail,
  uploaderName,
  fileName,
  reviewStatus,
  rejectionReason,
}: {
  uploaderEmail: string
  uploaderName: string
  fileName: string
  reviewStatus: 'verified' | 'rejected'
  rejectionReason?: string | null
}) {
  const approved = reviewStatus === 'verified'

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to:   uploaderEmail,
    subject: approved
      ? `Document verified — ${fileName}`
      : `Action required — document not accepted`,
    html: emailWrapper(`
      <h2 style="font-size:18px;font-weight:600;margin:0 0 8px;">
        ${approved ? 'Document Verified' : 'Document Not Accepted'}
      </h2>
      <p style="font-size:14px;color:#555;margin:0 0 20px;">Hi ${uploaderName || 'there'},</p>
      ${approved
        ? `<p style="font-size:14px;color:#444;margin:0 0 20px;">Your document <strong>${fileName}</strong> has been reviewed and verified. No further action is needed.</p>`
        : `<p style="font-size:14px;color:#444;margin:0 0 20px;">Your document <strong>${fileName}</strong> could not be accepted. Please log in to your portal and upload a corrected version.</p>`
      }
      ${!approved && rejectionReason ? `<div style="background:#fff5f5;border-left:3px solid #fca5a5;padding:12px 16px;margin:0 0 20px;font-size:14px;color:#555;"><strong>Reason:</strong><br>${rejectionReason}</div>` : ''}
      <a href="${APP_URL}/dashboard/borrower/documents" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">
        View Documents
      </a>
    `),
  })

  if (error) {
    console.error('[email] Failed to send document review email:', error)
  }
}
