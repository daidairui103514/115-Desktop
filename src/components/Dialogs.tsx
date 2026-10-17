import { useEffect, useRef, useState } from "react";

interface PromptDialogProps {
  title: string;
  label?: string;
  initialValue?: string;
  confirmText?: string;
  /** 只读的说明文字 */
  hint?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  label,
  initialValue = "",
  confirmText = "确定",
  hint,
  danger,
  busy,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // 选中主文件名，保留扩展名，方便直接改后缀
    const dot = initialValue.lastIndexOf(".");
    if (dot > 0) {
      el.setSelectionRange(0, dot);
    } else {
      el.select();
    }
  }, [initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        {label ? <label className="modal__label">{label}</label> : null}
        <input
          ref={inputRef}
          className="modal__input"
          value={value}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
        />
        {hint ? <p className="modal__hint">{hint}</p> : null}
        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`modal__btn modal__btn--primary${danger ? " modal__btn--danger" : ""}`}
            onClick={submit}
            disabled={busy || !value.trim()}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = "确定",
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button type="button" className="modal__btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`modal__btn modal__btn--primary${danger ? " modal__btn--danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
