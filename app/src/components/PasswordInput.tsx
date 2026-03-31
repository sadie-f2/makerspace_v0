"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type InputProps = React.ComponentPropsWithoutRef<typeof Input>;

/**
 * Password input with a show/hide toggle.
 * Drop-in replacement for <Input type="password" ... />.
 */
export default function PasswordInput({ className, ...props }: Omit<InputProps, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={className}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 select-none"
        tabIndex={-1}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
