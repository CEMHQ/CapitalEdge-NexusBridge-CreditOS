"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/loan-programs", label: "Loan Programs" },
  { href: "/investors", label: "Investors" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function BridgeLogo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <svg
        width="36"
        height="28"
        viewBox="0 0 36 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary flex-shrink-0"
        aria-hidden="true"
      >
        <line x1="18" y1="2" x2="18" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="14" y1="2" x2="22" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18" y1="4" x2="4" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="4" x2="8" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="4" x2="12" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="4" x2="32" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="4" x2="28" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="4" x2="24" y2="22" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="1" y1="22" x2="35" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-foreground font-bold tracking-widest text-sm uppercase">NexusBridge</span>
        <span className="text-muted-foreground tracking-widest text-[10px] uppercase">Lending</span>
      </div>
    </Link>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <BridgeLogo />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Button
            render={<Link href="/investors" />}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            Investor Portal
          </Button>
          <Button
            render={<Link href="/apply" />}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide"
          >
            Apply Now
          </Button>
        </div>

        {/* Mobile menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="md:hidden"
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent side="right" className="bg-card border-border w-72">
            <div className="flex flex-col gap-1 mt-8">
              {navLinks.map((link) => (
                <SheetClose
                  key={link.href}
                  render={<Link href={link.href} />}
                  className="px-3 py-3 text-sm tracking-wide text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                >
                  {link.label}
                </SheetClose>
              ))}
              <div className="mt-4 flex flex-col gap-2 px-3">
                <Button
                  render={<Link href="/investors" />}
                  variant="outline"
                  className="w-full border-border"
                >
                  Investor Portal
                </Button>
                <Button
                  render={<Link href="/apply" />}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  Apply Now
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
