import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface Props {
  request: ConfirmOptions | null;
  onClose: () => void;
}

export function ConfirmDialog({ request, onClose }: Props) {
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()} className="max-w-sm">
      {request && (
        <>
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            {request.description && (
              <DialogDescription>{request.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={request.destructive ? "destructive" : "default"}
              size="sm"
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
