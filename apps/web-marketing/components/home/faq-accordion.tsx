"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "What types of loans does NexusBridge offer?",
    a: "NexusBridge offers two core programs: Bridge Loans for acquisitions, refinances, and time-sensitive closings; and Renovation Financing for combined acquisition and rehab capital on residential value-add projects.",
  },
  {
    q: "What are the minimum and maximum loan amounts?",
    a: "Bridge loans range from $250,000 to $5,000,000. Renovation financing is structured on a deal-by-deal basis. Contact us for larger transactions.",
  },
  {
    q: "How quickly can I get funded?",
    a: "We issue term sheets within 24–48 hours of a complete submission. Closing and funding typically occur within 7–14 days from term sheet acceptance, depending on title and due diligence.",
  },
  {
    q: "What collateral is required?",
    a: "All loans require a first-lien position on the subject real property. We require an independent appraisal or BPO, title insurance, and hazard insurance at close.",
  },
  {
    q: "Who can invest in NexusBridge Capital LP?",
    a: "NexusBridge Capital LP is offered exclusively to accredited investors under Regulation D, Rule 506(c). Investors must meet SEC accreditation standards and complete our verification process.",
  },
  {
    q: "Is this a loan application or a commitment to lend?",
    a: "Submitting an inquiry is not a loan application or a commitment to lend. It initiates our review process. A term sheet, if issued, will outline the specific terms and conditions of any proposed financing.",
  },
];

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col divide-y divide-slate-200">
      {faqs.map((faq, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
          >
            <span className="text-base font-semibold text-[#0D1117] group-hover:text-[#2563EB] transition-colors">
              {faq.q}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-[#4A90D9] flex-shrink-0 transition-transform duration-200 ${
                open === i ? "rotate-180" : ""
              }`}
            />
          </button>
          {open === i && (
            <p className="pb-5 text-sm text-[#4A6070] leading-relaxed">
              {faq.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
