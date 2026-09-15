"use client";

import { useLanguage } from "./language-provider";
import styles from "./test-feedback.module.css";

const feedbackUrl = "https://github.com/Lfrangt/fretflow-ui/issues";

export function TestFeedback({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  if (compact) return <a className={styles.compact} href={feedbackUrl} target="_blank" rel="noopener noreferrer" title={t("FretFlow is in testing. Found a problem or have a suggestion? Your feedback is welcome.")}>
    {t("Testing · Feedback")}
  </a>;

  return <aside className={styles.notice} aria-label={t("Testing & feedback")}>
    <p>{t("FretFlow is in testing. Found a problem or have a suggestion? Your feedback is welcome.")}</p>
    <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">{t("Send feedback on GitHub")}</a>
  </aside>;
}
