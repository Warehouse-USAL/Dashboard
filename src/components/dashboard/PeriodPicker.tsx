import { useState } from "react";
import { Calendar as CalendarIcon, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS, periodLabel, type PeriodId } from "@/lib/dateRange";

export function PeriodLabelView({ value }: { value: PeriodId }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <CalendarIcon className="w-3 h-3" />
      {periodLabel(value)}
    </span>
  );
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (v: PeriodId) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card hover:bg-secondary/40 px-3 py-1.5 text-xs">
          <CalendarIcon className="w-3.5 h-3.5" />
          {periodLabel(value)}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onChange(p.id);
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-secondary/60",
              p.id === value && "bg-secondary/60",
            )}
          >
            {p.label}
            {p.id === value && <Check className="w-3 h-3 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
