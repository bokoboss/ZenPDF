import React from 'react';
import { cn } from '../utils';

export function Stepper({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'Upload' }, 
    { num: 2, label: 'Organize' }, 
    { num: 3, label: 'Edit' }
  ];
  
  return (
    <div className="flex items-center gap-3">
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300",
            current === step.num ? "bg-stone-900 text-white shadow-md" : 
            current > step.num ? "bg-stone-100 text-stone-900" : "text-stone-300"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              current === step.num ? "bg-white" : 
              current > step.num ? "bg-stone-900" : "bg-stone-300"
            )} />
            <span className={cn(
              "text-xs font-medium tracking-wide",
              current < step.num && "font-normal"
            )}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className="w-4 h-px bg-stone-200" />
          )}
        </div>
      ))}
    </div>
  );
}