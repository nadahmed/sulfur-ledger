"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

function AlertDialog({ ...props }: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger {...props} />
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return <DialogContent className={className} showCloseButton={false} {...props} />
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={className} {...props} />
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={className} {...props} />
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle className={className} {...props} />
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription className={className} {...props} />
}

function AlertDialogAction({
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button {...props} />
}

function AlertDialogCancel({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close render={<Button variant="outline" />} {...props} />
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
