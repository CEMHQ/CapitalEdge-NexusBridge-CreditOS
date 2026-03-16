import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Search, CheckCircle, DollarSign, BarChart3, RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Learn how NexusBridge processes bridge loan applications from submission to funding — and how investors participate.",
};

const borrowerSteps = [
  {
    icon: FileText,
    step: "01",
    title: "Submit Application",
    description: "Complete our online application with basic property details, requested loan amount, and your experience profile. No upfront fees.",
  },
  {
    icon: Search,
    step: "02",
    title: "Underwriting Review",
    description: "Our team evaluates collateral value, loan-to-value ratio, exit strategy, and borrower profile. We may request supporting documents.",
  },
  {
    icon: CheckCircle,
    step: "03",
    title: "Conditional Approval",
    description: "Receive a term sheet outlining rate, term, and conditions. Review and accept to move to final closing preparation.",
  },
  {
    icon: DollarSign,
    step: "04",
    title: "Close & Fund",
    description: "Work with title and our team to finalize closing documents. Funds are disbursed on a clear schedule once all conditions are met.",
  },
  {
    icon: BarChart3,
    step: "05",
    title: "Loan Servicing",
    description: "Make monthly interest payments through your borrower portal. Track your loan balance, payment history, and maturity date.",
  },
  {
    icon: RefreshCw,
    step: "06",
    title: "Payoff or Extend",
    description: "At maturity, pay off the loan from your exit event (sale, refinance, or other liquidity). Extensions considered on a case-by-case basis.",
  },
];

const investorSteps = [
  {
    step: "01",
    title: "Register & Verify",
    description: "Create your investor account and complete accreditation verification. NexusBridge Capital LP is available to accredited investors only under Reg D, Rule 506(c).",
  },
  {
    step: "02",
    title: "Review the Offering",
    description: "Access the Private Placement Memorandum, fund structure details, and historical loan performance data through your investor portal.",
  },
  {
    step: "03",
    title: "Commit Capital",
    description: "Submit your subscription agreement and fund your capital commitment via wire transfer. Minimum investment amounts apply.",
  },
  {
    step: "04",
    title: "Monitor Portfolio",
    description: "Log in to your investor portal to track funded loan exposure, capital account balance, and income distributions.",
  },
  {
    step: "05",
    title: "Receive Distributions",
    description: "Receive periodic distributions from loan interest income, processed on a regular schedule and reflected in your capital account.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">The Process</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">How It Works</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            A clear, efficient process for both borrowers and investors. No surprises — just institutional-grade execution.
          </p>
        </div>
      </section>

      {/* Borrower journey */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">For Borrowers</h2>
        <p className="text-muted-foreground mb-16 max-w-xl">
          From application to funded — a straightforward process built for speed and clarity.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {borrowerSteps.map(({ icon: Icon, step, title, description }) => (
            <div key={step} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-border leading-none">{step}</span>
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
        <div className="mt-14">
          <Button render={<Link href="/apply" />} className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide">
            Start Your Application <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Investor journey */}
      <section className="bg-card">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">For Investors</h2>
          <p className="text-muted-foreground mb-16 max-w-xl">
            Structured access to private credit through a managed fund vehicle.
          </p>
          <div className="flex flex-col gap-0">
            {investorSteps.map((step, i) => (
              <div key={step.step} className="flex gap-6 pb-10 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                  {i < investorSteps.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-2" />
                  )}
                </div>
                <div className="pb-2">
                  <h3 className="text-base font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Button render={<Link href="/investors" />} variant="outline" className="border-border hover:bg-secondary tracking-wide">
              Learn About Investing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
