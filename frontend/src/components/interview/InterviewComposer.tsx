import { forwardRef, KeyboardEvent, ReactNode } from "react";
import { Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InterviewComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxLength: number;
  softLimit: number;
  /** 语音相关 props（可选） */
  isListening?: boolean;
  interimText?: string;
  speechError?: string | null;
  onMicToggle?: () => void;
  /** Optional footer content rendered above the input pill */
  footer?: ReactNode;
}

export const InterviewComposer = forwardRef<HTMLTextAreaElement, InterviewComposerProps>(function InterviewComposer(
  {
    value,
    onChange,
    onSubmit,
    disabled,
    maxLength,
    softLimit,
    isListening = false,
    interimText = "",
    speechError,
    onMicToggle,
    footer,
  },
  ref
) {
  const canSubmit = !disabled && value.trim().length > 0;
  const hasMic = Boolean(onMicToggle);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-0 pt-0.5 md:px-5">
      {/* Footer (e.g. 已回答 / 重新开始) — above the input */}
      {footer && <div className="mb-0.5 px-1">{footer}</div>}

      {/* 语音识别中间文本提示 */}
      {isListening && interimText && (
        <div className="mb-0.5 rounded-xl bg-muted/40 px-4 py-2 text-sm text-muted-foreground italic">
          {interimText}
        </div>
      )}
      {speechError && (
        <div className="mb-0.5 text-xs text-destructive">{speechError}</div>
      )}

      {/* 浮动胶囊输入区 */}
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all focus-within:border-accent/40 focus-within:shadow-[0_2px_20px_rgba(0,0,0,0.12)] dark:border-zinc-600 dark:bg-zinc-800 dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] dark:focus-within:border-accent/50 dark:focus-within:shadow-[0_2px_20px_rgba(0,0,0,0.4)]">
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "正在聆听..." : "输入你的回答..."}
          maxLength={maxLength}
          disabled={disabled}
          rows={1}
          className="min-h-[2.25rem] max-h-40 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
          {hasMic && (
            <Button
              type="button"
              size="icon"
              variant={isListening ? "destructive" : "ghost"}
              onClick={onMicToggle}
              disabled={disabled}
              aria-label={isListening ? "停止语音输入" : "开始语音输入"}
              className={cn("h-8 w-8 rounded-xl", isListening && "animate-pulse")}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button
            size="icon"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-label="发送消息"
            className="h-8 w-8 rounded-xl transition-transform active:scale-90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 字数提示 */}
      <div className="mt-0.5 flex items-center justify-between px-2 text-[11px] text-muted-foreground/50">
        <span>建议控制在 {softLimit} 字以内</span>
        <span>{value.length}/{maxLength}</span>
      </div>
    </div>
  );
});
