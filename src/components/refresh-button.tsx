"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  className?: string;
}

export function RefreshButton({ className }: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Add a slight delay for visual feedback of the icon spinning
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn("h-9 w-9", className)}
            >
              <RotateCw
                className={cn(
                  "h-[1.2rem] w-[1.2rem] transition-all",
                  isRefreshing && "animate-spin"
                )}
              />
              <span className="sr-only">Refresh Application</span>
            </Button>
          }
        />
        <TooltipContent side="bottom">
          <p>Refresh Application</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
