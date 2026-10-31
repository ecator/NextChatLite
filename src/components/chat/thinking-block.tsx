import React, { useState, useEffect, useRef, useMemo } from "react";
import clsx from "clsx";
import BrainIcon from "@/icons/brain.svg";
import DownIcon from "@/icons/down.svg";
import CopyIcon from "@/icons/copy.svg";
import ConfirmIcon from "@/icons/confirm.svg";
import { MarkdownContent } from "../markdown";
import { copyToClipboard } from "@/utils";
import Locale, { getLang } from "@/locales";
import { formatThinkingDuration, extractPlainText } from "@/utils/thinking";
import styles from "./thinking-block.module.scss";

export { formatThinkingDuration, extractPlainText };

export interface ThinkingBlockProps {
  reasoning?: string;
  streaming?: boolean;
  duration?: number;
  defaultCollapsed?: boolean;
  className?: string;
}

export function ThinkingBlock(props: ThinkingBlockProps) {
  const { reasoning, streaming = false, duration: initialDuration } = props;

  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (props.defaultCollapsed !== undefined) return props.defaultCollapsed;
    return !streaming; // If streaming, default expanded; otherwise collapsed
  });

  const userInteractedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState<number>(
    () => initialDuration ?? 0,
  );
  const currentLang = getLang();

  // If initialDuration changes externally (e.g. hydrated from message), update elapsedMs
  useEffect(() => {
    if (initialDuration !== undefined && !streaming) {
      setElapsedMs(initialDuration);
    }
  }, [initialDuration, streaming]);

  // Handle live ticking timer during active streaming
  useEffect(() => {
    if (!streaming) return;

    // Reset start time anchor
    startTimeRef.current = Date.now();

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    return () => clearInterval(timer);
  }, [streaming]);

  // Handle auto-collapse transition when streaming completes
  useEffect(() => {
    if (!streaming) {
      // Auto-collapse if user hasn't manually interacted (F16-3 & B16-4)
      if (!userInteractedRef.current) {
        setIsCollapsed(true);
      }
    } else {
      // If streaming starts/restarts and user hasn't interacted, auto-expand
      if (!userInteractedRef.current) {
        setIsCollapsed(false);
      }
    }
  }, [streaming]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    userInteractedRef.current = true;
    setIsCollapsed((prev) => !prev);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const plainText = extractPlainText(reasoning || "");
    copyToClipboard(plainText || reasoning || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const durationLabel = useMemo(() => {
    if (streaming) {
      const sec = (Math.max(0, elapsedMs) / 1000).toFixed(1);
      switch (currentLang) {
        case "cn":
          return `思考中 (${sec}s)...`;
        case "jp":
          return `思考中 (${sec}s)...`;
        case "fr":
          return `Réflexion (${sec}s)...`;
        case "en":
        default:
          return `Thinking (${sec}s)...`;
      }
    }
    return formatThinkingDuration(elapsedMs, currentLang);
  }, [streaming, elapsedMs, currentLang]);

  // Boundary B16-3: Never render if reasoning is empty or whitespace-only
  if (!reasoning || reasoning.trim().length === 0) {
    return null;
  }

  return (
    <div
      className={clsx(
        styles["thinking-block"],
        {
          [styles["collapsed"]]: isCollapsed,
          [styles["streaming"]]: streaming,
        },
        props.className,
      )}
    >
      <div
        className={styles["thinking-header"]}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle(e as any);
          }
        }}
      >
        <div className={styles["thinking-title"]}>
          <span className={styles["thinking-icon"]}>
            <BrainIcon />
          </span>
          {streaming && <span className={styles["thinking-pulse"]} />}
          <span className={styles["thinking-label"]}>{durationLabel}</span>
        </div>

        <div className={styles["thinking-actions"]}>
          <button
            type="button"
            className={styles["thinking-copy-btn"]}
            onClick={handleCopy}
            title={Locale.Chat?.Actions?.Copy || "Copy"}
            aria-label="Copy reasoning"
          >
            {copied ? <ConfirmIcon /> : <CopyIcon />}
          </button>
          <span
            className={clsx(styles["thinking-chevron"], {
              [styles["expanded"]]: !isCollapsed,
            })}
          >
            <DownIcon />
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles["thinking-body"]}>
          <div className={styles["thinking-content"]}>
            <MarkdownContent content={reasoning} />
          </div>
        </div>
      )}
    </div>
  );
}
