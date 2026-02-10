'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

interface EditableTimeInputProps {
  value: number; // seconds
  onChange: (seconds: number) => void;
  className?: string;
  disabled?: boolean;
}

// Parse various time formats to seconds
// Supported: "1h 30m", "1h30m", "90m", "1.5h", "1:30", "90"
export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Format: "1:30" (hours:minutes)
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    if (minutes < 60) {
      return hours * 3600 + minutes * 60;
    }
  }

  // Format: "1h 30m", "1h30m", "2h", "45m"
  const hMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/);
  const mMatch = trimmed.match(/(\d+)\s*m(?:in)?/);

  if (hMatch || mMatch) {
    const hours = hMatch ? parseFloat(hMatch[1]) : 0;
    const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
    return Math.round(hours * 3600 + minutes * 60);
  }

  // Format: "1.5" (decimal hours)
  const decimalMatch = trimmed.match(/^(\d+\.\d+)$/);
  if (decimalMatch) {
    return Math.round(parseFloat(decimalMatch[1]) * 3600);
  }

  // Format: just minutes "90"
  const justNumber = trimmed.match(/^(\d+)$/);
  if (justNumber) {
    const num = parseInt(justNumber[1], 10);
    // If less than 10, treat as hours, otherwise as minutes
    if (num <= 8) {
      return num * 3600;
    }
    return num * 60;
  }

  return null;
}

// Format seconds to readable string
export function formatSecondsToTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

export function EditableTimeInput({ value, onChange, className = '', disabled = false }: EditableTimeInputProps) {
  const [inputValue, setInputValue] = useState(formatSecondsToTime(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update display when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(formatSecondsToTime(value));
    }
  }, [value, isEditing]);

  const handleFocus = () => {
    setIsEditing(true);
    // Select all on focus for easy replacement
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseTimeToSeconds(inputValue);
    if (parsed !== null && parsed > 0) {
      onChange(parsed);
      setInputValue(formatSecondsToTime(parsed));
    } else {
      // Reset to original value if invalid
      setInputValue(formatSecondsToTime(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setInputValue(formatSecondsToTime(value));
      inputRef.current?.blur();
    }
  };

  return (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`w-16 h-7 text-center font-mono text-xs px-1 ${className}`}
      placeholder="1h 30m"
    />
  );
}

export default EditableTimeInput;
