"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopNav() {
  const logoutFormRef = React.useRef<HTMLFormElement | null>(null);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-transparent px-4 md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-yellow-950/5 focus-visible:ring-2 focus-visible:ring-yellow-600/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <Avatar>
              <AvatarFallback>TJ</AvatarFallback>
            </Avatar>
            <div className="hidden text-left text-sm md:block">
              <div className="font-medium leading-none text-stone-900">Tanay</div>
              <div className="mt-1 text-xs text-stone-500">Personal</div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              // Radix dropdown will call preventDefault on certain structures;
              // force a real POST logout submission.
              e.preventDefault();
              logoutFormRef.current?.requestSubmit();
            }}
          >
            Log out
          </DropdownMenuItem>
          <form
            ref={logoutFormRef}
            action="/api/auth/logout"
            method="post"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
