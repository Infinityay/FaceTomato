import * as React from "react";
import { UploadCloud, XCircle, FileText } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type FileUploadProps = {
  accept?: string;
  onFileSelect: (file: File) => void;
  file?: { name: string; size: number } | null;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const ACCEPT_TYPES = ".txt,.md,.pdf,.docx,.jpg,.jpeg,.png";

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  ({ accept = ACCEPT_TYPES, onFileSelect, file, onClear, disabled, className, style }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileSelect(droppedFile);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) onFileSelect(selectedFile);
    };

    const handleButtonClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled) inputRef.current?.click();
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onClear?.();
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 p-8 text-center transition-all duration-200",
          isDragging && "border-primary/60 bg-primary/5",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        style={style}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {isDragging ? "松开鼠标即可上传文件" : "拖拽文件到此处，或点击下方按钮选择文件"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              支持 PDF / DOCX / 图片 / 文本格式
            </p>
          </div>
          <Button type="button" onClick={handleButtonClick} size="lg" className="px-6">
            选择文件
          </Button>
        </div>

        {/* 已上传文件信息条 */}
        {file && (
          <div className="mt-6 flex w-full items-center justify-between rounded-lg border border-border/60 bg-background/80 px-4 py-3">
            <div className="flex items-center gap-3 text-left">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground/80">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="移除文件"
              onClick={handleClear}
            >
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    );
  }
);
FileUpload.displayName = "FileUpload";

export { FileUpload };
