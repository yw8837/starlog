"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import s from "./bonds.module.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
};

/** A confirm step for the actions that clear stars (바꾸기, 새로 채우기, 별 지우기, 코드 새로 만들기). */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onClose, busy = false }: ConfirmDialogProps) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <h2 id={id} className={s.dialogTitle}>
        {title}
      </h2>
      <div className={s.dialogText}>{children}</div>
      <div className={s.dialogActions}>
        <Button variant="secondary" block onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          그대로 둘게요
        </Button>
      </div>
    </Modal>
  );
}
