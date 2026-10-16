'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import {
  buttonStyles,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button-styles';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
});
