"use client";

import { useLanguage, LanguageSwitcher } from "./language-provider";

import { useEffect, useRef, type ReactNode } from "react";
import { WorkspaceIcon } from "./workspace-icon";

export function WorkspaceSheet({ view, title, section, onClose, onBack, children }: {
  view: string | null;
  title: string;
  section: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (view && !dialog.open) dialog.showModal();
    if (!view && dialog.open) dialog.close();
    if (view) titleRef.current?.focus();
  }, [view]);

  return <dialog ref={dialogRef} className="workspace-sheet" data-view={view ?? undefined} aria-labelledby="workspace-sheet-title"
    onClose={onClose} onCancel={onClose}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <div className="sheet-header">
      <div className="sheet-heading">
        {onBack ? <button className="icon-button sheet-back" aria-label={t("Back to {section}", { section: t(section) })} onClick={onBack}><WorkspaceIcon name="back" /></button> : null}
        <div><p className="eyebrow">{t(section)}</p><h2 id="workspace-sheet-title" ref={titleRef} tabIndex={-1}>{t(title)}</h2></div>
      </div>
      <div className="sheet-header-actions"><LanguageSwitcher /><button className="icon-button" aria-label={t("Close panel")} onClick={onClose}><WorkspaceIcon name="close" /></button></div>
    </div>
    <div className="sheet-body" key={view}>{children}</div>
  </dialog>;
}
